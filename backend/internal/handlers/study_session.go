package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"lectura-backend/internal/middleware"
	"lectura-backend/internal/models"
	"lectura-backend/internal/repository"
)

type StudySessionHandler struct {
	repo *repository.StudySessionRepo
}

func NewStudySessionHandler(repo *repository.StudySessionRepo) *StudySessionHandler {
	return &StudySessionHandler{repo: repo}
}

func (h *StudySessionHandler) Start(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())

	var req struct {
		ActivityType string          `json:"activity_type"`
		ResourceID   string          `json:"resource_id"`
		ClientMeta   json.RawMessage `json:"client_meta"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}

	if req.ActivityType != "summary" && req.ActivityType != "quiz" && req.ActivityType != "flashcard" {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "activity_type must be summary, quiz, or flashcard", r))
		return
	}

	resourceID, err := uuid.Parse(req.ResourceID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid resource_id", r))
		return
	}

	session := &models.StudySession{
		UserID:       userID,
		ActivityType: req.ActivityType,
		ResourceID:   resourceID,
		ClientMetaJSON: func() json.RawMessage {
			if len(req.ClientMeta) == 0 {
				return json.RawMessage("{}")
			}
			return req.ClientMeta
		}(),
	}

	if err := h.repo.Start(r.Context(), session); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to start study session", r))
		return
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"session": session,
	})
}

func (h *StudySessionHandler) Heartbeat(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	sessionID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid session ID", r))
		return
	}

	if err := h.repo.Heartbeat(r.Context(), sessionID, userID); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to update study session", r))
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Heartbeat recorded"})
}

func (h *StudySessionHandler) Stop(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	sessionID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid session ID", r))
		return
	}

	if err := h.repo.Stop(r.Context(), sessionID, userID); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to stop study session", r))
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Study session stopped"})
}
