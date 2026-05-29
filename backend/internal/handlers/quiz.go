package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"lectura-backend/internal/middleware"
	"lectura-backend/internal/models"
	"lectura-backend/internal/repository"
	"lectura-backend/internal/services"
)

type QuizHandler struct {
	quizRepo     quizRepository
	summaryRepo  quizSummaryRepository
	jobRepo      quizJobRepository
	redis        queuePusher
	quotaService *services.QuotaService
	userRepo     *repository.UserRepo
}

type queuePusher interface {
	LPush(ctx context.Context, key string, values ...interface{}) *redis.IntCmd
}

type quizSummaryRepository interface {
	GetByID(ctx context.Context, id uuid.UUID) (*models.Summary, error)
}

type quizJobRepository interface {
	Create(ctx context.Context, j *models.Job) error
	UpdateStatus(ctx context.Context, id uuid.UUID, status string) error
}

type quizRepository interface {
	Create(ctx context.Context, q *models.Quiz) error
	ListByUser(ctx context.Context, userID uuid.UUID) ([]*models.Quiz, error)
	GetByID(ctx context.Context, id uuid.UUID) (*models.Quiz, error)
	Delete(ctx context.Context, id uuid.UUID) error
	ToggleFavorite(ctx context.Context, id uuid.UUID, userID uuid.UUID) error
	TouchLastAccessed(ctx context.Context, id uuid.UUID) (bool, error)
	CreateAttempt(ctx context.Context, a *models.QuizAttempt) error
	GetAttemptByID(ctx context.Context, id uuid.UUID) (*models.QuizAttempt, error)
	SaveProgress(ctx context.Context, attemptID uuid.UUID, answers json.RawMessage) error
	SubmitAttempt(ctx context.Context, attemptID uuid.UUID, score float64, correct int, answers json.RawMessage) error
}

func NewQuizHandler(quizRepo *repository.QuizRepo, summaryRepo *repository.SummaryRepo, jobRepo *repository.JobRepo, redisClient *redis.Client, quotaService *services.QuotaService, userRepo *repository.UserRepo) *QuizHandler {
	return &QuizHandler{
		quizRepo:     quizRepo,
		summaryRepo:  summaryRepo,
		jobRepo:      jobRepo,
		redis:        redisClient,
		quotaService: quotaService,
		userRepo:     userRepo,
	}
}

func (h *QuizHandler) Generate(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}

	var req models.GenerateQuizRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}

	var rawConfig struct {
		QuestionTypes []string `json:"question_types"`
	}
	_ = json.Unmarshal(body, &rawConfig)

	config := req
	if rawConfig.QuestionTypes != nil {
		config.QuestionTypes = append([]string(nil), rawConfig.QuestionTypes...)
	}
	log.Printf("Saving quiz config question_types: %v", config.QuestionTypes)

	userID := middleware.GetUserID(r.Context())

	// Verify summary belongs to user
	summary, err := h.summaryRepo.GetByID(r.Context(), req.SummaryID)
	if err != nil || summary.UserID != userID {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Summary not found", r))
		return
	}

	// Quota Check
	user, err := h.userRepo.GetByID(r.Context(), userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to load user profile", r))
		return
	}

	if !user.HasGeminiKey {
		allowed, err := h.quotaService.CheckQuota(r.Context(), userID, user.Plan, "quiz")
		if err != nil {
			if err.Error() == "API_KEY_REQUIRED" {
				writeJSON(w, http.StatusPaymentRequired, errorResp("API_KEY_REQUIRED", "Your Plus plan requires a custom Gemini API key. Please add it in settings.", r))
				return
			}
			writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to verify quota", r))
			return
		}
		if !allowed {
			writeJSON(w, http.StatusPaymentRequired, errorResp("QUOTA_EXCEEDED", "You have reached your monthly limit for Quizzes. Please upgrade your plan or add a custom API key.", r))
			return
		}
	}

	quiz := &models.Quiz{
		UserID:        userID,
		SummaryID:     &req.SummaryID,
		Title:         req.Title,
		QuestionCount: req.NumQuestions,
	}
	configBytes, _ := json.Marshal(config)
	quiz.ConfigJSON = configBytes
	quiz.QuestionsJSON = json.RawMessage("[]")

	if err := h.quizRepo.Create(r.Context(), quiz); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to create quiz", r))
		return
	}

	job := &models.Job{
		UserID:      userID,
		Type:        "quiz-generation",
		ReferenceID: quiz.ID,
		ConfigJSON:  configBytes,
	}

	if err := h.jobRepo.Create(r.Context(), job); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to create job", r))
		return
	}

	if h.redis == nil {
		_ = h.jobRepo.UpdateStatus(r.Context(), job.ID, "failed")
		writeJSON(w, http.StatusInternalServerError, errorResp("QUEUE_ERROR", "Failed to queue generation job", r))
		return
	}

	jobBytes, _ := json.Marshal(job)
	if err := h.redis.LPush(r.Context(), "queue:quiz-generation", string(jobBytes)).Err(); err != nil {
		_ = h.jobRepo.UpdateStatus(r.Context(), job.ID, "failed")
		writeJSON(w, http.StatusInternalServerError, errorResp("QUEUE_ERROR", "Failed to queue generation job", r))
		return
	}

	writeJSON(w, http.StatusAccepted, map[string]interface{}{
		"job_id":  job.ID,
		"quiz_id": quiz.ID,
	})
}

func (h *QuizHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())

	quizzes, err := h.quizRepo.ListByUser(r.Context(), userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to fetch quizzes", r))
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"quizzes": quizzes})
}

func (h *QuizHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid quiz ID", r))
		return
	}

	quiz, err := h.quizRepo.GetByID(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Quiz not found", r))
		return
	}

	userID := middleware.GetUserID(r.Context())
	if quiz.UserID != userID {
		writeJSON(w, http.StatusForbidden, errorResp("FORBIDDEN", "Access denied", r))
		return
	}

	go func(quizID uuid.UUID) {
		_, touchErr := h.quizRepo.TouchLastAccessed(context.Background(), quizID)
		if touchErr != nil {
			log.Printf("failed to update last_accessed_at for quiz %s: %v", quizID, touchErr)
		}
	}(quiz.ID)

	writeJSON(w, http.StatusOK, quiz)
}

func (h *QuizHandler) ToggleFavorite(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid quiz ID", r))
		return
	}

	quiz, err := h.quizRepo.GetByID(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Quiz not found", r))
		return
	}

	userID := middleware.GetUserID(r.Context())
	if quiz.UserID != userID {
		writeJSON(w, http.StatusForbidden, errorResp("FORBIDDEN", "Access denied", r))
		return
	}

	if err := h.quizRepo.ToggleFavorite(r.Context(), id, userID); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to update favorite", r))
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Favorite toggled"})
}

func (h *QuizHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid quiz ID", r))
		return
	}

	quiz, err := h.quizRepo.GetByID(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Quiz not found", r))
		return
	}

	userID := middleware.GetUserID(r.Context())
	if quiz.UserID != userID {
		writeJSON(w, http.StatusForbidden, errorResp("FORBIDDEN", "Access denied", r))
		return
	}

	if err := h.quizRepo.Delete(r.Context(), id); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to delete quiz", r))
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Quiz deleted"})
}

func (h *QuizHandler) StartAttempt(w http.ResponseWriter, r *http.Request) {
	quizID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid quiz ID", r))
		return
	}

	userID := middleware.GetUserID(r.Context())

	quiz, err := h.quizRepo.GetByID(r.Context(), quizID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Quiz not found", r))
		return
	}

	if quiz.UserID != userID {
		writeJSON(w, http.StatusForbidden, errorResp("FORBIDDEN", "Access denied", r))
		return
	}

	attempt := &models.QuizAttempt{
		QuizID: quizID,
		UserID: userID,
	}

	if err := h.quizRepo.CreateAttempt(r.Context(), attempt); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to start quiz", r))
		return
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"attempt_id": attempt.ID,
		"started_at": attempt.StartedAt,
	})
}

func (h *QuizHandler) SaveProgress(w http.ResponseWriter, r *http.Request) {
	attemptID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid attempt ID", r))
		return
	}

	// Get existing answers
	attempt, err := h.quizRepo.GetAttemptByID(r.Context(), attemptID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Attempt not found", r))
		return
	}

	userID := middleware.GetUserID(r.Context())
	if attempt.UserID != userID {
		writeJSON(w, http.StatusForbidden, errorResp("FORBIDDEN", "Access denied", r))
		return
	}

	var progress models.SaveProgressRequest
	if err := json.NewDecoder(r.Body).Decode(&progress); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}

	// Merge with existing answers
	var answers []map[string]int
	if attempt.AnswersJSON != nil {
		json.Unmarshal(attempt.AnswersJSON, &answers)
	}

	// Update or add answer
	found := false
	for i, a := range answers {
		if a["question_index"] == progress.QuestionIndex {
			answers[i]["answer_index"] = progress.AnswerIndex
			found = true
			break
		}
	}
	if !found {
		answers = append(answers, map[string]int{
			"question_index": progress.QuestionIndex,
			"answer_index":   progress.AnswerIndex,
		})
	}

	answersJSON, _ := json.Marshal(answers)
	if err := h.quizRepo.SaveProgress(r.Context(), attemptID, answersJSON); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to save progress", r))
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *QuizHandler) SubmitAttempt(w http.ResponseWriter, r *http.Request) {
	attemptID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid attempt ID", r))
		return
	}

	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}

	attempt, err := h.quizRepo.GetAttemptByID(r.Context(), attemptID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Attempt not found", r))
		return
	}

	userID := middleware.GetUserID(r.Context())
	if attempt.UserID != userID {
		writeJSON(w, http.StatusForbidden, errorResp("FORBIDDEN", "Access denied", r))
		return
	}

	// Get quiz questions for grading
	quiz, err := h.quizRepo.GetByID(r.Context(), attempt.QuizID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Quiz not found", r))
		return
	}

	if quiz.UserID != userID {
		writeJSON(w, http.StatusForbidden, errorResp("FORBIDDEN", "Access denied", r))
		return
	}

	var questions []models.QuizQuestion
	if err := json.Unmarshal(quiz.QuestionsJSON, &questions); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to parse quiz questions", r))
		return
	}

	var answers []map[string]int
	if err := json.Unmarshal(attempt.AnswersJSON, &answers); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to parse answers", r))
		return
	}

	// Grade
	correct := 0
	for _, a := range answers {
		qi := a["question_index"]
		ai := a["answer_index"]
		if qi < len(questions) && questions[qi].CorrectIndex == ai {
			correct++
		}
	}

	total := len(questions)
	score := 0.0
	if total > 0 {
		score = float64(correct) / float64(total) * 100
	}

	answersJSON, _ := json.Marshal(answers)
	if err := h.quizRepo.SubmitAttempt(r.Context(), attemptID, score, correct, answersJSON); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to submit attempt", r))
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"score_percent": score,
		"correct_count": correct,
		"total":         total,
		"attempt_id":    attemptID,
	})
}

func (h *QuizHandler) GetAttempt(w http.ResponseWriter, r *http.Request) {
	attemptID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid attempt ID", r))
		return
	}

	attempt, err := h.quizRepo.GetAttemptByID(r.Context(), attemptID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Attempt not found", r))
		return
	}

	userID := middleware.GetUserID(r.Context())
	if attempt.UserID != userID {
		writeJSON(w, http.StatusForbidden, errorResp("FORBIDDEN", "Access denied", r))
		return
	}

	// Include quiz questions for results page
	quiz, err := h.quizRepo.GetByID(r.Context(), attempt.QuizID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Quiz not found", r))
		return
	}

	if quiz.UserID != userID {
		writeJSON(w, http.StatusForbidden, errorResp("FORBIDDEN", "Access denied", r))
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"attempt":   attempt,
		"questions": quiz.QuestionsJSON,
		"quiz":      quiz,
	})
}
