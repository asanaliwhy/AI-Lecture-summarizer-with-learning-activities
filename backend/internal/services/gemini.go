package services

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"

	"log"

	"github.com/google/generative-ai-go/genai"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"google.golang.org/api/option"

	"lectura-backend/internal/models"
	"lectura-backend/internal/repository"
)

type GeminiService struct {
	client            *genai.Client
	model             *genai.GenerativeModel
	summaryRepo       *repository.SummaryRepo
	presentationRepo  *repository.PresentationRepo
	quizRepo          *repository.QuizRepo
	flashRepo         *repository.FlashcardRepo
	jobRepo           *repository.JobRepo
	redis             *redis.Client
	unsplashAccessKey string
	httpClient        *http.Client
	rateChan          chan struct{} // Token bucket
}

func NewGeminiService(
	apiKey string,
	concurrentReqs int,
	summaryRepo *repository.SummaryRepo,
	presentationRepo *repository.PresentationRepo,
	quizRepo *repository.QuizRepo,
	flashRepo *repository.FlashcardRepo,
	jobRepo *repository.JobRepo,
	redisClient *redis.Client,
	unsplashAccessKey string,
) (*GeminiService, error) {
	ctx := context.Background()
	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		return nil, fmt.Errorf("failed to create Gemini client: %w", err)
	}

	model := client.GenerativeModel("gemini-3-flash-preview")
	model.SetTemperature(0.3)
	model.SetTopP(0.95)

	// Token bucket for rate limiting
	rateChan := make(chan struct{}, concurrentReqs)
	for i := 0; i < concurrentReqs; i++ {
		rateChan <- struct{}{}
	}

	return &GeminiService{
		client:            client,
		model:             model,
		summaryRepo:       summaryRepo,
		presentationRepo:  presentationRepo,
		quizRepo:          quizRepo,
		flashRepo:         flashRepo,
		jobRepo:           jobRepo,
		redis:             redisClient,
		unsplashAccessKey: strings.TrimSpace(unsplashAccessKey),
		httpClient:        &http.Client{Timeout: 15 * time.Second},
		rateChan:          rateChan,
	}, nil
}

func (s *GeminiService) Close() {
	s.client.Close()
}

// acquireRate blocks until a rate slot is available
func (s *GeminiService) acquireRate(ctx context.Context) error {
	select {
	case <-s.rateChan:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(10 * time.Minute):
		return fmt.Errorf("timeout waiting for Gemini rate slot")
	}
}

func (s *GeminiService) releaseRate() {
	s.rateChan <- struct{}{}
}

func generateContentWithTimeout(
	ctx context.Context,
	model *genai.GenerativeModel,
	timeout time.Duration,
	parts ...genai.Part,
) (*genai.GenerateContentResponse, error) {
	callCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	resp, err := model.GenerateContent(callCtx, parts...)
	if err != nil {
		if errors.Is(callCtx.Err(), context.DeadlineExceeded) {
			return nil, fmt.Errorf("Gemini call timed out after %s", timeout)
		}
		return nil, err
	}

	return resp, nil
}

// PublishUpdate sends a WebSocket update via Redis pub/sub
func (s *GeminiService) PublishUpdate(ctx context.Context, userID uuid.UUID, msg models.WSMessage) {
	data, _ := json.Marshal(msg)
	s.redis.Publish(ctx, fmt.Sprintf("user_updates:%s", userID.String()), string(data))
}

// GenerateSummary handles the full summary generation flow
func (s *GeminiService) GenerateSummary(ctx context.Context, job *models.Job, transcript string) error {
	if err := s.acquireRate(ctx); err != nil {
		return err
	}
	defer s.releaseRate()

	var config struct {
		Format         string   `json:"format"`
		Length         string   `json:"length"`
		FocusAreas     []string `json:"focus_areas"`
		TargetAudience string   `json:"target_audience"`
		Language       string   `json:"language"`
	}
	json.Unmarshal(job.ConfigJSON, &config)
	metadataOnlyMode := isMetadataOnlyContent(transcript)

	summaryModel := s.model
	if metadataOnlyMode {
		metadataModel := s.client.GenerativeModel("gemini-3-flash-preview")
		metadataModel.SetTemperature(0.3)
		metadataModel.SetTopP(0.95)
		metadataModel.SetMaxOutputTokens(3072)
		summaryModel = metadataModel
	}

	// Build layered prompt
	prompt := buildSummaryPrompt(config.Format, config.Length, config.FocusAreas,
		config.TargetAudience, config.Language, transcript, metadataOnlyMode)

	// Publish status update
	s.PublishUpdate(ctx, job.UserID, models.WSMessage{
		Type: "status_update",
		Payload: models.StatusUpdate{
			JobID: job.ID, Step: 3, StepName: "Generating Summary",
			EstimatedSecondsRemaining: 30,
		},
	})

	// Call Gemini
	resp, err := generateContentWithTimeout(ctx, summaryModel, 10*time.Minute, genai.Text(prompt))
	if err != nil {
		return fmt.Errorf("Gemini API error: %w", err)
	}

	// Debug logging for Gemini response
	for i, cand := range resp.Candidates {
		log.Printf("Gemini Candidate %d: FinishReason=%s, TokenCount=%d", i, cand.FinishReason, cand.TokenCount)
		if cand.FinishReason != genai.FinishReasonStop {
			log.Printf("WARNING: Gemini stopped due to %s", cand.FinishReason)
		}
	}

	rawText := extractText(resp)
	isQualityFallback := false
	var qualityFallbackReason *string
	if rawText == "" {
		log.Println("WARNING: Gemini returned empty text. Using fallback.")
		rawText = "We could not generate a summary for this content. The transcript was likely unavailable or the content was blocked by safety filters."
		isQualityFallback = true
		reason := "gemini_empty_response"
		qualityFallbackReason = &reason
	}

	if metadataOnlyMode {
		isQualityFallback = true
		if qualityFallbackReason == nil {
			reason := "metadata_only_transcript"
			qualityFallbackReason = &reason
		}
	}

	if config.Format == "smart" && !hasValidSmartSummaryTable(rawText) {
		isQualityFallback = true
		if qualityFallbackReason == nil {
			reason := "smart_summary_structure_fallback"
			qualityFallbackReason = &reason
		}

		restructurePrompt := buildSmartSummaryStructureFallbackPrompt(rawText, metadataOnlyMode)
		resp2, err := generateContentWithTimeout(ctx, summaryModel, 90*time.Second, genai.Text(restructurePrompt))
		if err == nil {
			rawText2 := extractText(resp2)
			if strings.TrimSpace(rawText2) != "" {
				rawText = rawText2
			}
		}

		if !hasValidSmartSummaryTable(rawText) {
			rawText = ensureSmartSummaryTable(rawText)
		}
	}

	if config.Format == "smart" {
		rawText = normalizeSmartLabels(rawText)
		rawText = removeWeakExampleLines(rawText)
		rawText = pruneSmartRedundantSections(rawText)
		if metadataOnlyMode {
			rawText = enforceMetadataOnlyKeyInsightsSection(rawText)
		}
		if repairedText, repaired := enforceSmartAdditionalFactsBullets(rawText); repaired {
			rawText = repairedText
			log.Println("INFO: Smart summary Additional Interesting Facts auto-repaired to markdown bullets")
		}
		if !metadataOnlyMode {
			log.Println("INFO: Running Smart summary fidelity rewrite")
			rawText = s.rewriteSmartSummaryForFidelity(ctx, rawText, transcript)
			if !hasValidSmartSummaryTable(rawText) {
				rawText = ensureSmartSummaryTable(rawText)
				log.Println("INFO: Smart summary table restored after fidelity rewrite")
			}
		}

		// Safety net: detect missing "Summary of Video Content" and auto-generate it
		if !strings.Contains(strings.ToLower(rawText), "summary of video content") {
			log.Println("WARNING: Smart summary missing 'Summary of Video Content' section — auto-generating")
			excerpt := rawText[:min(len(rawText), 3000)]
			microPrompt := fmt.Sprintf(`Read the following summary and write ONE concise narrative paragraph (3-5 sentences) that summarizes the overall topic and main points of the video. Return ONLY the paragraph text, no headings, no markdown.

Summary:
%s`, excerpt)
			microCtx, microCancel := context.WithTimeout(ctx, 60*time.Second)
			defer microCancel()
			microResp, microErr := s.model.GenerateContent(microCtx, genai.Text(microPrompt))
			if microErr == nil {
				paragraph := strings.TrimSpace(extractText(microResp))
				if paragraph != "" {
					rawText = "## Summary of Video Content\n" + paragraph + "\n\n" + rawText
					log.Println("INFO: Smart summary 'Summary of Video Content' section auto-repaired")
				}
			} else {
				log.Printf("WARNING: Failed to auto-generate Summary of Video Content: %v", microErr)
			}
		}
	}

	if config.Format == "bullets" {
		rawText = normalizeBulletsSummary(rawText)
		if metadataOnlyMode {
			rawText = enforceMetadataOnlyBullets(rawText)
		}
	}

	if config.Format == "paragraph" {
		rawText = normalizeParagraphSummary(rawText)
		if metadataOnlyMode {
			rawText = enforceMetadataOnlyParagraph(rawText)
		}
	}

	// Parse Cornell if applicable
	var cues, notes, summaryText *string
	if config.Format == "cornell" {
		c, n, st := parseCornell(rawText)
		if c == "" || n == "" || st == "" {
			// Follow-up call to restructure
			restructurePrompt := "Restructure the following text into Cornell Method format.\n\n" +
				"Required section markers (exact, uppercase, in square brackets):\n" +
				"[CUES]\n[NOTES]\n[SUMMARY]\n\n" +
				"Output rules:\n" +
				"- Plain text only. Do NOT use markdown tables, pipes (|), or HTML tags.\n" +
				"- Keep CUES as short prompt lines and NOTES as readable bullet paragraphs.\n\n" +
				"Cue quality rules (CRITICAL):\n" +
				"- Each cue MUST be a specific retrieval question with one unambiguous answer, not a topic label.\n" +
				"- WRONG: \"Cerebrum's role?\" — too broad, no single answer.\n" +
				"- RIGHT: \"What percentage of brain mass does the cerebrum occupy?\"\n" +
				"- People cues must target one action, date, policy, or decision — not broad traits.\n" +
				"- WRONG: \"What characterized Khrushchev's leadership?\"\n" +
				"- RIGHT: \"What provocative structure did Khrushchev build in 1961 to stop East German defections?\"\n" +
				"- Each cue must have exactly one specific answer. Split multi-aspect topics into separate cues.\n\n" +
				"Notes alignment rules (CRITICAL):\n" +
				"- Each NOTES bullet must directly answer its matching CUE.\n" +
				"- The first sentence of each note must answer the cue immediately — do not broaden scope.\n" +
				"- WRONG: Cue asks how the Cold War extended to Asia but note gives generic domino-theory policy.\n" +
				"- RIGHT: Cue asks that and note states China's 1949 revolution plus Korean War (1950-1953) brought Cold War conflict to Asia.\n\n" +
				"Summary rules:\n" +
				"- The [SUMMARY] section must synthesize — do not paraphrase the Notes section.\n" +
				"- Write the Summary as if explaining to someone who has not read the Notes.\n\n" +
				"Text to restructure:\n" + rawText
			resp2, err := summaryModel.GenerateContent(ctx, genai.Text(restructurePrompt))
			if err == nil {
				rawText2 := extractText(resp2)
				if strings.TrimSpace(rawText2) != "" {
					rawText = rawText2
				}
				c, n, st = parseCornell(rawText)
			}
		}
		if metadataOnlyMode {
			rawText = enforceMetadataOnlyCornell(rawText)
			c, n, st = parseCornell(rawText)
		}
		if c != "" {
			cues = &c
		}
		if n != "" {
			notes = &n
		}
		if st != "" {
			summaryText = &st
		}
	}

	// Generate metadata (second Gemini call)
	s.PublishUpdate(ctx, job.UserID, models.WSMessage{
		Type: "status_update",
		Payload: models.StatusUpdate{
			JobID: job.ID, Step: 4, StepName: "Formatting",
			EstimatedSecondsRemaining: 5,
		},
	})

	type metaResult struct {
		title       string
		tags        []string
		description *string
	}

	followUpCh := make(chan []string, 1)
	go func(excerpt string) {
		questions := []string{}
		defer func() {
			if recovered := recover(); recovered != nil {
				log.Printf("follow-up questions panic for summary %s: %v", job.ReferenceID, recovered)
			}
			select {
			case followUpCh <- questions:
			default:
			}
		}()

		followUpCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
		defer cancel()

		followUpPrompt := fmt.Sprintf(`Read the following summary and generate exactly 4 follow-up questions that a curious student would ask to understand the topic more deeply.

Rules:
- Each question must be specific to the content, not generic
- Questions should spark curiosity and go beyond surface facts
- Each question should have a different angle: cause, implication, comparison, application
- Keep each question under 15 words
- Return ONLY a valid JSON array of 4 strings, no preamble, no markdown, no backticks

Example format:
["Why does X cause Y?", "How does A differ from B?", "What happens if C is removed?", "How is D applied in real life?"]

Summary:
%s`, excerpt)

		resp, err := s.model.GenerateContent(followUpCtx, genai.Text(followUpPrompt))
		if err != nil {
			log.Printf("follow-up questions generation failed for summary %s: %v", job.ReferenceID, err)
			return
		}

		raw := extractText(resp)
		raw = strings.TrimPrefix(raw, "```json")
		raw = strings.TrimPrefix(raw, "```")
		raw = strings.TrimSuffix(raw, "```")
		raw = strings.TrimSpace(raw)

		start := strings.Index(raw, "[")
		end := strings.LastIndex(raw, "]")
		if start >= 0 && end > start {
			raw = raw[start : end+1]
		}

		var parsed []string
		if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
			log.Printf("follow-up questions JSON parse failed for summary %s: %v", job.ReferenceID, err)
			return
		}

		valid := make([]string, 0, 4)
		for _, q := range parsed {
			q = strings.TrimSpace(q)
			if q != "" {
				valid = append(valid, q)
			}
			if len(valid) == 4 {
				break
			}
		}

		questions = valid
	}(rawText[:min(len(rawText), 4000)])

	metaCh := make(chan metaResult, 1)
	go func(summaryExcerpt string) {
		result := metaResult{
			title:       "Untitled Summary",
			tags:        []string{},
			description: nil,
		}

		defer func() {
			if recovered := recover(); recovered != nil {
				log.Printf("metadata generation panic for summary %s: %v", job.ReferenceID, recovered)
			}
			select {
			case metaCh <- result:
			default:
			}
		}()

		metaCtx, cancel := context.WithTimeout(ctx, 10*time.Minute)
		defer cancel()

		metaPrompt := fmt.Sprintf(`Given this summary, return ONLY a valid JSON object with these fields:
{"suggested_title": "title under 60 chars", "tags": ["tag1","tag2","tag3","tag4","tag5"], "one_sentence_description": "description under 120 chars"}

Rules:
- suggested_title: concise, specific, reflects the main topic of the ENTIRE summary
- tags: cover the full range of topics across ALL sections, not just the opening
- one_sentence_description: summarizes the complete content in plain language

Summary:
%s`, summaryExcerpt)

		metaResp, err := s.model.GenerateContent(metaCtx, genai.Text(metaPrompt))
		if err == nil {
			metaJSON := extractText(metaResp)
			metaJSON = strings.TrimPrefix(metaJSON, "```json")
			metaJSON = strings.TrimPrefix(metaJSON, "```")
			metaJSON = strings.TrimSuffix(metaJSON, "```")
			metaJSON = strings.TrimSpace(metaJSON)

			var meta struct {
				Title       string   `json:"suggested_title"`
				Tags        []string `json:"tags"`
				Description string   `json:"one_sentence_description"`
			}
			if json.Unmarshal([]byte(metaJSON), &meta) == nil {
				if meta.Title != "" {
					result.title = meta.Title
				}
				if len(meta.Tags) > 0 {
					result.tags = meta.Tags
				}
				if meta.Description != "" {
					result.description = &meta.Description
				}
			} else {
				log.Printf("metadata generation returned non-JSON payload for summary %s", job.ReferenceID)
			}
		} else {
			log.Printf("metadata generation failed for summary %s: %v", job.ReferenceID, err)
		}
	}(rawText[:min(len(rawText), 6000)])

	// Count words while metadata call runs concurrently
	wordCount := len(strings.Fields(rawText))

	metaData := metaResult{title: "Untitled Summary", tags: []string{}, description: nil}
	followUpQuestions := []string{}
	select {
	case metaData = <-metaCh:
	case <-time.After(10 * time.Minute):
		log.Printf("metadata generation timeout for summary %s — using defaults", job.ReferenceID)
	}
	select {
	case followUpQuestions = <-followUpCh:
	case <-time.After(90 * time.Second):
		log.Printf("follow-up questions timeout for summary %s", job.ReferenceID)
	}
	title := metaData.title
	tags := metaData.tags
	description := metaData.description

	// Update summary in database
	err = s.summaryRepo.UpdateContent(
		ctx,
		job.ReferenceID,
		rawText,
		cues,
		notes,
		summaryText,
		followUpQuestions,
		tags,
		description,
		wordCount,
		isQualityFallback,
		qualityFallbackReason,
	)
	if err != nil {
		return err
	}

	if len(followUpQuestions) > 0 {
		if err := s.summaryRepo.UpdateFollowUpQuestions(ctx, job.ReferenceID, followUpQuestions); err != nil {
			log.Printf("failed to save follow-up questions for summary %s: %v", job.ReferenceID, err)
		}
	}

	// Update title
	if title != "" {
		s.summaryRepo.UpdateTitle(ctx, job.ReferenceID, title)
	}

	return nil
}

func (s *GeminiService) GeneratePresentation(ctx context.Context, job *models.Job, transcript string) error {
	if err := s.acquireRate(ctx); err != nil {
		return err
	}
	defer s.releaseRate()

	var config models.GeneratePresentationRequest
	_ = json.Unmarshal(job.ConfigJSON, &config)
	if config.SlideCount <= 0 {
		config.SlideCount = 7
	}
	if config.Language == "" {
		config.Language = "en"
	}
	if strings.TrimSpace(config.TextStyle) == "" {
		config.TextStyle = "formal"
	}
	if strings.TrimSpace(config.Theme) == "" {
		config.Theme = "navy"
	}
	if config.FocusAreas == nil {
		config.FocusAreas = []string{}
	}

	s.PublishUpdate(ctx, job.UserID, models.WSMessage{
		Type: "status_update",
		Payload: models.StatusUpdate{
			JobID: job.ID, Step: 3, StepName: "Designing presentation",
			EstimatedSecondsRemaining: 35,
		},
	})

	prompt := buildPresentationPrompt(config, transcript)
	resp, err := generateContentWithTimeout(ctx, s.model, 10*time.Minute, genai.Text(prompt))
	if err != nil {
		return fmt.Errorf("Gemini API error: %w", err)
	}

	rawText := extractText(resp)
	rawText = strings.TrimSpace(rawText)
	rawText = strings.TrimPrefix(rawText, "```json")
	rawText = strings.TrimPrefix(rawText, "```")
	rawText = strings.TrimSuffix(rawText, "```")
	rawText = strings.TrimSpace(rawText)

	var slides []models.PresentationSlide
	qualityFallback := false
	if rawText != "" {
		if err := json.Unmarshal([]byte(rawText), &slides); err != nil {
			start := strings.Index(rawText, "[")
			end := strings.LastIndex(rawText, "]")
			if start >= 0 && end > start {
				rawText = rawText[start : end+1]
				_ = json.Unmarshal([]byte(rawText), &slides)
			}
		}
	}

	if len(slides) == 0 {
		qualityFallback = true
		slides = buildFallbackPresentationSlides(transcript, config.SlideCount)
	}

	normalizePresentationSlides(slides)
	enforcePresentationTextQuality(slides, transcript)
	enforcePresentationImageQueries(slides, transcript)

	s.PublishUpdate(ctx, job.UserID, models.WSMessage{
		Type: "status_update",
		Payload: models.StatusUpdate{
			JobID: job.ID, Step: 4, StepName: "Attaching presentation images",
			EstimatedSecondsRemaining: 10,
		},
	})

	s.attachPresentationImages(ctx, slides, transcript)

	s.PublishUpdate(ctx, job.UserID, models.WSMessage{
		Type: "status_update",
		Payload: models.StatusUpdate{
			JobID: job.ID, Step: 5, StepName: "Saving presentation",
			EstimatedSecondsRemaining: 3,
		},
	})

	if err := s.presentationRepo.UpdateSlides(ctx, job.ReferenceID, slides, "completed", qualityFallback); err != nil {
		return err
	}

	if title := derivePresentationTitle(slides); title != "" {
		if err := s.presentationRepo.UpdateTitle(ctx, job.ReferenceID, title); err != nil {
			log.Printf("failed to update presentation title for %s: %v", job.ReferenceID, err)
		}
	}

	return nil
}

// TranscribeAudio uses Gemini File API to transcribe uploaded audio bytes.
func (s *GeminiService) TranscribeAudio(ctx context.Context, audio []byte, mimeType string) (string, error) {
	if err := s.acquireRate(ctx); err != nil {
		return "", err
	}
	defer s.releaseRate()

	if len(audio) == 0 {
		return "", fmt.Errorf("audio payload is empty")
	}

	file, err := s.client.UploadFile(ctx, "", bytes.NewReader(audio), &genai.UploadFileOptions{
		DisplayName: "youtube-audio",
		MIMEType:    mimeType,
	})
	if err != nil {
		return "", fmt.Errorf("failed to upload audio to Gemini: %w", err)
	}

	// Ensure remote file is cleaned up
	defer s.client.DeleteFile(context.Background(), file.Name)

	// Wait until file is active
	for i := 0; i < 20; i++ {
		current, getErr := s.client.GetFile(ctx, file.Name)
		if getErr != nil {
			return "", fmt.Errorf("failed to get uploaded file status: %w", getErr)
		}

		if current.State == genai.FileStateActive {
			file = current
			break
		}
		if current.State == genai.FileStateFailed {
			return "", fmt.Errorf("Gemini failed to process uploaded audio file")
		}

		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(2 * time.Second):
		}
	}

	if file.State != genai.FileStateActive {
		return "", fmt.Errorf("audio file did not become active in time")
	}

	prompt := "Transcribe the provided audio verbatim. Return plain text only, without markdown, headers, or explanations."

	resp, err := s.model.GenerateContent(ctx,
		genai.Text(prompt),
		genai.FileData{MIMEType: mimeType, URI: file.URI},
	)
	if err != nil {
		return "", fmt.Errorf("Gemini transcription error: %w", err)
	}

	text := strings.TrimSpace(extractText(resp))
	if text == "" {
		return "", fmt.Errorf("Gemini returned empty transcription")
	}

	return text, nil
}

// GenerateQuiz handles quiz generation
func (s *GeminiService) GenerateQuiz(ctx context.Context, job *models.Job, summaryContent string) error {
	if err := s.acquireRate(ctx); err != nil {
		return err
	}
	defer s.releaseRate()

	var config models.GenerateQuizRequest
	json.Unmarshal(job.ConfigJSON, &config)

	prompt := buildQuizPrompt(config, summaryContent)

	s.PublishUpdate(ctx, job.UserID, models.WSMessage{
		Type: "status_update",
		Payload: models.StatusUpdate{
			JobID: job.ID, Step: 2, StepName: "Generating Questions",
			EstimatedSecondsRemaining: 20,
		},
	})

	resp, err := generateContentWithTimeout(ctx, s.model, 10*time.Minute, genai.Text(prompt))
	if err != nil {
		return fmt.Errorf("Gemini API error: %w", err)
	}

	rawText := extractText(resp)
	rawText = strings.TrimPrefix(rawText, "```json")
	rawText = strings.TrimPrefix(rawText, "```")
	rawText = strings.TrimSuffix(rawText, "```")
	rawText = strings.TrimSpace(rawText)

	var questions []models.QuizQuestion
	if err := json.Unmarshal([]byte(rawText), &questions); err != nil {
		// Try to extract JSON array
		start := strings.Index(rawText, "[")
		end := strings.LastIndex(rawText, "]")
		if start >= 0 && end > start {
			json.Unmarshal([]byte(rawText[start:end+1]), &questions)
		}
	}

	// Validate + enforce config constraints
	validQuestions := validateQuizQuestions(questions, config)
	if len(validQuestions) == 0 {
		return fmt.Errorf("quiz generation produced zero valid questions")
	}
	questionsJSON, _ := json.Marshal(validQuestions)

	if err := s.quizRepo.UpdateQuestions(ctx, job.ReferenceID, questionsJSON, len(validQuestions)); err != nil {
		return err
	}

	s.PublishUpdate(ctx, job.UserID, models.WSMessage{
		Type: "completed",
		Payload: models.CompletedEvent{
			JobID:      job.ID,
			ResultID:   job.ReferenceID,
			ResultType: "quiz",
		},
	})

	return nil
}

// GenerateFlashcards handles flashcard generation
func (s *GeminiService) GenerateFlashcards(ctx context.Context, job *models.Job, summaryContent string) error {
	if err := s.acquireRate(ctx); err != nil {
		return err
	}
	defer s.releaseRate()

	var config models.GenerateFlashcardsRequest
	json.Unmarshal(job.ConfigJSON, &config)

	prompt := buildFlashcardPrompt(config, summaryContent)

	s.PublishUpdate(ctx, job.UserID, models.WSMessage{
		Type: "status_update",
		Payload: models.StatusUpdate{
			JobID: job.ID, Step: 2, StepName: "Creating Flashcards",
			EstimatedSecondsRemaining: 15,
		},
	})

	resp, err := generateContentWithTimeout(ctx, s.model, 10*time.Minute, genai.Text(prompt))
	if err != nil {
		return fmt.Errorf("Gemini API error: %w", err)
	}

	rawText := extractText(resp)
	rawText = strings.TrimPrefix(rawText, "```json")
	rawText = strings.TrimPrefix(rawText, "```")
	rawText = strings.TrimSuffix(rawText, "```")
	rawText = strings.TrimSpace(rawText)

	type cardJSON struct {
		Front      string  `json:"front"`
		Back       string  `json:"back"`
		Difficulty int     `json:"difficulty"`
		Mnemonic   *string `json:"mnemonic"`
		Example    *string `json:"example"`
		Topic      string  `json:"topic"`
	}

	var cards []cardJSON
	if err := json.Unmarshal([]byte(rawText), &cards); err != nil {
		start := strings.Index(rawText, "[")
		end := strings.LastIndex(rawText, "]")
		if start >= 0 && end > start {
			json.Unmarshal([]byte(rawText[start:end+1]), &cards)
		}
	}

	// Convert to model cards
	modelCards := make([]models.FlashcardCard, len(cards))
	for i, c := range cards {
		modelCards[i] = models.FlashcardCard{
			Front:      c.Front,
			Back:       c.Back,
			Mnemonic:   c.Mnemonic,
			Example:    c.Example,
			Topic:      c.Topic,
			Difficulty: c.Difficulty,
		}
		if modelCards[i].Difficulty < 1 || modelCards[i].Difficulty > 3 {
			modelCards[i].Difficulty = 2
		}
	}

	validCards := validateFlashcardCards(modelCards, config)
	if len(validCards) == 0 {
		return fmt.Errorf("flashcard generation produced zero valid cards")
	}

	if err := s.flashRepo.CreateCards(ctx, job.ReferenceID, validCards); err != nil {
		return err
	}

	s.PublishUpdate(ctx, job.UserID, models.WSMessage{
		Type: "completed",
		Payload: models.CompletedEvent{
			JobID:      job.ID,
			ResultID:   job.ReferenceID,
			ResultType: "flashcard",
		},
	})

	return nil
}

// Helper functions

func extractText(resp *genai.GenerateContentResponse) string {
	var text strings.Builder
	for _, cand := range resp.Candidates {
		if cand.Content != nil {
			for _, part := range cand.Content.Parts {
				if t, ok := part.(genai.Text); ok {
					text.WriteString(string(t))
				}
			}
		}
	}
	return text.String()
}

func parseCornell(text string) (cues, notes, summary string) {
	upper := strings.ToUpper(text)

	const (
		cuesMarker    = "[CUES]"
		notesMarker   = "[NOTES]"
		summaryMarker = "[SUMMARY]"
	)

	// Use LastIndex to skip preamble mentions and repeated markers.
	// For well-formed output LastIndex == Index; for malformed output
	// LastIndex finds the actual section header.
	cuesIdx := strings.LastIndex(upper, cuesMarker)
	notesIdx := strings.LastIndex(upper, notesMarker)
	summaryIdx := strings.LastIndex(upper, summaryMarker)

	if cuesIdx >= 0 && notesIdx > cuesIdx {
		cues = strings.TrimSpace(text[cuesIdx+len(cuesMarker) : notesIdx])
	}
	if notesIdx >= 0 && summaryIdx > notesIdx {
		notes = strings.TrimSpace(text[notesIdx+len(notesMarker) : summaryIdx])
	}
	if summaryIdx >= 0 {
		summary = strings.TrimSpace(text[summaryIdx+len(summaryMarker):])
	}

	return
}

func enforceSmartAdditionalFactsBullets(text string) (string, bool) {
	normalized := strings.ReplaceAll(text, "\r\n", "\n")
	lines := strings.Split(normalized, "\n")

	joinSections := func(parts ...string) string {
		normalizedParts := make([]string, 0, len(parts))
		for _, part := range parts {
			trimmed := strings.TrimRight(part, "\n")
			if trimmed == "" {
				continue
			}
			normalizedParts = append(normalizedParts, trimmed)
		}
		return strings.Join(normalizedParts, "\n\n")
	}

	start := -1
	for i, line := range lines {
		if isAdditionalFactsHeading(line) {
			start = i
			break
		}
	}
	if start == -1 {
		return text, false
	}

	end := len(lines)
	for i := start + 1; i < len(lines); i++ {
		if isSmartSectionBoundary(lines[i]) {
			end = i
			break
		}
	}

	if end <= start+1 {
		return normalized, false
	}

	sectionLines := lines[start+1 : end]
	hasBullets := false
	for _, line := range sectionLines {
		t := strings.TrimSpace(line)
		if strings.HasPrefix(t, "- ") || strings.HasPrefix(t, "* ") || strings.HasPrefix(t, "+ ") {
			hasBullets = true
			break
		}
	}

	if hasBullets {
		// Ensure markdown list parsing stability: keep a blank line after heading.
		if len(sectionLines) > 0 && strings.TrimSpace(sectionLines[0]) != "" {
			before := strings.Join(lines[:start+1], "\n")
			factsSection := strings.Join(sectionLines, "\n")

			cleaned := ""
			if end < len(lines) {
				after := strings.Join(lines[end:], "\n")
				cleaned = joinSections(before, factsSection, after)
			} else {
				cleaned = joinSections(before, factsSection)
			}

			for strings.Contains(cleaned, "\n\n\n") {
				cleaned = strings.ReplaceAll(cleaned, "\n\n\n", "\n\n")
			}
			return strings.TrimSpace(cleaned), true
		}
		return normalized, false
	}

	paragraphs := collectParagraphChunks(sectionLines)
	if len(paragraphs) == 0 {
		return normalized, false
	}

	bullets := make([]string, 0, len(paragraphs)*2)
	for _, paragraph := range paragraphs {
		parts := splitSentenceLikeChunks(paragraph)
		if len(parts) == 0 {
			continue
		}
		for _, part := range parts {
			bullets = append(bullets, "- "+part)
		}
	}

	if len(bullets) == 0 {
		return normalized, false
	}

	before := strings.Join(lines[:start+1], "\n")
	factsSection := strings.Join(bullets, "\n")

	cleaned := ""
	if end < len(lines) {
		after := strings.Join(lines[end:], "\n")
		cleaned = joinSections(before, factsSection, after)
	} else {
		cleaned = joinSections(before, factsSection)
	}

	for strings.Contains(cleaned, "\n\n\n") {
		cleaned = strings.ReplaceAll(cleaned, "\n\n\n", "\n\n")
	}

	return strings.TrimSpace(cleaned), true
}

func normalizeSmartHeadingCandidate(line string) string {
	t := strings.TrimSpace(line)
	t = strings.TrimLeft(t, "#")
	t = strings.TrimSpace(t)

	if isOrderedListLine(t) {
		idx := strings.IndexAny(t, ".)")
		if idx >= 0 && idx+1 < len(t) {
			t = strings.TrimSpace(t[idx+1:])
		}
	}

	t = strings.TrimPrefix(t, "- ")
	t = strings.TrimPrefix(t, "* ")
	t = strings.TrimPrefix(t, "+ ")
	t = strings.TrimSpace(strings.TrimSuffix(t, ":"))

	return strings.ToLower(t)
}

func isAdditionalFactsHeading(line string) bool {
	normalized := normalizeSmartHeadingCandidate(line)
	return strings.Contains(normalized, "additional interesting facts")
}

func isKeyInsightsHeading(line string) bool {
	normalized := normalizeSmartHeadingCandidate(line)
	return strings.Contains(normalized, "key insights and core concepts")
}

func isSmartSectionBoundary(line string) bool {
	t := strings.TrimSpace(line)
	if t == "" {
		return false
	}
	if strings.HasPrefix(t, "#") || isOrderedListLine(t) {
		return true
	}

	normalized := normalizeSmartHeadingCandidate(t)
	return strings.Contains(normalized, "summary of video content") ||
		strings.Contains(normalized, "key insights and core concepts") ||
		strings.Contains(normalized, "brain structure and functions") ||
		strings.Contains(normalized, "key concepts table") ||
		strings.Contains(normalized, "summary table") ||
		strings.Contains(normalized, "additional interesting facts") ||
		strings.Contains(normalized, "conclusions") ||
		strings.Contains(normalized, "summary highlights")
}

func enforceMetadataOnlyKeyInsightsSection(text string) string {
	normalized := strings.ReplaceAll(text, "\r\n", "\n")
	lines := strings.Split(normalized, "\n")

	start := -1
	for i, line := range lines {
		if isKeyInsightsHeading(line) {
			start = i
			break
		}
	}
	if start == -1 {
		return text
	}

	end := len(lines)
	for i := start + 1; i < len(lines); i++ {
		if isSmartSectionBoundary(lines[i]) {
			end = i
			break
		}
	}

	replacement := []string{
		lines[start],
		"",
		"Key Insights cannot be generated from metadata alone. Please provide a video with an available transcript.",
	}

	rebuilt := make([]string, 0, len(lines)-max(0, end-start-1)+len(replacement)-1)
	rebuilt = append(rebuilt, lines[:start]...)
	rebuilt = append(rebuilt, replacement...)
	if end < len(lines) {
		rebuilt = append(rebuilt, "")
		rebuilt = append(rebuilt, lines[end:]...)
	}

	cleaned := strings.Join(rebuilt, "\n")
	for strings.Contains(cleaned, "\n\n\n") {
		cleaned = strings.ReplaceAll(cleaned, "\n\n\n", "\n\n")
	}

	return strings.TrimSpace(cleaned)
}

func containsMetadataHedgeLanguage(line string) bool {
	lower := strings.ToLower(line)
	hedgePhrases := []string{
		"likely covers",
		"likely discusses",
		"likely explores",
		"likely focuses",
		"presumably",
		"the video probably",
		"probably covers",
		"probably discusses",
		"it can be assumed",
		"hypothetically",
		"may cover",
		"may discuss",
		"might cover",
		"might discuss",
		"appears to cover",
		"seems to cover",
		"is expected to",
		"would likely",
		"could cover",
		"based on the title",
		"based on the metadata",
		"without access to the transcript",
		"cannot be confirmed",
	}

	for _, phrase := range hedgePhrases {
		if strings.Contains(lower, phrase) {
			return true
		}
	}

	return false
}

func enforceMetadataOnlyCornell(text string) string {
	normalized := strings.ReplaceAll(text, "\r\n", "\n")
	upper := strings.ToUpper(normalized)

	type section struct {
		marker  string
		idx     int
		message string
	}

	sections := make([]section, 0, 3)
	if idx := strings.Index(upper, "[CUES]"); idx >= 0 {
		sections = append(sections, section{
			marker:  "[CUES]",
			idx:     idx,
			message: "No cues available: transcript was not accessible for this video.",
		})
	}
	if idx := strings.Index(upper, "[NOTES]"); idx >= 0 {
		sections = append(sections, section{
			marker:  "[NOTES]",
			idx:     idx,
			message: "No notes available: transcript was not accessible for this video.",
		})
	}
	if idx := strings.Index(upper, "[SUMMARY]"); idx >= 0 {
		sections = append(sections, section{
			marker:  "[SUMMARY]",
			idx:     idx,
			message: "A summary cannot be generated from metadata alone. Please provide a video with an available transcript.",
		})
	}

	if len(sections) == 0 {
		cleaned := normalized
		for strings.Contains(cleaned, "\n\n\n") {
			cleaned = strings.ReplaceAll(cleaned, "\n\n\n", "\n\n")
		}
		return strings.TrimSpace(cleaned)
	}

	for i := 0; i < len(sections); i++ {
		for j := i + 1; j < len(sections); j++ {
			if sections[j].idx < sections[i].idx {
				sections[i], sections[j] = sections[j], sections[i]
			}
		}
	}

	var rebuilt strings.Builder
	if sections[0].idx > 0 {
		rebuilt.WriteString(normalized[:sections[0].idx])
	}

	for i, sec := range sections {
		rebuilt.WriteString(sec.marker)
		rebuilt.WriteString("\n\n")
		rebuilt.WriteString(sec.message)
		if i < len(sections)-1 {
			rebuilt.WriteString("\n\n")
		}
	}

	cleaned := rebuilt.String()
	for strings.Contains(cleaned, "\n\n\n") {
		cleaned = strings.ReplaceAll(cleaned, "\n\n\n", "\n\n")
	}

	return strings.TrimSpace(cleaned)
}

func enforceMetadataOnlyBullets(text string) string {
	normalized := strings.ReplaceAll(text, "\r\n", "\n")
	lines := strings.Split(normalized, "\n")
	out := make([]string, 0, len(lines))

	totalBullets := 0
	replacedBullets := 0

	for _, line := range lines {
		t := strings.TrimSpace(line)
		if t == "" {
			out = append(out, "")
			continue
		}

		prefix := ""
		content := ""
		switch {
		case strings.HasPrefix(t, "- "):
			prefix = "- "
			content = strings.TrimSpace(t[2:])
		case strings.HasPrefix(t, "• "):
			prefix = "• "
			content = strings.TrimSpace(t[2:])
		case strings.HasPrefix(t, "* "):
			prefix = "* "
			content = strings.TrimSpace(t[2:])
		}

		if prefix == "" {
			out = append(out, t)
			continue
		}

		totalBullets++
		if containsMetadataHedgeLanguage(content) {
			replacedBullets++
			out = append(out, prefix+"Content not available: transcript was not accessible for this video.")
			continue
		}

		out = append(out, prefix+content)
	}

	if totalBullets > 0 && replacedBullets == totalBullets {
		out = []string{
			"Overview",
			"- A summary cannot be generated from metadata alone. Please provide a video with an available transcript.",
		}
	}

	cleaned := strings.Join(out, "\n")
	for strings.Contains(cleaned, "\n\n\n") {
		cleaned = strings.ReplaceAll(cleaned, "\n\n\n", "\n\n")
	}

	return strings.TrimSpace(cleaned)
}

func enforceMetadataOnlyParagraph(text string) string {
	normalized := strings.ReplaceAll(text, "\r\n", "\n")
	lines := strings.Split(normalized, "\n")

	type paragraphSection struct {
		heading string
		body    []string
	}

	isHeading := func(lines []string, i int, line string) bool {
		t := strings.TrimSpace(line)
		if t == "" {
			return false
		}
		if strings.HasPrefix(t, "#") {
			return true
		}
		if len(t) < 80 && !strings.ContainsAny(t, ".!?") {
			if i+1 < len(lines) && strings.TrimSpace(lines[i+1]) == "" {
				return true
			}
		}
		return false
	}

	sections := make([]paragraphSection, 0)
	current := paragraphSection{}
	hasAnyHeading := false

	flushCurrent := func() {
		if current.heading == "" && len(current.body) == 0 {
			return
		}
		sections = append(sections, current)
		current = paragraphSection{}
	}

	for i, line := range lines {
		t := strings.TrimSpace(line)
		if t == "" {
			continue
		}

		if isHeading(lines, i, t) {
			hasAnyHeading = true
			flushCurrent()
			current.heading = t
			continue
		}

		if containsMetadataHedgeLanguage(t) {
			continue
		}

		current.body = append(current.body, t)
	}

	flushCurrent()

	if len(sections) == 0 {
		return "A summary cannot be generated from metadata alone. Please provide a video with an available transcript."
	}

	out := make([]string, 0, len(lines))
	nonHeadingLines := 0

	for i, sec := range sections {
		if sec.heading != "" {
			out = append(out, sec.heading)
		}

		if len(sec.body) == 0 {
			if hasAnyHeading {
				out = append(out, "Content not available: transcript was not accessible for this video.")
				nonHeadingLines++
			}
		} else {
			out = append(out, sec.body...)
			nonHeadingLines += len(sec.body)
		}

		if i < len(sections)-1 {
			out = append(out, "")
		}
	}

	if nonHeadingLines == 0 {
		return "A summary cannot be generated from metadata alone. Please provide a video with an available transcript."
	}

	cleaned := strings.Join(out, "\n")
	for strings.Contains(cleaned, "\n\n\n") {
		cleaned = strings.ReplaceAll(cleaned, "\n\n\n", "\n\n")
	}

	cleaned = strings.TrimSpace(cleaned)
	if cleaned == "" {
		return "A summary cannot be generated from metadata alone. Please provide a video with an available transcript."
	}

	return cleaned
}

func isOrderedListLine(line string) bool {
	t := strings.TrimSpace(line)
	if t == "" {
		return false
	}

	i := 0
	for i < len(t) && t[i] >= '0' && t[i] <= '9' {
		i++
	}
	if i == 0 || i >= len(t) {
		return false
	}

	if (t[i] != '.' && t[i] != ')') || i+1 >= len(t) || t[i+1] != ' ' {
		return false
	}

	return true
}

func collectParagraphChunks(lines []string) []string {
	chunks := []string{}
	current := []string{}

	flush := func() {
		if len(current) == 0 {
			return
		}
		merged := strings.TrimSpace(strings.Join(current, " "))
		if merged != "" {
			chunks = append(chunks, merged)
		}
		current = current[:0]
	}

	for _, line := range lines {
		t := strings.TrimSpace(line)
		if t == "" {
			flush()
			continue
		}

		t = strings.TrimSpace(strings.TrimPrefix(t, ">"))
		if t == "" {
			continue
		}

		if strings.HasPrefix(t, "- ") || strings.HasPrefix(t, "* ") || strings.HasPrefix(t, "+ ") {
			flush()
			item := strings.TrimSpace(t[2:])
			if item != "" {
				chunks = append(chunks, item)
			}
			continue
		}

		if isOrderedListLine(t) {
			flush()
			idx := strings.IndexAny(t, ".)")
			if idx >= 0 && idx+1 < len(t) {
				item := strings.TrimSpace(t[idx+1:])
				if item != "" {
					chunks = append(chunks, item)
				}
			}
			continue
		}

		current = append(current, t)
	}

	flush()
	return chunks
}

func splitSentenceLikeChunks(text string) []string {
	text = strings.Join(strings.Fields(text), " ")
	if text == "" {
		return nil
	}

	runes := []rune(text)
	parts := []string{}
	var current strings.Builder

	flush := func() {
		value := strings.TrimSpace(current.String())
		if value != "" {
			parts = append(parts, value)
		}
		current.Reset()
	}

	for i, r := range runes {
		current.WriteRune(r)
		if r != '.' && r != '!' && r != '?' {
			continue
		}

		j := i + 1
		for j < len(runes) && unicode.IsSpace(runes[j]) {
			j++
		}

		if j < len(runes) {
			next := runes[j]
			if unicode.IsUpper(next) || unicode.IsDigit(next) || next == '(' || next == '[' || next == '"' || next == '“' {
				flush()
			}
		}
	}

	flush()
	if len(parts) == 0 {
		return []string{text}
	}

	return parts
}

func isFillerOverviewBullet(line string) bool {
	lower := strings.ToLower(strings.TrimSpace(line))

	content := lower
	for _, prefix := range []string{"- ", "* ", "• "} {
		if strings.HasPrefix(content, prefix) {
			content = strings.TrimPrefix(content, prefix)
			break
		}
	}

	if !strings.HasPrefix(content, "overview of") {
		return false
	}

	if strings.Contains(content, ":") {
		return false
	}

	for _, r := range content {
		if unicode.IsDigit(r) {
			return false
		}
	}

	afterPhrase := strings.TrimSpace(strings.TrimPrefix(content, "overview of"))
	wordCount := len(strings.Fields(afterPhrase))
	if wordCount > 6 {
		return false
	}

	return true
}

func normalizeBulletsSummary(text string) string {
	normalized := strings.ReplaceAll(text, "\r\n", "\n")
	lines := strings.Split(normalized, "\n")
	out := make([]string, 0, len(lines))
	currentHeading := ""
	lastHeading := ""

	for _, line := range lines {
		t := strings.TrimSpace(line)
		if t == "" {
			out = append(out, "")
			continue
		}

		lower := strings.ToLower(t)
		if strings.HasPrefix(lower, "executive summary:") {
			t = strings.TrimSpace(t[len("Executive Summary:"):])
			if t == "" {
				continue
			}
		}

		bulletPrefix := ""
		content := t
		if strings.HasPrefix(t, "• ") {
			bulletPrefix = "• "
			content = strings.TrimSpace(t[2:])
		} else if strings.HasPrefix(t, "- ") {
			bulletPrefix = "- "
			content = strings.TrimSpace(t[2:])
		} else if strings.HasPrefix(t, "* ") {
			bulletPrefix = "• "
			content = strings.TrimSpace(t[2:])
		}

		if bulletPrefix == "" {
			heading := strings.ToLower(strings.TrimSpace(strings.TrimSuffix(content, ":")))
			if heading != "" && heading == lastHeading {
				continue
			}
			currentHeading = heading
			if heading != "" {
				lastHeading = heading
			}
			out = append(out, content)
			continue
		}

		content = strings.ReplaceAll(content, "Case Study/Observation:", "Fact:")
		content = strings.ReplaceAll(content, "Case study/observation:", "Fact:")
		content = strings.ReplaceAll(content, "Case Study:", "Fact:")
		content = strings.ReplaceAll(content, "Observation:", "Fact:")
		content = strings.ReplaceAll(content, "Figure:", "Size:")
		content = strings.ReplaceAll(content, "Example:", "Examples:")

		// Trim only filler overview bullets after wrapper headings.
		if isFillerOverviewBullet(content) {
			continue
		}

		if strings.Contains(currentHeading, "interesting facts") {
			if strings.HasPrefix(strings.ToLower(content), "fact:") {
				content = strings.TrimSpace(content[len("Fact:"):])
			}
		}

		// Integrate size/details into the previous Definition bullet for consistency.
		if strings.HasPrefix(strings.ToLower(content), "size:") {
			sizeText := strings.TrimSpace(content[len("Size:"):])
			if sizeText != "" {
				for i := len(out) - 1; i >= 0; i-- {
					prev := strings.TrimSpace(out[i])
					if prev == "" {
						continue
					}
					prevContent := strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(prev, "• "), "- "))
					if strings.HasPrefix(strings.ToLower(prevContent), "definition:") {
						def := strings.TrimSpace(prevContent[len("Definition:"):])
						if def != "" {
							def = strings.TrimSuffix(def, ".")
							sizeText = strings.TrimSuffix(sizeText, ".")
							prefix := "• "
							if strings.HasPrefix(prev, "- ") {
								prefix = "- "
							}
							out[i] = prefix + "Definition: " + def + " (" + sizeText + ")."
							content = ""
						}
						break
					}
				}
			}
			if content == "" {
				continue
			}
		}

		out = append(out, bulletPrefix+content)
	}

	cleaned := strings.Join(out, "\n")
	for strings.Contains(cleaned, "\n\n\n") {
		cleaned = strings.ReplaceAll(cleaned, "\n\n\n", "\n\n")
	}
	return strings.TrimSpace(cleaned)
}

func normalizeParagraphSummary(text string) string {
	normalized := strings.ReplaceAll(text, "\r\n", "\n")
	lines := strings.Split(normalized, "\n")
	out := make([]string, 0, len(lines))

	boldLabelRe := regexp.MustCompile(`(?i)\*\*\s*(key concept|definition|example|case study|dates\s*&\s*figures|dates and figures|fact)\s*:\s*([^*]+?)\s*\*\*`)
	inlineLabelRe := regexp.MustCompile(`(?i)\b(key concept|definition|example|case study|dates\s*&\s*figures|dates and figures|fact)\s*:\s*`)
	multiSpaceRe := regexp.MustCompile(`[ \t]{2,}`)

	for _, line := range lines {
		t := strings.TrimSpace(line)
		if t == "" {
			out = append(out, "")
			continue
		}

		if strings.HasPrefix(t, "- ") || strings.HasPrefix(t, "• ") || strings.HasPrefix(t, "* ") {
			t = strings.TrimSpace(t[2:])
		}

		t = boldLabelRe.ReplaceAllString(t, `$2`)
		t = inlineLabelRe.ReplaceAllString(t, "")
		t = multiSpaceRe.ReplaceAllString(t, " ")
		t = strings.TrimSpace(t)

		if t != "" {
			out = append(out, t)
		}
	}

	cleaned := strings.Join(out, "\n")
	for strings.Contains(cleaned, "\n\n\n") {
		cleaned = strings.ReplaceAll(cleaned, "\n\n\n", "\n\n")
	}

	return strings.TrimSpace(cleaned)
}

func containsMarkdownTable(text string) bool {
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	for i := 0; i < len(lines)-1; i++ {
		head := strings.TrimSpace(lines[i])
		sep := strings.TrimSpace(lines[i+1])
		if strings.HasPrefix(head, "|") && strings.HasSuffix(head, "|") {
			if strings.HasPrefix(sep, "|") && strings.HasSuffix(sep, "|") && strings.Contains(sep, "---") {
				return true
			}
		}
	}
	return false
}

func hasValidSmartSummaryTable(text string) bool {
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")

	for i := 0; i < len(lines)-1; i++ {
		header := strings.TrimSpace(lines[i])
		separator := strings.TrimSpace(lines[i+1])
		if !strings.HasPrefix(header, "|") || !strings.HasSuffix(header, "|") {
			continue
		}

		headerCells := parseMarkdownTableCells(header)
		if len(headerCells) < 2 {
			continue
		}

		if !isMarkdownSeparatorRow(separator, len(headerCells)) {
			continue
		}

		dataRows := 0
		for j := i + 2; j < len(lines); j++ {
			row := strings.TrimSpace(lines[j])
			if !strings.HasPrefix(row, "|") || !strings.HasSuffix(row, "|") {
				break
			}

			cells := parseMarkdownTableCells(row)
			if len(cells) != len(headerCells) {
				return false
			}

			for _, cell := range cells {
				trimmedCell := strings.TrimSpace(cell)
				if trimmedCell == "" || isDashPlaceholderCell(trimmedCell) {
					return false
				}
			}

			dataRows++
		}

		if dataRows > 0 {
			return true
		}
	}

	return false
}

func parseMarkdownTableCells(row string) []string {
	trimmed := strings.TrimSpace(row)
	trimmed = strings.TrimPrefix(trimmed, "|")
	trimmed = strings.TrimSuffix(trimmed, "|")
	parts := strings.Split(trimmed, "|")

	cells := make([]string, 0, len(parts))
	for _, part := range parts {
		cells = append(cells, strings.TrimSpace(part))
	}

	return cells
}

func isMarkdownSeparatorRow(row string, expectedColumns int) bool {
	cells := parseMarkdownTableCells(row)
	if expectedColumns < 2 || len(cells) != expectedColumns {
		return false
	}

	for _, cell := range cells {
		normalized := strings.TrimSpace(cell)
		if strings.HasPrefix(normalized, ":") {
			normalized = normalized[1:]
		}
		if strings.HasSuffix(normalized, ":") {
			normalized = normalized[:len(normalized)-1]
		}
		if len(normalized) < 3 {
			return false
		}
		for _, ch := range normalized {
			if ch != '-' {
				return false
			}
		}
	}

	return true
}

func isDashPlaceholderCell(cell string) bool {
	normalized := strings.ReplaceAll(strings.TrimSpace(cell), " ", "")
	if normalized == "" {
		return false
	}
	for _, ch := range normalized {
		if ch != '-' {
			return false
		}
	}
	return true
}

func ensureSmartSummaryTable(text string) string {
	normalized := strings.ReplaceAll(text, "\r\n", "\n")
	if hasValidSmartSummaryTable(normalized) {
		return normalized
	}

	lines := strings.Split(normalized, "\n")
	rows := make([]string, 0, 3)
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if strings.HasPrefix(trimmed, "#") || strings.HasPrefix(trimmed, "|") {
			continue
		}
		trimmed = strings.TrimPrefix(trimmed, "- ")
		trimmed = strings.TrimPrefix(trimmed, "• ")
		if trimmed == "" {
			continue
		}
		rows = append(rows, trimmed)
		if len(rows) == 3 {
			break
		}
	}

	for len(rows) < 3 {
		rows = append(rows, "Key takeaway")
	}

	var b strings.Builder
	b.WriteString(strings.TrimSpace(normalized))
	b.WriteString("\n\n## Key Concepts Table\n")
	b.WriteString("| Concept | Explanation |\n")
	b.WriteString("| --- | --- |\n")
	for i, row := range rows {
		b.WriteString(fmt.Sprintf("| Point %d | %s |\n", i+1, strings.ReplaceAll(row, "|", "/")))
	}

	return b.String()
}

func normalizeSmartLabels(text string) string {
	text = strings.ReplaceAll(text, "\nCore Concept:", "\nKey Concept:")
	text = strings.ReplaceAll(text, "\nCore concept:", "\nKey Concept:")
	text = strings.ReplaceAll(text, "\ncore concept:", "\nKey Concept:")
	if strings.HasPrefix(text, "Core Concept:") || strings.HasPrefix(text, "Core concept:") || strings.HasPrefix(text, "core concept:") {
		text = "Key Concept:" + text[strings.Index(text, ":")+1:]
	}
	return text
}

func pruneSmartRedundantSections(text string) string {
	normalized := strings.ReplaceAll(text, "\r\n", "\n")
	lines := strings.Split(normalized, "\n")

	isHeader := func(line string) bool {
		trimmed := strings.TrimSpace(strings.TrimPrefix(line, "#"))
		trimmed = strings.TrimSpace(strings.TrimPrefix(trimmed, "-"))
		lower := strings.ToLower(trimmed)
		return strings.Contains(lower, "summary of video content") ||
			strings.Contains(lower, "key insights and core concepts") ||
			strings.Contains(lower, "brain structure and functions") ||
			strings.Contains(lower, "key concepts table") ||
			strings.Contains(lower, "summary table") ||
			strings.Contains(lower, "additional interesting facts") ||
			strings.Contains(lower, "conclusions") ||
			strings.Contains(lower, "summary highlights")
	}

	isForbiddenHeader := func(line string) bool {
		trimmed := strings.TrimSpace(strings.TrimPrefix(line, "#"))
		trimmed = strings.TrimSpace(strings.TrimPrefix(trimmed, "-"))
		lower := strings.ToLower(trimmed)
		return strings.Contains(lower, "conclusions") || strings.Contains(lower, "summary highlights") || strings.Contains(lower, "summary table")
	}

	isSectionBoundary := func(line string) bool {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			return false
		}
		if strings.HasPrefix(trimmed, "#") {
			return true
		}
		return isHeader(line)
	}

	hasFutureSectionBoundary := func(start int) bool {
		for i := start; i < len(lines); i++ {
			if isSectionBoundary(lines[i]) {
				return true
			}
		}
		return false
	}

	out := make([]string, 0, len(lines))
	skip := false
	sawBlankWhileSkipping := false
	for i, line := range lines {
		if isForbiddenHeader(line) {
			skip = true
			sawBlankWhileSkipping = false
			continue
		}
		if skip {
			trimmed := strings.TrimSpace(line)
			if trimmed == "" {
				sawBlankWhileSkipping = true
				continue
			}

			if isSectionBoundary(line) {
				skip = false
				sawBlankWhileSkipping = false
			} else if sawBlankWhileSkipping && !hasFutureSectionBoundary(i+1) {
				// Preserve orphaned trailing content that appears after a pruned forbidden section.
				skip = false
				sawBlankWhileSkipping = false
			} else {
				continue
			}
		}
		out = append(out, line)
	}

	cleaned := strings.Join(out, "\n")
	for strings.Contains(cleaned, "\n\n\n") {
		cleaned = strings.ReplaceAll(cleaned, "\n\n\n", "\n\n")
	}
	return strings.TrimSpace(cleaned)
}

func removeWeakExampleLines(text string) string {
	normalized := strings.ReplaceAll(text, "\r\n", "\n")
	lines := strings.Split(normalized, "\n")
	out := make([]string, 0, len(lines))

	for _, line := range lines {
		trimmed := strings.TrimSpace(strings.ToLower(line))
		if strings.HasPrefix(trimmed, "example:") && strings.Contains(trimmed, "not explicitly stated in transcript") {
			continue
		}
		out = append(out, line)
	}

	cleaned := strings.Join(out, "\n")
	for strings.Contains(cleaned, "\n\n\n") {
		cleaned = strings.ReplaceAll(cleaned, "\n\n\n", "\n\n")
	}
	return strings.TrimSpace(cleaned)
}

func (s *GeminiService) rewriteSmartSummaryForFidelity(ctx context.Context, summaryText, transcript string) string {
	snippet := transcript[:min(len(transcript), 6000)]
	prompt := fmt.Sprintf(`You are revising a Smart Summary for strict factual fidelity.

Rules:
1) Preserve terminology from the transcript; prefer exact source terms.
2) Do NOT invent renamed concepts or neologisms.
3) Keep facts grounded in transcript evidence only.
4) For the section "Key Insights and Core Concepts", write 3-5 mini-paragraph insights with this shape:
   - **Key Concept: <specific concept from transcript>**
   - 1-2 sentence insight explaining implication/connection (not dictionary-style definition).
   - Include an Example line ONLY when there is an explicit transcript example; otherwise omit Example line entirely.
5) Ensure each triple is genuinely distinct and non-redundant.
6) Keep entity/concept descriptions ONLY in the topic-appropriate table section; avoid repeating those details in Key Insights.
7) Remove redundant sections; do NOT include "Conclusions" or "Summary Highlights".
8) Additional Interesting Facts must exclude trivial/silly statements and focus on substantial facts with concrete value.
9) For "Additional Interesting Facts", output 3-6 markdown bullets (each line starts with '- '). Do NOT output that section as a paragraph.
10) Keep markdown format and keep at least one markdown table.
11) Return markdown only.

Transcript excerpt:
%s

Current summary:
%s`, snippet, summaryText)

	resp, err := s.model.GenerateContent(ctx, genai.Text(prompt))
	if err != nil {
		return summaryText
	}

	text := strings.TrimSpace(extractText(resp))
	if text == "" {
		return summaryText
	}

	return text
}

func buildSummaryPrompt(format, length string, focusAreas []string, audience, language, transcript string, metadataOnlyMode bool) string {
	var b strings.Builder

	// Layer 1 — Role
	b.WriteString("You are an expert educational content analyst. Your task is to create a structured summary of the following lecture transcript.\n\n")
	b.WriteString("Universal rule: Cross-section uniqueness rule: Each fact or insight must be expressed with unique phrasing. If the same information appears in multiple sections, vary the angle, vocabulary, or implication. Never copy-paste the same sentence across sections. Maintain consistent academic-but-accessible vocabulary throughout all sections.\n\n")

	// Layer 2 — Format
	switch format {
	case "cornell":
		b.WriteString("Format: Use the Cornell Method. Provide three clearly labeled sections with these exact headers and order:\n[CUES]\n[NOTES]\n[SUMMARY]\n")
		b.WriteString("Output rules for Cornell: plain text only; DO NOT use markdown tables; DO NOT use pipes (|); DO NOT use HTML tags; keep CUES as short prompt lines and NOTES as readable bullet paragraphs.\n")
		b.WriteString("CRITICAL FORMATTING RULE: Both CUES and NOTES must be numbered lists using '1. ', '2. ', '3. ', etc. Each cue gets its own numbered line. Each note gets its own numbered line with the SAME number as its matching cue. Cue N answers Note N — they MUST be paired 1:1.\n")
		b.WriteString("Example output structure:\n[CUES]\n1. What percentage of brain mass does the cerebrum occupy?\n2. Which brain region coordinates voluntary movement?\n[NOTES]\n1. The cerebrum occupies approximately 85% of total brain mass and is responsible for higher-order thinking.\n2. The cerebellum coordinates voluntary movements, balance, and motor learning.\n[SUMMARY]\nThe brain consists of...\n\n")
		b.WriteString("Cue formatting rule: Each cue MUST be a specific retrieval question, not a topic label.\n")
		b.WriteString("WRONG: \"Cerebrum's role?\"\n")
		b.WriteString("RIGHT: \"What percentage of brain mass does the cerebrum occupy?\"\n")
		b.WriteString("Additional cue rules: people cues must target one action/date/policy/decision; not broad traits. WRONG: 'What characterized Khrushchev's leadership?' RIGHT: 'What provocative structure did Khrushchev build in 1961 to stop East German defections?' Each cue must have one specific answer; split multi-aspect topics into separate cues.\n")
		b.WriteString("Notes alignment rule: each NOTES bullet must directly answer its matching CUE; first sentence answers immediately; do not broaden scope. WRONG: Cue asks 'How did Cold War extend to Asia?' but note is generic domino-theory policy. RIGHT: Cue asks that and note states China's 1949 revolution plus Korean War (1950-1953) brought Cold War conflict to Asia.\n")
		b.WriteString("Cues should function as self-quiz questions a student could test themselves with.\n")
		b.WriteString("The Summary section must synthesize — do not paraphrase the Notes section. Write the Summary as if explaining to someone who has not read the Notes.\n\n")
		switch length {
		case "concise":
			b.WriteString("Cue count: generate 4-6 cues maximum. Do not exceed 6 cues under any circumstances.\n")
		case "standard":
			b.WriteString("Cue count: generate 6-8 cues maximum. Do not exceed 8 cues under any circumstances.\n")
		case "detailed":
			b.WriteString("Cue count: generate 9-12 cues maximum. Do not exceed 12 cues under any circumstances.\n")
		case "comprehensive":
			b.WriteString("Cue count: generate 13-18 cues maximum. Do not exceed 18 cues under any circumstances.\n")
		default:
			b.WriteString("Cue count: generate 6-8 cues maximum. Do not exceed 8 cues under any circumstances.\n")
		}
	case "bullets":
		b.WriteString("Format: Use structured bullet points with clear headings and concise bullets.\n")
		b.WriteString("Bullets output rules:\n")
		b.WriteString("1) Required section flow (exact order): Overview -> Core Structures -> Interesting Facts. These are the ONLY three top-level headings allowed.\n")
		b.WriteString("2) Do NOT include redundant wrapper titles like 'Executive Summary:' and do NOT repeat section headings (e.g., 'Overview' twice).\n")
		b.WriteString("3) Keep wording plain and concrete; avoid unnecessarily academic jargon when simpler wording is possible.\n")
		b.WriteString("CRITICAL NESTING RULE: ALL items in Core Structures MUST be bullet points nested UNDER the single 'Core Structures' heading. Do NOT create separate headings for each item. Each item is a bullet (- ItemName) with sub-bullets for Definition/Function/Examples/Key Takeaway.\n")
		b.WriteString("CORRECT structure example:\n")
		b.WriteString("## Core Structures\n")
		b.WriteString("- **Variables**\n")
		b.WriteString("  - Definition: Named identifiers storing data values.\n")
		b.WriteString("  - Function: Label and reference information.\n")
		b.WriteString("  - Examples: item = \"banana\", age = 28.\n")
		b.WriteString("  - Key Takeaway: Case-sensitivity prevents data conflicts.\n")
		b.WriteString("- **Data Types**\n")
		b.WriteString("  - Definition: Classifications defining a variable's value type.\n")
		b.WriteString("  ...\n\n")
		b.WriteString("WRONG: Creating separate '## Variables', '## Data Types', '## Conditional Statements' headings. They must ALL be bullets under ONE '## Core Structures' heading.\n")
		b.WriteString("4) For each major item in Core Structures, use a consistent micro-structure in this order:\n")
		b.WriteString("   - Definition: <what it is>\n")
		b.WriteString("   - Function: <what it does>\n")
		b.WriteString("   - Examples: <brief, specific examples; short phrase list, not long sentences>\n")
		b.WriteString("   - Key Takeaway: <why this structure matters in plain language>\n")
		b.WriteString("   - Key Takeaway rule (strengthened): state a specific real-world consequence/lasting impact/surprising implication, not purpose restatement; add info beyond Definition/Function. WRONG: 'This doctrine established the fundamental US approach to counter Soviet influence.' WRONG: 'This structure became an important part of the Cold War.' RIGHT: 'Without the Truman Doctrine, Greece and Turkey may have fallen to communism, potentially triggering wider domino effects.' RIGHT: 'SDI exerted immense economic pressure on the Soviet Union, contributing to its eventual collapse.' Must answer: what would differ without it?\n")
		b.WriteString("5) Keep labels consistent. Prefer Definition, Function, Examples, Key Takeaway, and Fact. Integrate size/location details into Definition instead of a separate 'Size:' bullet.\n")
		b.WriteString("6) In Interesting Facts, do NOT prefix each bullet with 'Fact:'; the heading already provides context.\n")
		b.WriteString("7) Merge related facts into one bullet when they describe the same point (e.g., wattage + LED example).\n")
		b.WriteString("8) Keep bullets non-redundant and compact; one idea per bullet.\n")
		b.WriteString("9) Return plain text bullets only (no markdown tables, no HTML).\n")
		b.WriteString("10) Include 4-5 Interesting Facts minimum, each expressing a unique angle. Do not reuse phrasing from the Core Structures section. Vary sentence openings — avoid starting every fact with the same structure.\n")
		b.WriteString("11) For each Core Structure item, add a one-sentence 'Key Takeaway' after Examples.\n\n")
	case "paragraph":
		b.WriteString("Format: Write in flowing, readable prose with clear subheadings.\n")
		b.WriteString("Paragraph output rules:\n")
		b.WriteString("1) Use natural essay-style paragraphs; prioritize readability and narrative flow over study-note labels.\n")
		b.WriteString("2) Keep section headings concise, then explain ideas in full sentences.\n")
		b.WriteString("Subheading rules (mandatory): ALWAYS use 2-4 title-case subheadings (2-5 words each); match each section's actual content; avoid generic labels like Overview/Main Points/Conclusion; each section under a subheading must have at least 2 full sentences; NEVER exceed 4 subheadings.\n")
		b.WriteString("WRONG: no subheadings or generic headings. RIGHT: specific headings like 'The Containment Strategy', 'Nuclear Brinkmanship', 'Internal Soviet Collapse'.\n")
		b.WriteString("3) STRICTLY FORBIDDEN labels in output: 'Key Concept:', 'Definition:', 'Example:', 'Case Study:', 'Dates & Figures:'.\n")
		b.WriteString("4) Weave those ideas naturally into prose (e.g., 'Energybending is ...'), without meta-prefixes.\n")
		b.WriteString("5) Avoid repetitive phrasing and repeated sentence templates.\n")
		b.WriteString("6) Do not use bullet-list study-note formatting unless explicitly requested by format.\n")
		b.WriteString("7) Use only one central metaphor per section — do not open with two competing analogies.\n")
		b.WriteString("8) End the final section with a sentence connecting the content to real-world significance or application.\n\n")
	case "smart":
		b.WriteString("Format: Create a Smart Summary in Markdown with clear section headings and concise high-value synthesis.\n")
		if metadataOnlyMode {
			b.WriteString("CRITICAL: This summary is based on metadata only, not a real transcript. For Key Insights and Core Concepts, DO NOT generate custom insights. Replace the entire section body with exactly this sentence: 'Key Insights cannot be generated from metadata alone. Please provide a video with an available transcript.'\n")
			b.WriteString("For Additional Interesting Facts: Only include facts directly stated in the metadata. Do not speculate about content, themes, or implications.\n")
		}
		b.WriteString("Required sections (in this EXACT order, ALL sections are MANDATORY — never omit any):\n")
		b.WriteString("1) Summary of Video Content — ALWAYS include this as the FIRST section. Write one concise narrative paragraph summarizing the overall topic and main points.\n")
		b.WriteString("2) Key Insights and Core Concepts — deeper insights, implications, and connections.\n")
		b.WriteString("3) Key Concepts Table — use EXACTLY this format, no exceptions:\n")
		b.WriteString("   - Table title: 'Key Concepts'\n")
		b.WriteString("   - EXACTLY 2 columns: 'Concept' and 'Explanation'\n")
		b.WriteString("   - EXACTLY 4-6 data rows, one per key concept from the transcript. HARD MAXIMUM: 6 rows. Do NOT output more than 6 data rows under any circumstances. Stop after the 6th row.\n")
		b.WriteString("   - Every cell MUST contain real content — no dashes, no empty strings, no placeholders\n")
		b.WriteString("   - Concept column: short name or term (1-5 words)\n")
		b.WriteString("   - Explanation column: one clear sentence explaining the concept\n")
		b.WriteString("   - Output ONLY ONE table. Do not output two tables.\n")
		b.WriteString("   - Correct format example:\n")
		b.WriteString("   | Concept | Explanation |\n")
		b.WriteString("   | --- | --- |\n")
		b.WriteString("   | Containment | US policy to prevent Soviet communism from spreading to new countries. |\n")
		b.WriteString("   | Marshall Plan | American economic aid program to rebuild post-war Europe and resist communism. |\n")
		b.WriteString("   | Berlin Wall | Physical barrier built in 1961 to stop East Germans defecting to the West. |\n\n")
		b.WriteString("4) Additional Interesting Facts — 3-6 noteworthy facts as a markdown bullet list.\n\n")
		b.WriteString("Output rules for Smart Summary: Use markdown headings and bullets. ALWAYS include at least one markdown table with at least 2 columns and 3 data rows. If the transcript has no obvious entities, create a table with columns: Concept | Explanation. Keep statements factual and avoid unsupported claims.\n")
		b.WriteString("Terminology fidelity rules: reuse exact source terms from the transcript whenever possible (prefer direct phrasing over paraphrased/neologism terms). Do NOT invent renamed concepts.\n")
		b.WriteString("Anti-redundancy rules: each fact appears once in the most appropriate section. Do NOT repeat the same fact across Summary, Insights, Table, and Facts.\n")
		b.WriteString("Section-specific rules:\n")
		b.WriteString("- Summary of Video Content: MANDATORY — always include this section. Write one concise narrative paragraph summarizing the overall video/document.\n")
		b.WriteString("  The Summary of Video Content section must answer \"so what\" — not list topics covered.\n")
		b.WriteString("  WRONG: \"This video covers the cerebrum, cerebellum, brain stem, and amygdala\"\n")
		b.WriteString("  RIGHT: \"The brain's hierarchical structure allows simultaneous conscious and unconscious processing\"\n")
		b.WriteString("- Key Insights and Core Concepts: 3-5 deeper insights (implications/connections), not dictionary-like repetition.\n")
		b.WriteString("  Each Key Insight must name specific details from the transcript, never vague generalizations.\n")
		b.WriteString("  WRONG: \"Different parts of the brain handle different tasks\"\n")
		b.WriteString("  RIGHT: \"The cerebrum's 85% mass dominance reflects its role as the primary seat of conscious thought\"\n")
		b.WriteString("  Each Key Insight must include one practical real-world application or implication.\n")
		b.WriteString("  Format each insight EXACTLY like this example (note the blank lines and spacing):\n")
		b.WriteString("  **Key Concept: Concept Title Here**\n")
		b.WriteString("  Explanation paragraph here with 1-2 sentences.\n\n")
		b.WriteString("  Example: A specific example from the transcript.\n\n")
		b.WriteString("  CRITICAL: Always put a space after the colon in 'Key Concept: Title'. Always put the explanation on a SEPARATE line (not on the same line as the title).\n")
		b.WriteString("  FORBIDDEN inside Key Insights section: Do NOT use markdown tables (| pipes), bullet lists (* or -), or any markdown formatting other than **bold** for the Key Concept title. Each insight is ONLY: bold title line, explanation paragraph, optional Example line. Nothing else.\n")
		b.WriteString("  Do NOT output repetitive 'Definition' lines for every item.\n")
		b.WriteString("  Include 'Example:' ONLY if explicitly present in transcript; otherwise omit the Example line entirely.\n")
		b.WriteString("  Example lines must be plain text starting with 'Example:' — do NOT wrap in blockquotes (> ...), do NOT bold the word Example, do NOT use code fences (```). Just: Example: your text here.\n")
		if metadataOnlyMode {
			b.WriteString("  CRITICAL: In metadata-only mode, this section must contain exactly one line: 'Key Insights cannot be generated from metadata alone. Please provide a video with an available transcript.'\n")
		}
		b.WriteString("CRITICAL: Output exactly ONE table with exactly 2 columns (Concept | Explanation) and STRICTLY 4-6 data rows. NEVER exceed 6 rows. If the transcript contains more than 6 concepts, select only the 6 most important ones. Every cell must have real content. No exceptions.\n\n")
		b.WriteString("- Additional Interesting Facts: output ONLY as a markdown bullet list (3-6 bullets, each line starts with '- '). Include only non-duplicated noteworthy facts, with numbers/evidence when present; avoid trivial or playful statements.\n")
		if metadataOnlyMode {
			b.WriteString("  Only include facts directly stated in the metadata. Do not speculate about content, themes, or implications.\n")
		}
		b.WriteString("Forbidden sections: DO NOT output 'Conclusions', 'Summary Highlights', or 'Summary Table'.\n")
		b.WriteString("For section 'Key Insights and Core Concepts', keep concept names faithful to transcript terminology and avoid invented terms.\n")
		b.WriteString("If transcript evidence is weak, explicitly mark uncertainty instead of fabricating details.\n")
		b.WriteString("Markdown structure rule for Additional Interesting Facts: this section MUST be a markdown unordered list ('- item'). Do NOT write it as a paragraph.\n")
		b.WriteString("FINAL OUTPUT RULE: Do NOT wrap the output in code fences (``` or ```markdown). Output raw markdown only. Do NOT add trailing ``` at the end.\n\n")
	}

	// Layer 3 — Length (strict bands, adjusted per format)
	sourceWords := len(strings.Fields(transcript))
	var targetPercent int
	var minWords int
	var maxWords int
	var lengthLabel string
	switch length {
	case "concise":
		targetPercent = 15
		minWords = 120
		maxWords = 220
		lengthLabel = "Short"
	case "standard":
		targetPercent = 25
		minWords = 260
		maxWords = 420
		lengthLabel = "Medium"
	case "detailed":
		targetPercent = 40
		minWords = 500
		maxWords = 850
		lengthLabel = "Long"
	case "comprehensive":
		targetPercent = 55
		minWords = 900
		maxWords = 1600
		lengthLabel = "Deep Dive"
	default:
		targetPercent = 25
		minWords = 260
		maxWords = 420
		lengthLabel = "Medium"
	}

	// Format-specific multiplier: multi-section formats need more words
	// to fill all required sections (Cornell: Cues+Notes+Summary, Smart: Summary+Insights+Table+Facts)
	var formatMultiplier float64
	switch format {
	case "cornell":
		formatMultiplier = 1.8 // 3 mandatory sections with structured content
	case "smart":
		formatMultiplier = 1.6 // 4 mandatory sections including a table
	case "bullets":
		formatMultiplier = 1.1 // structured bullets add some overhead
	default:
		formatMultiplier = 1.0 // paragraph stays as-is
	}

	minWords = int(float64(minWords) * formatMultiplier)
	maxWords = int(float64(maxWords) * formatMultiplier)

	targetWords := sourceWords * targetPercent / 100
	if targetWords < minWords {
		targetWords = minWords
	}
	if targetWords > maxWords {
		targetWords = maxWords
	}

	b.WriteString(fmt.Sprintf("Length preset: %s.\n", lengthLabel))
	b.WriteString(fmt.Sprintf("CRITICAL LENGTH CONSTRAINT: Output MUST be between %d and %d words.\n", minWords, maxWords))
	b.WriteString(fmt.Sprintf("Target about %d words (%d%% of %d source words, clamped to preset range).\n", targetWords, targetPercent, sourceWords))
	b.WriteString(fmt.Sprintf("UNDER NO CIRCUMSTANCES should your output exceed %d words. Cut non-essential details to fit.\n\n", maxWords))

	// Layer 4 — Focus areas
	for _, area := range focusAreas {
		b.WriteString(fmt.Sprintf("Priority: Prioritize and clearly label all %s.\n", area))
	}
	if len(focusAreas) > 0 {
		b.WriteString("\n")
	}

	// Layer 5 — Audience
	if audience != "" {
		b.WriteString(fmt.Sprintf("Target Audience: Write for a %s level audience.\n\n", audience))
	}

	// Layer 6 — Language
	if language != "" && language != "en" {
		b.WriteString(fmt.Sprintf("Language: Respond entirely in %s.\n\n", language))
	}

	// Layer 7 — Transcript
	b.WriteString("---TRANSCRIPT START---\n")
	b.WriteString(transcript)
	b.WriteString("\n---TRANSCRIPT END---\n")

	// Layer 8 — Final reinforcement for Smart Summary (fights "lost in the middle")
	if format == "smart" {
		b.WriteString("\nREMINDER: Your FIRST section MUST be '## Summary of Video Content' with a concise narrative paragraph. Do NOT skip it. Start your output with that section.\n")
	}

	return b.String()
}

func isMetadataOnlyContent(transcript string) bool {
	lower := strings.ToLower(strings.TrimSpace(transcript))
	return strings.Contains(lower, "transcript is unavailable for this content")
}

func buildSmartSummaryStructureFallbackPrompt(rawText string, metadataOnlyMode bool) string {
	var b strings.Builder
	b.WriteString("Rewrite this Smart Summary in clean Markdown (Smart Summary Structure Fallback). Preserve all key information, preserve source terminology, and include at least one markdown table with 2+ columns and 3+ data rows. If entities are not obvious, create a table with columns: Concept | Explanation. ")
	b.WriteString("CRITICAL: Every table cell MUST contain actual content. Never use dashes (---), empty strings, or placeholder text in data cells. If information is unknown, write 'Not specified' instead. ")
	b.WriteString("The separator row (| --- | --- |) MUST appear exactly once, immediately after the header row, before any data rows. It must NEVER appear as a data row. ")
	b.WriteString("Correct table example:\n| Brain Part | Primary Function | Key Characteristics |\n| --- | --- | --- |\n| Cerebrum | Thinking and learning | Largest part and supports conscious processing |\n| Cerebellum | Balance and motor coordination | Fine-tunes movement and posture |\n| Brain Stem | Involuntary regulation | Links brain to spinal cord and controls breathing |\n")
	b.WriteString("Before outputting the table, verify: (1) separator row exists after header, (2) every data cell has real content, (3) all rows have the same number of columns. ")
	if metadataOnlyMode {
		b.WriteString("CRITICAL: This summary is based on metadata only, not a real transcript. For Key Insights and Core Concepts, DO NOT generate custom insights. Replace the entire section body with exactly this sentence: 'Key Insights cannot be generated from metadata alone. Please provide a video with an available transcript.' ")
		b.WriteString("For Additional Interesting Facts: Only include facts directly stated in the metadata. Do not speculate about content, themes, or implications. ")
	}
	b.WriteString("Do NOT output sections named 'Summary Table', 'Conclusions', or 'Summary Highlights'. ")
	b.WriteString("In the section 'Additional Interesting Facts', output 3-6 markdown bullet points (each line must start with '- '). Do NOT invent new coined terms that are not present in the source transcript. If a claim is uncertain, say: Not explicitly stated in transcript. Return markdown only:\n\n")
	b.WriteString(rawText)
	return b.String()
}

func buildPresentationPrompt(config models.GeneratePresentationRequest, transcript string) string {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("Language: Respond entirely in %s.\n\n", presentationLanguageName(config.Language)))
	b.WriteString("You are an expert presentation designer and instructional storyteller. Read the transcript and generate a clean, audience-ready slide deck.\n\n")
	b.WriteString(fmt.Sprintf("Generate exactly %d slides. Return ONLY a valid JSON array of slide objects. No preamble, no markdown fences, no backticks, no explanations.\n\n", config.SlideCount))
	b.WriteString("Allowed slide types: title, content, two_column, stats, prose, summary.\n")
	b.WriteString("Every slide object must contain these keys exactly: index, type, variant, title, subtitle, body, bullets, leftColumn, rightColumn, leftLabel, rightLabel, quote, quoteAuthor, stats, takeaways, tableHeaders, tableRows, imageQuery, imagePosition, speakerNotes.\n")
	b.WriteString("Use null for optional scalar fields when absent, [] for optional arrays when absent.\n")
	b.WriteString("stats must be an array of objects shaped like {\"value\":\"...\",\"label\":\"...\",\"description\":\"...\"}.\n")
	b.WriteString("takeaways must be an array of objects shaped like {\"title\":\"...\",\"description\":\"...\",\"icon\":\"...\"}. icon should be a simple semantic token like globe, platform, workforce, equity, leaf, recycle, chart, education or an emoji.\n")
	b.WriteString("tableRows must be an array of rows, where each row is an array of 2-3 short strings. tableHeaders should contain 2-3 column names when using table layouts.\n")
	b.WriteString("IMAGE QUERY RULES (Unsplash side panel):\n")
	b.WriteString("- Images are side panel visuals, not full-slide backgrounds.\n")
	b.WriteString("- SKIP imageQuery (set null) for stats, two_column, and summary slides.\n")
	b.WriteString("- ALWAYS include imageQuery for title and prose slides.\n")
	b.WriteString("- Include imageQuery for content slides only when the slide has a concrete visual subject; otherwise set null.\n")
	b.WriteString("- imageQuery must be 3-6 English words.\n")
	b.WriteString("- Title image query should be atmospheric and high quality, not a literal product name.\n")
	b.WriteString("- Content image queries should use concrete nouns and visible scenes, not abstract nouns alone.\n")
	b.WriteString("- Avoid product/framework names that Unsplash rarely has (RabbitMQ, ResNet50, Kubernetes, MongoDB, etc.). Translate to visual equivalents.\n")
	b.WriteString("- If query is abstract-only (technology, innovation, system, process), add a concrete anchor like workspace, lab, team, student, server, or device.\n")
	b.WriteString("- The title slide (index 1, type=title) MUST have a non-empty imageQuery.\n")
	b.WriteString("speakerNotes must contain full-sentence detail and context for the presenter.\n\n")

	switch {
	case config.SlideCount <= 8:
		b.WriteString("Short deck structure: exactly 1 title slide, 4-6 content or prose slides, and 1 summary slide. Keep the narrative compact and focused.\n")
	case config.SlideCount <= 14:
		b.WriteString("Medium deck structure: exactly 1 title slide, multiple content and prose slides, at least 1 two_column slide, and 1 summary slide.\n")
	default:
		b.WriteString("Large deck structure: exactly 1 title slide, multiple content and prose slides, at least 1 two_column slide, at least 1 stats slide, and 1 summary slide.\n")
	}

	switch strings.ToLower(strings.TrimSpace(config.TextStyle)) {
	case "academic":
		b.WriteString("Text style: Academic. Cite concepts, use domain terminology, and build a structured argument with precise wording.\n")
	case "conversational":
		b.WriteString("Text style: Conversational. Use shorter bullets, plain language, and accessible explanations.\n")
	default:
		b.WriteString("Text style: Formal. Use professional language, full-sentence bullets when needed, and technical vocabulary where appropriate.\n")
	}

	b.WriteString("Design target: Gamma-style deck quality. Slides must look visually structured and concise, not like report paragraphs.\n")
	b.WriteString("Slide writing rules:\n")
	b.WriteString("- Keep each slide distinct, transcript-grounded, and non-redundant.\n")
	b.WriteString("- title slide: one strong thesis title + contextual subtitle; never add bullets.\n")
	b.WriteString("- content slide: use for sequential/procedural explanation. Prefer numbered stacked items encoded as 'NUM: N || Title || Description'. Use exactly 3 items. Each description must be exactly 30 words and written as one complete sentence with a concrete action and measurable outcome.\n")
	b.WriteString("- content variants:\n")
	b.WriteString("  * variant='feature_trio': exactly 3 feature cards. Encode each bullet as 'FEATURE: icon || Title || Description' or 'CARD: Title || Description'. Description should be one complete sentence around 15 words (target 13-17), never clipped.\n")
	b.WriteString("  * variant='comparison_table': use tabular comparisons. Provide tableHeaders and tableRows, or encode bullets as 'HEADER: Col1 || Col2 || Col3' and 'ROW: v1 || v2 || v3'. Include 4-5 data rows. Set imageQuery to null for this variant.\n")
	b.WriteString("  * variant='flow_arrows': use exactly 3 sequential arrows. Encode each bullet as 'FLOW: N || Title || Description'. Title must be 2-4 words; description should be one complete sentence around 12-18 words, and the first 3 words of description should not be same as title. [STRICT]: Step 2 and Step 3 must describe a transformation of the object from Step 1. No conversational filler. Set imageQuery to null for this variant.\n")
	b.WriteString("- two_column slide: comparison only. Each column must have exactly 4 items. Each item MUST be a full sentence of 20-25 words. [STRICT]: The first word of an item must not be 'This', 'These', 'The', 'A', or any word found in the Column/Slide Title. No concluding/summary sentences about the slide itself.\n")
	b.WriteString("  Example of How It Should Be:\n")
	b.WriteString("  Column 1 Title: • CONVENTIONAL PRACTICES\n")
	b.WriteString("  Bullet 1: Polyethylene carrier bags frequently migrate into marine ecosystems or landfill sites where they persist for centuries while leaching harmful chemical toxins.\n")
	b.WriteString("  Bullet 2: Disposable beverage containers account for massive volumes of global synthetic pollution, requiring constant fossil fuel extraction to maintain high production levels.\n")
	b.WriteString("  Bullet 3: Incandescent lighting filaments convert the majority of consumed electricity into heat rather than light, resulting in significant energy wastage during operation.\n")
	b.WriteString("  Bullet 4: Non-recyclable packaging materials often accumulate in oceanic gyres, disrupting delicate biological cycles and causing irreparable damage to various migratory bird species.\n")
	b.WriteString("  Column 2 Title: • ECOLOGICAL SOLUTIONS\n")
	b.WriteString("  Bullet 1: High-quality textile carriers provide a resilient solution that eliminates the necessity for constant manufacturing cycles while lowering total municipal solid waste.\n")
	b.WriteString("  Bullet 2: Vacuum-insulated stainless steel vessels offer a life-long replacement for synthetic bottles, effectively reducing the energy-intensive demand for raw material processing.\n")
	b.WriteString("  Bullet 3: Advanced light-emitting diode technology minimizes power consumption by up to eighty percent while providing a significantly longer operational lifespan than traditional bulbs.\n")
	b.WriteString("  Bullet 4: Compostable plant-based fibers break down naturally through microbial activity, successfully returning vital nutrients to the earth without leaving any hazardous plastic residues.\n")
	b.WriteString("- stats slide: include exactly 4 stats entries (value + label + description), values must come from transcript. Description must directly explain what the value represents in plain factual language tied to the specific stat. Never use generic management/business wording. [STRICT]: The first word of the description MUST NOT be the label, and it MUST NOT be 'This', 'These', 'The', or 'A'. Start with a unique noun or a descriptive phrase. NEVER start with an adverb like 'Currently', 'Actually', or 'Basically'.\n")
	b.WriteString("  Example of How It Should Be (Result):\n")
	b.WriteString("  78% | NITROGEN - Description: Gaseous molecules of this type dominate the atmospheric layers, providing the necessary pressure and chemical foundation for global life cycles.\n")
	b.WriteString("  21% | OXYGEN - Description: Cellular respiration relies entirely on this reactive gas, which is continuously replenished by photosynthetic organisms across terrestrial and aquatic biomes.\n")
	b.WriteString("  97% | SALT WATER - Description: Oceanic reservoirs hold nearly all liquid resources on the planet, though high salinity levels render them unsuitable for direct human use.\n")
	b.WriteString("  1% | POTABLE WATER - Description: Accessible fresh resources remain remarkably scarce, necessitating strict conservation efforts to sustain growing populations and agricultural demands.\n")
	b.WriteString("- prose slide: no bullets. body must contain 2-3 paragraphs of 25-45 words each separated by newlines. Paragraph 1: specific context or problem with a concrete claim. Paragraph 2: mechanism, solution, or key insight. Paragraph 3 (optional): implication or significance. Never one-sentence paragraphs. Never restate the slide title.\n")
	b.WriteString("- summary slide: prefer variant='summary_icons'. Use exactly 4 takeaways for medium/large decks; 3-4 for short decks. Each takeaway needs a title (2-4 words), a concise description around 15 words (target 13-17), and an icon token. Description must add new information and MUST NOT start with the same lead verb/word as the title. Make the summary feel like an icon-led takeaway grid, not a document paragraph.\n")
	b.WriteString("- Keep title and subtitle concise: title <= 9 words, subtitle <= 14 words.\n")
	b.WriteString("- Bullets must be 6-10 words and communicate a complete idea. Never under 5 words; never over 12 words.\n")
	b.WriteString("- Do not end bullets with periods.\n")
	b.WriteString("- Do not prefix bullets with numeric labels like 1., 2., 3.\n")
	b.WriteString("- Never repeat title wording inside subtitle or bullets.\n")
	b.WriteString("- Never output placeholder text like \"Point 1\", \"Takeaway 1\", \"Slide N\", \"TBD\", \"Lorem ipsum\", or template stubs.\n")
	b.WriteString("- If source material is thin, reduce bullet count and merge related points into stronger bullets; never use placeholders.\n")
	b.WriteString("- Card grid pattern: for problems/solutions/features/goals/stacks/benefits, encode bullets as 'CARD: Label || Description sentence'. Use exactly 3 cards. Each card description must be strictly 25-30 words (excluding the label), and each card label must be distinct. The first sentence of each description MUST NOT begin with the same word or phrase as that card label.\n")
	b.WriteString("- Numbered process pattern (high priority): encode sequential items as 'NUM: N || Title || Description'. Exactly 3 steps only. Each description must contain exactly 30 words.\n")
	b.WriteString("- Use two_column for before/after, X vs Y, limitations vs future.\n")
	b.WriteString("- Use prose for major introductions, architecture explanations, and conclusions when list format would fragment narrative flow.\n")
	b.WriteString("- If transcript has any quantifiable claim (number, percentage, count, cost, threshold, duration), include at least 1 stats slide regardless of deck size.\n")
	b.WriteString("- Slide rhythm: never place more than 2 consecutive content slides.\n")
	b.WriteString("- Deck size rhythm: short <=8 must include title + >=1 stats + >=1 two_column + summary; across all deck sizes, use at most 1 stats slide and at most 2 two_column slides.\n")
	b.WriteString("- Variant rhythm (medium/large decks): include at least one timeline content slide, at least one flow_arrows content slide, at least one 3-column CARD grid content slide, exactly one feature_trio slide, and exactly one comparison_table slide.\n")
	b.WriteString("- Image rhythm: set imagePosition to alternate left/right across consecutive image slides.\n")
	b.WriteString("- Density guard: every non-title slide must carry meaningful visible payload. For content/prose slides target at least 30-40 words total across subtitle and bullets/cards.\n")
	b.WriteString("- Design for visuals: at least 70% of eligible slides (title/content/prose) should have a non-empty imageQuery.\n")
	b.WriteString("- Keep imageQuery specific to topic; avoid generic queries like 'business meeting' unless unavoidable.\n")
	b.WriteString("- Do not generate quote slides. Use only title, content, two_column, stats, prose, summary.\n")
	b.WriteString("- speakerNotes: 2-4 full sentences per slide. Put full explanations in notes, not bullets.\n")
	b.WriteString("- The theme preference is '")
	b.WriteString(config.Theme)
	b.WriteString("'; reflect that mood implicitly in structure and wording, but do not mention theme names in the output.\n")
	if len(config.FocusAreas) > 0 {
		b.WriteString("- Prioritize these focus areas where relevant: ")
		b.WriteString(strings.Join(config.FocusAreas, ", "))
		b.WriteString(".\n")
	}
	b.WriteString("\nTranscript:\n---TRANSCRIPT START---\n")
	b.WriteString(transcript)
	b.WriteString("\n---TRANSCRIPT END---")
	return b.String()
}

func presentationLanguageName(language string) string {
	switch strings.ToLower(strings.TrimSpace(language)) {
	case "kk":
		return "Kazakh"
	case "ru":
		return "Russian"
	case "fr":
		return "French"
	case "es":
		return "Spanish"
	default:
		return "English"
	}
}

func buildFallbackPresentationSlides(transcript string, slideCount int) []models.PresentationSlide {
	if slideCount < 3 {
		slideCount = 3
	}
	sentenceCandidates := make([]string, 0, max(slideCount*5, 16))
	seen := map[string]struct{}{}
	for _, sentence := range splitPresentationSentences(transcript) {
		normalized := normalizePresentationBullet(sentence, 16)
		if normalized == "" || isConversationalTranscriptLine(normalized) || isStatMetadataText(normalized) {
			continue
		}
		normalized = ensureTrailingDot(normalized)
		key := normalizeCompareText(normalized)
		if key == "" {
			continue
		}
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		sentenceCandidates = append(sentenceCandidates, normalized)
		if len(sentenceCandidates) >= max(slideCount*5, 24) {
			break
		}
	}

	if len(sentenceCandidates) == 0 {
		sentenceCandidates = []string{
			"The source transcript was noisy, so this fallback deck focuses on validated high level insights.",
			"Core themes are organized into concise points that avoid transcript artifacts and conversational fragments.",
			"Each slide emphasizes practical understanding with clear phrasing and presentation ready structure.",
		}
	}

	title := strings.TrimRight(firstNWords(sentenceCandidates[0], 7), " .;:!?")
	if title == "" {
		title = "Generated Presentation"
	}

	slides := make([]models.PresentationSlide, 0, slideCount)
	titleQuery := fallbackSlideImageQuery(title)
	slides = append(slides, models.PresentationSlide{
		Index:         1,
		ID:            "slide-1",
		Type:          "title",
		Title:         title,
		ImageQuery:    &titleQuery,
		ImagePosition: stringPtr("right"),
		SpeakerNotes:  "Introduce the topic and explain that this deck was generated from limited structured output.",
	})

	contentSlides := slideCount - 2
	chunkSize := max(1, (len(sentenceCandidates)+contentSlides-1)/contentSlides)
	for i := 0; i < contentSlides; i++ {
		start := i * chunkSize
		end := min(len(sentenceCandidates), start+chunkSize)
		chunk := sentenceCandidates[start:end]
		if len(chunk) == 0 {
			chunk = []string{"Additional validated detail was limited in the source transcript."}
		}
		bullets := make([]string, 0, min(4, len(chunk)))
		for _, sentence := range chunk {
			trimmed := ensureTrailingDot(strings.TrimSpace(sentence))
			if trimmed != "" {
				bullets = append(bullets, trimmed)
			}
			if len(bullets) == 4 {
				break
			}
		}
		slideTitle := fmt.Sprintf("Insight %d", i+1)
		if len(bullets) > 0 {
			candidateTitle := strings.TrimRight(firstNWords(stripNumericPrefixes(bullets[0]), 4), " .;:!?")
			if candidateTitle != "" {
				slideTitle = candidateTitle
			}
		}
		slides = append(slides, models.PresentationSlide{
			Index:         len(slides) + 1,
			ID:            fmt.Sprintf("slide-%d", len(slides)+1),
			Type:          "content",
			Title:         slideTitle,
			Bullets:       bullets,
			ImageQuery:    stringPtr(fallbackSlideImageQuery(strings.Join(bullets, " "))),
			ImagePosition: stringPtr("right"),
			SpeakerNotes:  strings.Join(bullets, " "),
		})
	}

	summaryBullets := make([]string, 0, 4)
	for _, sentence := range sentenceCandidates {
		trimmed := ensureTrailingDot(strings.TrimSpace(sentence))
		if trimmed != "" {
			summaryBullets = append(summaryBullets, trimmed)
		}
		if len(summaryBullets) == 4 {
			break
		}
	}
	if len(summaryBullets) == 0 {
		summaryBullets = []string{"Source transcript was limited, so the summary remains high level."}
	}
	slides = append(slides, models.PresentationSlide{
		Index:         len(slides) + 1,
		ID:            fmt.Sprintf("slide-%d", len(slides)+1),
		Type:          "summary",
		Variant:       stringPtr("summary_icons"),
		Title:         "Key Takeaways",
		Bullets:       summaryBullets,
		ImageQuery:    stringPtr(fallbackSlideImageQuery(strings.Join(summaryBullets, " "))),
		ImagePosition: stringPtr("right"),
		SpeakerNotes:  "Close by restating the main ideas and next actions.",
	})
	lastIndex := len(slides) - 1
	slides[lastIndex].Takeaways = buildSummaryTakeaways(&slides[lastIndex])

	return slides
}

func splitPresentationSentences(text string) []string {
	text = strings.Join(strings.Fields(text), " ")
	if text == "" {
		return nil
	}
	parts := regexp.MustCompile(`[.!?]\s+`).Split(text, -1)
	out := make([]string, 0, len(parts))
	lastNorm := ""
	for _, part := range parts {
		trimmed := sanitizePresentationText(strings.TrimSpace(part))
		if trimmed == "" {
			continue
		}
		if containsTranscriptNoiseTag(trimmed) || isConversationalTranscriptLine(trimmed) {
			continue
		}
		norm := normalizeCompareText(trimmed)
		if norm == "" || norm == lastNorm {
			continue
		}
		lastNorm = norm
		out = append(out, trimmed)
	}
	if len(out) > 0 {
		return out
	}

	words := strings.Fields(text)
	for i := 0; i < len(words); i += 16 {
		out = append(out, strings.Join(words[i:min(len(words), i+16)], " "))
	}
	return out
}

func sanitizeSlideTitle(value string) string {
	clean := sanitizePresentationText(value)
	if clean == "" {
		return ""
	}

	lower := strings.ToLower(clean)
	if strings.HasPrefix(lower, "flow:") || strings.HasPrefix(lower, "arrow:") || strings.HasPrefix(lower, "step_flow:") || strings.HasPrefix(lower, "timeline:") || strings.HasPrefix(lower, "milestone:") || strings.HasPrefix(lower, "num:") {
		clean = regexp.MustCompile(`(?i)^(?:flow|arrow|step_flow|timeline|milestone|num):\s*`).ReplaceAllString(clean, "")
		clean = regexp.MustCompile(`^\s*\d{1,2}\s*\|\|\s*`).ReplaceAllString(clean, "")
		if strings.Contains(clean, "||") {
			clean = strings.TrimSpace(strings.SplitN(clean, "||", 2)[0])
		}
	}

	clean = strings.TrimRight(clean, " .;:!?")
	return sanitizePresentationText(clean)
}

func buildTitleSubtitleFallback(title string) string {
	topic := firstNWords(sanitizePresentationText(title), 4)
	if topic == "" || isConversationalTranscriptLine(topic) || isLikelyTranscriptFragment(topic) {
		return "A focused overview of the key challenge, approach, and measurable outcomes"
	}
	return fmt.Sprintf("A focused overview of %s, implementation choices, and measurable outcomes", strings.ToLower(topic))
}

func normalizePresentationSlides(slides []models.PresentationSlide) {
	for i := range slides {
		if slides[i].Index <= 0 {
			slides[i].Index = i + 1
		}
		if strings.TrimSpace(slides[i].ID) == "" {
			slides[i].ID = fmt.Sprintf("slide-%d", slides[i].Index)
		}
		if strings.TrimSpace(slides[i].Type) == "" {
			slides[i].Type = "content"
		}
		slides[i].Type = strings.ToLower(strings.TrimSpace(slides[i].Type))
		if slides[i].Type == "section" {
			slides[i].Type = "prose"
		}
		if slides[i].Bullets == nil {
			slides[i].Bullets = []string{}
		}
		if slides[i].LeftColumn == nil {
			slides[i].LeftColumn = []string{}
		}
		if slides[i].RightColumn == nil {
			slides[i].RightColumn = []string{}
		}
		if slides[i].Stats == nil {
			slides[i].Stats = []models.PresentationStat{}
		}
		if slides[i].Columns == nil {
			slides[i].Columns = []models.PresentationColumn{}
		}
		if slides[i].Takeaways == nil {
			slides[i].Takeaways = []models.PresentationTakeaway{}
		}
		if slides[i].TableHeaders == nil {
			slides[i].TableHeaders = []string{}
		}
		if slides[i].TableRows == nil {
			slides[i].TableRows = [][]string{}
		}
		for t := range slides[i].Takeaways {
			slides[i].Takeaways[t].Title = sanitizePresentationText(slides[i].Takeaways[t].Title)
			slides[i].Takeaways[t].Description = sanitizePresentationText(slides[i].Takeaways[t].Description)
			slides[i].Takeaways[t].Icon = sanitizePresentationText(slides[i].Takeaways[t].Icon)
		}
		for h := range slides[i].TableHeaders {
			slides[i].TableHeaders[h] = sanitizePresentationText(slides[i].TableHeaders[h])
		}
		for r := range slides[i].TableRows {
			for c := range slides[i].TableRows[r] {
				slides[i].TableRows[r][c] = sanitizePresentationText(slides[i].TableRows[r][c])
			}
		}
		slides[i].ImagePosition = stringPtr(normalizeImagePosition(pointerStringValue(slides[i].ImagePosition), slides[i].Type))
		slides[i].Variant = stringPtr(normalizePresentationVariant(pointerStringValue(slides[i].Variant), slides[i].Type))
		if slides[i].Body != nil {
			body := sanitizePresentationText(pointerStringValue(slides[i].Body))
			slides[i].Body = stringPtr(body)
		}
		if slides[i].SpeakerNotes == "" && slides[i].Notes != nil {
			slides[i].SpeakerNotes = strings.TrimSpace(*slides[i].Notes)
		}
		if slides[i].Notes == nil && strings.TrimSpace(slides[i].SpeakerNotes) != "" {
			notes := strings.TrimSpace(slides[i].SpeakerNotes)
			slides[i].Notes = &notes
		}
	}
}

func enforcePresentationTextQuality(slides []models.PresentationSlide, transcript string) {
	if len(slides) == 0 {
		return
	}

	for i := range slides {
		slideType := strings.ToLower(strings.TrimSpace(slides[i].Type))

		title := sanitizeSlideTitle(slides[i].Title)
		title = stripSlideIndexArtifact(title, slides[i].Index)
		if isConversationalTranscriptLine(title) {
			title = ""
		}
		if slideType == "content" || slideType == "prose" {
			normalizedTitle := normalizeCompareText(title)
			if normalizedTitle == "core insight" || normalizedTitle == "key insight" || isLikelyTranscriptFragment(title) {
				title = ""
			}
		}
		if title == "" {
			if slideType == "content" && len(slides[i].Bullets) > 0 {
				for _, raw := range slides[i].Bullets {
					candidate := strings.TrimRight(firstNWords(stripNumericPrefixes(raw), 5), " .;:!?")
					if candidate == "" || isConversationalTranscriptLine(candidate) || isLikelyTranscriptFragment(candidate) {
						continue
					}
					title = candidate
					break
				}
			}
			if title == "" {
				title = firstNonEmpty(pointerStringValue(slides[i].Subtitle), "Key Insight")
			}
			title = sanitizePresentationText(title)
			if isConversationalTranscriptLine(title) {
				switch slideType {
				case "stats":
					title = "Key Metrics"
				case "two_column":
					title = "Comparison Overview"
				case "summary":
					title = "Key Takeaways"
				default:
					title = "Topic Overview"
				}
			}
		}
		slides[i].Title = title

		if slides[i].Subtitle != nil {
			subtitle := sanitizePresentationText(*slides[i].Subtitle)
			subtitle = stripSlideIndexArtifact(subtitle, slides[i].Index)
			if subtitle != "" && isConversationalTranscriptLine(subtitle) {
				subtitle = ""
			}
			if subtitle == "" || isSubtitleRedundant(title, subtitle) {
				slides[i].Subtitle = nil
			} else {
				slides[i].Subtitle = &subtitle
			}
		}
		if slideType == "title" {
			subtitle := sanitizePresentationText(pointerStringValue(slides[i].Subtitle))
			if subtitle == "" || isConversationalTranscriptLine(subtitle) || isSubtitleRedundant(title, subtitle) {
				subtitle = buildTitleSubtitleFallback(title)
			}
			if subtitle != "" {
				slides[i].Subtitle = stringPtr(subtitle)
			}
		}

		maxBullets := maxBulletsForSlideType(slideType)
		maxWords := 10
		if slideType == "content" {
			maxWords = 18
		}
		if slideType == "summary" {
			maxWords = 20
		}
		if slideType == "two_column" {
			maxWords = 25
		}
		slides[i].Bullets = normalizePresentationBullets(slides[i].Bullets, title, pointerStringValue(slides[i].Subtitle), maxBullets, maxWords)

		variant := normalizePresentationVariant(pointerStringValue(slides[i].Variant), slideType)
		if slideType == "content" && variant == "default" {
			variant = inferContentVariant(&slides[i])
		}
		if slideType == "two_column" && variant == "default" {
			if len(slides[i].TableRows) > 0 {
				variant = "comparison_table"
			} else {
				for _, bullet := range slides[i].Bullets {
					if isComparisonRowEncodedBullet(bullet) {
						variant = "comparison_table"
						break
					}
				}
			}
		}
		slides[i].Variant = stringPtr(variant)

		if slideType == "prose" {
			body := sanitizePresentationText(pointerStringValue(slides[i].Body))
			if body == "" {
				body = buildProseBodyFromSlide(slides[i], transcript)
			}
			slides[i].Body = stringPtr(body)
			slides[i].Bullets = []string{}
		}

		if slideType == "content" && len(slides[i].Bullets) < 2 {
			fallbackSource := strings.TrimSpace(strings.Join([]string{slides[i].SpeakerNotes, pointerStringValue(slides[i].Notes)}, " "))
			fallbackBullets := buildCompactBulletsFromText(fallbackSource, 2-len(slides[i].Bullets), 8)
			slides[i].Bullets = append(slides[i].Bullets, fallbackBullets...)
			if len(slides[i].Bullets) > maxBullets {
				slides[i].Bullets = slides[i].Bullets[:maxBullets]
			}
		}

		slides[i].LeftColumn = normalizePresentationPhrases(slides[i].LeftColumn, 4, 20)
		slides[i].RightColumn = normalizePresentationPhrases(slides[i].RightColumn, 4, 20)
		for c := range slides[i].Columns {
			slides[i].Columns[c].Label = sanitizePresentationText(slides[i].Columns[c].Label)
			slides[i].Columns[c].Items = normalizePresentationPhrases(slides[i].Columns[c].Items, 5, 18)
		}

		if slideType == "two_column" {
			enrichTwoColumnSlide(&slides[i], transcript)
		}
		if slideType == "content" && pointerStringValue(slides[i].Variant) == "feature_trio" {
			enrichFeatureTrioSlide(&slides[i], transcript)
		}
		if slideType == "content" && pointerStringValue(slides[i].Variant) == "timeline" {
			enrichTimelineSlide(&slides[i], transcript)
		}
		if slideType == "content" && pointerStringValue(slides[i].Variant) == "flow_arrows" {
			enrichFlowArrowsSlide(&slides[i], transcript)
		}
		if pointerStringValue(slides[i].Variant) == "comparison_table" {
			enrichComparisonTableSlide(&slides[i])
		}
		if slideType == "summary" {
			enrichSummarySlide(&slides[i])
		}
		if slideType == "content" {
			ensureDefaultContentPayload(&slides[i], transcript)
			enforceNumberedStackSlideRules(&slides[i])
		}

		maxStatsItems := 6
		if slideType == "stats" {
			maxStatsItems = 4
		}
		slides[i].Stats = normalizePresentationStats(slides[i].Stats, maxStatsItems)
		if slideType == "stats" {
			ensureMinimumStatsCount(&slides[i], transcript, 4)
		}

		if strings.TrimSpace(slides[i].SpeakerNotes) == "" {
			slides[i].SpeakerNotes = buildSpeakerNotesFromSlide(slides[i])
		} else {
			slides[i].SpeakerNotes = sanitizePresentationText(slides[i].SpeakerNotes)
		}
	}

	enforceStatsSlideWhenQuantifiable(slides, transcript)
	enforcePresentationTypeVariety(slides)
	enforcePresentationVariantCoverage(slides, transcript)
	enforcePresentationTypeUsageLimits(slides, transcript)

	for i := range slides {
		slideType := strings.ToLower(strings.TrimSpace(slides[i].Type))
		if slideType == "prose" {
			body := sanitizePresentationText(pointerStringValue(slides[i].Body))
			if body == "" {
				body = buildProseBodyFromSlide(slides[i], transcript)
			}
			slides[i].Body = stringPtr(body)
			slides[i].Bullets = []string{}
		}
		if slideType == "two_column" {
			enrichTwoColumnSlide(&slides[i], transcript)
		}
		if slideType == "content" && pointerStringValue(slides[i].Variant) == "feature_trio" {
			enrichFeatureTrioSlide(&slides[i], transcript)
		}
		if slideType == "content" && pointerStringValue(slides[i].Variant) == "timeline" {
			enrichTimelineSlide(&slides[i], transcript)
		}
		if slideType == "content" && pointerStringValue(slides[i].Variant) == "flow_arrows" {
			enrichFlowArrowsSlide(&slides[i], transcript)
		}
		if pointerStringValue(slides[i].Variant) == "comparison_table" {
			enrichComparisonTableSlide(&slides[i])
		}
		if slideType == "summary" {
			enrichSummarySlide(&slides[i])
		}
		if slideType == "content" {
			ensureDefaultContentPayload(&slides[i], transcript)
		}
		maxStatsItems := 6
		if slideType == "stats" {
			maxStatsItems = 4
		}
		slides[i].Stats = normalizePresentationStats(slides[i].Stats, maxStatsItems)
		if slideType == "stats" {
			ensureMinimumStatsCount(&slides[i], transcript, 4)
		}
	}

	enforceNoEmptyContentSlides(slides, transcript)
	enforceStatsValueDedupAcrossDeck(slides, transcript)
}

func enforceNoEmptyContentSlides(slides []models.PresentationSlide, transcript string) {
	for i := range slides {
		if !strings.EqualFold(strings.TrimSpace(slides[i].Type), "content") {
			continue
		}

		variant := strings.ToLower(strings.TrimSpace(pointerStringValue(slides[i].Variant)))
		hasPayload := false

		switch variant {
		case "feature_trio":
			count := 0
			for _, bullet := range slides[i].Bullets {
				if isFeatureEncodedBullet(bullet) || isCardEncodedBullet(bullet) {
					count++
				}
			}
			hasPayload = count >= 3
		case "comparison_table":
			hasPayload = len(slides[i].TableRows) > 0
			if !hasPayload {
				for _, bullet := range slides[i].Bullets {
					if isComparisonRowEncodedBullet(bullet) {
						hasPayload = true
						break
					}
				}
			}
		case "timeline":
			count := 0
			for _, bullet := range slides[i].Bullets {
				if isTimelineEncodedBullet(bullet) {
					count++
				}
			}
			hasPayload = count >= 3
			if !hasPayload {
				numCount := 0
				for _, bullet := range slides[i].Bullets {
					if isNumberedCardEncodedBullet(bullet) {
						numCount++
					}
				}
				hasPayload = numCount >= 3
			}
		case "flow_arrows":
			count := 0
			for _, bullet := range slides[i].Bullets {
				if isFlowEncodedBullet(bullet) {
					count++
				}
			}
			hasPayload = count >= 3
		default:
			hasPayload = len(slides[i].Bullets) > 0
		}

		if hasPayload {
			continue
		}

		slides[i].Variant = stringPtr("default")
		slides[i].TableHeaders = []string{}
		slides[i].TableRows = [][]string{}
		ensureDefaultContentPayload(&slides[i], transcript)
	}
}

func maxBulletsForSlideType(slideType string) int {
	switch slideType {
	case "content":
		return 6
	case "summary":
		return 4
	case "prose":
		return 0
	case "section":
		return 2
	default:
		return 4
	}
}

func normalizePresentationVariant(value, slideType string) string {
	variant := strings.ToLower(strings.TrimSpace(value))
	if slideType == "summary" {
		if variant == "" || variant == "default" {
			return "summary_icons"
		}
		if variant == "summary_icons" {
			return variant
		}
		return "summary_icons"
	}

	if slideType == "content" {
		switch variant {
		case "", "default", "feature_trio", "comparison_table", "timeline", "flow_arrows":
			if variant == "" {
				return "default"
			}
			return variant
		default:
			return "default"
		}
	}

	if slideType == "two_column" {
		switch variant {
		case "", "default", "comparison_table":
			if variant == "" {
				return "default"
			}
			return variant
		default:
			return "default"
		}
	}

	if variant == "" {
		return "default"
	}
	return "default"
}

func normalizeImagePosition(value, slideType string) string {
	position := strings.ToLower(strings.TrimSpace(value))
	switch position {
	case "left", "right":
		return position
	}
	return "right"
}

func buildProseBodyFromSlide(slide models.PresentationSlide, transcript string) string {
	seed := strings.TrimSpace(strings.Join([]string{
		slide.Title,
		pointerStringValue(slide.Subtitle),
		pointerStringValue(slide.Body),
		strings.Join(slide.Bullets, ". "),
		slide.SpeakerNotes,
		transcript,
	}, " "))

	sentences := splitPresentationSentences(seed)
	if len(sentences) == 0 {
		return "This section introduces the main idea and explains why it matters for the overall narrative."
	}

	out := make([]string, 0, 3)
	for _, sentence := range sentences {
		normalized := strings.TrimSpace(sentence)
		if normalized == "" {
			continue
		}
		normalized = firstNWords(normalized, 26)
		normalized = strings.TrimRight(normalized, " .;:!?")
		if normalized == "" {
			continue
		}
		out = append(out, normalized+".")
		if len(out) >= 3 {
			break
		}
	}

	if len(out) == 0 {
		return "This section explains the context, core mechanism, and practical implication in clear narrative form."
	}

	return strings.Join(out, " ")
}

func enrichTwoColumnSlide(slide *models.PresentationSlide, transcript string) {
	if slide == nil {
		return
	}

	actionLeadRe := regexp.MustCompile(`(?i)^\s*(?:switching\s+to|by\s+adopting|adopting|by\s+choosing|choosing)\s+`)

	collectEvidenceClaims := func(items []string) []string {
		claims := make([]string, 0, len(items))
		for _, item := range items {
			clean := sanitizePresentationText(stripNumericPrefixes(item))
			if clean == "" {
				continue
			}
			if isNumberedCardEncodedBullet(clean) {
				normalized := normalizeNumberedCardBullet(clean)
				if normalized != "" {
					body := regexp.MustCompile(`(?i)^num:\s*`).ReplaceAllString(normalized, "")
					parts := strings.SplitN(body, "||", 3)
					if len(parts) >= 3 {
						claims = append(claims, normalizeCompareText(parts[1]), normalizeCompareText(parts[2]))
						continue
					}
				}
			}
			if isFlowEncodedBullet(clean) {
				title, description, ok := parseFlowBullet(clean)
				if ok {
					claims = append(claims, normalizeCompareText(title), normalizeCompareText(description))
					continue
				}
			}
			if isTimelineEncodedBullet(clean) {
				title, description, ok := parseTimelineBullet(clean)
				if ok {
					claims = append(claims, normalizeCompareText(title), normalizeCompareText(description))
					continue
				}
			}
			claims = append(claims, normalizeCompareText(clean))
		}
		return claims
	}

	containsClaimOverlap := func(base string, claims []string) bool {
		if base == "" {
			return false
		}
		for _, claim := range claims {
			if claim == "" {
				continue
			}
			if claim == base || strings.Contains(claim, base) || strings.Contains(base, claim) {
				return true
			}
		}
		return false
	}

	filterActionPrefixDuplicates := func(items []string, evidence []string) []string {
		filtered := make([]string, 0, len(items))
		claims := append([]string{}, evidence...)
		for _, item := range items {
			clean := sanitizePresentationText(item)
			if clean == "" {
				continue
			}
			candidateNorm := normalizeCompareText(clean)
			baseNorm := normalizeCompareText(actionLeadRe.ReplaceAllString(clean, ""))
			if actionLeadRe.MatchString(clean) && (baseNorm == "" || containsClaimOverlap(baseNorm, claims)) {
				continue
			}
			filtered = append(filtered, clean)
			if candidateNorm != "" {
				claims = append(claims, candidateNorm)
			}
			if baseNorm != "" {
				claims = append(claims, baseNorm)
			}
		}
		return filtered
	}

	isTwoColumnGenericFiller := func(value string) bool {
		clean := strings.ToLower(strings.TrimSpace(value))
		if clean == "" {
			return true
		}
		fillerPhrases := []string{
			"conventional practices often increase resource use",
			"environmental pressure in daily operations",
			"legacy systems can lock households",
			"lower efficiency over time",
			"avoidable maintenance burden",
			"without targeted upgrades",
			"context dependent",
			"operational difference",
		}
		for _, phrase := range fillerPhrases {
			if strings.Contains(clean, phrase) {
				return true
			}
		}
		return false
	}

	rewriteIfStartsWithLabel := func(item, label, prefix string) string {
		clean := sanitizePresentationText(item)
		if clean == "" {
			return ""
		}
		labelNormWords := strings.Fields(normalizeCompareText(label))
		if len(labelNormWords) == 0 {
			return clean
		}

		words := strings.Fields(clean)
		normWords := strings.Fields(normalizeCompareText(clean))
		if len(words) == 0 || len(normWords) == 0 {
			return clean
		}

		maxPrefix := min(4, min(len(labelNormWords), len(normWords)))
		removed := 0
		for n := maxPrefix; n >= 1; n-- {
			if strings.Join(normWords[:n], " ") == strings.Join(labelNormWords[:n], " ") {
				removed = n
				break
			}
		}

		if removed > 0 && len(words) > removed {
			rewritten := sanitizePresentationText(prefix + " " + strings.Join(words[removed:], " "))
			rewritten = strings.TrimLeft(rewritten, " ,;:-")
			if rewritten != "" {
				return rewritten
			}
		}

		labelLead := leadingAlphaToken(label)
		itemLead := leadingAlphaToken(clean)
		if labelLead != "" && itemLead != "" && labelLead == itemLead {
			if len(words) > 1 {
				rewritten := sanitizePresentationText(prefix + " " + strings.Join(words[1:], " "))
				rewritten = strings.TrimLeft(rewritten, " ,;:-")
				if rewritten != "" {
					return rewritten
				}
			}
		}

		return clean
	}

	sanitizeTwoColumnItems := func(items []string, label, sidePrefix string, evidence []string) []string {
		normalized := normalizePresentationPhrases(items, 4, 20)
		normalized = filterActionPrefixDuplicates(normalized, evidence)
		out := make([]string, 0, len(normalized))
		seen := map[string]struct{}{}
		for _, item := range normalized {
			clean := sanitizePresentationText(item)
			if clean == "" || isConversationalTranscriptLine(clean) || isTwoColumnMetaItem(clean) || isTwoColumnGenericFiller(clean) {
				continue
			}
			clean = rewriteIfStartsWithLabel(clean, label, sidePrefix)
			if clean == "" || isTwoColumnGenericFiller(clean) {
				continue
			}
			key := normalizeCompareText(clean)
			if key == "" {
				continue
			}
			if _, exists := seen[key]; exists {
				continue
			}
			seen[key] = struct{}{}
			out = append(out, clean)
			if len(out) >= 4 {
				break
			}
		}
		return out
	}

	left := append([]string{}, slide.LeftColumn...)
	right := append([]string{}, slide.RightColumn...)

	if len(left) == 0 || len(right) == 0 {
		for idx, col := range slide.Columns {
			if idx == 0 && len(left) == 0 {
				left = append(left, col.Items...)
			}
			if idx == 1 && len(right) == 0 {
				right = append(right, col.Items...)
			}
		}
	}

	if len(slide.Bullets) > 0 && (len(left) == 0 || len(right) == 0) {
		for i, bullet := range slide.Bullets {
			if i%2 == 0 {
				left = append(left, bullet)
			} else {
				right = append(right, bullet)
			}
		}
	}

	leftLabel := sanitizePresentationText(pointerStringValue(slide.LeftLabel))
	rightLabel := sanitizePresentationText(pointerStringValue(slide.RightLabel))
	if leftLabel == "" {
		leftLabel = "Context"
	}
	if rightLabel == "" {
		rightLabel = "Outcomes"
	}

	left = normalizePresentationPhrases(left, 4, 20)
	right = normalizePresentationPhrases(right, 4, 20)
	evidenceClaims := collectEvidenceClaims(slide.Bullets)
	evidenceClaims = append(evidenceClaims, collectEvidenceClaims(left)...)
	evidenceClaims = append(evidenceClaims, collectEvidenceClaims(right)...)
	left = sanitizeTwoColumnItems(left, leftLabel, "These materials", evidenceClaims)
	right = sanitizeTwoColumnItems(right, rightLabel, "Long-term alternatives", append(evidenceClaims, collectEvidenceClaims(left)...))

	// Use only speaker notes as fallback seed to avoid title/subtitle text
	// leaking into column items, and to prevent raw transcript speech.
	titleNorm := normalizeCompareText(slide.Title)
	subtitleNorm := normalizeCompareText(pointerStringValue(slide.Subtitle))
	seed := slide.SpeakerNotes
	extra := buildCompactBulletsFromText(seed, 8, 20)
	extraIdx := 0
	targetMin := 4
	for (len(left) < targetMin || len(right) < targetMin) && extraIdx < len(extra) {
		candidate := extra[extraIdx]
		extraIdx++
		if candidate == "" || isConversationalTranscriptLine(candidate) || isTwoColumnMetaItem(candidate) {
			continue
		}
		// Reject candidates that overlap with the slide title or subtitle.
		candidateNorm := normalizeCompareText(candidate)
		if candidateNorm != "" && titleNorm != "" && (strings.Contains(candidateNorm, titleNorm) || strings.Contains(titleNorm, candidateNorm)) {
			continue
		}
		if candidateNorm != "" && subtitleNorm != "" && (strings.Contains(candidateNorm, subtitleNorm) || strings.Contains(subtitleNorm, candidateNorm)) {
			continue
		}
		if len(left) < len(right) {
			left = append(left, candidate)
		} else {
			right = append(right, candidate)
		}
	}

	left = normalizePresentationPhrases(left, 4, 20)
	right = normalizePresentationPhrases(right, 4, 20)
	evidenceClaims = collectEvidenceClaims(slide.Bullets)
	evidenceClaims = append(evidenceClaims, collectEvidenceClaims(left)...)
	evidenceClaims = append(evidenceClaims, collectEvidenceClaims(right)...)
	left = sanitizeTwoColumnItems(left, leftLabel, "These materials", evidenceClaims)
	right = sanitizeTwoColumnItems(right, rightLabel, "Long-term alternatives", append(evidenceClaims, collectEvidenceClaims(left)...))

	leftFallback := []string{
		"Items designed for one-time use quickly become waste, increasing disposal volume and cleanup pressure across neighborhoods and public spaces.",
		"Continuous replacement requires repeated manufacturing cycles that consume additional raw materials, fossil energy, and transport capacity throughout supply chains.",
		"Short product lifespans accelerate landfill accumulation and raise the probability of leakage into rivers, coastlines, and sensitive habitats.",
		"Persistent plastic fragments and additives can spread as micro-scale residues in soil and water, complicating long-term remediation efforts.",
	}
	rightFallback := []string{
		"Reusable products lower total waste output by extending service life across many cycles and reducing routine demand for replacement purchases.",
		"Durable materials such as steel and glass can be cleaned, refilled, and reused repeatedly without rapid loss of performance.",
		"Shifting to long-life alternatives reduces demand for new plastic production and decreases associated emissions across extraction and manufacturing stages.",
		"Sustained reuse adoption supports circular systems where products are repaired, refilled, and recirculated instead of discarded after single use.",
	}
	for i := 0; len(left) < targetMin && i < len(leftFallback); i++ {
		left = append(left, leftFallback[i])
	}
	for i := 0; len(right) < targetMin && i < len(rightFallback); i++ {
		right = append(right, rightFallback[i])
	}

	left = normalizePresentationPhrases(left, 4, 20)
	right = normalizePresentationPhrases(right, 4, 20)
	evidenceClaims = collectEvidenceClaims(slide.Bullets)
	evidenceClaims = append(evidenceClaims, collectEvidenceClaims(left)...)
	evidenceClaims = append(evidenceClaims, collectEvidenceClaims(right)...)
	left = sanitizeTwoColumnItems(left, leftLabel, "These materials", evidenceClaims)
	right = sanitizeTwoColumnItems(right, rightLabel, "Long-term alternatives", append(evidenceClaims, collectEvidenceClaims(left)...))

	if len(left) == 0 {
		left = []string{"Core mechanisms and enabling factors are outlined for this side of the comparison"}
	}
	if len(right) == 0 {
		right = []string{"Observed outcomes and practical implications are summarized for this side"}
	}

	slide.LeftColumn = left
	slide.RightColumn = right
	slide.Bullets = []string{}

	slide.LeftLabel = stringPtr(leftLabel)
	slide.RightLabel = stringPtr(rightLabel)

	slide.Columns = []models.PresentationColumn{
		{Label: leftLabel, Items: left},
		{Label: rightLabel, Items: right},
	}
}

func inferTakeawayIcon(title, description string) string {
	text := strings.ToLower(strings.TrimSpace(title + " " + description))
	switch {
	case strings.Contains(text, "global"), strings.Contains(text, "world"), strings.Contains(text, "international"), strings.Contains(text, "planet"):
		return "globe"
	case strings.Contains(text, "impact"), strings.Contains(text, "result"), strings.Contains(text, "outcome"), strings.Contains(text, "growth"), strings.Contains(text, "performance"):
		return "impact"
	case strings.Contains(text, "platform"), strings.Contains(text, "system"), strings.Contains(text, "software"), strings.Contains(text, "infrastructure"), strings.Contains(text, "open-source"):
		return "platform"
	case strings.Contains(text, "network"), strings.Contains(text, "ecosystem"), strings.Contains(text, "integration"), strings.Contains(text, "connection"):
		return "network"
	case strings.Contains(text, "education"), strings.Contains(text, "learning"), strings.Contains(text, "student"), strings.Contains(text, "teacher"), strings.Contains(text, "study"):
		return "education"
	case strings.Contains(text, "workforce"), strings.Contains(text, "career"), strings.Contains(text, "skill"), strings.Contains(text, "employment"), strings.Contains(text, "development"):
		return "workforce"
	case strings.Contains(text, "equity"), strings.Contains(text, "access"), strings.Contains(text, "accessibility"), strings.Contains(text, "inclusion"), strings.Contains(text, "security"), strings.Contains(text, "trust"):
		return "equity"
	case strings.Contains(text, "environment"), strings.Contains(text, "nature"), strings.Contains(text, "forest"), strings.Contains(text, "climate"), strings.Contains(text, "sustainability"), strings.Contains(text, "water"):
		return "environment"
	case strings.Contains(text, "recycle"), strings.Contains(text, "waste"), strings.Contains(text, "reuse"), strings.Contains(text, "circular"):
		return "recycle"
	default:
		return "innovation"
	}
}

func leadingAlphaToken(value string) string {
	clean := strings.ToLower(strings.TrimSpace(value))
	clean = regexp.MustCompile(`^[^a-z0-9]+|[^a-z0-9]+$`).ReplaceAllString(clean, "")
	words := strings.Fields(clean)
	if len(words) == 0 {
		return ""
	}
	return words[0]
}

func ensureSummaryDescriptionDistinct(title, description string) string {
	description = sanitizePresentationText(description)
	if description == "" {
		return ""
	}

	titleLead := leadingAlphaToken(title)
	descLead := leadingAlphaToken(description)
	if titleLead != "" && descLead != "" && titleLead == descLead {
		words := strings.Fields(description)
		if len(words) > 1 {
			description = strings.TrimSpace(strings.Join(words[1:], " "))
			description = strings.TrimLeft(description, " ,;:.-")
		}
	}

	description = strings.TrimSpace(description)
	if description == "" {
		return ""
	}
	return ensureTrailingDot(description)
}

func buildSummaryTakeaways(slide *models.PresentationSlide) []models.PresentationTakeaway {
	if slide == nil {
		return []models.PresentationTakeaway{}
	}

	items := make([]models.PresentationTakeaway, 0, 4)
	appendItem := func(title, description, icon string) {
		title = sanitizePresentationText(title)
		description = sanitizePresentationText(description)
		icon = sanitizePresentationText(icon)
		if containsTranscriptNoiseTag(title) || containsTranscriptNoiseTag(description) {
			return
		}
		if isConversationalTranscriptLine(title) || isConversationalTranscriptLine(description) || isConversationalTranscriptLine(strings.TrimSpace(title+" "+description)) {
			return
		}
		if title == "" && description == "" {
			return
		}
		if title == "" && description != "" {
			words := strings.Fields(description)
			if len(words) > 4 {
				title = strings.Join(words[:4], " ")
				description = strings.TrimSpace(strings.Join(words[4:], " "))
			} else {
				title = description
				description = ""
			}
		}
		if description == "" {
			description = title
		}
		description = normalizeFeatureDescriptionSentence(description)
		description = ensureSummaryDescriptionDistinct(title, description)
		if description == "" {
			description = ensureSummaryDescriptionDistinct(title, normalizeFeatureDescriptionSentence(title+" with practical implementation and measurable impact for people and systems"))
		}
		if description == "" {
			description = ensureTrailingDot("Use a concrete action that delivers practical benefits for people and systems")
		}
		items = append(items, models.PresentationTakeaway{
			Title:       title,
			Description: description,
			Icon:        firstNonEmpty(icon, inferTakeawayIcon(title, description)),
		})
	}

	for _, item := range slide.Takeaways {
		appendItem(item.Title, item.Description, item.Icon)
	}

	if len(items) == 0 {
		for _, raw := range slide.Bullets {
			clean := sanitizePresentationText(stripNumericPrefixes(raw))
			if clean == "" {
				continue
			}
			if containsTranscriptNoiseTag(clean) || isConversationalTranscriptLine(clean) {
				continue
			}
			if idx := strings.Index(clean, ":"); idx > 0 && idx < 32 {
				appendItem(clean[:idx], clean[idx+1:], "")
				continue
			}
			words := strings.Fields(clean)
			if len(words) > 5 {
				appendItem(strings.Join(words[:min(4, len(words))], " "), strings.Join(words[min(4, len(words)):], " "), "")
			} else {
				appendItem(clean, clean, "")
			}
		}
	}

	if len(items) > 4 {
		items = items[:4]
	}

	return items
}

func enrichSummarySlide(slide *models.PresentationSlide) {
	if slide == nil {
		return
	}
	items := buildSummaryTakeaways(slide)
	if len(items) == 0 {
		return
	}
	slide.Takeaways = items
	if pointerStringValue(slide.Variant) == "" {
		slide.Variant = stringPtr("summary_icons")
	}
	if strings.TrimSpace(slide.Title) == "" {
		slide.Title = "Key Takeaways"
	}
}

func parseComparisonHeaderFromBullet(value string) []string {
	value = normalizeComparisonHeaderBullet(value)
	if value == "" {
		return nil
	}
	body := regexp.MustCompile(`(?i)^header:\s*`).ReplaceAllString(value, "")
	parts := strings.Split(body, "||")
	headers := make([]string, 0, 3)
	for _, part := range parts {
		cell := sanitizePresentationText(part)
		if cell != "" {
			headers = append(headers, cell)
		}
		if len(headers) >= 3 {
			break
		}
	}
	if len(headers) < 2 {
		return nil
	}
	return headers
}

func parseComparisonRowFromBullet(value string) []string {
	value = normalizeComparisonRowBullet(value)
	if value == "" {
		return nil
	}
	body := regexp.MustCompile(`(?i)^row:\s*`).ReplaceAllString(value, "")
	parts := strings.Split(body, "||")
	row := make([]string, 0, 3)
	for _, part := range parts {
		cell := sanitizePresentationText(part)
		if cell != "" {
			row = append(row, cell)
		}
		if len(row) >= 3 {
			break
		}
	}
	if len(row) < 2 {
		return nil
	}
	return row
}

func inferContentVariant(slide *models.PresentationSlide) string {
	if slide == nil {
		return "default"
	}
	for _, bullet := range slide.Bullets {
		if isNumberedCardEncodedBullet(bullet) {
			return "default"
		}
	}
	for _, bullet := range slide.Bullets {
		if isComparisonRowEncodedBullet(bullet) {
			return "comparison_table"
		}
	}
	timelineCount := 0
	for _, bullet := range slide.Bullets {
		if isTimelineEncodedBullet(bullet) {
			timelineCount++
		}
	}
	if timelineCount >= 3 {
		return "timeline"
	}
	flowCount := 0
	for _, bullet := range slide.Bullets {
		if isFlowEncodedBullet(bullet) {
			flowCount++
		}
	}
	if flowCount >= 3 {
		return "flow_arrows"
	}
	featureCount := 0
	cardCount := 0
	for _, bullet := range slide.Bullets {
		if isFeatureEncodedBullet(bullet) {
			featureCount++
			continue
		}
		if isCardEncodedBullet(bullet) {
			cardCount++
		}
	}
	if featureCount >= 3 {
		return "feature_trio"
	}
	if cardCount >= 3 {
		return "default"
	}
	return "default"
}

func cardGridCount(slide models.PresentationSlide) int {
	count := 0
	for _, bullet := range slide.Bullets {
		if isCardEncodedBullet(bullet) {
			count++
		}
	}
	return count
}

func buildCardDescriptionFallback(label, title, subtitle string) string {
	seed := strings.TrimSpace(strings.Join([]string{label, title, subtitle}, " "))
	seed = trimDanglingPhrase(seed)
	if seed == "" {
		seed = "Practical approach"
	}
	candidate := normalizeCardGridDescription(seed+" helps teams execute clear steps, sustain participation, and document measurable environmental outcomes across routine operations.", label, title, subtitle)
	if candidate != "" {
		return candidate
	}
	return "Communities apply a practical sequence of actions that improves adoption quality, reduces waste leakage, and produces measurable environmental gains over time across homes, schools, and local organizations."
}

func cardDescriptionWordCount(value string) int {
	return len(strings.Fields(normalizeCompareText(value)))
}

func normalizeCardGridDescription(value, label, title, subtitle string) string {
	text := sanitizePresentationText(value)
	if text == "" {
		text = sanitizePresentationText(strings.Join([]string{title, subtitle}, " "))
	}

	sentences := splitPresentationSentences(text)
	if len(sentences) > 0 {
		text = sanitizePresentationText(strings.Join(sentences[:min(2, len(sentences))], " "))
	}

	words := trimDanglingEndingWords(strings.Fields(text))
	if len(words) == 0 {
		words = strings.Fields("This approach organizes practical steps that reduce waste, improve adoption quality, and create measurable environmental impact across daily routines in homes, schools, and community spaces")
	}

	labelNormWords := strings.Fields(normalizeCompareText(label))
	descNormWords := strings.Fields(normalizeCompareText(strings.Join(words, " ")))
	descNormJoined := strings.Join(descNormWords, " ")
	for n := min(4, len(labelNormWords)); n >= 1 && len(words) > n; n-- {
		phrase := strings.Join(labelNormWords[:n], " ")
		if descNormJoined == phrase || strings.HasPrefix(descNormJoined, phrase+" ") {
			words = words[n:]
			break
		}
	}

	if len(words) == 0 {
		words = strings.Fields("This approach organizes practical steps that reduce waste, improve adoption quality, and create measurable environmental impact across daily routines in homes, schools, and community spaces")
	}

	labelLead := leadingAlphaToken(label)
	if labelLead != "" && strings.EqualFold(labelLead, leadingAlphaToken(strings.Join(words, " "))) {
		if len(words) > 1 {
			words = append([]string{"This", "approach"}, words[1:]...)
		} else {
			words = []string{"This", "approach", "uses", "a", "practical", "sequence", "that", "improves", "adoption", "quality", "and", "delivers", "measurable", "environmental", "results", "across", "daily", "operations", "for", "households", "and", "communities"}
		}
	}

	words = trimDanglingEndingWords(words)
	if len(words) > 30 {
		words = words[:30]
		words = trimDanglingEndingWords(words)
	}

	// Accept shorter descriptions rather than padding with cyclic filler text.
	// If the description is too short to be useful, return empty.
	if len(words) < 8 {
		return ""
	}

	text = strings.TrimRight(strings.TrimSpace(strings.Join(words, " ")), " .;:!?")
	if text == "" {
		return ""
	}

	if labelLead != "" && strings.EqualFold(labelLead, leadingAlphaToken(text)) {
		textWords := strings.Fields(text)
		if len(textWords) > 1 {
			text = strings.TrimSpace("This approach " + strings.Join(textWords[1:], " "))
		}
	}

	return ensureTrailingDot(text)
}

func normalizeCardGridEncodedBullet(value, title, subtitle string, index int) string {
	value = sanitizePresentationText(value)
	if value == "" || !isCardEncodedBullet(value) {
		return ""
	}

	body := regexp.MustCompile(`(?i)^card:\s*`).ReplaceAllString(value, "")
	parts := strings.SplitN(body, "||", 2)
	if len(parts) != 2 {
		return ""
	}

	label := strings.TrimRight(sanitizePresentationText(parts[0]), " .;:!?")
	if label == "" {
		fallbackLabels := []string{"Source Reduction", "Reuse Systems", "Collection Upgrade"}
		if index >= 0 && index < len(fallbackLabels) {
			label = fallbackLabels[index]
		} else {
			label = fmt.Sprintf("Focus %d", index+1)
		}
	}
	labelWords := strings.Fields(label)
	if len(labelWords) > 4 {
		label = strings.Join(labelWords[:4], " ")
	}

	description := normalizeCardGridDescription(parts[1], label, title, subtitle)
	wordCount := cardDescriptionWordCount(description)
	if wordCount < 8 || wordCount > 30 {
		description = normalizeCardGridDescription(buildCardDescriptionFallback(label, title, subtitle), label, title, subtitle)
		wordCount = cardDescriptionWordCount(description)
	}
	if description == "" || wordCount < 8 || wordCount > 30 {
		return ""
	}

	if labelLead := leadingAlphaToken(label); labelLead != "" && strings.EqualFold(labelLead, leadingAlphaToken(description)) {
		descWords := strings.Fields(strings.TrimRight(description, "."))
		if len(descWords) > 1 {
			description = ensureTrailingDot("This approach " + strings.Join(descWords[1:], " "))
		}
	}

	return "CARD: " + label + " || " + description
}

func enrichCardGridContentSlide(slide *models.PresentationSlide, transcript string) {
	if slide == nil {
		return
	}
	title := slide.Title
	subtitle := pointerStringValue(slide.Subtitle)

	cards := make([]string, 0, 3)
	seenLabels := map[string]struct{}{}
	seenDescriptions := map[string]struct{}{}
	fallbackLabels := []string{"Source Reduction", "Reuse Systems", "Collection Upgrade"}

	addCard := func(candidate string) {
		if len(cards) >= 3 {
			return
		}
		normalized := normalizeCardGridEncodedBullet(candidate, title, subtitle, len(cards))
		if normalized == "" {
			return
		}

		body := regexp.MustCompile(`(?i)^card:\s*`).ReplaceAllString(normalized, "")
		parts := strings.SplitN(body, "||", 2)
		if len(parts) != 2 {
			return
		}

		label := strings.TrimSpace(parts[0])
		description := strings.TrimSpace(parts[1])
		labelKey := normalizeCompareText(label)
		descriptionKey := normalizeCompareText(description)
		if labelKey == "" || descriptionKey == "" {
			return
		}
		if _, exists := seenDescriptions[descriptionKey]; exists {
			return
		}
		if _, exists := seenLabels[labelKey]; exists {
			for _, fallback := range fallbackLabels {
				fallbackKey := normalizeCompareText(fallback)
				if _, used := seenLabels[fallbackKey]; used {
					continue
				}
				label = fallback
				labelKey = fallbackKey
				break
			}
			if _, stillUsed := seenLabels[labelKey]; stillUsed {
				label = fmt.Sprintf("Focus %d", len(cards)+1)
				labelKey = normalizeCompareText(label)
			}
			normalized = "CARD: " + label + " || " + description
		}

		if wordCount := cardDescriptionWordCount(description); wordCount < 8 || wordCount > 30 {
			return
		}
		if labelLead := leadingAlphaToken(label); labelLead != "" && strings.EqualFold(labelLead, leadingAlphaToken(description)) {
			return
		}

		seenLabels[labelKey] = struct{}{}
		seenDescriptions[descriptionKey] = struct{}{}
		cards = append(cards, normalized)
	}

	for _, bullet := range slide.Bullets {
		if !isCardEncodedBullet(bullet) {
			continue
		}
		addCard(bullet)
		if len(cards) >= 3 {
			break
		}
	}

	if len(cards) < 3 {
		for _, bullet := range slide.Bullets {
			if isCardEncodedBullet(bullet) || isNumberedCardEncodedBullet(bullet) || isFeatureEncodedBullet(bullet) {
				continue
			}
			clean := sanitizePresentationText(stripNumericPrefixes(bullet))
			if clean == "" {
				continue
			}
			words := strings.Fields(clean)
			if len(words) < 4 {
				continue
			}
			label := strings.Join(words[:min(3, len(words))], " ")
			desc := clean
			if len(words) > 3 {
				desc = strings.Join(words[3:], " ")
			}
			if desc == "" {
				desc = buildCardDescriptionFallback(label, title, subtitle)
			}
			addCard("CARD: " + label + " || " + desc)
			if len(cards) >= 3 {
				break
			}
		}
	}

	if len(cards) < 3 {
		source := strings.Join([]string{slide.Title, pointerStringValue(slide.Subtitle), pointerStringValue(slide.Body), slide.SpeakerNotes, transcript}, " ")
		extra := buildCompactBulletsFromText(source, 6, 16)
		for _, item := range extra {
			if item == "" {
				continue
			}
			words := strings.Fields(item)
			if len(words) < 4 {
				continue
			}
			label := strings.Join(words[:min(3, len(words))], " ")
			desc := strings.Join(words[min(3, len(words)):], " ")
			if desc == "" {
				desc = buildCardDescriptionFallback(label, title, subtitle)
			}
			addCard("CARD: " + label + " || " + desc)
			if len(cards) >= 3 {
				break
			}
		}
	}

	fallbackCardSeeds := []string{
		"CARD: Source Reduction || Communities reduce plastic generation by replacing single use packaging with refill and bulk options, lowering disposal volume, cutting cleanup costs, and creating visible behavior change in daily routines.",
		"CARD: Reuse Systems || Schools and shops implement returnable containers, washable utensils, and tracking labels to keep materials circulating longer, reduce replacement purchases, and improve collection quality before final recycling steps.",
		"CARD: Collection Upgrade || Local programs standardize sorting guidance, expand neighborhood drop points, and publish contamination feedback so households separate waste correctly, enabling higher recovery rates and cleaner streams for processing facilities.",
	}

	if len(cards) < 3 {
		for _, seed := range fallbackCardSeeds {
			if len(cards) >= 3 {
				break
			}
			addCard(seed)
		}
	}

	if len(cards) == 0 {
		cards = []string{
			normalizeCardGridEncodedBullet(fallbackCardSeeds[0], title, subtitle, 0),
			normalizeCardGridEncodedBullet(fallbackCardSeeds[1], title, subtitle, 1),
			normalizeCardGridEncodedBullet(fallbackCardSeeds[2], title, subtitle, 2),
		}
	}

	if len(cards) > 3 {
		cards = cards[:3]
	}

	cleanCards := make([]string, 0, 3)
	for _, card := range cards {
		if card != "" {
			cleanCards = append(cleanCards, card)
		}
	}
	if len(cleanCards) < 3 {
		for i, seed := range fallbackCardSeeds {
			if len(cleanCards) >= 3 {
				break
			}
			normalized := normalizeCardGridEncodedBullet(seed, title, subtitle, i)
			if normalized == "" {
				continue
			}
			key := normalizeCompareText(normalized)
			exists := false
			for _, existing := range cleanCards {
				if normalizeCompareText(existing) == key {
					exists = true
					break
				}
			}
			if !exists {
				cleanCards = append(cleanCards, normalized)
			}
		}
	}
	if len(cleanCards) < 3 {
		return
	}

	slide.Type = "content"
	slide.Variant = stringPtr("default")
	slide.Bullets = cleanCards
	if strings.TrimSpace(pointerStringValue(slide.ImageQuery)) == "" {
		seed := fallbackSlideImageQuery(strings.Join([]string{slide.Title, pointerStringValue(slide.Subtitle), strings.Join(cleanCards, " ")}, " "))
		if seed != "" {
			slide.ImageQuery = stringPtr(seed)
		}
	}
}

func enrichTimelineSlide(slide *models.PresentationSlide, transcript string) {
	if slide == nil {
		return
	}

	type timelineItem struct {
		Title       string
		Description string
	}

	slideContext := strings.Join([]string{slide.Title, pointerStringValue(slide.Subtitle), pointerStringValue(slide.Body), slide.SpeakerNotes, transcript}, " ")
	isWasteCycleContext := regexp.MustCompile(`(?i)\b(?:compost|recycl|waste|plastic|landfill|organic|inorganic|sorting|material|resource|decomposition)\b`).MatchString(slideContext)

	containsTimelineLeak := func(value string) bool {
		clean := strings.ToLower(strings.TrimSpace(value))
		if clean == "" {
			return false
		}
		if containsTranscriptNoiseTag(clean) || isConversationalTranscriptLine(clean) {
			return true
		}
		if regexp.MustCompile(`(?i)\b(?:toby|lucas|mia|nadia|ben)\b`).MatchString(clean) {
			return true
		}
		if regexp.MustCompile(`(?i)\b[a-z]+\s+(?:mentioned|said|noted|explained|stated)\b`).MatchString(clean) {
			return true
		}
		blocked := []string{
			"nice to see you",
			"super important",
			"right",
			"all these things are",
			"people are coming up",
			"and now",
		}
		for _, phrase := range blocked {
			if strings.Contains(clean, phrase) {
				return true
			}
		}
		return false
	}

	titleStartsDescription := func(title, description string) bool {
		titleWords := strings.Fields(normalizeCompareText(title))
		descWords := strings.Fields(normalizeCompareText(description))
		if len(titleWords) == 0 || len(descWords) == 0 {
			return false
		}
		maxPrefix := min(4, min(len(titleWords), len(descWords)))
		for n := maxPrefix; n >= 1; n-- {
			if strings.Join(titleWords[:n], " ") == strings.Join(descWords[:n], " ") {
				return true
			}
		}
		return false
	}

	inferTimelineTitle := func(description string, step int) string {
		norm := normalizeCompareText(description)
		switch {
		case strings.Contains(norm, "sort"), strings.Contains(norm, "separat"), strings.Contains(norm, "bin"):
			return "Source Separation"
		case strings.Contains(norm, "collect"), strings.Contains(norm, "transport"), strings.Contains(norm, "facility"), strings.Contains(norm, "logistics"):
			return "Collection Logistics"
		case strings.Contains(norm, "decompos"), strings.Contains(norm, "compost"), strings.Contains(norm, "microorgan"):
			return "Biological Decomposition"
		case strings.Contains(norm, "recover"), strings.Contains(norm, "recycl"), strings.Contains(norm, "material"):
			return "Material Recovery"
		case strings.Contains(norm, "return"), strings.Contains(norm, "resource"), strings.Contains(norm, "soil"), strings.Contains(norm, "agric"):
			return "Resource Return"
		}

		if isWasteCycleContext {
			wasteTitles := []string{"Source Separation", "Collection Logistics", "Biological Decomposition", "Material Recovery", "Resource Return"}
			if step >= 1 && step <= len(wasteTitles) {
				return wasteTitles[step-1]
			}
		}

		genericTitles := []string{"Initial Intake", "Coordinated Transfer", "Core Processing", "Output Recovery", "System Reintegration"}
		if step >= 1 && step <= len(genericTitles) {
			return genericTitles[step-1]
		}
		return fmt.Sprintf("Process Step %d", max(1, step))
	}

	fallbackDescriptionFor := func(title string, step int) string {
		norm := normalizeCompareText(title)
		if isWasteCycleContext {
			switch {
			case strings.Contains(norm, "source separation"):
				return "Categorize household waste into distinct organic, recyclable, and landfill streams at the initial point of disposal."
			case strings.Contains(norm, "collection logistics"):
				return "Transport separated materials to specialized facilities for industrial processing or localized community-managed composting sites."
			case strings.Contains(norm, "biological decomposition"):
				return "Monitor organic matter as beneficial microorganisms transform food scraps into nutrient-dense, dark soil enhancers over several months."
			case strings.Contains(norm, "material recovery"):
				return "Process glass, paper, and various plastics back into raw materials to be utilized in future manufacturing cycles."
			case strings.Contains(norm, "resource return"):
				return "Apply the finished compost to local agricultural land to close the nutrient loop and support sustainable new growth."
			}
		}

		generic := []string{
			"Define scope, inputs, and classification criteria so each stream enters the process with clear handling requirements.",
			"Move validated inputs to the correct processing environment while preserving traceability, safety controls, and operational timing.",
			"Execute the main transformation stage using monitored conditions that convert inputs into stable and usable outputs.",
			"Verify quality and recover reusable outputs for subsequent production, service delivery, or controlled redistribution pathways.",
			"Return finalized outputs to practical use and record outcomes to improve the next operational cycle.",
		}
		if step >= 1 && step <= len(generic) {
			return generic[step-1]
		}
		return "This phase defines a concrete process milestone with measurable operational outcomes and clear next-step readiness criteria."
	}

	normalizeTitle := func(title, description string, step int) string {
		clean := strings.TrimRight(trimDanglingPhrase(sanitizePresentationText(title)), " .;:!?")
		if containsTimelineLeak(clean) {
			clean = ""
		}
		if clean != "" {
			norm := normalizeCompareText(clean)
			slideNorm := normalizeCompareText(slide.Title)
			if norm != "" && slideNorm != "" && (norm == slideNorm || strings.Contains(slideNorm, norm) || strings.Contains(norm, slideNorm)) {
				clean = ""
			}
		}

		if clean != "" {
			norm := normalizeCompareText(clean)
			weakPrefixes := []string{"all these things", "people are coming", "it is nice", "it's nice", "this flow", "the composting and recycling", "today"}
			for _, prefix := range weakPrefixes {
				if strings.HasPrefix(norm, normalizeCompareText(prefix)) {
					clean = ""
					break
				}
			}
		}

		if clean == "" {
			clean = inferTimelineTitle(description, step)
		}

		words := strings.Fields(clean)
		if len(words) > 4 {
			clean = strings.Join(words[:4], " ")
		}
		if len(strings.Fields(clean)) < 2 {
			clean = inferTimelineTitle(description, step)
		}
		return strings.TrimRight(sanitizePresentationText(clean), " .;:!?")
	}

	normalizeDescription := func(title, description string, step int) string {
		clean := sanitizePresentationText(description)
		clean = regexp.MustCompile(`(?i)\b[a-z]+\s+(?:mentioned|said|noted|explained|stated)\b`).ReplaceAllString(clean, "")
		clean = regexp.MustCompile(`(?i)(?:,?\s*(?:right|you\s+know|okay|ok))\.?$`).ReplaceAllString(clean, "")
		clean = sanitizePresentationText(clean)
		if clean == "" || containsTimelineLeak(clean) {
			clean = fallbackDescriptionFor(title, step)
		}

		clean = normalizeFeatureDescriptionSentence(clean)
		if clean == "" || containsTimelineLeak(clean) {
			clean = normalizeFeatureDescriptionSentence(fallbackDescriptionFor(title, step))
		}
		if clean == "" {
			return ""
		}

		if titleStartsDescription(title, clean) {
			rawWords := strings.Fields(strings.TrimRight(clean, "."))
			titleWords := strings.Fields(normalizeCompareText(title))
			removeCount := min(4, min(len(rawWords), len(titleWords)))
			if removeCount > 0 && len(rawWords) > removeCount {
				clean = normalizeFeatureDescriptionSentence("This stage " + strings.Join(rawWords[removeCount:], " "))
			}
		}

		if clean == "" || titleStartsDescription(title, clean) {
			clean = normalizeFeatureDescriptionSentence("This stage establishes a concrete operational milestone with measurable outcomes and clear readiness for the following step.")
		}
		return clean
	}

	inferRequestedStepCount := func() int {
		seed := strings.ToLower(strings.Join([]string{slide.Title, pointerStringValue(slide.Subtitle), pointerStringValue(slide.Body)}, " "))
		patterns := []struct {
			re *regexp.Regexp
			n  int
		}{
			{regexp.MustCompile(`(?i)\b(?:3|three)\s*[- ]?\s*(?:step|stage|phase)\b`), 3},
			{regexp.MustCompile(`(?i)\b(?:4|four)\s*[- ]?\s*(?:step|stage|phase)\b`), 4},
			{regexp.MustCompile(`(?i)\b(?:5|five)\s*[- ]?\s*(?:step|stage|phase)\b`), 5},
		}
		for _, pattern := range patterns {
			if pattern.re.MatchString(seed) {
				return pattern.n
			}
		}
		return 0
	}

	items := make([]timelineItem, 0, 5)
	seen := map[string]struct{}{}
	seenTitles := map[string]struct{}{}
	appendItem := func(title, description string) {
		if len(items) >= 5 {
			return
		}
		title = normalizeTitle(title, description, len(items)+1)
		if title == "" || containsTimelineLeak(title) {
			return
		}
		description = normalizeDescription(title, description, len(items)+1)
		if description == "" || containsTimelineLeak(description) {
			return
		}

		titleKey := normalizeCompareText(title)
		if titleKey == "" {
			return
		}
		if _, exists := seenTitles[titleKey]; exists {
			return
		}

		key := normalizeCompareText(title + " " + description)
		if key == "" {
			return
		}
		if _, exists := seen[key]; exists {
			return
		}
		seenTitles[titleKey] = struct{}{}
		seen[key] = struct{}{}
		items = append(items, timelineItem{Title: title, Description: description})
	}

	for _, bullet := range slide.Bullets {
		if !isTimelineEncodedBullet(bullet) {
			continue
		}
		title, description, ok := parseTimelineBullet(bullet)
		if !ok {
			continue
		}
		appendItem(title, description)
		if len(items) >= 5 {
			break
		}
	}

	if len(items) < 3 {
		for _, bullet := range slide.Bullets {
			if !isNumberedCardEncodedBullet(bullet) {
				continue
			}
			normalized := normalizeNumberedCardBullet(bullet)
			if normalized == "" {
				continue
			}
			body := regexp.MustCompile(`(?i)^num:\s*`).ReplaceAllString(normalized, "")
			parts := strings.SplitN(body, "||", 3)
			if len(parts) < 3 {
				continue
			}
			title := sanitizePresentationText(parts[1])
			description := sanitizePresentationText(parts[2])
			appendItem(title, description)
			if len(items) >= 5 {
				break
			}
		}
	}

	defaultSteps := []timelineItem{}
	if isWasteCycleContext {
		defaultSteps = []timelineItem{
			{Title: "Source Separation", Description: "Categorize household waste into distinct organic, recyclable, and landfill streams at the initial point of disposal."},
			{Title: "Collection Logistics", Description: "Transport separated materials to specialized facilities for industrial processing or localized community-managed composting sites."},
			{Title: "Biological Decomposition", Description: "Monitor organic matter as beneficial microorganisms transform food scraps into nutrient-dense, dark soil enhancers over several months."},
			{Title: "Material Recovery", Description: "Process glass, paper, and various plastics back into raw materials to be utilized in future manufacturing cycles."},
			{Title: "Resource Return", Description: "Apply the finished compost to local agricultural land to close the nutrient loop and support sustainable new growth."},
		}
	} else {
		defaultSteps = []timelineItem{
			{Title: "Initial Intake", Description: "Define input categories, scope boundaries, and handling criteria so each stream enters the workflow with clear operational requirements."},
			{Title: "Coordinated Transfer", Description: "Move validated inputs to the correct processing environment while preserving safety constraints, traceability records, and planned timing dependencies."},
			{Title: "Core Processing", Description: "Execute the primary transformation stage under monitored conditions that convert incoming materials into stable and usable intermediate outputs."},
			{Title: "Output Recovery", Description: "Verify quality, separate recoverable outputs, and prepare refined materials for practical downstream use or controlled redistribution pathways."},
			{Title: "System Reintegration", Description: "Return finalized outputs to productive use, then record performance results to guide optimization in the next operating cycle."},
		}
	}

	requestedSteps := inferRequestedStepCount()
	if requestedSteps < 3 || requestedSteps > 5 {
		requestedSteps = 0
	}

	if len(items) >= 3 {
		if isWasteCycleContext {
			expectedOrder := []string{"source separation", "collection logistics", "biological decomposition", "material recovery", "resource return"}
			used := map[int]struct{}{}
			reordered := make([]timelineItem, 0, len(items))
			for _, expected := range expectedOrder {
				for idx, item := range items {
					if _, exists := used[idx]; exists {
						continue
					}
					if strings.Contains(normalizeCompareText(item.Title), expected) {
						reordered = append(reordered, item)
						used[idx] = struct{}{}
						break
					}
				}
			}
			for idx, item := range items {
				if _, exists := used[idx]; exists {
					continue
				}
				reordered = append(reordered, item)
			}
			items = reordered
		}

		if requestedSteps > 0 && len(items) > requestedSteps {
			items = items[:requestedSteps]
		}
		if len(items) > 5 {
			items = items[:5]
		}
	} else {
		items = make([]timelineItem, 0, 5)
		seen = map[string]struct{}{}
		seenTitles = map[string]struct{}{}

		targetSteps := 5
		if requestedSteps > 0 {
			targetSteps = requestedSteps
		}

		for _, step := range defaultSteps {
			if len(items) >= targetSteps {
				break
			}
			appendItem(step.Title, step.Description)
		}

		for attempt := 0; len(items) < 3 && attempt < 8; attempt++ {
			idx := len(items) + 1
			generatedTitle := inferTimelineTitle("", idx)
			appendItem(generatedTitle, fallbackDescriptionFor(generatedTitle, idx))
		}

		if len(items) > targetSteps {
			items = items[:targetSteps]
		}
	}

	out := make([]string, 0, len(items))
	for i, item := range items {
		title := strings.TrimRight(sanitizePresentationText(item.Title), " .;:!?")
		description := normalizeFeatureDescriptionSentence(item.Description)
		if description == "" {
			description = "Clarifies milestone scope and measurable impact for project execution."
		}
		if title == "" {
			title = firstNWords(description, 4)
			title = strings.TrimRight(title, " .;:!?")
		}
		if title == "" {
			continue
		}
		out = append(out, fmt.Sprintf("TIMELINE: %d || %s || %s", i+1, title, description))
	}

	if len(out) < 3 {
		return
	}

	slide.Type = "content"
	slide.Variant = stringPtr("timeline")
	slide.Bullets = out
	slide.ImageQuery = nil
}

func enrichFlowArrowsSlide(slide *models.PresentationSlide, transcript string) {
	if slide == nil {
		return
	}
	_ = transcript

	type flowItem struct {
		Title       string
		Description string
	}

	inferFlowFallbackTitle := func(description string, step int) string {
		norm := normalizeCompareText(description)
		switch {
		case strings.Contains(norm, "prompt"), strings.Contains(norm, "specification"), strings.Contains(norm, "requirements"):
			return "Input Definition"
		case strings.Contains(norm, "prototype"), strings.Contains(norm, "build"), strings.Contains(norm, "implement"):
			return "Prototype Build"
		case strings.Contains(norm, "test"), strings.Contains(norm, "validate"), strings.Contains(norm, "play"):
			return "Validation Loop"
		case strings.Contains(norm, "optimiz"), strings.Contains(norm, "refine"), strings.Contains(norm, "iterate"):
			return "Refinement Cycle"
		}

		defaults := []string{"Input Definition", "Prototype Build", "Validation Loop"}
		if step >= 1 && step <= len(defaults) {
			return defaults[step-1]
		}
		return fmt.Sprintf("Flow Step %d", max(1, step))
	}

	items := make([]flowItem, 0, 3)
	seen := map[string]struct{}{}
	appendItem := func(title, description string) {
		if len(items) >= 3 {
			return
		}
		title = strings.TrimRight(trimDanglingPhrase(title), " .;:!?")
		description = normalizeFeatureDescriptionSentence(description)
		if description == "" {
			description = "Explains the implementation step with clear ownership and measurable operational impact."
		}

		titleWords := trimDanglingEndingWords(strings.Fields(title))
		if len(titleWords) > 4 {
			titleWords = titleWords[:4]
		}
		if len(titleWords) < 2 {
			descWords := trimDanglingEndingWords(strings.Fields(description))
			if len(descWords) >= 3 {
				titleWords = descWords[:3]
			}
		}
		if len(titleWords) == 0 {
			return
		}
		title = strings.Join(titleWords, " ")

		key := normalizeCompareText(title + " " + description)
		if key == "" {
			return
		}
		if _, exists := seen[key]; exists {
			return
		}
		seen[key] = struct{}{}
		items = append(items, flowItem{Title: title, Description: description})
	}

	for _, bullet := range slide.Bullets {
		if !isFlowEncodedBullet(bullet) {
			continue
		}
		title, description, ok := parseFlowBullet(bullet)
		if !ok {
			continue
		}
		appendItem(title, description)
		if len(items) >= 3 {
			break
		}
	}

	if len(items) < 3 {
		for _, bullet := range slide.Bullets {
			if !isNumberedCardEncodedBullet(bullet) {
				continue
			}
			normalized := normalizeNumberedCardBullet(bullet)
			if normalized == "" {
				continue
			}
			body := regexp.MustCompile(`(?i)^num:\s*`).ReplaceAllString(normalized, "")
			parts := strings.SplitN(body, "||", 3)
			if len(parts) < 3 {
				continue
			}
			title := sanitizePresentationText(parts[1])
			description := sanitizePresentationText(parts[2])
			appendItem(title, description)
			if len(items) >= 3 {
				break
			}
		}
	}

	if len(items) < 3 {
		for _, bullet := range slide.Bullets {
			if isFlowEncodedBullet(bullet) || isTimelineEncodedBullet(bullet) || isNumberedCardEncodedBullet(bullet) || isCardEncodedBullet(bullet) || isFeatureEncodedBullet(bullet) || isComparisonHeaderEncodedBullet(bullet) || isComparisonRowEncodedBullet(bullet) {
				continue
			}
			clean := sanitizePresentationText(stripNumericPrefixes(bullet))
			if clean == "" || isConversationalTranscriptLine(clean) || isLikelyTranscriptFragment(clean) {
				continue
			}
			title := inferFlowFallbackTitle(clean, len(items)+1)
			description := clean
			appendItem(title, description)
			if len(items) >= 3 {
				break
			}
		}
	}

	if len(items) < 3 {
		source := strings.Join([]string{slide.Title, pointerStringValue(slide.Subtitle), pointerStringValue(slide.Body), slide.SpeakerNotes}, " ")
		extra := buildCompactBulletsFromText(source, 5, 14)
		for _, bullet := range extra {
			clean := sanitizePresentationText(bullet)
			if clean == "" || isConversationalTranscriptLine(clean) || isLikelyTranscriptFragment(clean) {
				continue
			}
			title := inferFlowFallbackTitle(clean, len(items)+1)
			description := clean
			appendItem(title, description)
			if len(items) >= 3 {
				break
			}
		}
	}

	if len(items) == 0 {
		appendItem("Baseline Discovery", "Analyze current constraints and define success criteria that align stakeholders around measurable outcomes.")
		appendItem("Coordinated Execution", "Implement prioritized actions with cross functional accountability to reduce delays and maintain delivery quality.")
		appendItem("Feedback Optimization", "Measure outcomes continuously and refine the process using evidence from operational performance signals.")
	}

	for len(items) < 3 {
		appendItem("Execution Step", "This step aligns actions, ownership, and measurable checkpoints for reliable implementation outcomes.")
	}

	if len(items) > 3 {
		items = items[:3]
	}

	out := make([]string, 0, len(items))
	for i, item := range items {
		title := strings.TrimRight(sanitizePresentationText(item.Title), " .;:!?")
		description := normalizeFeatureDescriptionSentence(item.Description)
		if description == "" {
			description = "Describes a concrete step with practical implementation detail and measurable project impact."
		}
		if title == "" {
			title = strings.TrimRight(firstNWords(description, 3), " .;:!?")
		}
		if title == "" {
			continue
		}
		out = append(out, fmt.Sprintf("FLOW: %d || %s || %s", i+1, title, description))
	}

	if len(out) < 3 {
		return
	}

	slide.Type = "content"
	slide.Variant = stringPtr("flow_arrows")
	slide.Bullets = out
	slide.ImageQuery = nil
}

func normalizeFeatureDescriptionSentence(value string) string {
	text := sanitizePresentationText(value)
	if text == "" {
		return ""
	}

	// Take up to two sentences so we don't clip the description too aggressively.
	sentences := splitPresentationSentences(text)
	if len(sentences) >= 2 {
		text = sanitizePresentationText(sentences[0] + ". " + sentences[1])
	} else if len(sentences) == 1 {
		text = sanitizePresentationText(sentences[0])
	}

	words := strings.Fields(text)
	if len(words) > 20 {
		words = words[:20]
		words = trimDanglingEndingWords(words)
	}

	// Fix dangling prepositions/conjunctions at end without adding generic filler.
	dangling := map[string]struct{}{
		"to": {}, "and": {}, "or": {}, "with": {}, "of": {}, "for": {}, "in": {}, "on": {}, "at": {},
		"by": {}, "from": {}, "as": {}, "than": {}, "that": {}, "which": {}, "while": {}, "because": {},
	}
	for len(words) > 0 {
		last := strings.ToLower(strings.Trim(words[len(words)-1], " .;:!?"))
		if _, exists := dangling[last]; exists {
			words = words[:len(words)-1]
		} else {
			break
		}
	}

	text = strings.TrimRight(strings.TrimSpace(strings.Join(words, " ")), " .;:!?")
	if text == "" {
		return ""
	}
	return text + "."
}

func parseFeatureBullet(value string) (icon, title, description string, ok bool) {
	value = normalizeFeatureEncodedBullet(value)
	if value == "" {
		return "", "", "", false
	}
	body := regexp.MustCompile(`(?i)^feature:\s*`).ReplaceAllString(value, "")
	parts := strings.SplitN(body, "||", 3)
	if len(parts) < 3 {
		return "", "", "", false
	}
	icon = sanitizePresentationText(parts[0])
	title = sanitizePresentationText(parts[1])
	description = sanitizePresentationText(parts[2])
	if title == "" || description == "" {
		return "", "", "", false
	}
	return icon, title, description, true
}

func enrichFeatureTrioSlide(slide *models.PresentationSlide, transcript string) {
	if slide == nil {
		return
	}

	out := make([]string, 0, 3)
	for _, bullet := range slide.Bullets {
		if isFeatureEncodedBullet(bullet) {
			normalized := normalizeFeatureEncodedBullet(bullet)
			if normalized != "" {
				out = append(out, normalized)
			}
		} else if isCardEncodedBullet(bullet) {
			normalized := normalizeCardEncodedBullet(bullet)
			if normalized != "" {
				out = append(out, normalized)
			}
		}
		if len(out) >= 3 {
			break
		}
	}

	if len(out) == 0 {
		for _, bullet := range slide.Bullets {
			clean := sanitizePresentationText(stripNumericPrefixes(bullet))
			if clean == "" || isConversationalTranscriptLine(clean) || isLikelyTranscriptFragment(clean) {
				continue
			}
			titleWords := strings.Fields(clean)
			if len(titleWords) < 6 {
				continue
			}
			title := strings.Join(titleWords[:min(4, len(titleWords))], " ")
			desc := clean
			if len(titleWords) > 4 {
				desc = strings.Join(titleWords[min(4, len(titleWords)):], " ")
			}
			if desc == "" {
				desc = clean
			}
			icon := inferTakeawayIcon(title, desc)
			out = append(out, "FEATURE: "+icon+" || "+title+" || "+desc)
			if len(out) >= 3 {
				break
			}
		}
	}

	if len(out) == 0 {
		return
	}

	// Use only speaker notes for extra content; never raw transcript.
	if len(out) < 3 {
		extraSource := slide.SpeakerNotes
		extra := buildCompactBulletsFromText(extraSource, 3-len(out), 14)
		for _, item := range extra {
			if item == "" || isConversationalTranscriptLine(item) || isLikelyTranscriptFragment(item) {
				continue
			}
			titleWords := strings.Fields(item)
			if len(titleWords) < 6 {
				continue
			}
			title := strings.Join(titleWords[:min(4, len(titleWords))], " ")
			desc := item
			if len(titleWords) > 4 {
				desc = strings.Join(titleWords[min(4, len(titleWords)):], " ")
			}
			if desc == "" {
				desc = item
			}
			out = append(out, normalizeFeatureEncodedBullet("FEATURE: "+inferTakeawayIcon(title, desc)+" || "+title+" || "+desc))
			if len(out) >= 3 {
				break
			}
		}
	}

	for i := range out {
		icon, title, desc, ok := parseFeatureBullet(out[i])
		if !ok {
			continue
		}
		desc = normalizeFeatureDescriptionSentence(desc)
		if desc == "" {
			desc = "Delivers consistent outcomes through practical implementation and measurable everyday impact."
		}
		out[i] = normalizeFeatureEncodedBullet("FEATURE: " + firstNonEmpty(icon, inferTakeawayIcon(title, desc)) + " || " + title + " || " + desc)
	}

	slide.Bullets = out
	slide.Variant = stringPtr("feature_trio")
	slide.ImageQuery = nil
}

func enrichMediaSplitSlide(slide *models.PresentationSlide, transcript string) {
	if slide == nil {
		return
	}

	subtitle := pointerStringValue(slide.Subtitle)
	built := normalizePresentationBullets(slide.Bullets, slide.Title, subtitle, 4, 10)
	if len(built) < 3 {
		source := strings.Join([]string{slide.Title, subtitle, pointerStringValue(slide.Body), slide.SpeakerNotes, transcript}, " ")
		extra := buildCompactBulletsFromText(source, 4-len(built), 10)
		built = append(built, extra...)
		built = normalizePresentationBullets(built, slide.Title, subtitle, 4, 10)
	}

	if len(built) == 0 {
		seed := firstNonEmpty(slide.Title, "Key insight")
		built = []string{
			firstNWords(seed+" baseline context and setup for evaluation", 10),
			firstNWords(seed+" practical mechanism and implementation pathway", 10),
			firstNWords(seed+" measurable impact on outcomes and consistency", 10),
		}
	}

	if len(built) < 3 {
		for len(built) < 3 {
			built = append(built, firstNWords(firstNonEmpty(slide.Title, "Core factor")+" supporting evidence and practical implication", 10))
		}
	}

	slide.Bullets = built[:min(4, len(built))]
	slide.Variant = stringPtr("media_split")
	if strings.TrimSpace(pointerStringValue(slide.ImageQuery)) == "" {
		seed := fallbackSlideImageQuery(strings.Join([]string{slide.Title, subtitle, strings.Join(slide.Bullets, " ")}, " "))
		if seed != "" {
			slide.ImageQuery = stringPtr(seed)
		}
	}
	if strings.TrimSpace(subtitle) == "" {
		autoSubtitle := firstNWords(strings.Join(slide.Bullets, " "), 14)
		if autoSubtitle != "" {
			slide.Subtitle = stringPtr(autoSubtitle)
		}
	}
}

func enrichComparisonTableSlide(slide *models.PresentationSlide) {
	if slide == nil {
		return
	}

	titleNorm := normalizeCompareText(slide.Title)
	subtitleNorm := normalizeCompareText(pointerStringValue(slide.Subtitle))

	isMetaOrLeakRow := func(cells []string) bool {
		if len(cells) < 2 {
			return true
		}
		for _, cell := range cells {
			cellLower := strings.ToLower(strings.TrimSpace(cell))
			if strings.HasPrefix(cellLower, "header:") || strings.HasPrefix(cellLower, "table_header:") || strings.HasPrefix(cellLower, "row:") || strings.HasPrefix(cellLower, "table_row:") {
				return true
			}
		}
		joined := sanitizePresentationText(strings.Join(cells, " "))
		if joined == "" || containsTranscriptNoiseTag(joined) {
			return true
		}

		joinedNorm := normalizeCompareText(joined)
		if joinedNorm == "" {
			return true
		}

		metaPhrases := []string{
			"this table", "table outlines", "table summar", "table presents", "table shows", "the following table",
			"overview of", "evaluation of", "evaluating different methods", "each method plays", "unique role in",
		}
		for _, phrase := range metaPhrases {
			if strings.Contains(joinedNorm, phrase) {
				return true
			}
		}

		firstCellNorm := normalizeCompareText(firstNonEmpty(cells[0]))
		if regexp.MustCompile(`^(?:each|this|these|those|our|their|the|in\s+this)\b`).MatchString(firstCellNorm) {
			return true
		}

		if len(strings.Fields(joinedNorm)) >= 14 && len(strings.Fields(firstCellNorm)) >= 3 {
			return true
		}

		if subtitleNorm != "" && (strings.Contains(joinedNorm, subtitleNorm) || strings.Contains(subtitleNorm, joinedNorm)) {
			return true
		}
		if titleNorm != "" && strings.Contains(joinedNorm, titleNorm) {
			return true
		}

		// Reject rows that look like raw transcript speech rather than structured data.
		if isConversationalTranscriptLine(joined) {
			return true
		}

		return false
	}

	headers := append([]string{}, slide.TableHeaders...)
	rows := make([][]string, 0, len(slide.TableRows)+len(slide.Bullets))
	for _, row := range slide.TableRows {
		clean := make([]string, 0, 3)
		for _, cell := range row {
			text := sanitizePresentationText(cell)
			if text != "" {
				clean = append(clean, text)
			}
			if len(clean) >= 3 {
				break
			}
		}
		if len(clean) >= 2 && !isMetaOrLeakRow(clean) {
			rows = append(rows, clean)
		}
	}

	for _, bullet := range slide.Bullets {
		if len(headers) == 0 {
			if parsedHeaders := parseComparisonHeaderFromBullet(bullet); len(parsedHeaders) >= 2 {
				headers = parsedHeaders
				continue
			}
		}
		if parsedRow := parseComparisonRowFromBullet(bullet); len(parsedRow) >= 2 && !isMetaOrLeakRow(parsedRow) {
			rows = append(rows, parsedRow)
		}
	}

	if len(rows) == 0 && len(slide.Columns) >= 2 {
		leftItems := slide.Columns[0].Items
		rightItems := slide.Columns[1].Items
		maxRows := min(8, max(len(leftItems), len(rightItems)))
		if maxRows > 0 {
			if len(headers) == 0 {
				headers = []string{firstNonEmpty(slide.Columns[0].Label, pointerStringValue(slide.LeftLabel), "Left"), firstNonEmpty(slide.Columns[1].Label, pointerStringValue(slide.RightLabel), "Right")}
			}
			for i := 0; i < maxRows; i++ {
				candidate := []string{firstNonEmpty(getSliceItem(leftItems, i), "-"), firstNonEmpty(getSliceItem(rightItems, i), "-")}
				if !isMetaOrLeakRow(candidate) {
					rows = append(rows, candidate)
				}
			}
		}
	}

	if len(rows) == 0 {
		return
	}

	columnCount := 2
	for _, row := range rows {
		if len(row) > columnCount {
			columnCount = min(3, len(row))
		}
	}
	if len(headers) > columnCount {
		columnCount = min(3, len(headers))
	}

	if len(headers) == 0 {
		if columnCount == 3 {
			headers = []string{"Category", "Strength", "Gap"}
		} else {
			headers = []string{"Option", "Details"}
		}
	}
	for len(headers) < columnCount {
		headers = append(headers, fmt.Sprintf("Column %d", len(headers)+1))
	}
	headers = headers[:columnCount]

	normalizedRows := make([][]string, 0, min(8, len(rows)))
	seenRows := map[string]struct{}{}
	for _, row := range rows {
		cells := append([]string{}, row...)
		if len(cells) > columnCount {
			cells = cells[:columnCount]
		}
		for len(cells) < columnCount {
			cells = append(cells, "-")
		}
		if isMetaOrLeakRow(cells) {
			continue
		}
		key := normalizeCompareText(strings.Join(cells, "|"))
		if key == "" {
			continue
		}
		if _, exists := seenRows[key]; exists {
			continue
		}
		seenRows[key] = struct{}{}
		normalizedRows = append(normalizedRows, cells)
		if len(normalizedRows) >= 8 {
			break
		}
	}

	minRows := 4
	targetRows := 4
	if len(normalizedRows) < targetRows {
		seed := strings.Join([]string{
			slide.SpeakerNotes,
			strings.Join(slide.LeftColumn, " "),
			strings.Join(slide.RightColumn, " "),
			strings.Join(slide.Bullets, " "),
		}, " ")
		candidates := buildCompactBulletsFromText(seed, targetRows*2, 18)
		for _, candidate := range candidates {
			if isConversationalTranscriptLine(candidate) {
				continue
			}
			row := synthesizeComparisonRow(candidate, columnCount)
			if len(row) == 0 {
				continue
			}
			if len(row) > columnCount {
				row = row[:columnCount]
			}
			for len(row) < columnCount {
				row = append(row, "-")
			}
			if isMetaOrLeakRow(row) {
				continue
			}
			key := normalizeCompareText(strings.Join(row, "|"))
			if key == "" {
				continue
			}
			if _, exists := seenRows[key]; exists {
				continue
			}
			seenRows[key] = struct{}{}
			normalizedRows = append(normalizedRows, row)
			if len(normalizedRows) >= targetRows {
				break
			}
		}
	}

	if len(normalizedRows) < minRows {
		for attempt := 0; len(normalizedRows) < minRows && attempt < 10; attempt++ {
			idx := len(normalizedRows) + 1
			var row []string
			if columnCount == 3 {
				row = []string{fmt.Sprintf("Comparison %d", idx), "Operational difference", "Context dependent outcome"}
			} else {
				row = []string{fmt.Sprintf("Comparison %d", idx), "Operational difference with context dependent outcome"}
			}
			key := normalizeCompareText(strings.Join(row, "|"))
			if _, exists := seenRows[key]; exists {
				continue
			}
			seenRows[key] = struct{}{}
			normalizedRows = append(normalizedRows, row)
		}
	}

	slide.TableHeaders = headers
	slide.TableRows = normalizedRows
	slide.Variant = stringPtr("comparison_table")
	slide.Bullets = []string{}
	if pointerStringValue(slide.ImageQuery) != "" {
		slide.ImageQuery = nil
	}
}

func getSliceItem(values []string, index int) string {
	if index < 0 || index >= len(values) {
		return ""
	}
	return sanitizePresentationText(values[index])
}

func synthesizeComparisonRow(candidate string, columnCount int) []string {
	clean := sanitizePresentationText(stripNumericPrefixes(candidate))
	if clean == "" {
		return nil
	}

	words := strings.Fields(clean)
	if len(words) < 4 {
		return nil
	}

	trim := func(value string) string {
		return strings.TrimRight(strings.TrimSpace(value), " .;:!?")
	}

	if columnCount <= 2 {
		split := min(3, len(words)-1)
		left := trim(strings.Join(words[:split], " "))
		right := trim(strings.Join(words[split:], " "))
		if left == "" || right == "" {
			return nil
		}
		right = firstNWords(right, 12)
		return []string{left, right}
	}

	leftEnd := min(3, len(words)-2)
	middleEnd := min(leftEnd+5, len(words)-1)
	left := trim(strings.Join(words[:leftEnd], " "))
	middle := trim(strings.Join(words[leftEnd:middleEnd], " "))
	right := trim(strings.Join(words[middleEnd:], " "))
	if left == "" || middle == "" {
		return nil
	}
	if right == "" {
		right = middle
	}
	middle = firstNWords(middle, 6)
	right = firstNWords(right, 10)
	return []string{left, middle, right}
}

func containsTranscriptNoiseTag(value string) bool {
	clean := strings.TrimSpace(value)
	if clean == "" {
		return false
	}
	return regexp.MustCompile(`(?i)(?:\[(?:music|applause|laugh(?:ter|s)?|inaudible|silence|noise|sfx)[^\]]*\]|\((?:music|applause|inaudible|silence|noise|sfx)[^\)]*\)|[♪♫])`).MatchString(clean)
}

func hasImmediateLeadPhraseRepetition(value string) bool {
	clean := normalizeCompareText(value)
	if clean == "" {
		return false
	}
	words := strings.Fields(clean)
	if len(words) < 4 {
		return false
	}

	for n := 2; n <= 5; n++ {
		if len(words) < n*2 {
			continue
		}
		first := strings.Join(words[:n], " ")
		second := strings.Join(words[n:2*n], " ")
		if first == second {
			return true
		}
	}

	return false
}

func isLikelyTranscriptFragment(value string) bool {
	clean := strings.ToLower(strings.TrimSpace(value))
	if clean == "" {
		return false
	}

	if hasImmediateLeadPhraseRepetition(clean) {
		return true
	}

	if regexp.MustCompile(`\d`).MatchString(clean) {
		return false
	}

	words := strings.Fields(clean)
	if len(words) == 0 {
		return false
	}

	if len(words) <= 8 {
		leadingFragments := map[string]struct{}{
			"from": {}, "to": {}, "and": {}, "but": {}, "or": {}, "so": {}, "because": {},
			"then": {}, "maybe": {}, "with": {}, "for": {}, "in": {}, "on": {}, "at": {},
		}
		if _, exists := leadingFragments[words[0]]; exists {
			return true
		}
	}

	trailingFragments := map[string]struct{}{
		"to": {}, "and": {}, "or": {}, "of": {}, "with": {}, "for": {}, "the": {},
		"our": {}, "your": {}, "my": {}, "a": {}, "an": {}, "are": {}, "is": {},
		"me": {}, "us": {}, "him": {}, "her": {}, "them": {},
	}
	last := strings.Trim(words[len(words)-1], " ,.;:!?")
	if _, exists := trailingFragments[last]; exists {
		return true
	}

	if strings.Count(clean, ",") >= 2 {
		hasVerbLikeToken := false
		verbLike := []string{" is ", " are ", " was ", " were ", " be ", " have ", " has ", " do ", " does ", " did ", " can ", " will ", " should ", " need ", " helps ", " reduces ", " improves ", " protects "}
		padded := " " + clean + " "
		for _, token := range verbLike {
			if strings.Contains(padded, token) {
				hasVerbLikeToken = true
				break
			}
		}
		if !hasVerbLikeToken {
			return true
		}
	}

	return false
}

// isConversationalTranscriptLine detects raw YouTube-style transcript speech
// that should never appear as structured slide content.
func isConversationalTranscriptLine(value string) bool {
	clean := strings.ToLower(strings.TrimSpace(value))
	if clean == "" {
		return false
	}

	if hasImmediateLeadPhraseRepetition(clean) {
		return true
	}
	if isLikelyTranscriptFragment(clean) {
		return true
	}

	if regexp.MustCompile(`(?i)\b(?:translator|reviewer|subtitle|caption|speaker)\s*:`).MatchString(clean) {
		return true
	}
	if regexp.MustCompile(`(?i)^key\s*(?:point|takeaway|insight|step|item)\s*\d+\b`).MatchString(clean) {
		return true
	}
	if regexp.MustCompile(`(?i)^key\s*insights?$`).MatchString(clean) {
		return true
	}
	if regexp.MustCompile(`(?i)^key\s*takeaways?$`).MatchString(clean) {
		return true
	}
	if regexp.MustCompile(`^\d+$`).MatchString(clean) {
		return true
	}
	if regexp.MustCompile(`(?i)^\(?\s*(?:laughter|applause|inaudible|silence|music|noise|sfx)\s*\)?$`).MatchString(clean) {
		return true
	}
	if containsTranscriptNoiseTag(clean) {
		return true
	}

	// Casual YouTuber phrases that indicate unprocessed transcript.
	casualPhrases := []string{
		"all right, let's start", "all right lets start", "all right so", "alright, let's start", "alright so",
		"15-minute timer", "15 minute timer",
		"you know what i mean", "you know, we could", "not going to lie", "who knows",
		"let's copy this", "lets copy this", "let's run it", "lets run it", "let's paste", "lets paste",
		"check mid video", "mid video", "on to the next", "same exact prompt",
		"in the lead", "this is the end", "this is what", "we're not going to do", "we are not going to do",
		"i promise you i", "these videos",
		"chad gbt", "chad gpt", "claw", "tadbt",
		"hit that subscribe", "smash that like", "subscribe button",
		"hits that subscribe", "everyone hits that",
		"the long-awaited video", "the long awaited video",
		"finally here", "before we even start",
		"if you're new here", "if you are new here",
		"english podcast", "hosted by me",
		"as i said", "i'm here to", "i am here to",
		"i'd like to", "i would like to", "let me make",
		"if you want to understand", "they come to me",
		"going against each other", "going to get this",
		"by the end", "let me know in the comments",
		"comment asking me", "check out the link",
		"make sure to", "don't forget to",
		"which i have paid", "which i paid",
		"we're finally going", "we are finally going",
		"out the way before",
		"it feels good to be back",
		"our lovely listeners",
		"in this series",
		"have fun learning english",
		"for this episode",
		"free pdf",
		"vocabulary and helpful tips",
		"in the next part",
		"all opinions are welcome",
		"and now, are",
		"that's a great idea",
		"do any of you",
		"i do the same",
		"let's also talk about",
		"and let's not forget",
		"these small actions really",
		"you just need to",
		"let's try to buy",
		"it's easy, and now",
		"it is easy, and now",
		"thanks, ben and nadia",
		"today's focus will be",
		"todays focus will be",
		"in today's episode",
		"in todays episode",
		"what do you think",
		"when it comes to",
		"our lovely planet earth",
		"to everything in the world that you care",
		"i appreciate all your",
		"oh, guys",
		"yeah,",
		"pollutions are everywhere",
		"the first word is",
		"the next word is",
		"the first one is",
		"first question",
		"the second question is",
		"now, let's talk about",
		"now let's talk about",
		"now, let's look at",
		"now let's look at",
		"last word",
		"please leave your comments",
		"let us know what you think",
		"goodbye, and we'll see you",
		"goodbye and we'll see you",
		"this is the end of our podcast",
		"i always feel so",
		"i saw a video",
		"it's like a secret",
		"it is like a secret",
		"did you know",
		"believe it or not",
		"mind-blowing fact",
		"mind blowing fact",
		"tree social network",
		"all these things are super",
		"it's nice to see",
		"it is nice to see",
		"it's better than buying",
		"it is better than buying",
		"it's fresher, and we",
		"it is fresher, and we",
		"biking is fun and it",
		"as nature lovers",
	}
	for _, phrase := range casualPhrases {
		if strings.Contains(clean, phrase) {
			return true
		}
	}

	// Detect first-person casual address patterns.
	casualPatterns := regexp.MustCompile(`(?i)^(?:if everyone|before we|we have chad|we're finally|the long[- ]awaited|in this series|for this episode|in the next part|do any of you|all opinions are welcome|today'?s focus will be|when it comes to|oh,?\s+guys|yeah\b|[a-z]+\s+(?:emphasized|said|noted|mentioned|explained|stated)\s+that)`)
	if casualPatterns.MatchString(clean) {
		return true
	}

	slangOrFiller := regexp.MustCompile(`(?i)\b(?:bro|yo|uh|um|cuz|gonna|wanna|kinda|sorta|ain't)\b`)
	if slangOrFiller.MatchString(clean) {
		return true
	}

	podcastAction := regexp.MustCompile(`(?i)\b(?:let'?s\s+(?:start|copy|run|paste|check|give)|we'?re\s+(?:not\s+going\s+to|going\s+to)|all\s+right|you\s+know\s+what\s+i\s+mean|not\s+going\s+to\s+lie|who\s+knows)\b`)
	if podcastAction.MatchString(clean) {
		return true
	}

	firstPersonDialogue := regexp.MustCompile(`(?i)^(?:i\s+(?:also\s+)?(?:am|was|have|had|do|did|use|used|started|watched|saw|feel|know|appreciate|think|want|need|carry|try)|i'?m\b|i'?ve\b|we\s+(?:can|should|need|must|will|have|used|use)|let'?s\b|you\s+(?:can|should|need|just\s+need)|please\s+leave\b)`)
	if firstPersonDialogue.MatchString(clean) {
		return true
	}

	return false
}

func isTwoColumnMetaItem(value string) bool {
	clean := strings.ToLower(strings.TrimSpace(value))
	if clean == "" {
		return true
	}

	metaPhrases := []string{
		"this slide",
		"emphasizes that",
		"compares the",
		"as discussed",
		"as mentioned",
		"the problems discussed",
		"simple ways to contribute",
		"it starts with how",
		"not just about large-scale",
		"we can take",
		"operational constraints",
		"baseline conditions",
		"implementation choices",
	}
	for _, phrase := range metaPhrases {
		if strings.Contains(clean, phrase) {
			return true
		}
	}

	if regexp.MustCompile(`(?i)\b(?:a\s+profound|a\s+significant|a\s+major|a\s+critical)\s*$`).MatchString(strings.TrimSpace(value)) {
		return true
	}

	if regexp.MustCompile(`(?i)^[A-Z][a-z]+\s+(?:emphasized|said|noted|mentioned|explained|stated)\s+that`).MatchString(strings.TrimSpace(value)) {
		return true
	}

	return false
}

func isGenericBusinessFillerText(value string) bool {
	clean := strings.ToLower(strings.TrimSpace(value))
	if clean == "" {
		return false
	}

	fillerPhrases := []string{
		"evaluate tradeoffs",
		"set realistic targets",
		"monitor progress",
		"operational safeguards",
		"coordinated actions",
		"implementation choices",
		"operational constraints",
		"baseline conditions",
		"constrained share",
		"small shifts in efficiency",
		"protection policy",
		"overall system outcomes",
		"anchors decision context",
		"provides a concrete benchmark",
	}
	for _, phrase := range fillerPhrases {
		if strings.Contains(clean, phrase) {
			return true
		}
	}

	return false
}

func isStatFirstPersonLeak(value string) bool {
	clean := strings.ToLower(strings.TrimSpace(value))
	if clean == "" {
		return false
	}

	leakPhrases := []string{
		"hosted by",
		"this is my",
		"join me",
		"i am",
		"i'm",
		"i started",
		"i have",
		"i was",
		"by me",
	}
	for _, phrase := range leakPhrases {
		if strings.Contains(clean, phrase) {
			return true
		}
	}

	return false
}

func statValueLooksNumeric(value string) bool {
	clean := strings.TrimSpace(value)
	if clean == "" {
		return false
	}
	return regexp.MustCompile(`\d`).MatchString(clean)
}

func isAbstractPercentStatLabel(label string) bool {
	clean := strings.ToLower(strings.TrimSpace(label))
	if clean == "" {
		return true
	}

	genericMetricTerms := []string{
		"awareness", "importance", "impact", "benefit", "efficiency", "effectiveness", "progress",
		"improvement", "success", "growth", "quality", "performance", "engagement", "readiness",
		"adoption", "support", "confidence", "satisfaction",
	}

	concreteAnchors := []string{
		"population", "people", "users", "students", "households", "respondents", "samples",
		"co2", "water", "energy", "forest", "trees", "species", "cases", "incidents",
		"hours", "minutes", "days", "weeks", "months", "years", "kg", "km", "mw", "kwh",
		"usd", "dollar", "revenue", "cost", "budget", "price", "rate",
	}

	hasGeneric := false
	for _, term := range genericMetricTerms {
		if strings.Contains(clean, term) {
			hasGeneric = true
			break
		}
	}
	if !hasGeneric {
		return false
	}

	for _, anchor := range concreteAnchors {
		if strings.Contains(clean, anchor) {
			return false
		}
	}

	return true
}

func isStatMetadataText(value string) bool {
	clean := strings.ToLower(strings.TrimSpace(value))
	if clean == "" {
		return true
	}
	if strings.Contains(clean, "%") {
		return true
	}
	if regexp.MustCompile(`(?i)^(?:about|only|just|around|approximately)\b`).MatchString(clean) {
		return true
	}

	if strings.Contains(clean, "http://") || strings.Contains(clean, "https://") || strings.Contains(clean, "www.") {
		return true
	}

	badTokens := []string{
		"source url", "source:", "title:", "youtube", "watch?v", "translator", "reviewer", "caption", "subtitle",
		"key point", "key takeaway", "speaker:", "coverage scope", "additional quantified", "metric panel",
		"metrics", "indicator",
	}
	for _, token := range badTokens {
		if strings.Contains(clean, token) {
			return true
		}
	}

	return false
}

func normalizeStatLabel(value string) string {
	label := regexp.MustCompile(`\[[^\]]*\]`).ReplaceAllString(value, " ")
	label = sanitizePresentationText(label)
	label = strings.Trim(label, "-,:; ")
	if label == "" || isStatMetadataText(label) || isConversationalTranscriptLine(label) || isStatFirstPersonLeak(label) {
		return ""
	}
	words := trimDanglingEndingWords(strings.Fields(label))
	if len(words) > 5 {
		words = words[:5]
		words = trimDanglingEndingWords(words)
	}
	for len(words) > 0 {
		lead := strings.ToLower(strings.Trim(words[0], " .;:!?"))
		if lead == "about" || lead == "only" || lead == "just" || lead == "around" {
			words = words[1:]
			continue
		}
		break
	}
	if len(words) == 0 {
		return ""
	}
	label = strings.Join(words, " ")
	if isStatMetadataText(label) {
		return ""
	}
	return label
}

func normalizeStatDescription(value string) string {
	description := regexp.MustCompile(`\[[^\]]*\]`).ReplaceAllString(value, " ")
	description = sanitizePresentationText(description)
	if description == "" {
		return ""
	}
	if isGenericBusinessFillerText(description) {
		return ""
	}
	if isStatFirstPersonLeak(description) {
		return ""
	}
	if isStatMetadataText(description) {
		return ""
	}
	lowerDescription := strings.ToLower(description)
	if strings.Contains(lowerDescription, "highlights a critical benchmark that shapes implementation priorities") ||
		strings.Contains(lowerDescription, "anchors a key benchmark, connecting this milestone") ||
		strings.Contains(lowerDescription, "anchors decision context, connecting this metric") ||
		strings.Contains(lowerDescription, "tied to") && strings.Contains(lowerDescription, "provides a concrete benchmark") {
		return ""
	}
	if containsTranscriptNoiseTag(description) || isConversationalTranscriptLine(description) {
		return ""
	}

	sentences := splitPresentationSentences(description)
	if len(sentences) > 0 {
		chosen := make([]string, 0, 2)
		for _, sentence := range sentences {
			candidate := sanitizePresentationText(sentence)
			if candidate == "" || containsTranscriptNoiseTag(candidate) || isConversationalTranscriptLine(candidate) || isStatFirstPersonLeak(candidate) || isGenericBusinessFillerText(candidate) {
				continue
			}
			chosen = append(chosen, candidate)
			if len(chosen) >= 2 {
				break
			}
		}
		if len(chosen) > 0 {
			description = sanitizePresentationText(strings.Join(chosen, " "))
		}
	}

	words := trimDanglingEndingWords(strings.Fields(description))
	if len(words) > 25 {
		words = words[:25]
		words = trimDanglingEndingWords(words)
	}
	if len(words) < 12 {
		return ""
	}

	description = strings.TrimRight(strings.TrimSpace(strings.Join(words, " ")), " .;:!?")
	if description == "" {
		return ""
	}
	return description + "."
}

func statValueLooksTemporal(value string) bool {
	clean := strings.ToLower(strings.TrimSpace(value))
	if clean == "" {
		return false
	}
	if regexp.MustCompile(`^\d{4}$`).MatchString(clean) {
		return true
	}
	if regexp.MustCompile(`^\d{1,2}:\d{2}\s*(?:am|pm)?$`).MatchString(clean) {
		return true
	}
	if regexp.MustCompile(`^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b`).MatchString(clean) {
		return true
	}
	return false
}

func chooseBySeed(options []string, seed string) string {
	if len(options) == 0 {
		return ""
	}
	if len(options) == 1 {
		return options[0]
	}
	h := 0
	for _, r := range seed {
		h = (h*33 + int(r)) % 2147483647
	}
	if h < 0 {
		h = -h
	}
	return options[h%len(options)]
}

func buildStatDescriptionFallback(label, value string) string {
	cleanLabel := sanitizePresentationText(label)
	cleanValue := sanitizePresentationText(value)
	if cleanLabel == "" || cleanValue == "" {
		return ""
	}

	factual := fmt.Sprintf("%s is reported as %s in the source and should be interpreted in that specific context.", cleanLabel, cleanValue)
	if normalized := normalizeStatDescription(factual); normalized != "" {
		return normalized
	}

	return ""
}

func normalizePresentationStats(stats []models.PresentationStat, maxItems int) []models.PresentationStat {
	if maxItems <= 0 {
		return []models.PresentationStat{}
	}
	if len(stats) == 0 {
		return []models.PresentationStat{}
	}

	seen := map[string]struct{}{}
	out := make([]models.PresentationStat, 0, min(len(stats), maxItems))
	for _, stat := range stats {
		value := sanitizePresentationText(stat.Value)
		label := normalizeStatLabel(stat.Label)
		rawDescription := sanitizePresentationText(stat.Description)
		description := normalizeStatDescription(stat.Description)

		if containsTranscriptNoiseTag(stat.Label) || containsTranscriptNoiseTag(stat.Description) || isConversationalTranscriptLine(stat.Label) || isConversationalTranscriptLine(stat.Description) || isStatMetadataText(stat.Label) || isStatMetadataText(stat.Description) {
			continue
		}
		if value == "" || label == "" || !statValueLooksNumeric(value) {
			continue
		}
		if strings.Contains(value, "%") && isAbstractPercentStatLabel(label) {
			continue
		}
		if rawDescription != "" && (isGenericBusinessFillerText(rawDescription) || isStatFirstPersonLeak(rawDescription)) {
			description = ""
		}
		if description != "" && (isStatFirstPersonLeak(description) || isGenericBusinessFillerText(description)) {
			description = ""
		}

		key := normalizeCompareText(value + "|" + label)
		if key == "" {
			continue
		}
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}

		out = append(out, models.PresentationStat{
			Value:       value,
			Label:       label,
			Description: description,
		})
		if len(out) >= maxItems {
			break
		}
	}

	return out
}

func statPairExists(stats []models.PresentationStat, value, label string) bool {
	key := normalizeCompareText(sanitizePresentationText(value) + "|" + sanitizePresentationText(label))
	if key == "" {
		return false
	}
	for _, stat := range stats {
		existing := normalizeCompareText(sanitizePresentationText(stat.Value) + "|" + sanitizePresentationText(stat.Label))
		if existing == key {
			return true
		}
	}
	return false
}

func synthesizeSupplementalStat(existing []models.PresentationStat, title, subtitle string) (models.PresentationStat, bool) {
	years := make([]int, 0, 4)
	hasPercent := false
	for _, stat := range existing {
		value := strings.TrimSpace(strings.ToLower(stat.Value))
		if m := regexp.MustCompile(`\b(19|20)\d{2}\b`).FindString(value); m != "" {
			if year, err := strconv.Atoi(m); err == nil {
				years = append(years, year)
			}
		}
		if strings.Contains(value, "%") {
			hasPercent = true
		}
	}

	if len(years) >= 2 {
		minYear, maxYear := years[0], years[0]
		for _, y := range years[1:] {
			if y < minYear {
				minYear = y
			}
			if y > maxYear {
				maxYear = y
			}
		}
		span := maxYear - minYear
		if span > 0 {
			value := fmt.Sprintf("%d Years", span)
			label := "Timeline Span"
			if !statPairExists(existing, value, label) {
				description := normalizeStatDescription(fmt.Sprintf("Timeline Span of %d years captures the duration between key events and helps compare pacing, escalation, and long horizon strategic impact.", span))
				if description == "" {
					description = ensureTrailingDot("This span captures event duration and supports comparison of pacing, escalation, and strategic impact over time")
				}
				return models.PresentationStat{Value: value, Label: label, Description: description}, true
			}
		}
	}

	if hasPercent {
		value := "100%"
		label := "Reference Baseline"
		if !statPairExists(existing, value, label) {
			description := normalizeStatDescription("Reference Baseline defines the full proportion used to interpret percentage metrics consistently and evaluate tradeoffs across constrained resource categories.")
			if description == "" {
				description = ensureTrailingDot("This baseline provides full-scale context for interpreting percentage metrics and comparing constrained resource tradeoffs")
			}
			return models.PresentationStat{Value: value, Label: label, Description: description}, true
		}
	}

	return models.PresentationStat{}, false
}

func ensureMinimumStatsCount(slide *models.PresentationSlide, transcript string, minItems int) {
	if slide == nil || minItems <= 0 {
		return
	}
	if !strings.EqualFold(strings.TrimSpace(slide.Type), "stats") {
		return
	}

	stats := normalizePresentationStats(slide.Stats, 4)
	if len(stats) >= minItems {
		slide.Stats = stats
		return
	}

	source := append([]string{}, slide.Bullets...)
	seed := strings.Join([]string{slide.Title, pointerStringValue(slide.Subtitle), pointerStringValue(slide.Body), slide.SpeakerNotes, transcript}, " ")
	source = append(source, splitPresentationSentences(seed)...)
	extra := extractStatsFromBullets(source)
	stats = normalizePresentationStats(append(stats, extra...), 4)

	for len(stats) < minItems {
		candidate, ok := synthesizeSupplementalStat(stats, slide.Title, pointerStringValue(slide.Subtitle))
		if !ok {
			break
		}
		before := len(stats)
		stats = normalizePresentationStats(append(stats, candidate), 4)
		if len(stats) <= before {
			break
		}
	}

	slide.Stats = stats
}

func enforceStatsValueDedupAcrossDeck(slides []models.PresentationSlide, transcript string) {
	if len(slides) == 0 {
		return
	}

	seenValues := map[string]struct{}{}

	for i := range slides {
		if !strings.EqualFold(strings.TrimSpace(slides[i].Type), "stats") {
			continue
		}

		base := normalizePresentationStats(slides[i].Stats, 4)
		filtered := make([]models.PresentationStat, 0, len(base))
		localSeen := map[string]struct{}{}
		for _, stat := range base {
			key := normalizeCompareText(stat.Value)
			if key == "" {
				continue
			}
			if _, exists := seenValues[key]; exists {
				continue
			}
			if _, exists := localSeen[key]; exists {
				continue
			}
			localSeen[key] = struct{}{}
			filtered = append(filtered, stat)
		}

		slides[i].Stats = filtered
		ensureMinimumStatsCount(&slides[i], transcript, 4)

		finalStats := normalizePresentationStats(slides[i].Stats, 4)
		final := make([]models.PresentationStat, 0, len(finalStats))
		localSeen = map[string]struct{}{}
		for _, stat := range finalStats {
			key := normalizeCompareText(stat.Value)
			if key == "" {
				continue
			}
			if _, exists := seenValues[key]; exists {
				continue
			}
			if _, exists := localSeen[key]; exists {
				continue
			}
			localSeen[key] = struct{}{}
			final = append(final, stat)
		}

		slides[i].Stats = final
		for _, stat := range final {
			key := normalizeCompareText(stat.Value)
			if key != "" {
				seenValues[key] = struct{}{}
			}
		}
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func stripNumericPrefixes(value string) string {
	value = sanitizePresentationText(value)
	value = regexp.MustCompile(`(?i)^\s*key\s*insight(?:\s*\d+)?\s*[:.)-]?\s*`).ReplaceAllString(value, "")
	value = regexp.MustCompile(`(?i)^\s*(?:(?:key\s*)?(?:point|takeaway|insight|step|item)\s*\d+\s*[:.)-]?\s*)`).ReplaceAllString(value, "")
	value = regexp.MustCompile(`(?i)^\s*(?:(?:\(?\d{1,2}\)?|[ivxlcdm]{1,5})\s*(?:[).:-]|-\s)\s*|[-*•]+\s*)`).ReplaceAllString(value, "")
	return strings.TrimSpace(value)
}

func sanitizePresentationText(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	value = strings.Join(strings.Fields(value), " ")
	value = regexp.MustCompile(`([A-Za-z]{2,})-\s+([A-Za-z]{2,})`).ReplaceAllString(value, "$1-$2")
	return value
}

func trimDanglingEndingWords(words []string) []string {
	if len(words) == 0 {
		return words
	}
	dangling := map[string]struct{}{
		"a": {}, "an": {}, "the": {},
		"to": {}, "and": {}, "or": {}, "with": {}, "of": {}, "for": {}, "in": {}, "on": {}, "at": {},
		"by": {}, "from": {}, "as": {}, "than": {}, "that": {}, "which": {}, "while": {}, "because": {},
		"into": {}, "onto": {}, "over": {}, "under": {}, "about": {},
	}

	out := append([]string{}, words...)
	for len(out) > 0 {
		last := strings.ToLower(strings.Trim(out[len(out)-1], " .;:!?"))
		if _, exists := dangling[last]; !exists {
			break
		}
		out = out[:len(out)-1]
	}

	return out
}

func trimDanglingPhrase(value string) string {
	clean := sanitizePresentationText(value)
	if clean == "" {
		return ""
	}
	words := trimDanglingEndingWords(strings.Fields(clean))
	if len(words) == 0 {
		return ""
	}
	return strings.Join(words, " ")
}

func stripSlideIndexArtifact(value string, index int) string {
	value = sanitizePresentationText(value)
	if value == "" || index <= 0 {
		return value
	}

	suffix := fmt.Sprintf("%d", index)
	if !strings.HasSuffix(value, suffix) || len(value) <= len(suffix) {
		return value
	}

	prevByte := value[len(value)-len(suffix)-1]
	trimmedPrefix := strings.TrimSpace(strings.TrimRight(strings.TrimSuffix(value, suffix), "-–: "))
	if trimmedPrefix == "" {
		return value
	}

	if unicode.IsLetter(rune(prevByte)) {
		return trimmedPrefix
	}

	if (prevByte == ' ' || prevByte == '-' || prevByte == ':') && len(trimmedPrefix) >= 20 {
		return trimmedPrefix
	}

	return value
}

func normalizeCompareText(value string) string {
	clean := strings.ToLower(strings.TrimSpace(value))
	if clean == "" {
		return ""
	}
	re := regexp.MustCompile(`[^a-z0-9\s]+`)
	clean = re.ReplaceAllString(clean, " ")
	return strings.Join(strings.Fields(clean), " ")
}

func isSubtitleRedundant(title, subtitle string) bool {
	normalizedTitle := normalizeCompareText(title)
	normalizedSubtitle := normalizeCompareText(subtitle)
	if normalizedTitle == "" || normalizedSubtitle == "" {
		return false
	}
	if normalizedTitle == normalizedSubtitle {
		return true
	}
	if strings.Contains(normalizedSubtitle, normalizedTitle) || strings.Contains(normalizedTitle, normalizedSubtitle) {
		return true
	}
	return false
}

func truncateBullet(bullet string, maxWords int) string {
	bullet = strings.Join(strings.Fields(strings.TrimSpace(bullet)), " ")
	if bullet == "" {
		return ""
	}

	words := strings.Fields(bullet)

	// Floor guard: never truncate a bullet that's already short enough
	if len(words) <= maxWords {
		return bullet
	}

	// Safety floor: if truncation would produce fewer than 6 words, keep original
	if maxWords < 6 {
		return bullet
	}

	return strings.Join(words[:maxWords], " ")
}

func isCardEncodedBullet(value string) bool {
	value = strings.TrimSpace(value)
	if value == "" {
		return false
	}
	if !strings.HasPrefix(strings.ToLower(value), "card:") {
		return false
	}
	return strings.Contains(value, "||")
}

func isNumberedCardEncodedBullet(value string) bool {
	value = strings.TrimSpace(value)
	if value == "" {
		return false
	}
	if !strings.HasPrefix(strings.ToLower(value), "num:") {
		return false
	}
	parts := strings.Split(value, "||")
	return len(parts) >= 3
}

func isComparisonHeaderEncodedBullet(value string) bool {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" {
		return false
	}
	if !(strings.HasPrefix(value, "header:") || strings.HasPrefix(value, "table_header:")) {
		return false
	}
	return strings.Contains(value, "||")
}

func isComparisonRowEncodedBullet(value string) bool {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" {
		return false
	}
	if !(strings.HasPrefix(value, "row:") || strings.HasPrefix(value, "table_row:")) {
		return false
	}
	return strings.Contains(value, "||")
}

func isFeatureEncodedBullet(value string) bool {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" {
		return false
	}
	if !strings.HasPrefix(value, "feature:") {
		return false
	}
	parts := strings.Split(value, "||")
	return len(parts) >= 3
}

func isFlowEncodedBullet(value string) bool {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" {
		return false
	}
	if !(strings.HasPrefix(value, "flow:") || strings.HasPrefix(value, "arrow:") || strings.HasPrefix(value, "step_flow:")) {
		return false
	}
	body := regexp.MustCompile(`(?i)^(?:flow|arrow|step_flow):\s*`).ReplaceAllString(value, "")
	parts := strings.Split(body, "||")
	return len(parts) >= 2
}

func parseFlowBullet(value string) (title, description string, ok bool) {
	value = sanitizePresentationText(value)
	if value == "" || !isFlowEncodedBullet(value) {
		return "", "", false
	}
	body := regexp.MustCompile(`(?i)^(?:flow|arrow|step_flow):\s*`).ReplaceAllString(value, "")
	parts := strings.Split(body, "||")
	clean := make([]string, 0, 3)
	for _, part := range parts {
		item := strings.TrimSpace(part)
		if item != "" {
			clean = append(clean, item)
		}
	}

	if len(clean) < 2 {
		return "", "", false
	}

	if len(clean) >= 3 && regexp.MustCompile(`^\d{1,2}$`).MatchString(clean[0]) {
		title = strings.TrimRight(sanitizePresentationText(clean[1]), " .;:!?")
		description = sanitizePresentationText(clean[2])
	} else {
		title = strings.TrimRight(sanitizePresentationText(clean[0]), " .;:!?")
		description = sanitizePresentationText(clean[1])
	}

	if title == "" || description == "" {
		return "", "", false
	}

	description = strings.TrimRight(strings.TrimSpace(description), " .;:!?")
	if description == "" {
		return "", "", false
	}

	return title, description + ".", true
}

func normalizeFlowEncodedBullet(value string) string {
	title, description, ok := parseFlowBullet(value)
	if !ok {
		return ""
	}
	if isConversationalTranscriptLine(title) || isLikelyTranscriptFragment(title) || isConversationalTranscriptLine(description) || isLikelyTranscriptFragment(description) {
		return ""
	}
	title = strings.TrimRight(trimDanglingPhrase(title), " .;:!?")
	titleWords := trimDanglingEndingWords(strings.Fields(title))
	if len(titleWords) > 4 {
		titleWords = titleWords[:4]
	}
	if len(titleWords) < 2 {
		descWords := trimDanglingEndingWords(strings.Fields(description))
		if len(descWords) >= 3 {
			titleWords = descWords[:3]
		}
	}
	if len(titleWords) == 0 {
		return ""
	}
	title = strings.Join(titleWords, " ")

	description = normalizeFeatureDescriptionSentence(description)
	if description == "" {
		description = "Explains the implementation step with clear ownership and measurable operational impact."
	}
	if isConversationalTranscriptLine(title) || isLikelyTranscriptFragment(title) || isConversationalTranscriptLine(description) || isLikelyTranscriptFragment(description) {
		return ""
	}

	return "FLOW: " + title + " || " + description
}

func isTimelineEncodedBullet(value string) bool {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" {
		return false
	}
	if !(strings.HasPrefix(value, "timeline:") || strings.HasPrefix(value, "milestone:")) {
		return false
	}
	body := regexp.MustCompile(`(?i)^(?:timeline|milestone):\s*`).ReplaceAllString(value, "")
	parts := strings.Split(body, "||")
	return len(parts) >= 2
}

func parseTimelineBullet(value string) (title, description string, ok bool) {
	value = sanitizePresentationText(value)
	if value == "" || !isTimelineEncodedBullet(value) {
		return "", "", false
	}
	body := regexp.MustCompile(`(?i)^(?:timeline|milestone):\s*`).ReplaceAllString(value, "")
	parts := strings.Split(body, "||")
	clean := make([]string, 0, 3)
	for _, part := range parts {
		item := strings.TrimSpace(part)
		if item != "" {
			clean = append(clean, item)
		}
	}

	if len(clean) < 2 {
		return "", "", false
	}

	if len(clean) >= 3 && regexp.MustCompile(`^\d{1,2}$`).MatchString(clean[0]) {
		title = strings.TrimRight(sanitizePresentationText(clean[1]), " .;:!?")
		description = sanitizePresentationText(clean[2])
	} else {
		title = strings.TrimRight(sanitizePresentationText(clean[0]), " .;:!?")
		description = sanitizePresentationText(clean[1])
	}

	if title == "" || description == "" {
		return "", "", false
	}

	description = strings.TrimRight(strings.TrimSpace(description), " .;:!?")
	if description == "" {
		return "", "", false
	}

	return title, description + ".", true
}

func normalizeTimelineEncodedBullet(value string) string {
	title, description, ok := parseTimelineBullet(value)
	if !ok {
		return ""
	}
	if isConversationalTranscriptLine(title) || isLikelyTranscriptFragment(title) || isConversationalTranscriptLine(description) || isLikelyTranscriptFragment(description) {
		return ""
	}
	description = normalizeFeatureDescriptionSentence(description)
	if description == "" {
		description = "Explains the milestone outcome with clear implementation detail and measurable project impact."
	}
	if isConversationalTranscriptLine(title) || isConversationalTranscriptLine(description) {
		return ""
	}
	return "TIMELINE: " + title + " || " + description
}

func normalizeComparisonHeaderBullet(value string) string {
	value = sanitizePresentationText(value)
	if value == "" {
		return ""
	}
	if !isComparisonHeaderEncodedBullet(value) {
		return value
	}

	value = regexp.MustCompile(`(?i)^(?:header|table_header):\s*`).ReplaceAllString(value, "")
	parts := strings.Split(value, "||")
	clean := make([]string, 0, 3)
	for _, part := range parts {
		cell := strings.TrimRight(sanitizePresentationText(part), " .;:!?")
		if cell != "" {
			clean = append(clean, cell)
		}
		if len(clean) >= 3 {
			break
		}
	}
	if len(clean) < 2 {
		return ""
	}
	return "HEADER: " + strings.Join(clean, " || ")
}

func normalizeComparisonRowBullet(value string) string {
	value = sanitizePresentationText(value)
	if value == "" {
		return ""
	}
	if !isComparisonRowEncodedBullet(value) {
		return value
	}

	value = regexp.MustCompile(`(?i)^(?:row|table_row):\s*`).ReplaceAllString(value, "")
	parts := strings.Split(value, "||")
	clean := make([]string, 0, 3)
	for _, part := range parts {
		cell := strings.TrimRight(sanitizePresentationText(part), " .;:!?")
		if cell != "" {
			words := strings.Fields(cell)
			if len(words) > 16 {
				cell = strings.Join(words[:16], " ")
			}
			clean = append(clean, cell)
		}
		if len(clean) >= 3 {
			break
		}
	}
	if len(clean) < 2 {
		return ""
	}
	return "ROW: " + strings.Join(clean, " || ")
}

func normalizeFeatureEncodedBullet(value string) string {
	value = sanitizePresentationText(value)
	if value == "" {
		return ""
	}
	if !isFeatureEncodedBullet(value) {
		return value
	}

	body := regexp.MustCompile(`(?i)^feature:\s*`).ReplaceAllString(value, "")
	parts := strings.SplitN(body, "||", 3)
	if len(parts) < 3 {
		return ""
	}
	icon := sanitizePresentationText(parts[0])
	title := strings.TrimRight(sanitizePresentationText(parts[1]), " .;:!?")
	// Preserve the description text including its trailing period for sentence integrity.
	description := sanitizePresentationText(parts[2])
	if isConversationalTranscriptLine(title) || isLikelyTranscriptFragment(title) || isConversationalTranscriptLine(description) || isLikelyTranscriptFragment(description) {
		return ""
	}
	title = trimDanglingPhrase(title)
	titleWords := strings.Fields(title)
	if len(titleWords) > 4 {
		titleWords = titleWords[:4]
		titleWords = trimDanglingEndingWords(titleWords)
		title = strings.Join(titleWords, " ")
	}
	if len(strings.Fields(title)) < 2 {
		descWords := trimDanglingEndingWords(strings.Fields(description))
		if len(descWords) >= 3 {
			title = strings.Join(descWords[:3], " ")
		}
	}
	if title == "" || description == "" {
		return ""
	}
	if isConversationalTranscriptLine(title) || isLikelyTranscriptFragment(title) || isConversationalTranscriptLine(description) || isLikelyTranscriptFragment(description) {
		return ""
	}
	if icon == "" {
		icon = inferTakeawayIcon(title, description)
	}
	return "FEATURE: " + icon + " || " + title + " || " + description
}

func normalizeNumberedDescriptionWordCount(value string, targetWords int) string {
	text := sanitizePresentationText(value)
	if text == "" || targetWords <= 0 {
		return ""
	}

	words := trimDanglingEndingWords(strings.Fields(text))
	if len(words) == 0 {
		return ""
	}

	if len(words) > targetWords {
		words = words[:targetWords]
		words = trimDanglingEndingWords(words)
	}

	pad := []string{"with", "clear", "execution", "steps", "that", "improve", "reliability", "safety", "efficiency", "and", "measurable", "outcomes", "for", "communities", "over", "time"}
	padIndex := 0
	for len(words) < targetWords {
		words = append(words, pad[padIndex%len(pad)])
		padIndex++
	}

	if len(words) > targetWords {
		words = words[:targetWords]
	}

	text = strings.TrimRight(strings.TrimSpace(strings.Join(words, " ")), " .;:!?")
	if text == "" {
		return ""
	}
	return ensureTrailingDot(text)
}

func normalizeNumberedCardBullet(value string) string {
	value = sanitizePresentationText(value)
	if value == "" {
		return ""
	}
	if !isNumberedCardEncodedBullet(value) {
		return value
	}

	re := regexp.MustCompile(`(?i)^num:\s*`)
	body := re.ReplaceAllString(value, "")
	parts := strings.SplitN(body, "||", 3)
	if len(parts) < 3 {
		return ""
	}

	number := regexp.MustCompile(`\D+`).ReplaceAllString(strings.TrimSpace(parts[0]), "")
	if number == "" {
		number = "1"
	}
	title := sanitizePresentationText(parts[1])
	description := sanitizePresentationText(parts[2])
	title = strings.TrimRight(title, " .;:!?")
	description = strings.TrimSpace(description)
	if title == "" || description == "" {
		return ""
	}
	if isConversationalTranscriptLine(title) || isLikelyTranscriptFragment(title) || isConversationalTranscriptLine(description) || isLikelyTranscriptFragment(description) {
		return ""
	}

	if len(strings.Fields(title)) > 7 {
		title = strings.Join(strings.Fields(title)[:7], " ")
	}

	description = normalizeNumberedDescriptionWordCount(description, 30)
	if description == "" {
		return ""
	}

	return "NUM: " + number + " || " + title + " || " + description
}

func normalizeCardDescriptionSentence(value string) string {
	text := sanitizePresentationText(value)
	if text == "" {
		return ""
	}

	sentences := splitPresentationSentences(text)
	if len(sentences) > 0 {
		text = sanitizePresentationText(sentences[0])
	}

	words := strings.Fields(text)
	words = trimDanglingEndingWords(words)
	if len(words) > 20 {
		words = words[:20]
		words = trimDanglingEndingWords(words)
	}
	if len(words) < 10 {
		return ""
	}

	text = strings.TrimRight(strings.TrimSpace(strings.Join(words, " ")), " .;:!?")
	if text == "" {
		return ""
	}
	return text + "."
}

func normalizeCardEncodedBullet(value string) string {
	value = sanitizePresentationText(value)
	if value == "" {
		return ""
	}

	if !isCardEncodedBullet(value) {
		return value
	}

	re := regexp.MustCompile(`(?i)^card:\s*`)
	body := re.ReplaceAllString(value, "")
	parts := strings.SplitN(body, "||", 2)
	if len(parts) != 2 {
		return ""
	}

	label := sanitizePresentationText(parts[0])
	desc := sanitizePresentationText(parts[1])
	label = strings.TrimRight(label, " .;:!?")
	desc = normalizeCardDescriptionSentence(desc)
	if label == "" || desc == "" {
		return ""
	}
	if isConversationalTranscriptLine(label) || isLikelyTranscriptFragment(label) || isConversationalTranscriptLine(desc) || isLikelyTranscriptFragment(desc) {
		return ""
	}

	labelWords := strings.Fields(label)
	if len(labelWords) > 4 {
		label = strings.Join(labelWords[:4], " ")
	}

	return "CARD: " + label + " || " + desc
}

func isPlaceholderText(s string) bool {
	lower := strings.ToLower(strings.TrimSpace(s))
	if lower == "" {
		return true
	}
	if isCardEncodedBullet(lower) {
		return false
	}
	if isNumberedCardEncodedBullet(lower) {
		return false
	}
	if isComparisonHeaderEncodedBullet(lower) || isComparisonRowEncodedBullet(lower) {
		return false
	}
	if isFeatureEncodedBullet(lower) {
		return false
	}
	if isFlowEncodedBullet(lower) {
		return false
	}
	if isTimelineEncodedBullet(lower) {
		return false
	}

	patterns := []string{
		"point ", "takeaway ", "item ", "slide ", "label ",
		"tbd", "lorem ipsum", "placeholder", "todo",
	}

	for _, p := range patterns {
		if strings.HasPrefix(lower, p) || lower == strings.TrimSpace(p) {
			if (strings.HasPrefix(lower, "slide ") || strings.HasPrefix(lower, "label ")) && len(strings.Fields(lower)) > 2 {
				continue
			}
			return true
		}
	}

	return false
}

func normalizePresentationBullet(value string, maxWords int) string {
	value = sanitizePresentationText(value)
	if value == "" {
		return ""
	}
	if containsTranscriptNoiseTag(value) {
		return ""
	}
	if isConversationalTranscriptLine(value) {
		return ""
	}

	if isNumberedCardEncodedBullet(value) {
		return normalizeNumberedCardBullet(value)
	}

	if isCardEncodedBullet(value) {
		return normalizeCardEncodedBullet(value)
	}

	if isComparisonHeaderEncodedBullet(value) {
		return normalizeComparisonHeaderBullet(value)
	}

	if isComparisonRowEncodedBullet(value) {
		return normalizeComparisonRowBullet(value)
	}

	if isFeatureEncodedBullet(value) {
		return normalizeFeatureEncodedBullet(value)
	}

	if isFlowEncodedBullet(value) {
		return normalizeFlowEncodedBullet(value)
	}

	if isTimelineEncodedBullet(value) {
		return normalizeTimelineEncodedBullet(value)
	}

	value = regexp.MustCompile(`(?i)^\s*(?:(?:key\s*)?(?:point|takeaway|insight|step|item)\s*\d+\s*[:.)-]?\s*)`).ReplaceAllString(value, "")
	value = regexp.MustCompile(`(?i)^\s*(?:(?:\(?\d{1,2}\)?|[ivxlcdm]{1,5})\s*(?:[).:-]|-\s)\s*|[-*•]+\s*)`).ReplaceAllString(value, "")
	value = sanitizePresentationText(value)
	if value != "" && isConversationalTranscriptLine(value) {
		return ""
	}
	value = strings.TrimRight(value, " .;:!?")
	if value == "" {
		return ""
	}
	if isPlaceholderText(value) {
		return ""
	}

	truncated := truncateBullet(value, maxWords)
	if truncated == "" {
		return ""
	}
	truncated = trimDanglingPhrase(truncated)
	if truncated == "" {
		return ""
	}
	if len(strings.Fields(truncated)) < 5 {
		return ""
	}
	return truncated
}

func transcriptHasQuantifiableClaim(transcript string) bool {
	text := strings.TrimSpace(strings.ToLower(transcript))
	if text == "" {
		return false
	}

	if regexp.MustCompile(`\b\d+(?:[.,]\d+)?\s*%\b`).MatchString(text) {
		return true
	}
	if regexp.MustCompile(`\b\d{1,4}(?:[.,]\d+)?\b`).MatchString(text) {
		return true
	}
	keywords := []string{"percent", "percentage", "count", "duration", "minutes", "hours", "days", "weeks", "months", "years", "cost", "price", "rank", "ranking", "threshold", "accuracy", "latency", "fps"}
	for _, keyword := range keywords {
		if strings.Contains(text, keyword) {
			return true
		}
	}

	return false
}

func enforceStatsSlideWhenQuantifiable(slides []models.PresentationSlide, transcript string) {
	if len(slides) == 0 || !transcriptHasQuantifiableClaim(transcript) {
		return
	}

	for _, slide := range slides {
		if strings.EqualFold(strings.TrimSpace(slide.Type), "stats") && len(slide.Stats) >= 3 {
			return
		}
	}

	for i := 1; i < len(slides)-1; i++ {
		if !strings.EqualFold(strings.TrimSpace(slides[i].Type), "content") {
			continue
		}

		stats := extractStatsFromBullets(slides[i].Bullets)
		if len(stats) == 0 {
			continue
		}

		slides[i].Type = "stats"
		slides[i].Stats = stats
		slides[i].Bullets = []string{}
		return
	}
}

func extractStatsFromBullets(bullets []string) []models.PresentationStat {
	stats := make([]models.PresentationStat, 0, 6)
	numberPattern := regexp.MustCompile(`\b\d+(?:[.,]\d+)?%?\b`)

	for _, bullet := range bullets {
		if len(stats) >= 6 {
			break
		}
		clean := sanitizePresentationText(strings.TrimSpace(bullet))
		if clean == "" {
			continue
		}
		if containsTranscriptNoiseTag(clean) || isConversationalTranscriptLine(clean) || isStatMetadataText(clean) {
			continue
		}
		match := numberPattern.FindString(clean)
		if match == "" {
			continue
		}

		label := normalizeStatLabel(numberPattern.ReplaceAllString(clean, ""))
		if label == "" || isStatMetadataText(label) {
			continue
		}
		if strings.Contains(match, "%") && isAbstractPercentStatLabel(label) {
			continue
		}
		description := normalizeStatDescription(clean)
		if description != "" && (isStatFirstPersonLeak(description) || isGenericBusinessFillerText(description)) {
			description = ""
		}
		if !statValueLooksNumeric(match) {
			continue
		}

		labelWords := strings.Fields(label)
		if len(labelWords) > 5 {
			label = strings.Join(labelWords[:5], " ")
		}

		stats = append(stats, models.PresentationStat{
			Value:       match,
			Label:       label,
			Description: description,
		})
	}

	return stats
}

func normalizePresentationBullets(bullets []string, title, subtitle string, maxItems, maxWords int) []string {
	if maxItems <= 0 {
		return []string{}
	}

	titleNorm := normalizeCompareText(title)
	subtitleNorm := normalizeCompareText(subtitle)
	seen := map[string]struct{}{}
	out := make([]string, 0, min(maxItems, len(bullets)))

	for _, bullet := range bullets {
		normalized := normalizePresentationBullet(bullet, maxWords)
		if normalized == "" {
			continue
		}

		wordCount := len(strings.Fields(normalized))
		if wordCount < 6 {
			// only drop if it's a known placeholder pattern; otherwise keep as-is
			if isPlaceholderText(normalized) {
				continue
			}
		}

		compare := normalizeCompareText(normalized)
		if compare == "" || compare == titleNorm || compare == subtitleNorm {
			continue
		}
		if _, exists := seen[compare]; exists {
			continue
		}

		seen[compare] = struct{}{}
		out = append(out, normalized)
		if len(out) >= maxItems {
			break
		}
	}

	return out
}

func normalizePresentationPhrases(items []string, maxItems, maxWords int) []string {
	if maxItems <= 0 {
		return []string{}
	}
	seen := map[string]struct{}{}
	out := make([]string, 0, min(maxItems, len(items)))
	for _, item := range items {
		normalized := normalizePhraseSentence(item, maxWords)
		if normalized == "" || isConversationalTranscriptLine(normalized) || isTwoColumnMetaItem(normalized) {
			continue
		}
		key := normalizeCompareText(normalized)
		if key == "" {
			continue
		}
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, normalized)
		if len(out) >= maxItems {
			break
		}
	}
	return out
}

func ensureTrailingDot(value string) string {
	value = sanitizePresentationText(value)
	value = strings.TrimRight(value, " .;:!?")
	if value == "" {
		return ""
	}
	return value + "."
}

func normalizePhraseSentence(value string, maxWords int) string {
	clean := sanitizePresentationText(value)
	if clean == "" || containsTranscriptNoiseTag(clean) {
		return ""
	}
	if isTwoColumnMetaItem(clean) {
		return ""
	}

	sentences := splitPresentationSentences(clean)
	if len(sentences) > 0 {
		clean = sanitizePresentationText(sentences[0])
		if isTwoColumnMetaItem(clean) {
			return ""
		}
	}

	normalized := normalizePresentationBullet(clean, maxWords)
	if normalized == "" {
		return ""
	}

	return ensureTrailingDot(normalized)
}

func buildCompactBulletsFromText(source string, maxItems, maxWords int) []string {
	if maxItems <= 0 {
		return []string{}
	}
	sentences := splitPresentationSentences(source)
	if len(sentences) == 0 {
		return []string{}
	}

	seen := map[string]struct{}{}
	out := make([]string, 0, maxItems)
	for _, sentence := range sentences {
		phrase := normalizePresentationBullet(sentence, maxWords)
		if phrase == "" {
			continue
		}
		key := normalizeCompareText(phrase)
		if key == "" {
			continue
		}
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, phrase)
		if len(out) >= maxItems {
			break
		}
	}

	return out
}

func buildDeterministicContentBullets(title, subtitle string) []string {
	subject := firstNonEmpty(title, subtitle, "Core topic")
	subject = sanitizePresentationText(subject)
	subject = firstNWords(subject, 4)
	if subject == "" {
		subject = "Core topic"
	}

	return []string{
		sanitizePresentationText(subject + " context and key challenge framing"),
		sanitizePresentationText(subject + " implementation path with practical decisions"),
		sanitizePresentationText("Expected outcomes and measurable impact for stakeholders"),
	}
}

func ensureDefaultContentPayload(slide *models.PresentationSlide, transcript string) {
	if slide == nil {
		return
	}
	_ = transcript
	if !strings.EqualFold(strings.TrimSpace(slide.Type), "content") {
		return
	}

	variant := strings.ToLower(strings.TrimSpace(pointerStringValue(slide.Variant)))
	if variant == "" {
		variant = "default"
	}
	if variant == "feature_trio" || variant == "comparison_table" || variant == "timeline" || variant == "flow_arrows" {
		return
	}

	title := sanitizePresentationText(slide.Title)
	subtitle := pointerStringValue(slide.Subtitle)
	built := normalizePresentationBullets(slide.Bullets, title, subtitle, 6, 14)

	if len(built) < 2 {
		source := strings.TrimSpace(strings.Join([]string{title, subtitle, pointerStringValue(slide.Body), slide.SpeakerNotes}, " "))
		extra := buildCompactBulletsFromText(source, 4, 10)
		built = normalizePresentationBullets(append(built, extra...), title, subtitle, 6, 14)
	}

	if len(built) < 2 {
		fallback := buildDeterministicContentBullets(title, subtitle)
		built = normalizePresentationBullets(append(built, fallback...), title, subtitle, 6, 14)
	}

	if len(built) == 0 {
		built = []string{
			"Key context and constraints shaping this topic",
			"Practical implementation steps for reliable execution",
			"Expected outcomes and measurable impact for stakeholders",
		}
	}

	slide.Bullets = built
}

func enforceNumberedStackSlideRules(slide *models.PresentationSlide) {
	if slide == nil {
		return
	}
	if !strings.EqualFold(strings.TrimSpace(slide.Type), "content") {
		return
	}
	if strings.ToLower(strings.TrimSpace(pointerStringValue(slide.Variant))) != "default" {
		return
	}

	type numItem struct {
		Title       string
		Description string
	}

	items := make([]numItem, 0, 3)
	for _, bullet := range slide.Bullets {
		normalized := normalizeNumberedCardBullet(bullet)
		if normalized == "" || !isNumberedCardEncodedBullet(normalized) {
			continue
		}
		body := regexp.MustCompile(`(?i)^num:\s*`).ReplaceAllString(normalized, "")
		parts := strings.SplitN(body, "||", 3)
		if len(parts) < 3 {
			continue
		}
		title := strings.TrimSpace(parts[1])
		description := strings.TrimSpace(parts[2])
		if title == "" || description == "" {
			continue
		}
		items = append(items, numItem{Title: title, Description: description})
		if len(items) >= 3 {
			break
		}
	}

	if len(items) == 0 {
		return
	}

	base := firstNWords(firstNonEmpty(sanitizePresentationText(slide.Title), "Action Plan"), 2)
	if base == "" {
		base = "Action Plan"
	}

	for len(items) < 3 {
		idx := len(items) + 1
		items = append(items, numItem{
			Title:       fmt.Sprintf("%s Step %d", base, idx),
			Description: normalizeNumberedDescriptionWordCount("Implement a concrete action sequence with clear accountability checkpoints, efficient resource use, and observable progress indicators that reduce risk while improving long-term operational outcomes for people, systems, and surrounding communities.", 30),
		})
	}

	out := make([]string, 0, 3)
	for i := 0; i < 3 && i < len(items); i++ {
		title := strings.TrimRight(sanitizePresentationText(items[i].Title), " .;:!?")
		if title == "" || isConversationalTranscriptLine(title) || isLikelyTranscriptFragment(title) {
			title = fmt.Sprintf("Step %d Focus", i+1)
		}
		titleWords := strings.Fields(title)
		if len(titleWords) > 7 {
			title = strings.Join(titleWords[:7], " ")
		}
		description := normalizeNumberedDescriptionWordCount(items[i].Description, 30)
		if description == "" {
			description = normalizeNumberedDescriptionWordCount("Implement a concrete action sequence with clear accountability checkpoints, efficient resource use, and observable progress indicators that reduce risk while improving long-term operational outcomes for people, systems, and surrounding communities.", 30)
		}
		out = append(out, fmt.Sprintf("NUM: %d || %s || %s", i+1, title, description))
	}

	if len(out) == 3 {
		slide.Bullets = out
	}
}

func buildSpeakerNotesFromSlide(slide models.PresentationSlide) string {
	parts := make([]string, 0, 4)
	if strings.TrimSpace(slide.Title) != "" {
		parts = append(parts, slide.Title)
	}
	if body := pointerStringValue(slide.Body); body != "" {
		parts = append(parts, firstNWords(body, 24))
	}
	for _, bullet := range slide.Bullets {
		if len(parts) >= 4 {
			break
		}
		if strings.TrimSpace(bullet) != "" {
			parts = append(parts, bullet)
		}
	}
	for _, stat := range slide.Stats {
		if len(parts) >= 4 {
			break
		}
		if strings.TrimSpace(stat.Value) == "" || strings.TrimSpace(stat.Label) == "" {
			continue
		}
		parts = append(parts, strings.TrimSpace(stat.Value+" "+stat.Label))
	}
	for _, row := range slide.TableRows {
		if len(parts) >= 4 {
			break
		}
		if len(row) == 0 {
			continue
		}
		joined := strings.TrimSpace(strings.Join(row, " - "))
		if joined != "" {
			parts = append(parts, joined)
		}
	}
	if len(parts) == 0 {
		return "Briefly introduce the key idea, then explain the most important implication for the audience."
	}
	return strings.Join(parts, ". ") + "."
}

func enforcePresentationTypeVariety(slides []models.PresentationSlide) {
	if len(slides) < 4 {
		return
	}

	hasTwoColumn := false
	hasProse := false
	for i := range slides {
		t := strings.ToLower(strings.TrimSpace(slides[i].Type))
		if t == "two_column" {
			hasTwoColumn = true
		}
		if t == "prose" {
			hasProse = true
		}
	}

	if !hasTwoColumn && len(slides) >= 8 {
		for i := 2; i < len(slides)-1; i++ {
			if !strings.EqualFold(strings.TrimSpace(slides[i].Type), "content") || len(slides[i].Bullets) < 5 {
				continue
			}

			slides[i].Type = "two_column"
			left := make([]string, 0, 5)
			right := make([]string, 0, 5)
			for j, bullet := range slides[i].Bullets {
				if j%2 == 0 {
					left = append(left, bullet)
				} else {
					right = append(right, bullet)
				}
			}
			slides[i].LeftColumn = normalizePresentationPhrases(left, 4, 20)
			slides[i].RightColumn = normalizePresentationPhrases(right, 4, 20)
			if slides[i].LeftLabel == nil {
				leftLabel := "Key Drivers"
				slides[i].LeftLabel = &leftLabel
			}
			if slides[i].RightLabel == nil {
				rightLabel := "Implications"
				slides[i].RightLabel = &rightLabel
			}
			slides[i].Bullets = []string{}
			break
		}
	}

	if !hasProse && len(slides) >= 8 {
		for i := 2; i < len(slides)-1; i++ {
			if !strings.EqualFold(strings.TrimSpace(slides[i].Type), "content") && !strings.EqualFold(strings.TrimSpace(slides[i].Type), "prose") {
				continue
			}
			slides[i].Type = "prose"
			body := buildProseBodyFromSlide(slides[i], "")
			slides[i].Body = stringPtr(body)
			slides[i].Bullets = []string{}
			break
		}
	}

}

func convertStatsSlideToContent(slide *models.PresentationSlide, transcript string) {
	if slide == nil {
		return
	}
	_ = transcript

	bullets := make([]string, 0, 4)
	for _, stat := range normalizePresentationStats(slide.Stats, 4) {
		parts := make([]string, 0, 3)
		if value := sanitizePresentationText(stat.Value); value != "" {
			parts = append(parts, value)
		}
		if label := sanitizePresentationText(stat.Label); label != "" {
			parts = append(parts, label)
		}
		if description := sanitizePresentationText(stat.Description); description != "" {
			parts = append(parts, description)
		}
		if len(parts) == 0 {
			continue
		}
		bullets = append(bullets, sanitizePresentationText(strings.Join(parts, " ")))
	}

	if len(bullets) == 0 {
		source := strings.Join([]string{slide.Title, pointerStringValue(slide.Subtitle), slide.SpeakerNotes}, " ")
		bullets = buildCompactBulletsFromText(source, 4, 14)
	}

	slide.Type = "content"
	slide.Variant = stringPtr("default")
	slide.Stats = []models.PresentationStat{}
	slide.TableHeaders = []string{}
	slide.TableRows = [][]string{}
	slide.LeftColumn = []string{}
	slide.RightColumn = []string{}
	slide.Columns = nil
	slide.LeftLabel = nil
	slide.RightLabel = nil
	slide.Bullets = normalizePresentationBullets(bullets, slide.Title, pointerStringValue(slide.Subtitle), 6, 14)
	ensureDefaultContentPayload(slide, transcript)
}

func convertTwoColumnSlideToContent(slide *models.PresentationSlide, transcript string) {
	if slide == nil {
		return
	}
	_ = transcript

	leftLabel := firstNonEmpty(pointerStringValue(slide.LeftLabel), "Perspective A")
	rightLabel := firstNonEmpty(pointerStringValue(slide.RightLabel), "Perspective B")

	leftItems := append([]string{}, slide.LeftColumn...)
	rightItems := append([]string{}, slide.RightColumn...)
	if len(leftItems) == 0 && len(rightItems) == 0 && len(slide.Columns) >= 2 {
		leftLabel = firstNonEmpty(slide.Columns[0].Label, leftLabel)
		rightLabel = firstNonEmpty(slide.Columns[1].Label, rightLabel)
		leftItems = append(leftItems, slide.Columns[0].Items...)
		rightItems = append(rightItems, slide.Columns[1].Items...)
	}

	maxLen := len(leftItems)
	if len(rightItems) > maxLen {
		maxLen = len(rightItems)
	}

	bullets := make([]string, 0, 6)
	for i := 0; i < maxLen && len(bullets) < 6; i++ {
		left := sanitizePresentationText(getSliceItem(leftItems, i))
		if left != "" {
			bullets = append(bullets, sanitizePresentationText(leftLabel+": "+left))
		}
		if len(bullets) >= 6 {
			break
		}
		right := sanitizePresentationText(getSliceItem(rightItems, i))
		if right != "" {
			bullets = append(bullets, sanitizePresentationText(rightLabel+": "+right))
		}
	}

	if len(bullets) == 0 {
		source := strings.Join([]string{slide.Title, pointerStringValue(slide.Subtitle), slide.SpeakerNotes}, " ")
		bullets = buildCompactBulletsFromText(source, 4, 14)
	}

	slide.Type = "content"
	slide.Variant = stringPtr("default")
	slide.LeftColumn = []string{}
	slide.RightColumn = []string{}
	slide.Columns = nil
	slide.LeftLabel = nil
	slide.RightLabel = nil
	slide.TableHeaders = []string{}
	slide.TableRows = [][]string{}
	slide.Stats = []models.PresentationStat{}
	slide.Bullets = normalizePresentationBullets(bullets, slide.Title, pointerStringValue(slide.Subtitle), 6, 14)
	ensureDefaultContentPayload(slide, transcript)
}

func enforcePresentationTypeUsageLimits(slides []models.PresentationSlide, transcript string) {
	if len(slides) == 0 {
		return
	}

	statsCount := 0
	twoColumnCount := 0

	for i := range slides {
		slideType := strings.ToLower(strings.TrimSpace(slides[i].Type))
		switch slideType {
		case "stats":
			statsCount++
			if statsCount > 1 {
				convertStatsSlideToContent(&slides[i], transcript)
			}
		case "two_column":
			twoColumnCount++
			if twoColumnCount > 2 {
				convertTwoColumnSlideToContent(&slides[i], transcript)
			}
		}
	}
}

func enforcePresentationVariantCoverage(slides []models.PresentationSlide, transcript string) {
	if len(slides) < 7 {
		return
	}

	mediumOrLargeDeck := len(slides) >= 9

	contentIndices := make([]int, 0, len(slides))
	proseIndices := make([]int, 0, len(slides))
	twoColumnIndices := make([]int, 0, len(slides))
	featureIndices := make([]int, 0, 3)
	comparisonIndices := make([]int, 0, 3)
	timelineIndices := make([]int, 0, 2)
	flowIndices := make([]int, 0, 2)
	featureIndex := -1
	comparisonIndex := -1
	timelineIndex := -1
	flowIndex := -1
	cardGridIndex := -1

	for i := range slides {
		typeName := strings.ToLower(strings.TrimSpace(slides[i].Type))
		variant := strings.ToLower(strings.TrimSpace(pointerStringValue(slides[i].Variant)))
		if typeName == "content" {
			contentIndices = append(contentIndices, i)
			if variant == "feature_trio" {
				featureIndices = append(featureIndices, i)
			}
			if variant == "timeline" {
				timelineIndices = append(timelineIndices, i)
			}
			if variant == "flow_arrows" {
				flowIndices = append(flowIndices, i)
			}
			if cardGridCount(slides[i]) >= 3 && variant != "feature_trio" && variant != "comparison_table" {
				cardGridIndex = i
			}
		}
		if typeName == "prose" {
			proseIndices = append(proseIndices, i)
		}
		if typeName == "two_column" {
			twoColumnIndices = append(twoColumnIndices, i)
		}
		if variant == "comparison_table" {
			comparisonIndices = append(comparisonIndices, i)
		}
	}

	if len(featureIndices) > 0 {
		featureIndex = featureIndices[0]
	}
	if len(comparisonIndices) > 0 {
		comparisonIndex = comparisonIndices[0]
	}
	if len(timelineIndices) > 0 {
		timelineIndex = timelineIndices[0]
	}
	if len(flowIndices) > 0 {
		flowIndex = flowIndices[0]
	}

	if len(featureIndices) > 1 {
		for _, idx := range featureIndices[1:] {
			enrichCardGridContentSlide(&slides[idx], transcript)
			if cardGridIndex == -1 && cardGridCount(slides[idx]) >= 3 {
				cardGridIndex = idx
			}
		}
	}

	if len(comparisonIndices) > 1 {
		for _, idx := range comparisonIndices[1:] {
			typeName := strings.ToLower(strings.TrimSpace(slides[idx].Type))
			slides[idx].Variant = stringPtr("default")
			if typeName == "content" && cardGridIndex == -1 {
				enrichCardGridContentSlide(&slides[idx], transcript)
				if cardGridCount(slides[idx]) >= 3 {
					cardGridIndex = idx
				}
			}
			if typeName == "two_column" {
				enrichTwoColumnSlide(&slides[idx], transcript)
			}
		}
	}

	if featureIndex == -1 {
		for _, idx := range contentIndices {
			if idx == comparisonIndex {
				continue
			}
			slides[idx].Variant = stringPtr("feature_trio")
			enrichFeatureTrioSlide(&slides[idx], transcript)
			featureIndex = idx
			break
		}
	}

	if featureIndex == -1 && len(proseIndices) > 0 {
		idx := proseIndices[0]
		slides[idx].Type = "content"
		if len(slides[idx].Bullets) == 0 {
			source := strings.Join([]string{slides[idx].Title, pointerStringValue(slides[idx].Subtitle), pointerStringValue(slides[idx].Body), slides[idx].SpeakerNotes}, " ")
			slides[idx].Bullets = buildCompactBulletsFromText(source, 3, 16)
			if len(slides[idx].Bullets) == 0 {
				slides[idx].Bullets = []string{
					firstNWords(slides[idx].Title+" practical mechanism and concrete impact", 14),
					firstNWords(slides[idx].Title+" user experience and implementation detail", 14),
					firstNWords(slides[idx].Title+" measurable results and strategic value", 14),
				}
			}
		}
		slides[idx].Variant = stringPtr("feature_trio")
		enrichFeatureTrioSlide(&slides[idx], transcript)
		featureIndex = idx
		contentIndices = append(contentIndices, idx)
	}

	if cardGridIndex == -1 {
		for _, idx := range contentIndices {
			if idx == featureIndex || idx == comparisonIndex {
				continue
			}
			enrichCardGridContentSlide(&slides[idx], transcript)
			if cardGridCount(slides[idx]) >= 3 {
				cardGridIndex = idx
				break
			}
		}
	}

	if cardGridIndex == -1 && len(proseIndices) > 1 {
		for _, idx := range proseIndices {
			if idx == featureIndex || idx == comparisonIndex {
				continue
			}
			enrichCardGridContentSlide(&slides[idx], transcript)
			if cardGridCount(slides[idx]) >= 3 {
				cardGridIndex = idx
				contentIndices = append(contentIndices, idx)
				break
			}
		}
	}

	if comparisonIndex == -1 {
		if len(twoColumnIndices) > 0 {
			idx := twoColumnIndices[0]
			slides[idx].Variant = stringPtr("comparison_table")
			enrichComparisonTableSlide(&slides[idx])
			if len(slides[idx].TableRows) > 0 {
				comparisonIndex = idx
			}
		}
	}

	if comparisonIndex == -1 {
		for _, idx := range contentIndices {
			if idx == featureIndex {
				continue
			}
			slides[idx].Variant = stringPtr("comparison_table")
			enrichComparisonTableSlide(&slides[idx])
			if len(slides[idx].TableRows) > 0 {
				comparisonIndex = idx
				break
			}
		}
	}

	if mediumOrLargeDeck && timelineIndex == -1 {
		for _, idx := range contentIndices {
			if idx == featureIndex || idx == comparisonIndex || idx == cardGridIndex {
				continue
			}
			typeName := strings.ToLower(strings.TrimSpace(slides[idx].Type))
			if typeName != "content" {
				continue
			}
			slides[idx].Variant = stringPtr("timeline")
			enrichTimelineSlide(&slides[idx], transcript)
			if strings.EqualFold(strings.TrimSpace(pointerStringValue(slides[idx].Variant)), "timeline") {
				timelineIndex = idx
				break
			}
		}
	}

	if mediumOrLargeDeck && timelineIndex == -1 {
		for _, idx := range contentIndices {
			if idx == featureIndex || idx == comparisonIndex {
				continue
			}
			typeName := strings.ToLower(strings.TrimSpace(slides[idx].Type))
			if typeName != "content" {
				continue
			}
			slides[idx].Variant = stringPtr("timeline")
			enrichTimelineSlide(&slides[idx], transcript)
			if strings.EqualFold(strings.TrimSpace(pointerStringValue(slides[idx].Variant)), "timeline") {
				timelineIndex = idx
				break
			}
		}
	}

	if mediumOrLargeDeck && timelineIndex == -1 {
		for _, idx := range proseIndices {
			if idx == featureIndex || idx == comparisonIndex {
				continue
			}
			slides[idx].Type = "content"
			if len(slides[idx].Bullets) == 0 {
				source := strings.Join([]string{slides[idx].Title, pointerStringValue(slides[idx].Subtitle), pointerStringValue(slides[idx].Body), slides[idx].SpeakerNotes}, " ")
				slides[idx].Bullets = buildCompactBulletsFromText(source, 5, 14)
			}
			slides[idx].Variant = stringPtr("timeline")
			enrichTimelineSlide(&slides[idx], transcript)
			if strings.EqualFold(strings.TrimSpace(pointerStringValue(slides[idx].Variant)), "timeline") {
				timelineIndex = idx
				contentIndices = append(contentIndices, idx)
				break
			}
		}
	}

	if mediumOrLargeDeck && flowIndex == -1 {
		for _, idx := range contentIndices {
			if idx == featureIndex || idx == comparisonIndex || idx == cardGridIndex || idx == timelineIndex {
				continue
			}
			typeName := strings.ToLower(strings.TrimSpace(slides[idx].Type))
			if typeName != "content" {
				continue
			}
			slides[idx].Variant = stringPtr("flow_arrows")
			enrichFlowArrowsSlide(&slides[idx], transcript)
			flowCount := 0
			for _, bullet := range slides[idx].Bullets {
				if isFlowEncodedBullet(bullet) {
					flowCount++
				}
			}
			if flowCount >= 3 {
				flowIndex = idx
				break
			}
		}
	}

	if mediumOrLargeDeck && flowIndex == -1 {
		for _, idx := range contentIndices {
			if idx == featureIndex || idx == comparisonIndex || idx == timelineIndex {
				continue
			}
			typeName := strings.ToLower(strings.TrimSpace(slides[idx].Type))
			if typeName != "content" {
				continue
			}
			slides[idx].Variant = stringPtr("flow_arrows")
			enrichFlowArrowsSlide(&slides[idx], transcript)
			flowCount := 0
			for _, bullet := range slides[idx].Bullets {
				if isFlowEncodedBullet(bullet) {
					flowCount++
				}
			}
			if flowCount >= 3 {
				flowIndex = idx
				break
			}
		}
	}

	if mediumOrLargeDeck && flowIndex == -1 {
		for _, idx := range proseIndices {
			if idx == featureIndex || idx == comparisonIndex || idx == timelineIndex {
				continue
			}
			slides[idx].Type = "content"
			if len(slides[idx].Bullets) == 0 {
				source := strings.Join([]string{slides[idx].Title, pointerStringValue(slides[idx].Subtitle), pointerStringValue(slides[idx].Body), slides[idx].SpeakerNotes}, " ")
				slides[idx].Bullets = buildCompactBulletsFromText(source, 5, 14)
			}
			slides[idx].Variant = stringPtr("flow_arrows")
			enrichFlowArrowsSlide(&slides[idx], transcript)
			flowCount := 0
			for _, bullet := range slides[idx].Bullets {
				if isFlowEncodedBullet(bullet) {
					flowCount++
				}
			}
			if flowCount >= 3 {
				flowIndex = idx
				contentIndices = append(contentIndices, idx)
				break
			}
		}
	}

	featureUsed := featureIndex != -1
	comparisonUsed := comparisonIndex != -1

	for _, idx := range contentIndices {
		variant := strings.ToLower(strings.TrimSpace(pointerStringValue(slides[idx].Variant)))
		if variant == "" || variant == "default" {
			variant = inferContentVariant(&slides[idx])
			slides[idx].Variant = stringPtr(variant)
		}

		if variant == "feature_trio" && idx != featureIndex {
			if featureUsed {
				slides[idx].Variant = stringPtr("default")
				variant = "default"
				if cardGridIndex == -1 {
					enrichCardGridContentSlide(&slides[idx], transcript)
					if cardGridCount(slides[idx]) >= 3 {
						cardGridIndex = idx
					}
				}
			} else {
				featureUsed = true
				featureIndex = idx
			}
		}

		if variant == "comparison_table" && idx != comparisonIndex {
			if comparisonUsed {
				slides[idx].Variant = stringPtr("default")
				variant = "default"
			} else {
				comparisonUsed = true
				comparisonIndex = idx
			}
		}

		switch variant {
		case "feature_trio":
			enrichFeatureTrioSlide(&slides[idx], transcript)
		case "flow_arrows":
			enrichFlowArrowsSlide(&slides[idx], transcript)
		case "timeline":
			enrichTimelineSlide(&slides[idx], transcript)
		case "comparison_table":
			enrichComparisonTableSlide(&slides[idx])
		default:
			if idx == cardGridIndex {
				enrichCardGridContentSlide(&slides[idx], transcript)
			}
		}
	}
}

func enforcePresentationImageQueries(slides []models.PresentationSlide, transcript string) {
	if len(slides) == 0 {
		return
	}

	primaryTopic := detectPresentationPrimaryTopic(slides, transcript)
	titleIndex := findTitleSlideIndex(slides)

	for i := range slides {
		slideType := strings.ToLower(strings.TrimSpace(slides[i].Type))
		variant := strings.ToLower(strings.TrimSpace(pointerStringValue(slides[i].Variant)))
		if slideType == "stats" || slideType == "two_column" || slideType == "summary" {
			slides[i].ImageQuery = nil
			continue
		}
		if variant == "comparison_table" || variant == "feature_trio" || variant == "timeline" || variant == "flow_arrows" {
			slides[i].ImageQuery = nil
			continue
		}

		existing := pointerStringValue(slides[i].ImageQuery)
		if existing != "" {
			normalized := normalizeImageQuery(existing)
			if normalized != "" {
				slides[i].ImageQuery = stringPtr(normalized)
			}
			continue
		}

		seed := fallbackSlideImageQuery(strings.Join([]string{
			primaryTopic,
			slides[i].Title,
			pointerStringValue(slides[i].Subtitle),
			strings.Join(slides[i].Bullets, " "),
		}, " "))
		if seed != "" {
			slides[i].ImageQuery = stringPtr(seed)
		}
	}

	if titleIndex >= 0 && strings.TrimSpace(pointerStringValue(slides[titleIndex].ImageQuery)) == "" {
		titleSeed := fallbackSlideImageQuery(strings.Join([]string{primaryTopic, slides[titleIndex].Title, pointerStringValue(slides[titleIndex].Subtitle)}, " "))
		if titleSeed == "" {
			titleSeed = "presentation hero background"
		}
		slides[titleIndex].ImageQuery = stringPtr(titleSeed)
	}

	enforceImagePositionRhythm(slides)
}

func findTitleSlideIndex(slides []models.PresentationSlide) int {
	for i := range slides {
		if strings.EqualFold(strings.TrimSpace(slides[i].Type), "title") {
			return i
		}
	}
	if len(slides) > 0 {
		return 0
	}
	return -1
}

func detectPresentationPrimaryTopic(slides []models.PresentationSlide, transcript string) string {
	var titleText strings.Builder
	for _, slide := range slides {
		if strings.EqualFold(strings.TrimSpace(slide.Type), "title") {
			titleText.WriteString(slide.Title)
			titleText.WriteString(" ")
			titleText.WriteString(pointerStringValue(slide.Subtitle))
			break
		}
	}
	source := strings.ToLower(titleText.String() + " " + transcript)

	if strings.Contains(source, "spider-man") || strings.Contains(source, "spiderman") || strings.Contains(source, "spider man") {
		return "spider-man"
	}

	if query := fallbackSlideImageQuery(titleText.String()); query != "" {
		return query
	}

	if query := fallbackSlideImageQuery(transcript); query != "" {
		return query
	}

	return ""
}

func enforceImagePositionRhythm(slides []models.PresentationSlide) {
	lastSide := "right"
	for i := range slides {
		t := strings.ToLower(strings.TrimSpace(slides[i].Type))
		if t != "title" && t != "content" && t != "prose" {
			slides[i].ImagePosition = stringPtr("right")
			continue
		}

		if pointerStringValue(slides[i].ImageQuery) == "" {
			slides[i].ImagePosition = stringPtr(normalizeImagePosition(pointerStringValue(slides[i].ImagePosition), t))
			continue
		}

		desired := normalizeImagePosition(pointerStringValue(slides[i].ImagePosition), t)

		if pointerStringValue(slides[i].ImagePosition) == "" {
			if lastSide == "right" {
				desired = "left"
			} else {
				desired = "right"
			}
		}

		slides[i].ImagePosition = stringPtr(desired)
		lastSide = desired
	}
}

func fallbackSlideImageQuery(text string) string {
	normalized := normalizeImageQuery(text)
	if normalized == "" {
		return ""
	}
	words := strings.Fields(normalized)
	if len(words) > 6 {
		words = words[:6]
	}
	return strings.Join(words, " ")
}

func sanitizeImageQuery(query string) string {
	lower := strings.ToLower(strings.TrimSpace(query))
	if lower == "" {
		return ""
	}

	replacements := map[string]string{
		"rabbitmq":        "server room cable management",
		"mongodb":         "database server rack",
		"postgresql":      "data center hardware",
		"kubernetes":      "data center server racks",
		"docker":          "software developer workspace",
		"redis":           "server memory hardware",
		"resnet50":        "deep learning gpu server",
		"resnet":          "neural network visualization",
		"yolov":           "computer vision camera",
		"faster r-cnn":    "object detection camera lens",
		"jwt":             "cybersecurity lock screen",
		"rbac":            "security access control panel",
		"llm":             "artificial intelligence brain chip",
		"microservice":    "modular architecture blueprint",
		"api gateway":     "network traffic routing",
		"pytorch":         "deep learning research workstation",
		"tensorflow":      "gpu training workstation",
		"transformer":     "artificial intelligence model diagram",
		"nlp":             "language processing workstation",
		"computer vision": "smart camera monitoring",
		"kafka":           "streaming data center servers",
		"etl":             "data pipeline dashboard",
		"data warehouse":  "enterprise analytics dashboard",
		"graphql":         "api architecture flow diagram",
		"oauth":           "secure login verification",
		"sso":             "enterprise identity login",
		"ci/cd":           "software deployment pipeline",
		"devops":          "cloud operations team",
		"blockchain":      "distributed ledger network",
		"encryption":      "digital security lock",
		"zero trust":      "cybersecurity access checkpoint",
		"phishing":        "email security warning",
		"lms":             "online classroom interface",
		"curriculum":      "classroom learning materials",
		"assessment":      "student exam evaluation",
	}

	for term, visual := range replacements {
		if strings.Contains(lower, term) {
			return visual
		}
	}

	abstractOnlySet := map[string]struct{}{
		"technology": {}, "innovation": {}, "solution": {}, "learning": {},
		"education": {}, "platform": {}, "system": {}, "process": {}, "concept": {},
	}
	words := strings.Fields(lower)
	if len(words) == 0 {
		return query
	}

	allAbstract := true
	for _, word := range words {
		if _, ok := abstractOnlySet[word]; !ok {
			allAbstract = false
			break
		}
	}
	if allAbstract {
		return strings.TrimSpace(query) + " workspace"
	}

	return strings.TrimSpace(query)
}

func normalizeImageQuery(raw string) string {
	raw = strings.TrimSpace(strings.ToLower(raw))
	if raw == "" {
		return ""
	}

	if strings.Contains(raw, "spider-man") || strings.Contains(raw, "spiderman") || strings.Contains(raw, "spider man") {
		return "spider-man superhero new york"
	}

	re := regexp.MustCompile(`[^a-z0-9\s-]+`)
	clean := re.ReplaceAllString(raw, " ")
	clean = strings.Join(strings.Fields(clean), " ")
	if clean == "" {
		return ""
	}

	words := strings.Fields(clean)
	filtered := make([]string, 0, len(words))
	for _, word := range words {
		if isGenericImageWord(word) {
			continue
		}
		filtered = append(filtered, word)
	}
	if len(filtered) == 0 {
		filtered = words
	}
	if len(filtered) > 6 {
		filtered = filtered[:6]
	}
	return strings.Join(filtered, " ")
}

func isGenericImageWord(word string) bool {
	switch word {
	case "presentation", "presentations", "slide", "slides", "section", "summary", "takeaway", "takeaways", "overview", "intro", "introduction", "lecture", "project", "content", "point", "points", "final", "key":
		return true
	default:
		return false
	}
}

func buildSlideImageQueryCandidates(slide models.PresentationSlide, primaryTopic string, isTitle bool) []string {
	slideType := strings.ToLower(strings.TrimSpace(slide.Type))
	if slideType == "stats" || slideType == "two_column" || slideType == "summary" {
		return nil
	}

	candidates := make([]string, 0, 8)
	seen := make(map[string]struct{}, 8)
	addNormalized := func(query string) {
		query = normalizeImageQuery(query)
		if query == "" {
			return
		}
		if _, exists := seen[query]; exists {
			return
		}
		seen[query] = struct{}{}
		candidates = append(candidates, query)
	}
	addSanitized := func(query string) {
		if strings.TrimSpace(query) == "" {
			return
		}
		addNormalized(sanitizeImageQuery(query))
	}

	rawImageQuery := pointerStringValue(slide.ImageQuery)
	if rawImageQuery != "" {
		sanitized := sanitizeImageQuery(rawImageQuery)
		addNormalized(sanitized)
		if normalizeImageQuery(sanitized) != normalizeImageQuery(rawImageQuery) {
			addNormalized(rawImageQuery)
		}
	}

	if primaryTopic != "" {
		if isTitle {
			addSanitized(primaryTopic + " cinematic poster")
			addSanitized(primaryTopic + " character portrait")
			addSanitized(primaryTopic + " movie scene")
		} else {
			addSanitized(primaryTopic + " " + slide.Title)
			addSanitized(primaryTopic + " " + firstNWords(strings.Join(slide.Bullets, " "), 4))
		}
	}
	addSanitized(slide.Title)
	addSanitized(pointerStringValue(slide.Subtitle))
	addSanitized(firstNWords(strings.Join(slide.Bullets, " "), 6))

	if isTitle && len(candidates) == 0 {
		addSanitized("presentation hero background")
	}

	return candidates
}

func firstNWords(text string, n int) string {
	words := strings.Fields(strings.TrimSpace(text))
	if len(words) == 0 {
		return ""
	}
	if n <= 0 || len(words) <= n {
		return strings.Join(words, " ")
	}
	return strings.Join(words[:n], " ")
}

func derivePresentationTitle(slides []models.PresentationSlide) string {
	for _, slide := range slides {
		if strings.EqualFold(strings.TrimSpace(slide.Type), "title") && strings.TrimSpace(slide.Title) != "" {
			return strings.TrimSpace(slide.Title)
		}
	}
	for _, slide := range slides {
		if strings.TrimSpace(slide.Title) != "" {
			return strings.TrimSpace(slide.Title)
		}
	}
	return ""
}

func (s *GeminiService) attachPresentationImages(ctx context.Context, slides []models.PresentationSlide, transcript string) {
	if strings.TrimSpace(s.unsplashAccessKey) == "" || len(slides) == 0 {
		return
	}

	primaryTopic := detectPresentationPrimaryTopic(slides, transcript)
	titleIndex := findTitleSlideIndex(slides)

	var wg sync.WaitGroup
	var mu sync.Mutex
	var firstFoundImage string
	sem := make(chan struct{}, 5)

	for i := range slides {
		slideType := strings.ToLower(strings.TrimSpace(slides[i].Type))
		if slideType == "stats" || slideType == "two_column" || slideType == "summary" {
			slides[i].ImageURL = nil
			slides[i].ImageQuery = nil
			continue
		}

		candidates := buildSlideImageQueryCandidates(slides[i], primaryTopic, i == titleIndex)
		if len(candidates) == 0 {
			continue
		}

		wg.Add(1)
		sem <- struct{}{}
		go func(index int, candidateQueries []string, mustHaveImage bool) {
			defer wg.Done()
			defer func() { <-sem }()

			imageURL, usedQuery, err := s.fetchUnsplashImageFromCandidates(ctx, candidateQueries, mustHaveImage)
			if err != nil || imageURL == "" {
				if err != nil {
					log.Printf("unsplash lookup failed for slide %d queries %v: %v", index, candidateQueries, err)
				}
				return
			}

			mu.Lock()
			slides[index].ImageURL = &imageURL
			if strings.TrimSpace(pointerStringValue(slides[index].ImageQuery)) == "" && usedQuery != "" {
				slides[index].ImageQuery = stringPtr(usedQuery)
			}
			if firstFoundImage == "" {
				firstFoundImage = imageURL
			}
			mu.Unlock()
		}(i, candidates, i == titleIndex)
	}

	wg.Wait()

	if titleIndex >= 0 && slides[titleIndex].ImageURL == nil {
		if firstFoundImage != "" {
			slides[titleIndex].ImageURL = &firstFoundImage
			return
		}

		titleQuery := pointerStringValue(slides[titleIndex].ImageQuery)
		if titleQuery == "" {
			titleQuery = fallbackSlideImageQuery(strings.Join([]string{primaryTopic, slides[titleIndex].Title, pointerStringValue(slides[titleIndex].Subtitle)}, " "))
			if titleQuery == "" {
				titleQuery = "presentation hero background"
			}
			slides[titleIndex].ImageQuery = stringPtr(titleQuery)
		}

		fallbackURL := "https://source.unsplash.com/1600x900/?" + url.QueryEscape(titleQuery)
		slides[titleIndex].ImageURL = &fallbackURL
		log.Printf("title slide image fallback used with query %q", titleQuery)
	}
}

func (s *GeminiService) fetchUnsplashImageFromCandidates(ctx context.Context, candidates []string, requireImage bool) (string, string, error) {
	var lastErr error
	for _, query := range candidates {
		imageURL, err := s.fetchUnsplashImage(ctx, query)
		if err != nil {
			lastErr = err
			continue
		}
		if strings.TrimSpace(imageURL) != "" {
			return imageURL, query, nil
		}
	}

	if requireImage && len(candidates) > 0 {
		for _, query := range candidates[:min(2, len(candidates))] {
			imageURL, err := s.fetchUnsplashRandomImage(ctx, query)
			if err != nil {
				lastErr = err
				continue
			}
			if strings.TrimSpace(imageURL) != "" {
				return imageURL, query, nil
			}
		}
	}

	return "", "", lastErr
}

func (s *GeminiService) fetchUnsplashImage(ctx context.Context, imageQuery string) (string, error) {
	values := url.Values{}
	values.Set("query", imageQuery)
	values.Set("per_page", "1")
	values.Set("orientation", "landscape")

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.unsplash.com/search/photos?"+values.Encode(), nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Client-ID "+s.unsplashAccessKey)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("unsplash returned status %d", resp.StatusCode)
	}

	var payload struct {
		Results []struct {
			URLs struct {
				Regular string `json:"regular"`
			} `json:"urls"`
		} `json:"results"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return "", err
	}
	if len(payload.Results) == 0 {
		return "", nil
	}
	return strings.TrimSpace(payload.Results[0].URLs.Regular), nil
}

func (s *GeminiService) fetchUnsplashRandomImage(ctx context.Context, imageQuery string) (string, error) {
	values := url.Values{}
	values.Set("query", imageQuery)
	values.Set("orientation", "landscape")

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.unsplash.com/photos/random?"+values.Encode(), nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Client-ID "+s.unsplashAccessKey)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("unsplash random returned status %d", resp.StatusCode)
	}

	var payload struct {
		URLs struct {
			Regular string `json:"regular"`
		} `json:"urls"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return "", err
	}
	return strings.TrimSpace(payload.URLs.Regular), nil
}

func stringPtr(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func pointerStringValue(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func buildQuizPrompt(config models.GenerateQuizRequest, content string) string {
	var b strings.Builder

	b.WriteString("You are an expert educational assessor. Generate quiz questions based on the following content.\n\n")
	b.WriteString("CRITICAL: Return ONLY a valid JSON array. No preamble, no markdown, no backticks.\n\n")

	b.WriteString(fmt.Sprintf("Generate exactly %d questions.\n", config.NumQuestions))

	allowedTypes := make([]string, 0, 2)
	hasMC := false
	hasTF := false
	for _, qt := range config.QuestionTypes {
		switch strings.ToLower(strings.TrimSpace(qt)) {
		case "multiple_choice":
			if !hasMC {
				hasMC = true
				allowedTypes = append(allowedTypes, "multiple_choice")
			}
		case "true_false":
			if !hasTF {
				hasTF = true
				allowedTypes = append(allowedTypes, "true_false")
			}
		}
	}
	if len(allowedTypes) == 0 {
		allowedTypes = []string{"multiple_choice", "true_false"}
		hasMC = true
		hasTF = true
	}

	switch {
	case hasTF && !hasMC:
		b.WriteString("Question type rule: ALL questions MUST be type=\"true_false\".\n")
		b.WriteString("Do NOT output any multiple_choice question.\n")
	case hasMC && !hasTF:
		b.WriteString("Question type rule: ALL questions MUST be type=\"multiple_choice\".\n")
		b.WriteString("Do NOT output any true_false question.\n")
	default:
		b.WriteString("Question type rule: Use both multiple_choice and true_false questions with balanced distribution.\n")
	}

	b.WriteString(fmt.Sprintf("Difficulty: %s\n", config.Difficulty))

	switch config.Difficulty {
	case "easy":
		b.WriteString("Easy = direct recall from explicit statements in the source.\n")
		b.WriteString("Avoid multi-step inference, ambiguity, or trick wording.\n")
	case "medium":
		b.WriteString("Medium = basic application and comparison of concepts from the source.\n")
	case "hard":
		b.WriteString("Hard = deep analytical questions requiring synthesis across multiple parts of the content.\n")
		b.WriteString("Use nuanced distinctions, implications, edge cases, and strong distractors.\n")
	}
	b.WriteString("Set every item's difficulty field exactly to this requested difficulty value.\n")

	cleanTopics := make([]string, 0, len(config.Topics))
	for _, t := range config.Topics {
		t = strings.TrimSpace(t)
		if t != "" {
			cleanTopics = append(cleanTopics, t)
		}
	}
	if len(cleanTopics) > 0 {
		b.WriteString("Topic constraints: every question MUST target one of these topics and set the topic field accordingly.\n")
		b.WriteString("Allowed topics: " + strings.Join(cleanTopics, ", ") + "\n")
	}

	b.WriteString(`
JSON schema per question:
{"question": "string", "type": "multiple_choice"|"true_false", "options": ["string"], "correct_index": int, "explanation": "string", "hint": "string", "difficulty": "easy"|"medium"|"hard", "topic": "string"}

For multiple_choice: exactly 4 options. For true_false: exactly 2 options ["True", "False"].
For true_false: correct_index must be 0 or 1.
`)

	b.WriteString("\n---CONTENT---\n")
	b.WriteString(content)
	b.WriteString("\n---END---\n")

	return b.String()
}

func buildFlashcardPrompt(config models.GenerateFlashcardsRequest, content string) string {
	var b strings.Builder

	b.WriteString("You are an expert flashcard creator. Generate high-quality flashcards from the content below.\n\n")
	b.WriteString("CRITICAL: Return ONLY a valid JSON array. No preamble, no markdown, no backticks.\n\n")
	b.WriteString(fmt.Sprintf("Generate exactly %d flashcards.\n\n", config.NumCards))

	strategy := strings.ToLower(strings.TrimSpace(config.Strategy))
	switch strategy {
	case "definitions":
		strategy = "term_definition"
	case "qa":
		strategy = "question_answer"
	case "":
		strategy = "term_definition"
	}

	switch strategy {
	case "term_definition":
		b.WriteString("Strategy: Front = term or concept. Back = clear definition.\n")
	case "question_answer":
		b.WriteString("Strategy: Front = question. Back = concise answer.\n")
	default:
		b.WriteString("Strategy: Mix term/definition and question/answer cards.\n")
	}

	cleanTopics := make([]string, 0, len(config.Topics))
	for _, t := range config.Topics {
		t = strings.TrimSpace(t)
		if t != "" {
			cleanTopics = append(cleanTopics, t)
		}
	}
	if len(cleanTopics) > 0 {
		b.WriteString("Topic constraints: every card topic MUST be one of these topics.\n")
		b.WriteString("Allowed topics: " + strings.Join(cleanTopics, ", ") + "\n")
	}

	if config.IncludeMnemonics {
		b.WriteString("Mnemonic rule: Generate a genuine memory anchor using association, imagery, or wordplay.\n")
		b.WriteString("WRONG: \"WITB — acronym of the question\"\n")
		b.WriteString("RIGHT: \"Think of the Cerebellum as the brain's GPS — it doesn't decide where to go, it smooths the route\"\n")
		b.WriteString("Mnemonics must create a memorable mental image or story, not just abbreviate the term.\n")
	} else {
		b.WriteString("Mnemonic setting: set mnemonic to null for all cards.\n")
	}

	if config.IncludeExamples {
		b.WriteString("Examples setting: include concise contextual examples when useful.\n")
	} else {
		b.WriteString("Examples setting: set example to null for all cards.\n")
	}

	b.WriteString(`
Rules:
- Front must be under 15 words (question or term, never a statement)
- Back must be under 60 words and self-contained
- No two cards may test the same concept
- Vary card types

JSON schema per card:
{"front": "string", "back": "string", "difficulty": 1|2|3, "mnemonic": "string|null", "example": "string|null", "topic": "string"}
`)

	b.WriteString("\n---CONTENT---\n")
	b.WriteString(content)
	b.WriteString("\n---END---\n")

	return b.String()
}

func validateFlashcardCards(cards []models.FlashcardCard, config models.GenerateFlashcardsRequest) []models.FlashcardCard {
	strategy := strings.ToLower(strings.TrimSpace(config.Strategy))
	if strategy == "definitions" {
		strategy = "term_definition"
	}
	if strategy == "qa" {
		strategy = "question_answer"
	}

	allowedTopics := make([]string, 0, len(config.Topics))
	topicLookup := map[string]string{}
	for _, t := range config.Topics {
		trimmed := strings.TrimSpace(t)
		if trimmed == "" {
			continue
		}
		lower := strings.ToLower(trimmed)
		if _, ok := topicLookup[lower]; !ok {
			topicLookup[lower] = trimmed
			allowedTopics = append(allowedTopics, trimmed)
		}
	}
	topicIdx := 0

	limit := config.NumCards
	if limit <= 0 {
		limit = len(cards)
	}

	valid := make([]models.FlashcardCard, 0, limit)
	for _, c := range cards {
		if len(valid) >= limit {
			break
		}

		c.Front = strings.TrimSpace(c.Front)
		c.Back = strings.TrimSpace(c.Back)
		if c.Front == "" || c.Back == "" {
			continue
		}

		if c.Difficulty < 1 || c.Difficulty > 3 {
			c.Difficulty = 2
		}

		if strategy == "question_answer" && !strings.HasSuffix(c.Front, "?") {
			c.Front = strings.TrimSpace(c.Front) + "?"
		}
		if strategy == "term_definition" && strings.HasSuffix(strings.TrimSpace(c.Front), "?") {
			c.Front = strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(c.Front), "?"))
		}

		c.Mnemonic = normalizeOptionalText(c.Mnemonic)
		c.Example = normalizeOptionalText(c.Example)

		if !config.IncludeMnemonics {
			c.Mnemonic = nil
		} else if c.Mnemonic == nil {
			c.Mnemonic = buildMnemonicFallback(c.Front)
		}
		if !config.IncludeExamples {
			c.Example = nil
		} else if c.Example == nil {
			c.Example = buildExampleFallback(c.Front, c.Back)
		}

		if len(allowedTopics) > 0 {
			topic := strings.TrimSpace(c.Topic)
			if canonical, ok := topicLookup[strings.ToLower(topic)]; ok {
				c.Topic = canonical
			} else {
				c.Topic = allowedTopics[topicIdx%len(allowedTopics)]
				topicIdx++
			}
		} else if strings.TrimSpace(c.Topic) == "" {
			c.Topic = "General"
		}

		valid = append(valid, c)
	}

	return valid
}

func normalizeOptionalText(value *string) *string {
	if value == nil {
		return nil
	}

	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}

	return &trimmed
}

func buildMnemonicFallback(front string) *string {
	// Acronym-based mnemonics are explicitly forbidden by the flashcard prompt rules.
	// Returning nil is correct — no mnemonic is better than a fake one.
	// If Gemini returned null for a mnemonic, respect that and omit it.
	_ = front // parameter retained for signature compatibility
	return nil
}

func buildExampleFallback(front, back string) *string {
	// Template-based examples restate card content without contextual application.
	// Returning nil is correct — no example is better than a mechanical filler string.
	// If Gemini returned null for an example, respect that and omit it.
	_ = front // parameters retained for signature compatibility
	_ = back
	return nil
}

func validateQuizQuestions(questions []models.QuizQuestion, config models.GenerateQuizRequest) []models.QuizQuestion {
	targetDifficulty := strings.ToLower(strings.TrimSpace(config.Difficulty))
	if targetDifficulty != "easy" && targetDifficulty != "medium" && targetDifficulty != "hard" {
		targetDifficulty = "medium"
	}

	allowedTypes := map[string]bool{}
	for _, qt := range config.QuestionTypes {
		n := normalizeQuestionType(qt)
		if n != "" {
			allowedTypes[n] = true
		}
	}
	if len(allowedTypes) == 0 {
		allowedTypes["multiple_choice"] = true
		allowedTypes["true_false"] = true
	}

	originalTopics := make([]string, 0, len(config.Topics))
	topicLookup := map[string]string{}
	for _, t := range config.Topics {
		trimmed := strings.TrimSpace(t)
		if trimmed == "" {
			continue
		}
		lower := strings.ToLower(trimmed)
		if _, ok := topicLookup[lower]; !ok {
			topicLookup[lower] = trimmed
			originalTopics = append(originalTopics, trimmed)
		}
	}
	topicIdx := 0

	var valid []models.QuizQuestion
	limit := config.NumQuestions
	if limit <= 0 {
		limit = len(questions)
	}

	for _, q := range questions {
		if len(valid) >= limit {
			break
		}

		q.Question = strings.TrimSpace(q.Question)
		if q.Question == "" {
			continue
		}

		normalizedType := normalizeQuestionType(q.Type)
		if normalizedType == "" {
			if isTrueFalseOptions(q.Options) {
				normalizedType = "true_false"
			} else {
				normalizedType = "multiple_choice"
			}
		}

		if !allowedTypes[normalizedType] {
			continue
		}

		if normalizedType == "true_false" {
			if !isTrueFalseOptions(q.Options) {
				continue
			}

			if q.CorrectIndex < 0 || q.CorrectIndex >= len(q.Options) {
				q.CorrectIndex = 0
			}

			correctText := strings.TrimSpace(strings.ToLower(q.Options[q.CorrectIndex]))
			if correctText == "false" {
				q.CorrectIndex = 1
			} else {
				q.CorrectIndex = 0
			}
			q.Options = []string{"True", "False"}
		} else {
			if len(q.Options) < 4 {
				continue
			}
			if len(q.Options) > 4 {
				q.Options = q.Options[:4]
			}
			if q.CorrectIndex < 0 || q.CorrectIndex >= len(q.Options) {
				q.CorrectIndex = 0
			}
		}

		q.Type = normalizedType
		q.Difficulty = targetDifficulty

		if len(originalTopics) > 0 {
			topic := strings.TrimSpace(q.Topic)
			if canonical, ok := topicLookup[strings.ToLower(topic)]; ok {
				q.Topic = canonical
			} else {
				q.Topic = originalTopics[topicIdx%len(originalTopics)]
				topicIdx++
			}
		}

		valid = append(valid, q)
	}
	return valid
}

func normalizeQuestionType(v string) string {
	v = strings.ToLower(strings.TrimSpace(v))
	switch v {
	case "multiple_choice", "multiple-choice", "mcq", "multiplechoice":
		return "multiple_choice"
	case "true_false", "true-false", "truefalse", "boolean":
		return "true_false"
	default:
		return ""
	}
}

func isTrueFalseOptions(options []string) bool {
	if len(options) != 2 {
		return false
	}
	a := strings.TrimSpace(strings.ToLower(options[0]))
	b := strings.TrimSpace(strings.ToLower(options[1]))
	return (a == "true" && b == "false") || (a == "false" && b == "true")
}

// ChatWithSummary sends a user question to Gemini with summary content as context.
func (s *GeminiService) ChatWithSummary(ctx context.Context, summaryContent, userMessage string, history []models.ChatMessage) (string, error) {
	if err := s.acquireRate(ctx); err != nil {
		return "", err
	}
	defer s.releaseRate()

	// Create a chat-specific model instance with a system instruction
	chatModel := s.client.GenerativeModel("gemini-3-flash-preview")
	chatModel.SetTemperature(0.4)
	chatModel.SetTopP(0.95)

	// Truncate summary if very long to stay within token limits
	maxContext := 30000
	contextText := summaryContent
	if len(contextText) > maxContext {
		contextText = contextText[:maxContext] + "\n\n[...content truncated for length]"
	}

	chatModel.SystemInstruction = &genai.Content{
		Parts: []genai.Part{
			genai.Text(fmt.Sprintf(`You are an expert tutor helping a student explore a topic in depth. The student has been studying the following summary and wants to understand it better.

Your role:
- Use the summary as your primary foundation and reference point
- For analytical, comparative, or application questions that go beyond the summary, draw on your broader knowledge to give a thoughtful answer
- Always connect your answer back to concepts mentioned in the summary when relevant
- Be intellectually engaging — encourage deeper thinking
- Keep answers concise — 3 to 5 sentences maximum
- Respond in plain conversational text only. No markdown formatting, no bullet points, no headers, no bold text
- Write naturally as if explaining to a curious student
- If a question is completely unrelated to the summary topic, gently redirect back to the subject

SUMMARY CONTENT:
%s`, contextText)),
		},
	}

	// Build chat session with history
	chat := chatModel.StartChat()

	// Replay conversation history
	for _, msg := range history {
		role := "user"
		if msg.Role == "assistant" {
			role = "model"
		}
		chat.History = append(chat.History, &genai.Content{
			Role:  role,
			Parts: []genai.Part{genai.Text(msg.Content)},
		})
	}

	// Send the new message
	resp, err := chat.SendMessage(ctx, genai.Text(userMessage))
	if err != nil {
		return "", fmt.Errorf("Gemini chat error: %w", err)
	}

	reply := strings.TrimSpace(extractText(resp))
	if reply == "" {
		return "I couldn't generate a response. Please try rephrasing your question.", nil
	}

	return reply, nil
}
