package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"lectura-backend/internal/middleware"
	"lectura-backend/internal/models"
	"lectura-backend/internal/services"
)

type ChatHandler struct {
	summaryRepo   summaryRepository
	geminiService *services.GeminiService
}

func NewChatHandler(summaryRepo summaryRepository, geminiService *services.GeminiService) *ChatHandler {
	return &ChatHandler{
		summaryRepo:   summaryRepo,
		geminiService: geminiService,
	}
}

func (h *ChatHandler) AskQuestion(w http.ResponseWriter, r *http.Request) {
	summaryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid summary ID", r))
		return
	}

	var req models.ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}

	if strings.TrimSpace(req.Message) == "" {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Message is required", r))
		return
	}

	// Load summary and verify ownership
	summary, err := h.summaryRepo.GetByID(r.Context(), summaryID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Summary not found", r))
		return
	}

	userID := middleware.GetUserID(r.Context())
	if summary.UserID != userID {
		writeJSON(w, http.StatusForbidden, errorResp("FORBIDDEN", "Access denied", r))
		return
	}

	// Build summary context text
	var summaryContent string
	if summary.ContentRaw != nil && *summary.ContentRaw != "" {
		summaryContent = *summary.ContentRaw
	} else if summary.CornellCues != nil || summary.CornellNotes != nil || summary.CornellSummary != nil {
		var parts []string
		if summary.CornellCues != nil {
			parts = append(parts, "CUES:\n"+*summary.CornellCues)
		}
		if summary.CornellNotes != nil {
			parts = append(parts, "NOTES:\n"+*summary.CornellNotes)
		}
		if summary.CornellSummary != nil {
			parts = append(parts, "SUMMARY:\n"+*summary.CornellSummary)
		}
		summaryContent = strings.Join(parts, "\n\n")
	}

	if summaryContent == "" {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Summary has no content to chat about", r))
		return
	}

	// Call Gemini chat
	reply, err := h.geminiService.ChatWithSummary(r.Context(), summaryContent, req.Message, req.History)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("AI_ERROR", "Failed to get AI response", r))
		return
	}

	writeJSON(w, http.StatusOK, models.ChatResponse{Reply: reply})
}
