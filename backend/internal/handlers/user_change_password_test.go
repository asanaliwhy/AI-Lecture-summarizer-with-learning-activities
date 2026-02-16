package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"

	"lectura-backend/internal/middleware"
	"lectura-backend/internal/models"
)

type stubUserRepoForPassword struct {
	user       *models.User
	updateErr  error
	updated    bool
	updatedID  uuid.UUID
	updatedPwd string
}

func (s *stubUserRepoForPassword) Create(ctx context.Context, user *models.User) error {
	return nil
}

func (s *stubUserRepoForPassword) GetByEmail(ctx context.Context, email string) (*models.User, error) {
	return nil, pgx.ErrNoRows
}

func (s *stubUserRepoForPassword) GetByID(ctx context.Context, id uuid.UUID) (*models.User, error) {
	if s.user == nil {
		return nil, pgx.ErrNoRows
	}
	return s.user, nil
}

func (s *stubUserRepoForPassword) Update(ctx context.Context, user *models.User) error {
	return nil
}

func (s *stubUserRepoForPassword) UpdateLastLogin(ctx context.Context, id uuid.UUID) error {
	return nil
}

func (s *stubUserRepoForPassword) UpdatePassword(ctx context.Context, userID uuid.UUID, passwordHash string) error {
	s.updated = true
	s.updatedID = userID
	s.updatedPwd = passwordHash
	return s.updateErr
}

func (s *stubUserRepoForPassword) VerifyEmail(ctx context.Context, id uuid.UUID) error {
	return nil
}

func (s *stubUserRepoForPassword) Delete(ctx context.Context, id uuid.UUID) error {
	return nil
}

func (s *stubUserRepoForPassword) CreateSettings(ctx context.Context, userID uuid.UUID) error {
	return nil
}

func (s *stubUserRepoForPassword) GetSettings(ctx context.Context, userID uuid.UUID) (*models.UserSettings, error) {
	return nil, pgx.ErrNoRows
}

func (s *stubUserRepoForPassword) UpdateSettings(ctx context.Context, settings *models.UserSettings) error {
	return nil
}

func (s *stubUserRepoForPassword) SetNotificationSetting(ctx context.Context, userID uuid.UUID, key string, enabled bool) error {
	return nil
}

func (s *stubUserRepoForPassword) UpdateNotificationTimestamps(ctx context.Context, userID uuid.UUID, updates map[string]string) error {
	return nil
}

func (s *stubUserRepoForPassword) ListUsersForNotification(ctx context.Context, key string) ([]*models.User, error) {
	return nil, nil
}

func (s *stubUserRepoForPassword) GetLastNotificationSentAt(ctx context.Context, userID uuid.UUID, key string) (*string, error) {
	return nil, nil
}

func (s *stubUserRepoForPassword) BuildWeeklyDigestStats(ctx context.Context, userID uuid.UUID) (map[string]interface{}, error) {
	return nil, nil
}

func (s *stubUserRepoForPassword) GetLastStudyActivityAt(ctx context.Context, userID uuid.UUID) (*string, error) {
	return nil, nil
}

func TestUserHandler_ChangePassword_Validation(t *testing.T) {
	userID := uuid.New()
	hash, err := bcrypt.GenerateFromPassword([]byte("CurrentPass1"), 12)
	if err != nil {
		t.Fatalf("failed to hash password: %v", err)
	}

	repo := &stubUserRepoForPassword{user: &models.User{ID: userID, PasswordHash: string(hash)}}
	h := &UserHandler{userRepo: repo}

	body := `{"current_password":"CurrentPass1","new_password":"NoDigits"}`
	req := httptest.NewRequest(http.MethodPut, "/api/v1/user/password", strings.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	h.ChangePassword(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, rr.Code)
	}
	if repo.updated {
		t.Fatalf("password should not be updated on validation error")
	}
}

func TestUserHandler_ChangePassword_CurrentPasswordMismatch(t *testing.T) {
	userID := uuid.New()
	hash, err := bcrypt.GenerateFromPassword([]byte("CurrentPass1"), 12)
	if err != nil {
		t.Fatalf("failed to hash password: %v", err)
	}

	repo := &stubUserRepoForPassword{user: &models.User{ID: userID, PasswordHash: string(hash)}}
	h := &UserHandler{userRepo: repo}

	body := `{"current_password":"WrongPass1","new_password":"NewPass123"}`
	req := httptest.NewRequest(http.MethodPut, "/api/v1/user/password", strings.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	h.ChangePassword(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected status %d, got %d", http.StatusUnauthorized, rr.Code)
	}
	if repo.updated {
		t.Fatalf("password should not be updated for wrong current password")
	}
}

func TestUserHandler_ChangePassword_Success(t *testing.T) {
	userID := uuid.New()
	hash, err := bcrypt.GenerateFromPassword([]byte("CurrentPass1"), 12)
	if err != nil {
		t.Fatalf("failed to hash password: %v", err)
	}

	repo := &stubUserRepoForPassword{user: &models.User{ID: userID, PasswordHash: string(hash)}}
	h := &UserHandler{userRepo: repo}

	body := `{"current_password":"CurrentPass1","new_password":"NewPass123"}`
	req := httptest.NewRequest(http.MethodPut, "/api/v1/user/password", strings.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	h.ChangePassword(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rr.Code)
	}
	if !repo.updated {
		t.Fatalf("password should be updated on success")
	}
	if repo.updatedID != userID {
		t.Fatalf("expected updated user id %s, got %s", userID, repo.updatedID)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(repo.updatedPwd), []byte("NewPass123")); err != nil {
		t.Fatalf("stored password hash does not match new password")
	}

	var payload map[string]string
	if err := json.NewDecoder(rr.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if payload["message"] != "Password changed successfully" {
		t.Fatalf("unexpected response message: %q", payload["message"])
	}
}
