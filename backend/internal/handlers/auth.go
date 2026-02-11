package handlers

import (
	"encoding/json"
	"net/http"

	"lectura-backend/internal/models"
	"lectura-backend/internal/services"
)

type AuthHandler struct {
	authService *services.AuthService
	frontendURL string
}

func NewAuthHandler(authService *services.AuthService, frontendURL string) *AuthHandler {
	return &AuthHandler{authService: authService, frontendURL: frontendURL}
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

	writeJSON(w, http.StatusOK, tokens)
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

	writeJSON(w, http.StatusOK, tokens)
}

func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	var req models.RefreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}

	tokens, err := h.authService.RefreshToken(r.Context(), req.RefreshToken)
	if err != nil {
		handleServiceError(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, tokens)
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	var req models.RefreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}

	h.authService.Logout(r.Context(), req.RefreshToken)
	writeJSON(w, http.StatusOK, map[string]string{"message": "Logged out successfully"})
}

func (h *AuthHandler) ResendVerification(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}

	_, err := h.authService.ResendVerification(r.Context(), req.Email)
	if err != nil {
		handleServiceError(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Verification email sent"})
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
