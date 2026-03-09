package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"lectura-backend/internal/models"
	"lectura-backend/internal/services"
)

const (
	refreshTokenCookieName = "refresh_token"
	refreshTokenCookiePath = "/api/v1/auth/refresh"
)

type authService interface {
	Register(ctx context.Context, req models.RegisterRequest) (*models.User, string, error)
	VerifyEmail(ctx context.Context, token string) (*models.AuthTokens, error)
	Login(ctx context.Context, req models.LoginRequest) (*models.AuthTokens, error)
	RefreshToken(ctx context.Context, refreshToken string) (*models.AuthTokens, error)
	Logout(ctx context.Context, refreshToken string) error
	GoogleLogin(ctx context.Context, idToken string) (*models.AuthTokens, error)
	GoogleCodeLogin(ctx context.Context, code string) (*models.AuthTokens, error)
	GoogleOAuthConfig() (clientID string, redirectURI string, configured bool)
	ResendVerification(ctx context.Context, email string) error
}

type AuthHandler struct {
	authService  authService
	frontendURL  string
	isProduction bool
}

func NewAuthHandler(authService *services.AuthService, frontendURL string, isProduction bool) *AuthHandler {
	return &AuthHandler{authService: authService, frontendURL: frontendURL, isProduction: isProduction}
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req models.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}

	user, _, err := h.authService.Register(r.Context(), req)
	if err != nil {
		handleServiceError(w, r, err)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"message": "Check your email to verify your account.",
		"user_id": user.ID,
	})
}

func (h *AuthHandler) VerifyEmail(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Token is required", r))
		return
	}

	tokens, err := h.authService.VerifyEmail(r.Context(), token)
	if err != nil {
		handleServiceError(w, r, err)
		return
	}

	setRefreshTokenCookie(w, tokens.RefreshToken, h.isProduction)
	writeAuthResponse(w, http.StatusOK, tokens)
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}

	tokens, err := h.authService.Login(r.Context(), req)
	if err != nil {
		handleServiceError(w, r, err)
		return
	}

	setRefreshTokenCookie(w, tokens.RefreshToken, h.isProduction)
	writeAuthResponse(w, http.StatusOK, tokens)
}

func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	refreshToken, err := readRefreshTokenFromRequest(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}
	if refreshToken == "" {
		writeJSON(w, http.StatusUnauthorized, errorResp("UNAUTHORIZED", "Refresh token missing or expired. Please log in again.", r))
		return
	}

	tokens, err := h.authService.RefreshToken(r.Context(), refreshToken)
	if err != nil {
		handleServiceError(w, r, err)
		return
	}

	setRefreshTokenCookie(w, tokens.RefreshToken, h.isProduction)
	writeAuthResponse(w, http.StatusOK, tokens)
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	refreshToken, err := readRefreshTokenFromRequest(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}

	if refreshToken != "" {
		h.authService.Logout(r.Context(), refreshToken)
	}
	clearRefreshTokenCookie(w, h.isProduction)
	writeJSON(w, http.StatusOK, map[string]string{"message": "Logged out successfully"})
}

func (h *AuthHandler) GoogleLogin(w http.ResponseWriter, r *http.Request) {
	var req models.GoogleLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}

	if req.IDToken == "" {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "id_token is required", r))
		return
	}

	tokens, err := h.authService.GoogleLogin(r.Context(), req.IDToken)
	if err != nil {
		handleServiceError(w, r, err)
		return
	}

	setRefreshTokenCookie(w, tokens.RefreshToken, h.isProduction)
	writeAuthResponse(w, http.StatusOK, tokens)
}

func (h *AuthHandler) GoogleCodeLogin(w http.ResponseWriter, r *http.Request) {
	var req models.GoogleCodeLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}

	if req.Code == "" {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "code is required", r))
		return
	}

	tokens, err := h.authService.GoogleCodeLogin(r.Context(), req.Code)
	if err != nil {
		handleServiceError(w, r, err)
		return
	}

	setRefreshTokenCookie(w, tokens.RefreshToken, h.isProduction)
	writeAuthResponse(w, http.StatusOK, tokens)
}

func (h *AuthHandler) GoogleConfig(w http.ResponseWriter, r *http.Request) {
	clientID, redirectURI, configured := h.authService.GoogleOAuthConfig()

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"configured":   configured,
		"client_id":    clientID,
		"redirect_uri": redirectURI,
	})
}

func (h *AuthHandler) ResendVerification(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}

	err := h.authService.ResendVerification(r.Context(), req.Email)
	if err != nil {
		handleServiceError(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "If that email is registered and unverified, a new verification email has been sent."})
}

// Shared helpers

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func errorResp(code, message string, r *http.Request) models.ErrorResponse {
	return models.ErrorResponse{
		Error: models.APIError{
			Code:      code,
			Message:   message,
			RequestID: r.Header.Get("X-Request-ID"),
		},
	}
}

func errorRespWithFields(code, message string, fields map[string]string, r *http.Request) models.ErrorResponse {
	return models.ErrorResponse{
		Error: models.APIError{
			Code:      code,
			Message:   message,
			Fields:    fields,
			RequestID: r.Header.Get("X-Request-ID"),
		},
	}
}

func handleServiceError(w http.ResponseWriter, r *http.Request, err error) {
	switch e := err.(type) {
	case *services.ValidationError:
		writeJSON(w, http.StatusBadRequest, errorRespWithFields("VALIDATION_ERROR", "Validation failed", e.Fields, r))
	case *services.ConflictError:
		writeJSON(w, http.StatusConflict, errorResp("CONFLICT", e.Message, r))
	case *services.NotFoundError:
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", e.Message, r))
	case *services.UnauthorizedError:
		writeJSON(w, http.StatusUnauthorized, errorResp("UNAUTHORIZED", e.Message, r))
	case *services.ForbiddenError:
		writeJSON(w, http.StatusForbidden, errorResp("FORBIDDEN", e.Message, r))
	case *services.RateLimitError:
		writeJSON(w, http.StatusTooManyRequests, errorResp("RATE_LIMITED", e.Message, r))
	default:
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "An unexpected error occurred", r))
	}
}

func writeAuthResponse(w http.ResponseWriter, status int, tokens *models.AuthTokens) {
	writeJSON(w, status, map[string]interface{}{
		"access_token": tokens.AccessToken,
		"expires_in":   tokens.ExpiresIn,
	})
}

func setRefreshTokenCookie(w http.ResponseWriter, refreshToken string, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     refreshTokenCookieName,
		Value:    refreshToken,
		Path:     refreshTokenCookiePath,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   int((7 * 24 * time.Hour).Seconds()),
	})
}

func clearRefreshTokenCookie(w http.ResponseWriter, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     refreshTokenCookieName,
		Value:    "",
		Path:     refreshTokenCookiePath,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
	})
}

func readRefreshTokenFromRequest(r *http.Request) (string, error) {
	if c, err := r.Cookie(refreshTokenCookieName); err == nil {
		if token := strings.TrimSpace(c.Value); token != "" {
			return token, nil
		}
	}

	if r.Body == nil {
		return "", nil
	}

	var req models.RefreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		if errors.Is(err, io.EOF) {
			return "", nil
		}
		return "", err
	}

	return strings.TrimSpace(req.RefreshToken), nil
}
