package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"

	"lectura-backend/internal/middleware"
	"lectura-backend/internal/services"
)

type WSTicketHandler struct {
	redis *redis.Client
}

func NewWSTicketHandler(redisClient *redis.Client) *WSTicketHandler {
	return &WSTicketHandler{redis: redisClient}
}

func (h *WSTicketHandler) IssueTicket(w http.ResponseWriter, r *http.Request) {
	if h.redis == nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "WebSocket ticket service unavailable", r))
		return
	}

	userID := middleware.GetUserID(r.Context())
	if userID.String() == "" {
		writeJSON(w, http.StatusUnauthorized, errorResp("UNAUTHORIZED", "Unauthorized", r))
		return
	}

	ticket, err := services.GenerateToken(16)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to generate WebSocket ticket", r))
		return
	}

	key := fmt.Sprintf("ws_ticket:%s", ticket)
	if err := h.redis.Set(context.Background(), key, userID.String(), 30*time.Second).Err(); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to issue WebSocket ticket", r))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"ticket": ticket})
}
