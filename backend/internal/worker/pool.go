package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	urlpkg "net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"lectura-backend/internal/models"
	"lectura-backend/internal/repository"
	"lectura-backend/internal/services"
)

type Pool struct {
	redis       *redis.Client
	gemini      *services.GeminiService
	email       *services.EmailService
	userRepo    *repository.UserRepo
	youtube     *services.YouTubeService
	fileExtract *services.FileExtractService
	jobRepo     *repository.JobRepo
	contentRepo *repository.ContentRepo
	summaryRepo *repository.SummaryRepo
	quizRepo    *repository.QuizRepo
	flashRepo   *repository.FlashcardRepo
	storagePath string
	workerCount int
	stopChan    chan struct{}
}

func NewPool(
	redisClient *redis.Client,
	gemini *services.GeminiService,
	email *services.EmailService,
	userRepo *repository.UserRepo,
	youtube *services.YouTubeService,
	fileExtract *services.FileExtractService,
	jobRepo *repository.JobRepo,
	contentRepo *repository.ContentRepo,
	summaryRepo *repository.SummaryRepo,
	quizRepo *repository.QuizRepo,
	flashRepo *repository.FlashcardRepo,
	storagePath string,
	workerCount int,
) *Pool {
	return &Pool{
		redis:       redisClient,
		gemini:      gemini,
		email:       email,
		userRepo:    userRepo,
		youtube:     youtube,
		fileExtract: fileExtract,
		jobRepo:     jobRepo,
		contentRepo: contentRepo,
		summaryRepo: summaryRepo,
		quizRepo:    quizRepo,
		flashRepo:   flashRepo,
		storagePath: storagePath,
		workerCount: workerCount,
		stopChan:    make(chan struct{}),
	}
}

func (p *Pool) Start() {
	queues := []string{
		"queue:content-processing",
		"queue:summary-generation",
		"queue:quiz-generation",
		"queue:flashcard-generation",
	}

	for i := 0; i < p.workerCount; i++ {
		go p.worker(i, queues)
	}

	log.Printf("Started %d worker goroutines", p.workerCount)
}

func (p *Pool) Stop() {
	close(p.stopChan)
}

func (p *Pool) worker(id int, queues []string) {
	for {
		select {
		case <-p.stopChan:
			log.Printf("Worker %d shutting down", id)
			return
		default:
		}

		ctx := context.Background()

		// BLPOP with 30s timeout
		result, err := p.redis.BLPop(ctx, 30*time.Second, queues...).Result()
		if err != nil {
			continue // Timeout or error, retry
		}

		if len(result) < 2 {
			continue
		}

		// Parse job
		var job models.Job
		if err := json.Unmarshal([]byte(result[1]), &job); err != nil {
			log.Printf("Worker %d: failed to parse job: %v", id, err)
			continue
		}

		// Try to acquire lock
		lockKey := fmt.Sprintf("job_lock:%s", job.ID.String())
		locked, err := p.redis.SetNX(ctx, lockKey, "1", 10*time.Minute).Result()
		if err != nil || !locked {
			continue // Another worker has this job
		}

		log.Printf("Worker %d: processing job %s (type: %s)", id, job.ID, job.Type)

		// Update status
		p.jobRepo.UpdateStatus(ctx, job.ID, "processing")

		// Publish status update
		p.gemini.PublishUpdate(ctx, job.UserID, models.WSMessage{
			Type: "status_update",
			Payload: models.StatusUpdate{
				JobID:    job.ID,
				Step:     1,
				StepName: "Analyzing content",
			},
		})

		// Execute handler
		var processErr error
		switch job.Type {
		case "summary-generation":
			processErr = p.processSummary(ctx, &job)
		case "quiz-generation":
			processErr = p.processQuiz(ctx, &job)
		case "flashcard-generation":
			processErr = p.processFlashcard(ctx, &job)
		case "content-processing":
			processErr = p.processContent(ctx, &job)
		default:
			processErr = fmt.Errorf("unknown job type: %s", job.Type)
		}

		if processErr != nil {
			p.handleFailure(ctx, &job, processErr)
		} else {
			p.handleSuccess(ctx, &job)
		}

		// Release lock
		p.redis.Del(ctx, lockKey)
	}
}

func (p *Pool) processSummary(ctx context.Context, job *models.Job) error {
	// Get the content transcript
	summary, err := p.summaryRepo.GetByID(ctx, job.ReferenceID)
	if err != nil {
		return fmt.Errorf("failed to get summary: %w", err)
	}

	if summary.ContentID == nil {
		return fmt.Errorf("summary has no linked content")
	}

	content, err := p.contentRepo.GetByID(ctx, *summary.ContentID)
	if err != nil {
		return fmt.Errorf("failed to get content: %w", err)
	}

	if content.Type == "file" && (content.Transcript == nil || *content.Transcript == "") {
		if _, waitErr := p.waitForContentReady(ctx, content.ID, 60*time.Second); waitErr != nil {
			log.Printf("File transcript not ready for content %s, proceeding with fallback: %v", content.ID, waitErr)
		}

		refreshed, getErr := p.contentRepo.GetByID(ctx, content.ID)
		if getErr == nil {
			content = refreshed
		}
	}

	// If summary started before content-processing finished, fetch transcript directly here.
	if content.Type == "youtube" && (content.Transcript == nil || *content.Transcript == "") {
		if content.SourceURL == nil {
			return fmt.Errorf("youtube content has no source URL")
		}

		videoID := extractVideoID(*content.SourceURL)
		if videoID == "" {
			return fmt.Errorf("invalid YouTube URL: %s", *content.SourceURL)
		}

		p.gemini.PublishUpdate(ctx, job.UserID, models.WSMessage{
			Type: "status_update",
			Payload: models.StatusUpdate{
				JobID:    job.ID,
				Step:     2,
				StepName: "Extracting transcript from video",
			},
		})

		transcript, transcriptErr := p.youtube.GetTranscript(videoID)
		if transcriptErr != nil {
			// STT fallback for summary race path (when content-processing hasn't populated transcript)
			audioBytes, mimeType, audioErr := p.youtube.DownloadAudio(*content.SourceURL)
			if audioErr != nil {
				return fmt.Errorf("transcript extraction failed for video %s: %v; audio fallback download failed: %w", videoID, transcriptErr, audioErr)
			}

			transcribed, transcribeErr := p.gemini.TranscribeAudio(ctx, audioBytes, mimeType)
			if transcribeErr != nil {
				return fmt.Errorf("transcript extraction failed for video %s: %v; STT fallback transcription failed: %w", videoID, transcriptErr, transcribeErr)
			}

			transcript = transcribed
		}

		if updateErr := p.contentRepo.UpdateTranscript(ctx, content.ID, transcript); updateErr != nil {
			return fmt.Errorf("failed to save transcript: %w", updateErr)
		}

		content.Transcript = &transcript
	}

	transcript := ""
	if content.Transcript != nil && *content.Transcript != "" {
		transcript = *content.Transcript
	} else if content.Type == "file" || content.Type == "youtube" {
		transcript = buildMetadataFallbackTranscript(content)
	} else {
		return fmt.Errorf("cannot generate summary: transcript is not available")
	}

	return p.gemini.GenerateSummary(ctx, job, transcript)
}

func (p *Pool) waitForContentReady(ctx context.Context, contentID uuid.UUID, timeout time.Duration) (*models.Content, error) {
	deadline := time.Now().Add(timeout)

	for {
		content, err := p.contentRepo.GetByID(ctx, contentID)
		if err != nil {
			return nil, fmt.Errorf("failed to get content: %w", err)
		}

		if content.Transcript != nil && *content.Transcript != "" {
			return content, nil
		}

		if content.Status == "failed" {
			return nil, fmt.Errorf("content processing failed")
		}

		if content.Status == "completed" {
			if content.Transcript == nil || *content.Transcript == "" {
				return nil, fmt.Errorf("content completed without transcript")
			}
			return content, nil
		}

		if time.Now().After(deadline) {
			return nil, fmt.Errorf("content transcript not ready yet (status: %s)", content.Status)
		}

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(5 * time.Second):
		}
	}
}

func (p *Pool) processQuiz(ctx context.Context, job *models.Job) error {
	// Get the summary content for quiz generation
	var config struct {
		SummaryID uuid.UUID `json:"summary_id"`
	}
	json.Unmarshal(job.ConfigJSON, &config)

	summary, err := p.summaryRepo.GetByID(ctx, config.SummaryID)
	if err != nil {
		return fmt.Errorf("failed to get summary: %w", err)
	}

	content := ""
	if summary.ContentRaw != nil {
		content = *summary.ContentRaw
	}

	return p.gemini.GenerateQuiz(ctx, job, content)
}

func (p *Pool) processFlashcard(ctx context.Context, job *models.Job) error {
	var config struct {
		SummaryID uuid.UUID `json:"summary_id"`
	}
	json.Unmarshal(job.ConfigJSON, &config)

	deck, err := p.flashRepo.GetDeckByID(ctx, job.ReferenceID)
	if err != nil {
		return fmt.Errorf("failed to get flashcard deck: %w", err)
	}

	if deck.SummaryID == nil || *deck.SummaryID == uuid.Nil {
		return fmt.Errorf("flashcard deck has no linked summary")
	}

	summary, err := p.summaryRepo.GetByID(ctx, *deck.SummaryID)
	if err != nil {
		return fmt.Errorf("failed to get summary: %w", err)
	}

	content := ""
	if summary.ContentRaw != nil {
		content = *summary.ContentRaw
	}

	return p.gemini.GenerateFlashcards(ctx, job, content)
}

func (p *Pool) processContent(ctx context.Context, job *models.Job) error {
	content, err := p.contentRepo.GetByID(ctx, job.ReferenceID)
	if err != nil {
		return fmt.Errorf("failed to get content: %w", err)
	}

	p.contentRepo.UpdateStatus(ctx, content.ID, "processing")

	if content.Type == "youtube" && content.SourceURL != nil {
		// Extract video ID from URL
		videoID := extractVideoID(*content.SourceURL)
		if videoID == "" {
			return fmt.Errorf("invalid YouTube URL: %s", *content.SourceURL)
		}

		// Step 1: Fetch transcript
		p.gemini.PublishUpdate(ctx, job.UserID, models.WSMessage{
			Type: "status_update",
			Payload: models.StatusUpdate{
				JobID:    job.ID,
				Step:     2,
				StepName: "Extracting transcript from video",
			},
		})

		transcript, err := p.youtube.GetTranscript(videoID)
		if err != nil {
			log.Printf("Transcript extraction failed for %s: %v", videoID, err)

			// STT fallback via Gemini multimodal audio transcription
			audioBytes, mimeType, audioErr := p.youtube.DownloadAudio(*content.SourceURL)
			if audioErr != nil {
				fallbackTranscript := buildMetadataFallbackTranscript(content)
				if saveErr := p.contentRepo.UpdateTranscript(ctx, content.ID, fallbackTranscript); saveErr != nil {
					p.contentRepo.UpdateStatus(ctx, content.ID, "failed")
					return fmt.Errorf("transcript extraction failed for video %s: %v; audio fallback download failed: %w; failed to save metadata fallback transcript: %v", videoID, err, audioErr, saveErr)
				}

				log.Printf("Using metadata-only fallback transcript for %s after transcript/audio extraction failure", videoID)
				return nil
			}

			transcribed, transcribeErr := p.gemini.TranscribeAudio(ctx, audioBytes, mimeType)
			if transcribeErr != nil {
				fallbackTranscript := buildMetadataFallbackTranscript(content)
				if saveErr := p.contentRepo.UpdateTranscript(ctx, content.ID, fallbackTranscript); saveErr != nil {
					p.contentRepo.UpdateStatus(ctx, content.ID, "failed")
					return fmt.Errorf("transcript extraction failed for video %s: %v; STT fallback transcription failed: %w; failed to save metadata fallback transcript: %v", videoID, err, transcribeErr, saveErr)
				}

				log.Printf("Using metadata-only fallback transcript for %s after transcript + STT failure", videoID)
				return nil
			}

			transcript = transcribed
		}

		// Step 2: Save transcript
		p.contentRepo.UpdateTranscript(ctx, content.ID, transcript)

		log.Printf("Fetched transcript for video %s (%d chars)", videoID, len(transcript))
	}

	if content.Type == "file" {
		if content.FilePath == nil || *content.FilePath == "" {
			p.contentRepo.UpdateStatus(ctx, content.ID, "failed")
			return fmt.Errorf("file content has no file path")
		}

		fullPath := filepath.Join(p.storagePath, *content.FilePath)
		ext := strings.ToLower(filepath.Ext(fullPath))

		var extracted string
		var extractErr error

		switch ext {
		case ".txt", ".pdf", ".docx":
			if p.fileExtract == nil {
				extractErr = fmt.Errorf("file extraction service is not initialized")
			} else {
				extracted, extractErr = p.fileExtract.ExtractTextFromPath(fullPath)
			}
		case ".mp3", ".wav", ".mp4":
			fileBytes, readErr := os.ReadFile(fullPath)
			if readErr != nil {
				extractErr = fmt.Errorf("failed to read media file: %w", readErr)
				break
			}

			mimeType := "audio/mpeg"
			switch ext {
			case ".wav":
				mimeType = "audio/wav"
			case ".mp4":
				mimeType = "video/mp4"
			}

			extracted, extractErr = p.gemini.TranscribeAudio(ctx, fileBytes, mimeType)
		default:
			extractErr = fmt.Errorf("unsupported file type for extraction: %s", ext)
		}

		if extractErr != nil {
			fallbackTranscript := buildMetadataFallbackTranscript(content)
			if saveErr := p.contentRepo.UpdateTranscript(ctx, content.ID, fallbackTranscript); saveErr != nil {
				p.contentRepo.UpdateStatus(ctx, content.ID, "failed")
				return fmt.Errorf("failed to extract file text from %s: %v; failed to save fallback transcript: %v", fullPath, extractErr, saveErr)
			}

			log.Printf("Using metadata-only fallback transcript for file content %s after extraction failure: %v", content.ID, extractErr)
			return nil
		}

		if err := p.contentRepo.UpdateTranscript(ctx, content.ID, extracted); err != nil {
			p.contentRepo.UpdateStatus(ctx, content.ID, "failed")
			return fmt.Errorf("failed to save extracted file text: %w", err)
		}

		log.Printf("Extracted file text for content %s (%d chars)", content.ID, len(extracted))
	}

	return nil
}

func buildMetadataFallbackTranscript(content *models.Content) string {
	sourceURL := ""
	if content.SourceURL != nil {
		sourceURL = *content.SourceURL
	}

	metadata := "{}"
	if len(content.MetadataJSON) > 0 {
		metadata = string(content.MetadataJSON)
	}

	return fmt.Sprintf(
		"Transcript is unavailable for this content due to source/network restrictions. Generate a helpful study summary using only the available metadata. Clearly mark uncertain details as assumptions. Content type: %s. Title: %s. Source URL: %s. Metadata JSON: %s.",
		content.Type,
		content.Title,
		sourceURL,
		metadata,
	)
}

func extractVideoID(url string) string {
	parsed, err := urlpkg.Parse(url)
	if err == nil {
		host := strings.ToLower(parsed.Host)
		path := strings.Trim(parsed.Path, "/")

		// youtube.com/watch?v=VIDEO_ID
		if strings.Contains(host, "youtube.com") {
			if v := parsed.Query().Get("v"); len(v) == 11 {
				return v
			}

			parts := strings.Split(path, "/")
			if len(parts) >= 2 {
				switch parts[0] {
				case "shorts", "embed", "v":
					if len(parts[1]) == 11 {
						return parts[1]
					}
				}
			}
		}

		// youtu.be/VIDEO_ID
		if strings.Contains(host, "youtu.be") {
			if len(path) >= 11 {
				candidate := strings.Split(path, "/")[0]
				if len(candidate) == 11 {
					return candidate
				}
			}
		}
	}

	// Fallback regex for unusual URL forms
	patterns := []string{
		`(?:v=|\/v\/|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})`,
	}
	for _, p := range patterns {
		re := regexp.MustCompile(p)
		if m := re.FindStringSubmatch(url); len(m) > 1 {
			return m[1]
		}
	}

	return ""
}

func (p *Pool) handleSuccess(ctx context.Context, job *models.Job) {
	p.jobRepo.UpdateStatus(ctx, job.ID, "completed")

	if job.Type == "summary-generation" {
		go p.sendSummaryCompletionEmail(context.Background(), job)
	}

	p.gemini.PublishUpdate(ctx, job.UserID, models.WSMessage{
		Type: "completed",
		Payload: models.CompletedEvent{
			JobID:      job.ID,
			ResultID:   job.ReferenceID,
			ResultType: getResultType(job.Type),
		},
	})

	log.Printf("Job %s completed successfully", job.ID)
}

func (p *Pool) sendSummaryCompletionEmail(ctx context.Context, job *models.Job) {
	if p.email == nil || p.userRepo == nil || p.summaryRepo == nil {
		return
	}

	enabled, err := p.userRepo.GetNotificationSetting(ctx, job.UserID, "processing_complete", true)
	if err != nil {
		log.Printf("failed to load processing_complete notification preference for user %s: %v", job.UserID, err)
		return
	}

	if !enabled {
		return
	}

	user, err := p.userRepo.GetByID(ctx, job.UserID)
	if err != nil {
		log.Printf("failed to load user %s for completion email: %v", job.UserID, err)
		return
	}

	summary, err := p.summaryRepo.GetByID(ctx, job.ReferenceID)
	if err != nil {
		log.Printf("failed to load summary %s for completion email: %v", job.ReferenceID, err)
		return
	}

	if err := p.email.SendProcessingCompleteEmail(user.Email, summary.Title, summary.ID.String()); err != nil {
		log.Printf("failed to send processing-complete email to %s for summary %s: %v", user.Email, summary.ID, err)
	}
}

func (p *Pool) handleFailure(ctx context.Context, job *models.Job, err error) {
	job.RetryCount++
	errMsg := err.Error()

	if job.RetryCount < 3 {
		// Re-queue with backoff
		log.Printf("Job %s failed (attempt %d): %s — retrying", job.ID, job.RetryCount, errMsg)
		p.jobRepo.UpdateStatus(ctx, job.ID, "pending")
		p.jobRepo.UpdateError(ctx, job.ID, errMsg, job.RetryCount)

		// Re-queue after backoff
		jobBytes, _ := json.Marshal(job)
		backoff := time.Duration(1<<uint(job.RetryCount)) * time.Second
		time.AfterFunc(backoff, func() {
			p.redis.LPush(context.Background(), jobQueueName(job.Type), string(jobBytes))
		})
	} else {
		// Max retries reached
		log.Printf("Job %s failed permanently: %s", job.ID, errMsg)
		p.jobRepo.UpdateStatus(ctx, job.ID, "failed")
		p.jobRepo.UpdateError(ctx, job.ID, errMsg, job.RetryCount)
		if job.Type == "content-processing" {
			p.contentRepo.UpdateStatus(ctx, job.ReferenceID, "failed")
		}

		p.gemini.PublishUpdate(ctx, job.UserID, models.WSMessage{
			Type: "error",
			Payload: models.ErrorEvent{
				JobID:        job.ID,
				ErrorCode:    "JOB_FAILED",
				ErrorMessage: errMsg,
			},
		})
	}
}

func jobQueueName(jobType string) string {
	switch jobType {
	case "content-processing":
		return "queue:content-processing"
	case "summary-generation":
		return "queue:summary-generation"
	case "quiz-generation":
		return "queue:quiz-generation"
	case "flashcard-generation":
		return "queue:flashcard-generation"
	default:
		return "queue:" + jobType
	}
}

func getResultType(jobType string) string {
	switch jobType {
	case "summary-generation":
		return "summary"
	case "quiz-generation":
		return "quiz"
	case "flashcard-generation":
		return "flashcard"
	default:
		return "content"
	}
}
