package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"lectura-backend/internal/middleware"
	"lectura-backend/internal/models"
)

type stubSummaryRepo struct {
	summary  *models.Summary
	toggled  bool
	lastID   uuid.UUID
	lastUser uuid.UUID
}

func (s *stubSummaryRepo) Create(ctx context.Context, summary *models.Summary) error {
	return nil
}

func (s *stubSummaryRepo) ListByUser(ctx context.Context, userID uuid.UUID, search, sortBy string, limit, offset int) ([]*models.Summary, int, error) {
	return nil, 0, nil
}

func (s *stubSummaryRepo) GetByID(ctx context.Context, id uuid.UUID) (*models.Summary, error) {
	if s.summary == nil {
		return nil, context.Canceled
	}
	return s.summary, nil
}

func (s *stubSummaryRepo) Update(ctx context.Context, summary *models.Summary) error {
	return nil
}

func (s *stubSummaryRepo) Delete(ctx context.Context, id uuid.UUID) error {
	return nil
}

func (s *stubSummaryRepo) ToggleFavorite(ctx context.Context, id uuid.UUID, userID uuid.UUID) error {
	s.toggled = true
	s.lastID = id
	s.lastUser = userID
	return nil
}

func TestSummaryHandler_ToggleFavorite_Authorization(t *testing.T) {
	summaryID := uuid.New()
	ownerID := uuid.New()
	otherUserID := uuid.New()

	repo := &stubSummaryRepo{
		summary: &models.Summary{ID: summaryID, UserID: ownerID},
	}

	h := &SummaryHandler{summaryRepo: repo}

	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", summaryID.String())

	req := httptest.NewRequest(http.MethodPut, "/api/v1/summaries/"+summaryID.String()+"/favorite", nil)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, otherUserID))

	rr := httptest.NewRecorder()
	h.ToggleFavorite(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("expected status %d, got %d", http.StatusForbidden, rr.Code)
	}
	if repo.toggled {
		t.Fatalf("toggle should not be executed for non-owner")
	}
}

func TestSummaryHandler_ToggleFavorite_OwnerCanToggle(t *testing.T) {
	summaryID := uuid.New()
	ownerID := uuid.New()

	repo := &stubSummaryRepo{
		summary: &models.Summary{ID: summaryID, UserID: ownerID},
	}

	h := &SummaryHandler{summaryRepo: repo}

	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", summaryID.String())

	req := httptest.NewRequest(http.MethodPut, "/api/v1/summaries/"+summaryID.String()+"/favorite", nil)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, ownerID))

	rr := httptest.NewRecorder()
	h.ToggleFavorite(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rr.Code)
	}
	if !repo.toggled {
		t.Fatalf("expected toggle to be executed for owner")
	}
	if repo.lastID != summaryID || repo.lastUser != ownerID {
		t.Fatalf("unexpected toggle params: id=%s user=%s", repo.lastID, repo.lastUser)
	}

	var payload map[string]string
	if err := json.NewDecoder(rr.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if payload["message"] != "Favorite toggled" {
		t.Fatalf("unexpected response message: %q", payload["message"])
	}
}
