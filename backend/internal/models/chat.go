package models

import (
	"time"

	"github.com/google/uuid"
)

// ChatMessage represents a single message in a conversation.
type ChatMessage struct {
	Role    string `json:"role"` // "user" or "assistant"
	Content string `json:"content"`
}

// ChatRequest is the payload sent to the chat endpoint.
type ChatRequest struct {
	Message string        `json:"message"`
	History []ChatMessage `json:"history"`
}

// ChatResponse is the reply from the AI chat.
type ChatResponse struct {
	Reply string `json:"reply"`
}

// ChatHistoryMessage is a persisted chat message row.
type ChatHistoryMessage struct {
	ID        uuid.UUID `json:"id"`
	SummaryID uuid.UUID `json:"-"`
	UserID    uuid.UUID `json:"-"`
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

type CreateChatHistoryMessageRequest struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}
