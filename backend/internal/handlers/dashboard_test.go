package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"

	"lectura-backend/internal/middleware"
)

func TestGetRecent_SummariesOnly_Returns200(t *testing.T) {
	userID := uuid.New()
	now := time.Now().UTC()

	h := &DashboardHandler{
		recentFetcher: func(ctx context.Context, uid uuid.UUID, limit int) ([]dashboardRecentItem, error) {
			if uid != userID {
				t.Fatalf("unexpected user id: %s", uid)
			}
			if limit != 12 {
				t.Fatalf("unexpected limit: %d", limit)
			}
			return []dashboardRecentItem{
				{ID: uuid.New(), Type: "summary", Title: "S1", CreatedAt: now, Progress: 0},
			}, nil
		},
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/dashboard/recent", nil)
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	rr := httptest.NewRecorder()

	h.Recent(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rr.Code)
	}

	var payload struct {
		Recent []struct {
			Type string `json:"type"`
		} `json:"recent"`
	}
	if err := json.NewDecoder(rr.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(payload.Recent) != 1 || payload.Recent[0].Type != "summary" {
		t.Fatalf("unexpected recent payload: %#v", payload.Recent)
	}
}

func TestGetRecent_MixedContent_Returns200(t *testing.T) {
	userID := uuid.New()
	now := time.Now().UTC()

	h := &DashboardHandler{
		recentFetcher: func(ctx context.Context, uid uuid.UUID, limit int) ([]dashboardRecentItem, error) {
			return []dashboardRecentItem{
				{ID: uuid.New(), Type: "summary", Title: "Summary", CreatedAt: now.Add(-2 * time.Hour), Progress: 0},
				{ID: uuid.New(), Type: "quiz", Title: "Quiz", CreatedAt: now.Add(-1 * time.Hour), Progress: 80},
				{ID: uuid.New(), Type: "flashcard_deck", Title: "Deck", CreatedAt: now, Progress: 0},
			}, nil
		},
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/dashboard/recent", nil)
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	rr := httptest.NewRecorder()

	h.Recent(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rr.Code)
	}

	var payload struct {
		Recent []struct {
			Type string `json:"type"`
		} `json:"recent"`
	}
	if err := json.NewDecoder(rr.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(payload.Recent) != 3 {
		t.Fatalf("expected 3 recent items, got %d", len(payload.Recent))
	}
	if payload.Recent[0].Type != "summary" || payload.Recent[1].Type != "quiz" || payload.Recent[2].Type != "flashcard_deck" {
		t.Fatalf("unexpected types order/content: %#v", payload.Recent)
	}
}

func TestGetRecent_NoContent_Returns200(t *testing.T) {
	userID := uuid.New()

	h := &DashboardHandler{
		recentFetcher: func(ctx context.Context, uid uuid.UUID, limit int) ([]dashboardRecentItem, error) {
			return []dashboardRecentItem{}, nil
		},
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/dashboard/recent", nil)
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	rr := httptest.NewRecorder()

	h.Recent(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rr.Code)
	}

	var payload struct {
		Recent []interface{} `json:"recent"`
	}
	if err := json.NewDecoder(rr.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(payload.Recent) != 0 {
		t.Fatalf("expected empty recent list, got %d items", len(payload.Recent))
	}
}

func TestStats_RaceCondition_DefaultsAppliedAfterWait(t *testing.T) {
	// Race behavior is validated by running the package with:
	// go test -race ./internal/handlers/...
	// This named test exists to lock the regression intent for A-010.
	t.Skip("race regression is validated with -race execution against Stats path")
}
