package handlers

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"

	"lectura-backend/internal/middleware"
	"lectura-backend/internal/models"
)

type stubUserRepoForSettingsHandlers struct {
	user              *models.User
	updateErr         error
	deleteErr         error
	updateSettingsErr error

	updatedUser     bool
	deletedUser     bool
	updatedSettings bool
}

func (s *stubUserRepoForSettingsHandlers) GetByID(ctx context.Context, id uuid.UUID) (*models.User, error) {
	if s.user == nil {
		return nil, errors.New("user not found")
	}
	return s.user, nil
}

func (s *stubUserRepoForSettingsHandlers) Update(ctx context.Context, user *models.User) error {
	s.updatedUser = true
	return s.updateErr
}

func (s *stubUserRepoForSettingsHandlers) UpdatePassword(ctx context.Context, userID uuid.UUID, passwordHash string) error {
	return nil
}

func (s *stubUserRepoForSettingsHandlers) Delete(ctx context.Context, id uuid.UUID) error {
	s.deletedUser = true
	return s.deleteErr
}

func (s *stubUserRepoForSettingsHandlers) GetSettings(ctx context.Context, userID uuid.UUID) (*models.UserSettings, error) {
	return &models.UserSettings{UserID: userID}, nil
}

func (s *stubUserRepoForSettingsHandlers) UpdateSettings(ctx context.Context, settings *models.UserSettings) error {
	s.updatedSettings = true
	return s.updateSettingsErr
}

func (s *stubUserRepoForSettingsHandlers) SetNotificationSetting(ctx context.Context, userID uuid.UUID, key string, enabled bool) error {
	return nil
}

func TestUserHandler_UpdateMe_InvalidRequestBody(t *testing.T) {
	userID := uuid.New()
	repo := &stubUserRepoForSettingsHandlers{
		user: &models.User{ID: userID, FullName: "Alice", Email: "alice@example.com"},
	}
	h := &UserHandler{userRepo: repo}

	body := `{"full_name":"Updated","unknown_field":true}`
	req := httptest.NewRequest(http.MethodPut, "/api/v1/user/me", strings.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	h.UpdateMe(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, rr.Code)
	}
	if repo.updatedUser {
		t.Fatalf("user should not be updated for invalid request body")
	}
}

func TestUserHandler_UpdateMe_RepoFailure(t *testing.T) {
	userID := uuid.New()
	repo := &stubUserRepoForSettingsHandlers{
		user:      &models.User{ID: userID, FullName: "Alice", Email: "alice@example.com"},
		updateErr: errors.New("db unavailable"),
	}
	h := &UserHandler{userRepo: repo}

	body := `{"full_name":"Updated Name"}`
	req := httptest.NewRequest(http.MethodPut, "/api/v1/user/me", strings.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	h.UpdateMe(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("expected status %d, got %d", http.StatusInternalServerError, rr.Code)
	}
	if !repo.updatedUser {
		t.Fatalf("expected user update to be attempted")
	}
}

func TestUserHandler_UpdateMe_RejectsTooLongBio(t *testing.T) {
	userID := uuid.New()
	repo := &stubUserRepoForSettingsHandlers{
		user: &models.User{ID: userID, FullName: "Alice", Email: "alice@example.com"},
	}
	h := &UserHandler{userRepo: repo}

	longBio := strings.Repeat("a", 301)
	body := `{"bio":"` + longBio + `"}`
	req := httptest.NewRequest(http.MethodPut, "/api/v1/user/me", strings.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	h.UpdateMe(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, rr.Code)
	}
	if repo.updatedUser {
		t.Fatalf("user should not be updated for invalid bio")
	}
}

func TestUserHandler_UpdateSettings_InvalidRequestBody(t *testing.T) {
	userID := uuid.New()
	repo := &stubUserRepoForSettingsHandlers{user: &models.User{ID: userID}}
	h := &UserHandler{userRepo: repo}

	body := `{"default_summary_length":"standard","unexpected":"value"}`
	req := httptest.NewRequest(http.MethodPut, "/api/v1/user/settings", strings.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	h.UpdateSettings(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, rr.Code)
	}
	if repo.updatedSettings {
		t.Fatalf("settings should not be updated for invalid request body")
	}
}

func TestUserHandler_UpdateSettings_RepoFailure(t *testing.T) {
	userID := uuid.New()
	repo := &stubUserRepoForSettingsHandlers{
		user:              &models.User{ID: userID},
		updateSettingsErr: errors.New("write failed"),
	}
	h := &UserHandler{userRepo: repo}

	body := `{"default_summary_length":"standard","default_format":"paragraph","default_difficulty":"medium","language":"en","notifications":{"weekly_digest":true}}`
	req := httptest.NewRequest(http.MethodPut, "/api/v1/user/settings", strings.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	h.UpdateSettings(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("expected status %d, got %d", http.StatusInternalServerError, rr.Code)
	}
	if !repo.updatedSettings {
		t.Fatalf("expected settings update to be attempted")
	}
}

func TestUserHandler_DeleteMe_RepoFailure(t *testing.T) {
	userID := uuid.New()
	repo := &stubUserRepoForSettingsHandlers{
		user:      &models.User{ID: userID},
		deleteErr: errors.New("delete failed"),
	}
	h := &UserHandler{userRepo: repo}

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/user/me", nil)
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))

	rr := httptest.NewRecorder()
	h.DeleteMe(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("expected status %d, got %d", http.StatusInternalServerError, rr.Code)
	}
	if !repo.deletedUser {
		t.Fatalf("expected delete to be attempted")
	}
}
