package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
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
	client      *genai.Client
	model       *genai.GenerativeModel
	summaryRepo *repository.SummaryRepo
	quizRepo    *repository.QuizRepo
	flashRepo   *repository.FlashcardRepo
	jobRepo     *repository.JobRepo
	redis       *redis.Client
	rateChan    chan struct{} // Token bucket
}

func NewGeminiService(
	apiKey string,
	concurrentReqs int,
	summaryRepo *repository.SummaryRepo,
	quizRepo *repository.QuizRepo,
	flashRepo *repository.FlashcardRepo,
	jobRepo *repository.JobRepo,
	redisClient *redis.Client,
) (*GeminiService, error) {
	ctx := context.Background()
	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		return nil, fmt.Errorf("failed to create Gemini client: %w", err)
	}

	model := client.GenerativeModel("gemini-2.5-flash")
	model.SetTemperature(0.3)
	model.SetTopP(0.95)

	// Token bucket for rate limiting
	rateChan := make(chan struct{}, concurrentReqs)
	for i := 0; i < concurrentReqs; i++ {
		rateChan <- struct{}{}
	}

	return &GeminiService{
		client:      client,
		model:       model,
		summaryRepo: summaryRepo,
		quizRepo:    quizRepo,
		flashRepo:   flashRepo,
		jobRepo:     jobRepo,
		redis:       redisClient,
		rateChan:    rateChan,
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
	case <-time.After(5 * time.Minute):
		return fmt.Errorf("timeout waiting for Gemini rate slot")
	}
}

func (s *GeminiService) releaseRate() {
	s.rateChan <- struct{}{}
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
		metadataModel := s.client.GenerativeModel("gemini-2.5-flash")
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
	resp, err := summaryModel.GenerateContent(ctx, genai.Text(prompt))
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
		resp2, err := summaryModel.GenerateContent(ctx, genai.Text(restructurePrompt))
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

	metaCh := make(chan metaResult, 1)
	go func() {
		result := metaResult{
			title:       "Untitled Summary",
			tags:        []string{},
			description: nil,
		}

		metaPrompt := fmt.Sprintf(`Given this summary, return ONLY a valid JSON object with these fields:
{"suggested_title": "title under 60 chars", "tags": ["tag1","tag2","tag3","tag4","tag5"], "one_sentence_description": "description under 120 chars"}

Rules:
- suggested_title: concise, specific, reflects the main topic of the ENTIRE summary
- tags: cover the full range of topics across ALL sections, not just the opening
- one_sentence_description: summarizes the complete content in plain language

Summary:
%s`, rawText[:min(len(rawText), 6000)])

		metaResp, err := s.model.GenerateContent(ctx, genai.Text(metaPrompt))
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
			}
		}

		metaCh <- result
	}()

	// Count words while metadata call runs concurrently
	wordCount := len(strings.Fields(rawText))

	metaData := <-metaCh
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
		tags,
		description,
		wordCount,
		isQualityFallback,
		qualityFallbackReason,
	)
	if err != nil {
		return err
	}

	// Update title
	if title != "" {
		s.summaryRepo.UpdateTitle(ctx, job.ReferenceID, title)
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

	resp, err := s.model.GenerateContent(ctx, genai.Text(prompt))
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

	return s.quizRepo.UpdateQuestions(ctx, job.ReferenceID, questionsJSON, len(validQuestions))
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

	resp, err := s.model.GenerateContent(ctx, genai.Text(prompt))
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

	return s.flashRepo.CreateCards(ctx, job.ReferenceID, validCards)
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
			rebuilt := make([]string, 0, len(lines)+1)
			rebuilt = append(rebuilt, lines[:start+1]...)
			rebuilt = append(rebuilt, "")
			rebuilt = append(rebuilt, sectionLines...)
			if end < len(lines) {
				rebuilt = append(rebuilt, lines[end:]...)
			}

			cleaned := strings.Join(rebuilt, "\n")
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

	rebuilt := make([]string, 0, len(lines)+len(bullets))
	rebuilt = append(rebuilt, lines[:start+1]...)
	rebuilt = append(rebuilt, "")
	rebuilt = append(rebuilt, bullets...)
	if end < len(lines) {
		rebuilt = append(rebuilt, "")
		rebuilt = append(rebuilt, lines[end:]...)
	}

	cleaned := strings.Join(rebuilt, "\n")
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

		// Trim redundant overview bullets after wrapper headings.
		lt := strings.ToLower(strings.TrimSpace(content))
		if strings.HasPrefix(lt, "overview of ") {
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

	out := make([]string, 0, len(lines))
	skip := false
	for _, line := range lines {
		if isForbiddenHeader(line) {
			skip = true
			continue
		}
		if skip && isHeader(line) {
			skip = false
		}
		if skip {
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
		b.WriteString("Cue formatting rule: Each cue MUST be a specific retrieval question, not a topic label.\n")
		b.WriteString("WRONG: \"Cerebrum's role?\"\n")
		b.WriteString("RIGHT: \"What percentage of brain mass does the cerebrum occupy?\"\n")
		b.WriteString("Additional cue rules: people cues must target one action/date/policy/decision; not broad traits. WRONG: 'What characterized Khrushchev's leadership?' RIGHT: 'What provocative structure did Khrushchev build in 1961 to stop East German defections?' Each cue must have one specific answer; split multi-aspect topics into separate cues.\n")
		b.WriteString("Notes alignment rule: each NOTES bullet must directly answer its matching CUE; first sentence answers immediately; do not broaden scope. WRONG: Cue asks 'How did Cold War extend to Asia?' but note is generic domino-theory policy. RIGHT: Cue asks that and note states China's 1949 revolution plus Korean War (1950-1953) brought Cold War conflict to Asia.\n")
		b.WriteString("Cues should function as self-quiz questions a student could test themselves with.\n")
		b.WriteString("The Summary section must synthesize — do not paraphrase the Notes section. Write the Summary as if explaining to someone who has not read the Notes.\n\n")
	case "bullets":
		b.WriteString("Format: Use structured bullet points with clear headings and concise bullets.\n")
		b.WriteString("Bullets output rules:\n")
		b.WriteString("1) Required section flow (exact order): Overview -> Core Structures -> Interesting Facts.\n")
		b.WriteString("2) Do NOT include redundant wrapper titles like 'Executive Summary:' and do NOT repeat section headings (e.g., 'Overview' twice).\n")
		b.WriteString("3) Keep wording plain and concrete; avoid unnecessarily academic jargon when simpler wording is possible.\n")
		b.WriteString("4) For each major item in Core Structures (e.g., a brain part), use a consistent micro-structure in this order:\n")
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
		b.WriteString("3) [Topic-Appropriate Table] — a markdown table (2+ columns, 3+ data rows) covering the main entities/concepts from the content. Name this section based on the actual topic (e.g. 'Brain Structure and Functions', 'Key Historical Events', 'Algorithm Comparison').\n")
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
		b.WriteString("  CRITICAL: Always put a space after the colon in 'Key Concept: Title'. Always put the explanation on a SEPARATE line (not on the same line as the title).\n")
		b.WriteString("  Do NOT output repetitive 'Definition' lines for every item.\n")
		b.WriteString("  Include 'Example:' ONLY if explicitly present in transcript; otherwise omit the Example line entirely.\n")
		if metadataOnlyMode {
			b.WriteString("  CRITICAL: In metadata-only mode, this section must contain exactly one line: 'Key Insights cannot be generated from metadata alone. Please provide a video with an available transcript.'\n")
		}
		b.WriteString("- Table section: use a topic-appropriate title; this is the ONLY place for entity/concept descriptions in table form.\n")
		b.WriteString("  The table MUST be a proper markdown table with header, separator, and at least 3 data rows.\n")
		b.WriteString("  CRITICAL: Every table cell MUST contain actual content. Never use dashes (---), empty strings, or placeholder text in data cells. If information is unknown, write 'Not specified' instead.\n")
		b.WriteString("  The separator row (| --- | --- |) MUST appear exactly once, immediately after the header row, before any data rows. It must NEVER appear as a data row.\n")
		b.WriteString("  Example of correct table format:\n")
		b.WriteString("  | Brain Part | Primary Function | Key Characteristics |\n  | --- | --- | --- |\n  | Cerebrum | Thinking and learning | Largest part and supports conscious processing |\n  | Cerebellum | Balance and motor coordination | Fine-tunes movement and posture |\n  | Brain Stem | Involuntary regulation | Links brain to spinal cord and controls breathing |\n")
		b.WriteString("  Before outputting the table, verify: (1) separator row exists after header, (2) every data cell has real content, (3) all rows have the same number of columns.\n\n")
		b.WriteString("- Additional Interesting Facts: output ONLY as a markdown bullet list (3-6 bullets, each line starts with '- '). Include only non-duplicated noteworthy facts, with numbers/evidence when present; avoid trivial or playful statements.\n")
		if metadataOnlyMode {
			b.WriteString("  Only include facts directly stated in the metadata. Do not speculate about content, themes, or implications.\n")
		}
		b.WriteString("Forbidden sections: DO NOT output 'Conclusions', 'Summary Highlights', or 'Summary Table'.\n")
		b.WriteString("For section 'Key Insights and Core Concepts', keep concept names faithful to transcript terminology and avoid invented terms.\n")
		b.WriteString("If transcript evidence is weak, explicitly mark uncertainty instead of fabricating details.\n")
		b.WriteString("Markdown structure rule for Additional Interesting Facts: this section MUST be a markdown unordered list ('- item'). Do NOT write it as a paragraph.\n\n")
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
	chatModel := s.client.GenerativeModel("gemini-2.5-flash")
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
			genai.Text(fmt.Sprintf(`You are a friendly study tutor helping a student understand their notes. Answer questions using ONLY the summary content provided below.

STRICT RULES:
1. Respond in plain conversational text only. No markdown formatting whatsoever.
2. Never use bullet points, dashes, asterisks, numbered lists, or any list formatting.
3. Never use headers, bold, italic, or code formatting.
4. Keep answers concise — 2 to 4 sentences maximum.
5. Write naturally, as if you are explaining something to a friend.
6. If the answer is not in the summary, say something like "That's not covered in this summary, but feel free to ask about something else!"
7. Combine related points into flowing sentences instead of listing them.

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
