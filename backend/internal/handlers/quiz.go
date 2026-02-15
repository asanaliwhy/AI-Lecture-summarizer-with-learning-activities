package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"lectura-backend/internal/middleware"
	"lectura-backend/internal/models"
	"lectura-backend/internal/repository"
)

type QuizHandler struct {
	quizRepo    *repository.QuizRepo
	summaryRepo *repository.SummaryRepo
	jobRepo     *repository.JobRepo
	redis       *redis.Client
}

func NewQuizHandler(quizRepo *repository.QuizRepo, summaryRepo *repository.SummaryRepo, jobRepo *repository.JobRepo, redisClient *redis.Client) *QuizHandler {
	return &QuizHandler{
		quizRepo:    quizRepo,
		summaryRepo: summaryRepo,
		jobRepo:     jobRepo,
		redis:       redisClient,
	}
}

func (h *QuizHandler) Generate(w http.ResponseWriter, r *http.Request) {
	var req models.GenerateQuizRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}

	userID := middleware.GetUserID(r.Context())

	// Verify summary belongs to user
	summary, err := h.summaryRepo.GetByID(r.Context(), req.SummaryID)
	if err != nil || summary.UserID != userID {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Summary not found", r))
		return
	}

	quiz := &models.Quiz{
		UserID:        userID,
		SummaryID:     &req.SummaryID,
		Title:         req.Title,
		QuestionCount: req.NumQuestions,
	}
	configBytes, _ := json.Marshal(req)
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

	jobBytes, _ := json.Marshal(job)
	h.redis.LPush(r.Context(), "queue:quiz-generation", string(jobBytes))

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
	json.NewDecoder(r.Body).Decode(&progress)

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
	h.quizRepo.SaveProgress(r.Context(), attemptID, answersJSON)

	writeJSON(w, http.StatusOK, map[string]string{"message": "Progress saved"})
}

func (h *QuizHandler) SubmitAttempt(w http.ResponseWriter, r *http.Request) {
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

	// Get quiz questions for grading
	quiz, err := h.quizRepo.GetByID(r.Context(), attempt.QuizID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to fetch quiz", r))
		return
	}

	var questions []models.QuizQuestion
	json.Unmarshal(quiz.QuestionsJSON, &questions)

	var answers []map[string]int
	json.Unmarshal(attempt.AnswersJSON, &answers)

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
	h.quizRepo.SubmitAttempt(r.Context(), attemptID, score, correct, answersJSON)

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
	quiz, _ := h.quizRepo.GetByID(r.Context(), attempt.QuizID)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"attempt":   attempt,
		"questions": quiz.QuestionsJSON,
		"quiz":      quiz,
	})
}
