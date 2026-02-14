package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type StudySession struct {
	ID              uuid.UUID       `json:"id"`
	UserID          uuid.UUID       `json:"user_id"`
	ActivityType    string          `json:"activity_type"`
	ResourceID      uuid.UUID       `json:"resource_id"`
	StartedAt       time.Time       `json:"started_at"`
	LastHeartbeatAt time.Time       `json:"last_heartbeat_at"`
	EndedAt         *time.Time      `json:"ended_at,omitempty"`
	DurationSeconds int             `json:"duration_seconds"`
	ClientMetaJSON  json.RawMessage `json:"client_meta"`
	CreatedAt       time.Time       `json:"created_at"`
}
