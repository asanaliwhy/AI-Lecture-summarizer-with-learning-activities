package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type Summary struct {
	ID             uuid.UUID       `json:"id"`
	UserID         uuid.UUID       `json:"user_id"`
	ContentID      *uuid.UUID      `json:"content_id"`
	Source         string          `json:"source"`
	Title          string          `json:"title"`
	Format         string          `json:"format"` // "cornell" | "bullets" | "paragraph"
	LengthSetting  string          `json:"length_setting"`
	ConfigJSON     json.RawMessage `json:"config"`
	ContentRaw     *string         `json:"content_raw"`
	CornellCues    *string         `json:"cornell_cues"`
	CornellNotes   *string         `json:"cornell_notes"`
	CornellSummary *string         `json:"cornell_summary"`
	Tags           []string        `json:"tags"`
	Description    *string         `json:"description"`
	WordCount      int             `json:"word_count"`
	IsFavorite     bool            `json:"is_favorite"`
	IsArchived     bool            `json:"is_archived"`
	CreatedAt      time.Time       `json:"created_at"`
	LastAccessedAt *time.Time      `json:"last_accessed_at"`
}

type GenerateSummaryRequest struct {
	ContentID      uuid.UUID `json:"content_id"`
	Format         string    `json:"format"`
	Length         string    `json:"length"`
	FocusAreas     []string  `json:"focus_areas"`
	TargetAudience string    `json:"target_audience"`
	Language       string    `json:"language"`
}
