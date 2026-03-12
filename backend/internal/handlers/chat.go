package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"lectura-backend/internal/middleware"
	"lectura-backend/internal/models"
	"lectura-backend/internal/services"
)

const (
	maxChatMessageLength = 4000
	maxChatHistoryItems  = 20
	maxChatHistoryBytes  = 32000
	maxChatBodyBytes     = 64 * 1024
)

type chatService interface {
	ChatWithSummary(ctx context.Context, summaryContent, userMessage string, history []models.ChatMessage) (string, error)
}

type chatHistoryRepository interface {
	GetBySummaryAndUser(ctx context.Context, summaryID, userID uuid.UUID) ([]models.ChatHistoryMessage, error)
	Create(ctx context.Context, summaryID, userID uuid.UUID, role, content string) (*models.ChatHistoryMessage, error)
	DeleteBySummaryAndUser(ctx context.Context, summaryID, userID uuid.UUID) error
}

type ChatHandler struct {
	summaryRepo   summaryRepository
	chatRepo      chatHistoryRepository
	geminiService chatService
}

func NewChatHandler(summaryRepo summaryRepository, chatRepo chatHistoryRepository, geminiService *services.GeminiService) *ChatHandler {
	return &ChatHandler{
		summaryRepo:   summaryRepo,
		chatRepo:      chatRepo,
		geminiService: geminiService,
	}
}

func (h *ChatHandler) getOwnedSummary(r *http.Request, summaryID uuid.UUID) (*models.Summary, bool) {
	summary, err := h.summaryRepo.GetByID(r.Context(), summaryID)
	if err != nil {
		return nil, false
	}

	userID := middleware.GetUserID(r.Context())
	if summary.UserID != userID {
		return nil, false
	}

	return summary, true
}

func (h *ChatHandler) GetChatHistory(w http.ResponseWriter, r *http.Request) {
	summaryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid summary ID", r))
		return
	}

	if _, ok := h.getOwnedSummary(r, summaryID); !ok {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Summary not found", r))
		return
	}

	if h.chatRepo == nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Chat history storage unavailable", r))
		return
	}

	userID := middleware.GetUserID(r.Context())
	messages, err := h.chatRepo.GetBySummaryAndUser(r.Context(), summaryID, userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to fetch chat history", r))
		return
	}

	writeJSON(w, http.StatusOK, messages)
}

func (h *ChatHandler) CreateChatHistory(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxChatBodyBytes)

	summaryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid summary ID", r))
		return
	}

	if _, ok := h.getOwnedSummary(r, summaryID); !ok {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Summary not found", r))
		return
	}

	if h.chatRepo == nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Chat history storage unavailable", r))
		return
	}

	var req models.CreateChatHistoryMessageRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Request body too large", r))
			return
		}
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}

	role := strings.TrimSpace(req.Role)
	if role != "user" && role != "assistant" {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Role must be 'user' or 'assistant'", r))
		return
	}

	content := strings.TrimSpace(req.Content)
	if content == "" {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Content cannot be empty", r))
		return
	}

	if len([]rune(content)) > maxChatMessageLength {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", fmt.Sprintf("Content exceeds maximum length of %d characters", maxChatMessageLength), r))
		return
	}

	userID := middleware.GetUserID(r.Context())
	msg, err := h.chatRepo.Create(r.Context(), summaryID, userID, role, content)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to save chat message", r))
		return
	}

	writeJSON(w, http.StatusCreated, msg)
}

func (h *ChatHandler) ClearChatHistory(w http.ResponseWriter, r *http.Request) {
	summaryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid summary ID", r))
		return
	}

	if _, ok := h.getOwnedSummary(r, summaryID); !ok {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Summary not found", r))
		return
	}

	if h.chatRepo == nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Chat history storage unavailable", r))
		return
	}

	userID := middleware.GetUserID(r.Context())
	if err := h.chatRepo.DeleteBySummaryAndUser(r.Context(), summaryID, userID); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to clear chat history", r))
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Chat history cleared"})
}

func trimChatHistory(history []models.ChatMessage) []models.ChatMessage {
	trimmed := history
	if len(trimmed) > maxChatHistoryItems {
		trimmed = trimmed[len(trimmed)-maxChatHistoryItems:]
	}

	normalized := make([]models.ChatMessage, 0, len(trimmed))
	for _, msg := range trimmed {
		content := strings.TrimSpace(msg.Content)
		if content == "" {
			continue
		}

		if len([]rune(content)) > maxChatMessageLength {
			content = string([]rune(content)[:maxChatMessageLength])
		}

		role := "user"
		if msg.Role == "assistant" {
			role = "assistant"
		}

		normalized = append(normalized, models.ChatMessage{Role: role, Content: content})
	}

	historyBytes := func(items []models.ChatMessage) int {
		total := 0
		for _, m := range items {
			total += len(m.Role) + len(m.Content)
		}
		return total
	}

	for len(normalized) > 0 && historyBytes(normalized) > maxChatHistoryBytes {
		normalized = normalized[1:]
	}

	return normalized
}

func (h *ChatHandler) AskQuestion(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxChatBodyBytes)

	summaryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid summary ID", r))
		return
	}

	var req models.ChatRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Request body too large", r))
			return
		}
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}

	if strings.TrimSpace(req.Message) == "" {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Message cannot be empty", r))
		return
	}

	if len([]rune(req.Message)) > maxChatMessageLength {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", fmt.Sprintf("Message exceeds maximum length of %d characters", maxChatMessageLength), r))
		return
	}

	history := trimChatHistory(req.History)

	// Load summary and verify ownership
	summary, ok := h.getOwnedSummary(r, summaryID)
	if !ok {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Summary not found", r))
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
	reply, err := h.geminiService.ChatWithSummary(r.Context(), summaryContent, req.Message, history)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("AI_ERROR", "Failed to get AI response", r))
		return
	}

	writeJSON(w, http.StatusOK, models.ChatResponse{Reply: reply})
}
