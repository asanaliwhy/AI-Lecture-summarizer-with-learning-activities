package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"lectura-backend/internal/middleware"
	"lectura-backend/internal/models"
)

type stubQuizRepoForGenerate struct {
	created []*models.Quiz
}

func (s *stubQuizRepoForGenerate) Create(ctx context.Context, q *models.Quiz) error {
	if q.ID == uuid.Nil {
		q.ID = uuid.New()
	}
	s.created = append(s.created, q)
	return nil
}

func (s *stubQuizRepoForGenerate) ListByUser(ctx context.Context, userID uuid.UUID) ([]*models.Quiz, error) {
	return nil, nil
}

func (s *stubQuizRepoForGenerate) GetByID(ctx context.Context, id uuid.UUID) (*models.Quiz, error) {
	return nil, context.Canceled
}

func (s *stubQuizRepoForGenerate) Delete(ctx context.Context, id uuid.UUID) error {
	return nil
}

func (s *stubQuizRepoForGenerate) ToggleFavorite(ctx context.Context, id uuid.UUID, userID uuid.UUID) error {
	return nil
}

func (s *stubQuizRepoForGenerate) TouchLastAccessed(ctx context.Context, id uuid.UUID) (bool, error) {
	return true, nil
}

func (s *stubQuizRepoForGenerate) CreateAttempt(ctx context.Context, a *models.QuizAttempt) error {
	return nil
}

func (s *stubQuizRepoForGenerate) GetAttemptByID(ctx context.Context, id uuid.UUID) (*models.QuizAttempt, error) {
	return nil, context.Canceled
}

func (s *stubQuizRepoForGenerate) SaveProgress(ctx context.Context, attemptID uuid.UUID, answers json.RawMessage) error {
	return nil
}

func (s *stubQuizRepoForGenerate) SubmitAttempt(ctx context.Context, attemptID uuid.UUID, score float64, correct int, answers json.RawMessage) error {
	return nil
}

type stubQuizSummaryRepo struct {
	summary *models.Summary
}

func (s *stubQuizSummaryRepo) GetByID(ctx context.Context, id uuid.UUID) (*models.Summary, error) {
	if s.summary == nil {
		return nil, context.Canceled
	}
	return s.summary, nil
}

type stubQuizJobRepo struct {
	created         []*models.Job
	updatedStatuses []string
	updatedIDs      []uuid.UUID
}

func (s *stubQuizJobRepo) Create(ctx context.Context, j *models.Job) error {
	if j.ID == uuid.Nil {
		j.ID = uuid.New()
	}
	j.Status = "pending"
	s.created = append(s.created, j)
	return nil
}

func (s *stubQuizJobRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status string) error {
	s.updatedIDs = append(s.updatedIDs, id)
	s.updatedStatuses = append(s.updatedStatuses, status)
	return nil
}

type quizFakeQueuePusher struct {
	err    error
	key    string
	values []interface{}
}

func (f *quizFakeQueuePusher) LPush(ctx context.Context, key string, values ...interface{}) *redis.IntCmd {
	f.key = key
	f.values = append(f.values, values...)
	if f.err != nil {
		return redis.NewIntResult(0, f.err)
	}
	return redis.NewIntResult(1, nil)
}

type stubQuizRepoForMutations struct {
	quiz            *models.Quiz
	attempt         *models.QuizAttempt
	savedProgress   bool
	submitted       bool
	savedAttemptID  uuid.UUID
	submitAttemptID uuid.UUID
}

func (s *stubQuizRepoForMutations) Create(ctx context.Context, q *models.Quiz) error {
	return nil
}

func (s *stubQuizRepoForMutations) ListByUser(ctx context.Context, userID uuid.UUID) ([]*models.Quiz, error) {
	return nil, nil
}

func (s *stubQuizRepoForMutations) GetByID(ctx context.Context, id uuid.UUID) (*models.Quiz, error) {
	if s.quiz == nil {
		return nil, context.Canceled
	}
	return s.quiz, nil
}

func (s *stubQuizRepoForMutations) Delete(ctx context.Context, id uuid.UUID) error {
	return nil
}

func (s *stubQuizRepoForMutations) ToggleFavorite(ctx context.Context, id uuid.UUID, userID uuid.UUID) error {
	return nil
}

func (s *stubQuizRepoForMutations) TouchLastAccessed(ctx context.Context, id uuid.UUID) (bool, error) {
	return true, nil
}

func (s *stubQuizRepoForMutations) CreateAttempt(ctx context.Context, a *models.QuizAttempt) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	if a.StartedAt.IsZero() {
		a.StartedAt = time.Now()
	}
	return nil
}

func (s *stubQuizRepoForMutations) GetAttemptByID(ctx context.Context, id uuid.UUID) (*models.QuizAttempt, error) {
	if s.attempt == nil {
		return nil, context.Canceled
	}
	return s.attempt, nil
}

func (s *stubQuizRepoForMutations) SaveProgress(ctx context.Context, attemptID uuid.UUID, answers json.RawMessage) error {
	s.savedProgress = true
	s.savedAttemptID = attemptID
	return nil
}

func (s *stubQuizRepoForMutations) SubmitAttempt(ctx context.Context, attemptID uuid.UUID, score float64, correct int, answers json.RawMessage) error {
	s.submitted = true
	s.submitAttemptID = attemptID
	return nil
}

func makeAttemptRequest(method string, path string, attemptID uuid.UUID, userID uuid.UUID, body string) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", attemptID.String())

	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	return req
}

func TestSaveProgress_MalformedBody_Returns400(t *testing.T) {
	userID := uuid.New()
	attemptID := uuid.New()

	repo := &stubQuizRepoForMutations{
		attempt: &models.QuizAttempt{ID: attemptID, UserID: userID},
	}
	h := &QuizHandler{quizRepo: repo}

	req := makeAttemptRequest(http.MethodPost, "/api/v1/quiz-attempts/"+attemptID.String()+"/save-progress", attemptID, userID, "{")
	rr := httptest.NewRecorder()

	h.SaveProgress(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, rr.Code)
	}
	if repo.savedProgress {
		t.Fatalf("save progress should not be called on malformed body")
	}
}

func TestSaveProgress_ValidBody_Returns204(t *testing.T) {
	userID := uuid.New()
	attemptID := uuid.New()

	repo := &stubQuizRepoForMutations{
		attempt: &models.QuizAttempt{ID: attemptID, UserID: userID, AnswersJSON: json.RawMessage(`[]`)},
	}
	h := &QuizHandler{quizRepo: repo}

	req := makeAttemptRequest(http.MethodPost, "/api/v1/quiz-attempts/"+attemptID.String()+"/save-progress", attemptID, userID, `{"question_index":0,"answer_index":1}`)
	rr := httptest.NewRecorder()

	h.SaveProgress(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Fatalf("expected status %d, got %d", http.StatusNoContent, rr.Code)
	}
	if !repo.savedProgress || repo.savedAttemptID != attemptID {
		t.Fatalf("expected save progress to be called with attempt %s", attemptID)
	}
}

func TestSubmitAttempt_MalformedBody_Returns400(t *testing.T) {
	userID := uuid.New()
	attemptID := uuid.New()
	quizID := uuid.New()

	repo := &stubQuizRepoForMutations{
		attempt: &models.QuizAttempt{ID: attemptID, QuizID: quizID, UserID: userID, AnswersJSON: json.RawMessage(`[]`)},
		quiz:    &models.Quiz{ID: quizID, QuestionsJSON: json.RawMessage(`[]`)},
	}
	h := &QuizHandler{quizRepo: repo}

	req := makeAttemptRequest(http.MethodPost, "/api/v1/quiz-attempts/"+attemptID.String()+"/submit", attemptID, userID, "{")
	rr := httptest.NewRecorder()

	h.SubmitAttempt(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, rr.Code)
	}
	if repo.submitted {
		t.Fatalf("submit should not execute on malformed body")
	}
}

func TestSubmitAttempt_ValidBody_Returns200(t *testing.T) {
	userID := uuid.New()
	attemptID := uuid.New()
	quizID := uuid.New()

	repo := &stubQuizRepoForMutations{
		attempt: &models.QuizAttempt{ID: attemptID, QuizID: quizID, UserID: userID, StartedAt: time.Now(), AnswersJSON: json.RawMessage(`[{"question_index":0,"answer_index":1}]`)},
		quiz:    &models.Quiz{ID: quizID, UserID: userID, QuestionsJSON: json.RawMessage(`[{"question":"Q1","type":"mcq","options":["a","b"],"correct_index":1,"explanation":"","hint":"","difficulty":"easy","topic":"t"}]`)},
	}
	h := &QuizHandler{quizRepo: repo}

	req := makeAttemptRequest(http.MethodPost, "/api/v1/quiz-attempts/"+attemptID.String()+"/submit", attemptID, userID, `{}`)
	rr := httptest.NewRecorder()

	h.SubmitAttempt(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rr.Code)
	}
	if !repo.submitted || repo.submitAttemptID != attemptID {
		t.Fatalf("expected submit to be called with attempt %s", attemptID)
	}
}

func TestStartAttempt_DeniesForeignQuiz(t *testing.T) {
	userID := uuid.New()
	ownerID := uuid.New()
	quizID := uuid.New()

	repo := &stubQuizRepoForMutations{
		quiz: &models.Quiz{ID: quizID, UserID: ownerID},
	}
	h := &QuizHandler{quizRepo: repo}

	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", quizID.String())
	req := httptest.NewRequest(http.MethodPost, "/api/v1/quizzes/"+quizID.String()+"/start", nil)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	rr := httptest.NewRecorder()

	h.StartAttempt(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("expected status %d, got %d", http.StatusForbidden, rr.Code)
	}
}

func TestStartAttempt_AllowsOwnedQuiz(t *testing.T) {
	userID := uuid.New()
	quizID := uuid.New()

	repo := &stubQuizRepoForMutations{
		quiz: &models.Quiz{ID: quizID, UserID: userID},
	}
	h := &QuizHandler{quizRepo: repo}

	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", quizID.String())
	req := httptest.NewRequest(http.MethodPost, "/api/v1/quizzes/"+quizID.String()+"/start", nil)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	rr := httptest.NewRecorder()

	h.StartAttempt(rr, req)

	if rr.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d", http.StatusCreated, rr.Code)
	}
}

func TestGetAttempt_DeniesWhenQuizOwnershipMismatch(t *testing.T) {
	userID := uuid.New()
	ownerID := uuid.New()
	attemptID := uuid.New()
	quizID := uuid.New()

	repo := &stubQuizRepoForMutations{
		attempt: &models.QuizAttempt{ID: attemptID, QuizID: quizID, UserID: userID},
		quiz:    &models.Quiz{ID: quizID, UserID: ownerID, QuestionsJSON: json.RawMessage(`[]`)},
	}
	h := &QuizHandler{quizRepo: repo}

	qctx := chi.NewRouteContext()
	qctx.URLParams.Add("id", attemptID.String())
	req := httptest.NewRequest(http.MethodGet, "/api/v1/quiz-attempts/"+attemptID.String(), nil)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, qctx))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	rr := httptest.NewRecorder()

	h.GetAttempt(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("expected status %d, got %d", http.StatusForbidden, rr.Code)
	}
}

func TestQuizGenerate_QueueFailure_MarksJobFailed(t *testing.T) {
	userID := uuid.New()
	summaryID := uuid.New()

	quizRepo := &stubQuizRepoForGenerate{}
	summaryRepo := &stubQuizSummaryRepo{summary: &models.Summary{ID: summaryID, UserID: userID}}
	jobRepo := &stubQuizJobRepo{}
	queue := &quizFakeQueuePusher{err: errors.New("redis down")}

	h := &QuizHandler{quizRepo: quizRepo, summaryRepo: summaryRepo, jobRepo: jobRepo, redis: queue}

	body := `{"summary_id":"` + summaryID.String() + `","title":"Quiz","num_questions":5,"difficulty":"medium","question_types":["mcq"],"topics":[]}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/quizzes/generate", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	rr := httptest.NewRecorder()

	h.Generate(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("expected status %d, got %d", http.StatusInternalServerError, rr.Code)
	}
	if code := errorCodeFromBody(t, rr); code != "QUEUE_ERROR" {
		t.Fatalf("expected QUEUE_ERROR, got %q", code)
	}
	if len(quizRepo.created) != 1 {
		t.Fatalf("expected quiz to be created before enqueue failure")
	}
	if len(jobRepo.created) != 1 {
		t.Fatalf("expected job to be created before enqueue failure")
	}
	if len(jobRepo.updatedStatuses) == 0 || jobRepo.updatedStatuses[len(jobRepo.updatedStatuses)-1] != "failed" {
		t.Fatalf("expected job status to be marked failed")
	}
	if queue.key != "queue:quiz-generation" {
		t.Fatalf("expected queue key queue:quiz-generation, got %q", queue.key)
	}
}

func TestQuizGenerate_QueueSuccess_Returns202(t *testing.T) {
	userID := uuid.New()
	summaryID := uuid.New()

	quizRepo := &stubQuizRepoForGenerate{}
	summaryRepo := &stubQuizSummaryRepo{summary: &models.Summary{ID: summaryID, UserID: userID}}
	jobRepo := &stubQuizJobRepo{}
	queue := &quizFakeQueuePusher{}

	h := &QuizHandler{quizRepo: quizRepo, summaryRepo: summaryRepo, jobRepo: jobRepo, redis: queue}

	body := `{"summary_id":"` + summaryID.String() + `","title":"Quiz","num_questions":5,"difficulty":"medium","question_types":["mcq"],"topics":[]}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/quizzes/generate", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	rr := httptest.NewRecorder()

	h.Generate(rr, req)

	if rr.Code != http.StatusAccepted {
		t.Fatalf("expected status %d, got %d", http.StatusAccepted, rr.Code)
	}
	if len(jobRepo.updatedStatuses) != 0 {
		t.Fatalf("did not expect failed status updates on successful enqueue")
	}

	var payload map[string]interface{}
	if err := json.NewDecoder(rr.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if payload["job_id"] == nil {
		t.Fatalf("expected job_id in response")
	}
	if payload["quiz_id"] == nil {
		t.Fatalf("expected quiz_id in response")
	}
}
