package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type Job struct {
	ID           uuid.UUID       `json:"id"`
	UserID       uuid.UUID       `json:"user_id"`
	Type         string          `json:"type"` // "content-processing" | "summary-generation" | "quiz-generation" | "flashcard-generation"
	ReferenceID  uuid.UUID       `json:"reference_id"`
	ConfigJSON   json.RawMessage `json:"config"`
	Status       string          `json:"status"` // "pending" | "processing" | "completed" | "failed"
	RetryCount   int             `json:"retry_count"`
	MaxRetries   int             `json:"max_retries"`
	ErrorMessage *string         `json:"error_message"`
	CreatedAt    time.Time       `json:"created_at"`
	CompletedAt  *time.Time      `json:"completed_at"`
}

type UserSettings struct {
	UserID               uuid.UUID       `json:"user_id"`
	DefaultSummaryLength string          `json:"default_summary_length"`
	DefaultFormat        string          `json:"default_format"`
	DefaultDifficulty    string          `json:"default_difficulty"`
	Language             string          `json:"language"`
	NotificationsJSON    json.RawMessage `json:"notifications"`
	UpdatedAt            time.Time       `json:"updated_at"`
}

// WebSocket message types
type WSMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

type StatusUpdate struct {
	JobID                     uuid.UUID `json:"job_id"`
	Step                      int       `json:"step"`
	StepName                  string    `json:"step_name"`
	EstimatedSecondsRemaining int       `json:"estimated_seconds_remaining"`
}

type PartialContent struct {
	JobID           uuid.UUID `json:"job_id"`
	Chunk           string    `json:"chunk"`
	TotalChunksSent int       `json:"total_chunks_sent"`
}

type CompletedEvent struct {
	JobID      uuid.UUID `json:"job_id"`
	ResultID   uuid.UUID `json:"result_id"`
	ResultType string    `json:"result_type"`
}

type ErrorEvent struct {
	JobID        uuid.UUID `json:"job_id"`
	ErrorCode    string    `json:"error_code"`
	ErrorMessage string    `json:"error_message"`
}

// API Error response
type APIError struct {
	Code      string            `json:"code"`
	Message   string            `json:"message"`
	Fields    map[string]string `json:"fields,omitempty"`
	RequestID string            `json:"request_id"`
}

type ErrorResponse struct {
	Error APIError `json:"error"`
}
