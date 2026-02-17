package models

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
