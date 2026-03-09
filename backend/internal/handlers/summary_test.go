package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"lectura-backend/internal/middleware"
	"lectura-backend/internal/models"
)

type stubSummaryRepoForUpdate struct {
	summary        *models.Summary
	getErr         error
	updated        bool
	updatedSummary *models.Summary
}

func (s *stubSummaryRepoForUpdate) Create(ctx context.Context, summary *models.Summary) error {
	return nil
}

func (s *stubSummaryRepoForUpdate) ListByUser(ctx context.Context, userID uuid.UUID, search, sortBy string, limit, offset int) ([]*models.Summary, int, error) {
	return nil, 0, nil
}

func (s *stubSummaryRepoForUpdate) GetByID(ctx context.Context, id uuid.UUID) (*models.Summary, error) {
	if s.getErr != nil {
		return nil, s.getErr
	}
	return s.summary, nil
}

func (s *stubSummaryRepoForUpdate) Update(ctx context.Context, summary *models.Summary) error {
	s.updated = true
	clone := *summary
	s.updatedSummary = &clone
	return nil
}

func (s *stubSummaryRepoForUpdate) UpdateTitle(ctx context.Context, id uuid.UUID, title string) error {
	return nil
}

func (s *stubSummaryRepoForUpdate) Delete(ctx context.Context, id uuid.UUID) error {
	return nil
}

func (s *stubSummaryRepoForUpdate) ToggleFavorite(ctx context.Context, id uuid.UUID, userID uuid.UUID) error {
	return nil
}

func TestSummaryUpdate_MalformedBody_Returns400(t *testing.T) {
	userID := uuid.New()
	summaryID := uuid.New()
	repo := &stubSummaryRepoForUpdate{summary: &models.Summary{ID: summaryID, UserID: userID, Title: "Old"}}
	h := &SummaryHandler{summaryRepo: repo}

	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", summaryID.String())
	req := httptest.NewRequest(http.MethodPut, "/api/v1/summaries/"+summaryID.String(), strings.NewReader("not json"))
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected %d, got %d", http.StatusBadRequest, rr.Code)
	}
	if repo.updated {
		t.Fatalf("update should not be called for malformed body")
	}
}

func TestSummaryUpdate_EmptyBody_Returns400(t *testing.T) {
	userID := uuid.New()
	summaryID := uuid.New()
	repo := &stubSummaryRepoForUpdate{summary: &models.Summary{ID: summaryID, UserID: userID, Title: "Old"}}
	h := &SummaryHandler{summaryRepo: repo}

	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", summaryID.String())
	req := httptest.NewRequest(http.MethodPut, "/api/v1/summaries/"+summaryID.String(), strings.NewReader(`{}`))
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected %d, got %d", http.StatusBadRequest, rr.Code)
	}
	if repo.updated {
		t.Fatalf("update should not be called for empty update payload")
	}
}

func TestSummaryUpdate_ValidTitle_Returns200(t *testing.T) {
	userID := uuid.New()
	summaryID := uuid.New()
	repo := &stubSummaryRepoForUpdate{summary: &models.Summary{ID: summaryID, UserID: userID, Title: "Old"}}
	h := &SummaryHandler{summaryRepo: repo}

	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", summaryID.String())
	req := httptest.NewRequest(http.MethodPut, "/api/v1/summaries/"+summaryID.String(), strings.NewReader(`{"title":"New Title"}`))
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected %d, got %d", http.StatusOK, rr.Code)
	}
	if !repo.updated {
		t.Fatalf("expected repository update to be called")
	}
	if repo.updatedSummary == nil || repo.updatedSummary.Title != "New Title" {
		t.Fatalf("expected updated title New Title, got %#v", repo.updatedSummary)
	}

	var payload models.Summary
	if err := json.NewDecoder(rr.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if payload.Title != "New Title" {
		t.Fatalf("expected response title New Title, got %q", payload.Title)
	}
}

func TestSummaryUpdate_NonOwner_Returns403(t *testing.T) {
	summaryID := uuid.New()
	ownerID := uuid.New()
	otherID := uuid.New()
	repo := &stubSummaryRepoForUpdate{summary: &models.Summary{ID: summaryID, UserID: ownerID, Title: "Old"}}
	h := &SummaryHandler{summaryRepo: repo}

	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", summaryID.String())
	req := httptest.NewRequest(http.MethodPut, "/api/v1/summaries/"+summaryID.String(), strings.NewReader(`{"title":"Hacked"}`))
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, otherID))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("expected %d, got %d", http.StatusForbidden, rr.Code)
	}
	if repo.updated {
		t.Fatalf("update should not be called for non-owner")
	}
}

func TestSummaryUpdate_NotFound_Returns404(t *testing.T) {
	userID := uuid.New()
	summaryID := uuid.New()
	repo := &stubSummaryRepoForUpdate{getErr: errors.New("not found")}
	h := &SummaryHandler{summaryRepo: repo}

	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", summaryID.String())
	req := httptest.NewRequest(http.MethodPut, "/api/v1/summaries/"+summaryID.String(), strings.NewReader(`{"title":"X"}`))
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("expected %d, got %d", http.StatusNotFound, rr.Code)
	}
}
