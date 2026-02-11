package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

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

	model := client.GenerativeModel("gemini-3-flash-preview")
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

	// Build layered prompt
	prompt := buildSummaryPrompt(config.Format, config.Length, config.FocusAreas,
		config.TargetAudience, config.Language, transcript)

	// Publish status update
	s.PublishUpdate(ctx, job.UserID, models.WSMessage{
		Type: "status_update",
		Payload: models.StatusUpdate{
			JobID: job.ID, Step: 3, StepName: "Generating Summary",
			EstimatedSecondsRemaining: 30,
		},
	})

	// Call Gemini
	resp, err := s.model.GenerateContent(ctx, genai.Text(prompt))
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
	if rawText == "" {
		log.Println("WARNING: Gemini returned empty text. Using fallback.")
		rawText = "We could not generate a summary for this content. The transcript was likely unavailable or the content was blocked by safety filters."
	}

	// Parse Cornell if applicable
	var cues, notes, summaryText *string
	if config.Format == "cornell" {
		c, n, st := parseCornell(rawText)
		if c == "" || n == "" || st == "" {
			// Follow-up call to restructure
			restructurePrompt := "Restructure this text into Cornell Method format with clear [CUES], [NOTES], and [SUMMARY] sections. Return plain text only. Do NOT use markdown tables, pipes (|), or HTML:\n\n" + rawText
			resp2, err := s.model.GenerateContent(ctx, genai.Text(restructurePrompt))
			if err == nil {
				rawText2 := extractText(resp2)
				c, n, st = parseCornell(rawText2)
			}
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

	// Count words
	wordCount := len(strings.Fields(rawText))

	// Generate metadata (second Gemini call)
	s.PublishUpdate(ctx, job.UserID, models.WSMessage{
		Type: "status_update",
		Payload: models.StatusUpdate{
			JobID: job.ID, Step: 4, StepName: "Formatting",
			EstimatedSecondsRemaining: 5,
		},
	})

	metaPrompt := fmt.Sprintf(`Given this summary, return ONLY a valid JSON object with these fields:
{"suggested_title": "title under 60 chars", "tags": ["tag1","tag2","tag3","tag4","tag5"], "one_sentence_description": "description under 120 chars"}

Summary:
%s`, rawText[:min(len(rawText), 2000)])

	tags := []string{}
	var description *string
	title := "Untitled Summary"

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
				title = meta.Title
			}
			if len(meta.Tags) > 0 {
				tags = meta.Tags
			}
			if meta.Description != "" {
				description = &meta.Description
			}
		}
	}

	// Update summary in database
	err = s.summaryRepo.UpdateContent(ctx, job.ReferenceID, rawText, cues, notes, summaryText, tags, description, wordCount)
	if err != nil {
		return err
	}

	// Update title
	summary, _ := s.summaryRepo.GetByID(ctx, job.ReferenceID)
	if summary != nil && summary.Title == "" {
		summary.Title = title
		summary.Tags = tags
		summary.Description = description
		s.summaryRepo.Update(ctx, summary)
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

	// Validate
	validQuestions := validateQuizQuestions(questions)
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

	return s.flashRepo.CreateCards(ctx, job.ReferenceID, modelCards)
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

	cuesIdx := strings.Index(upper, "[CUES]")
	notesIdx := strings.Index(upper, "[NOTES]")
	summaryIdx := strings.Index(upper, "[SUMMARY]")

	if cuesIdx >= 0 && notesIdx > cuesIdx {
		cues = strings.TrimSpace(text[cuesIdx+6 : notesIdx])
	}
	if notesIdx >= 0 && summaryIdx > notesIdx {
		notes = strings.TrimSpace(text[notesIdx+7 : summaryIdx])
	}
	if summaryIdx >= 0 {
		summary = strings.TrimSpace(text[summaryIdx+9:])
	}

	return
}

func buildSummaryPrompt(format, length string, focusAreas []string, audience, language, transcript string) string {
	var b strings.Builder

	// Layer 1 — Role
	b.WriteString("You are an expert educational content analyst. Your task is to create a structured summary of the following lecture transcript.\n\n")

	// Layer 2 — Format
	switch format {
	case "cornell":
		b.WriteString("Format: Use the Cornell Method. Provide three clearly labeled sections with these exact headers and order:\n[CUES]\n[NOTES]\n[SUMMARY]\n")
		b.WriteString("Output rules for Cornell: plain text only; DO NOT use markdown tables; DO NOT use pipes (|); DO NOT use HTML tags; keep CUES as short prompt lines and NOTES as readable bullet paragraphs.\n\n")
	case "bullets":
		b.WriteString("Format: Use structured bullet points with hierarchical numbering and sub-bullets.\n\n")
	case "paragraph":
		b.WriteString("Format: Write in flowing academic prose with clear subheadings.\n\n")
	}

	// Layer 3 — Length
	sourceWords := len(strings.Fields(transcript))
	var targetPercent int
	switch length {
	case "concise":
		targetPercent = 15
	case "standard":
		targetPercent = 25
	case "detailed":
		targetPercent = 40
	case "comprehensive":
		targetPercent = 55
	default:
		targetPercent = 25
	}
	targetWords := sourceWords * targetPercent / 100
	b.WriteString(fmt.Sprintf("Length: The output must be approximately %d words (%d%% of the %d word source).\n\n", targetWords, targetPercent, sourceWords))

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

func buildQuizPrompt(config models.GenerateQuizRequest, content string) string {
	var b strings.Builder

	b.WriteString("You are an expert educational assessor. Generate quiz questions based on the following content.\n\n")
	b.WriteString("CRITICAL: Return ONLY a valid JSON array. No preamble, no markdown, no backticks.\n\n")

	b.WriteString(fmt.Sprintf("Generate exactly %d questions.\n", config.NumQuestions))

	if len(config.QuestionTypes) > 0 {
		mcCount := config.NumQuestions * 7 / 10
		tfCount := config.NumQuestions - mcCount
		for _, qt := range config.QuestionTypes {
			if qt == "true_false" {
				b.WriteString(fmt.Sprintf("Include %d true/false questions and %d multiple choice questions.\n", tfCount, mcCount))
				break
			}
		}
	}

	b.WriteString(fmt.Sprintf("Difficulty: %s\n", config.Difficulty))

	switch config.Difficulty {
	case "easy":
		b.WriteString("Easy = direct recall from text.\n")
	case "medium":
		b.WriteString("Medium = application of concepts.\n")
	case "hard":
		b.WriteString("Hard = analysis, synthesis, or inference beyond what is explicitly stated.\n")
	}

	b.WriteString(`
JSON schema per question:
{"question": "string", "type": "multiple_choice"|"true_false", "options": ["string"], "correct_index": int, "explanation": "string", "hint": "string", "difficulty": "easy"|"medium"|"hard", "topic": "string"}

For multiple_choice: exactly 4 options. For true_false: exactly 2 options ["True", "False"].
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

	switch config.Strategy {
	case "term_definition":
		b.WriteString("Strategy: Front = term or concept. Back = clear definition.\n")
	case "question_answer":
		b.WriteString("Strategy: Front = question. Back = concise answer.\n")
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

func validateQuizQuestions(questions []models.QuizQuestion) []models.QuizQuestion {
	var valid []models.QuizQuestion
	for _, q := range questions {
		if q.Question == "" || len(q.Options) == 0 {
			continue
		}
		if q.CorrectIndex < 0 || q.CorrectIndex >= len(q.Options) {
			q.CorrectIndex = 0
		}
		if q.Type == "true_false" && len(q.Options) != 2 {
			q.Options = []string{"True", "False"}
		}
		valid = append(valid, q)
	}
	return valid
}
