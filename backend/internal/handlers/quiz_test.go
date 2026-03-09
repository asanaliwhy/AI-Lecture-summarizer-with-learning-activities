package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"lectura-backend/internal/middleware"
	"lectura-backend/internal/models"
)

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
		quiz:    &models.Quiz{ID: quizID, QuestionsJSON: json.RawMessage(`[{"question":"Q1","type":"mcq","options":["a","b"],"correct_index":1,"explanation":"","hint":"","difficulty":"easy","topic":"t"}]`)},
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
