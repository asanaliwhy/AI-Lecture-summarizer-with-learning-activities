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

	if config.Format == "smart" && !containsMarkdownTable(rawText) {
		restructurePrompt := "Rewrite this Smart Summary in clean Markdown. Preserve all key information, preserve source terminology, and include at least one markdown table with 2+ columns and 3+ data rows. If entities are not obvious, create a table with columns: Concept | Explanation. In the section 'Additional Interesting Facts', output 3-6 markdown bullet points (each line must start with '- '). Do NOT invent new coined terms that are not present in the source transcript. If a claim is uncertain, say: Not explicitly stated in transcript. Return markdown only:\n\n" + rawText
		resp2, err := s.model.GenerateContent(ctx, genai.Text(restructurePrompt))
		if err == nil {
			rawText2 := extractText(resp2)
			if strings.TrimSpace(rawText2) != "" {
				rawText = rawText2
			}
		}

		if !containsMarkdownTable(rawText) {
			rawText = ensureSmartSummaryTable(rawText)
		}
	}

	if config.Format == "smart" {
		if refined := s.rewriteSmartSummaryForFidelity(ctx, rawText, transcript); strings.TrimSpace(refined) != "" {
			rawText = refined
		}
		rawText = normalizeSmartLabels(rawText)
		rawText = removeWeakExampleLines(rawText)
		rawText = pruneSmartRedundantSections(rawText)
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

func ensureSmartSummaryTable(text string) string {
	normalized := strings.ReplaceAll(text, "\r\n", "\n")
	if containsMarkdownTable(normalized) {
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
	b.WriteString("\n\n## Summary Table\n")
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
			strings.Contains(lower, "additional interesting facts") ||
			strings.Contains(lower, "conclusions") ||
			strings.Contains(lower, "summary highlights")
	}

	isForbiddenHeader := func(line string) bool {
		trimmed := strings.TrimSpace(strings.TrimPrefix(line, "#"))
		trimmed = strings.TrimSpace(strings.TrimPrefix(trimmed, "-"))
		lower := strings.ToLower(trimmed)
		return strings.Contains(lower, "conclusions") || strings.Contains(lower, "summary highlights")
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
6) Keep brain-part descriptions ONLY in "Brain Structure and Functions" table; avoid repeating those details in Key Insights.
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
	case "smart":
		b.WriteString("Format: Create a Smart Summary in Markdown with clear section headings and concise high-value synthesis.\n")
		b.WriteString("Required sections (in this order):\n")
		b.WriteString("1) Summary of Video Content\n2) Key Insights and Core Concepts\n3) Brain Structure and Functions (markdown table)\n4) Additional Interesting Facts\n\n")
		b.WriteString("Output rules for Smart Summary: Use markdown headings and bullets. ALWAYS include at least one markdown table with at least 2 columns and 3 data rows. If the transcript has no obvious entities, create a table with columns: Concept | Explanation. Keep statements factual and avoid unsupported claims.\n")
		b.WriteString("Terminology fidelity rules: reuse exact source terms from the transcript whenever possible (prefer direct phrasing over paraphrased/neologism terms). Do NOT invent renamed concepts.\n")
		b.WriteString("Anti-redundancy rules: each fact appears once in the most appropriate section. Do NOT repeat the same fact across Summary, Insights, Table, and Facts.\n")
		b.WriteString("Section-specific rules:\n")
		b.WriteString("- Summary of Video Content: one concise narrative paragraph only.\n")
		b.WriteString("- Key Insights and Core Concepts: 3-5 deeper insights (implications/connections), not dictionary-like repetition.\n")
		b.WriteString("  Format each insight as a mini-paragraph with a bold concept header, e.g. '**Key Concept: Neuro-Computational Superiority**' followed by 1-2 explanatory sentences.\n")
		b.WriteString("  Do NOT output repetitive 'Definition' lines for every item.\n")
		b.WriteString("  Include 'Example:' ONLY if explicitly present in transcript; otherwise omit the Example line entirely.\n")
		b.WriteString("- Brain Structure and Functions: this is the ONLY place for brain-part functional descriptions.\n")
		b.WriteString("- Additional Interesting Facts: output ONLY as a markdown bullet list (3-6 bullets, each line starts with '- '). Include only non-duplicated noteworthy facts, with numbers/evidence when present; avoid trivial or playful statements.\n")
		b.WriteString("Forbidden sections: DO NOT output 'Conclusions' or 'Summary Highlights'.\n")
		b.WriteString("For section 'Key Insights and Core Concepts', keep concept names faithful to transcript terminology and avoid invented terms.\n")
		b.WriteString("If transcript evidence is weak, explicitly mark uncertainty instead of fabricating details.\n")
		b.WriteString("Markdown structure rule for Additional Interesting Facts: this section MUST be a markdown unordered list ('- item'). Do NOT write it as a paragraph.\n\n")
	}

	// Layer 3 — Length (strict bands)
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

	targetWords := sourceWords * targetPercent / 100
	if targetWords < minWords {
		targetWords = minWords
	}
	if targetWords > maxWords {
		targetWords = maxWords
	}

	b.WriteString(fmt.Sprintf("Length preset: %s.\n", lengthLabel))
	b.WriteString(fmt.Sprintf("Output MUST be between %d and %d words.\n", minWords, maxWords))
	b.WriteString(fmt.Sprintf("Target about %d words (%d%% of %d source words, clamped to preset range).\n", targetWords, targetPercent, sourceWords))
	b.WriteString("Do not output less than the minimum or more than the maximum for this preset.\n\n")

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
		b.WriteString("Mnemonic setting: include a mnemonic on most cards when useful.\n")
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

		if !config.IncludeMnemonics {
			c.Mnemonic = nil
		}
		if !config.IncludeExamples {
			c.Example = nil
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
