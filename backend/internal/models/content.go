package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type Content struct {
	ID              uuid.UUID       `json:"id"`
	UserID          uuid.UUID       `json:"user_id"`
	Type            string          `json:"type"`   // "youtube" | "file"
	Status          string          `json:"status"` // "pending" | "processing" | "completed" | "failed"
	SourceURL       *string         `json:"source_url"`
	FilePath        *string         `json:"file_path"`
	Title           string          `json:"title"`
	DurationSeconds *int            `json:"duration_seconds"`
	Transcript      *string         `json:"transcript"`
	MetadataJSON    json.RawMessage `json:"metadata"`
	CreatedAt       time.Time       `json:"created_at"`
}

type ValidateYouTubeRequest struct {
	URL string `json:"url"`
}

type YouTubeMetadata struct {
	VideoID      string `json:"video_id"`
	Title        string `json:"title"`
	ChannelName  string `json:"channel_name"`
	ThumbnailURL string `json:"thumbnail_url"`
	Duration     int    `json:"duration_seconds"`
	WordCount    int    `json:"word_count,omitempty"`
}
