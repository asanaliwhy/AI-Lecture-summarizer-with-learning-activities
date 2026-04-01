package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type PresentationStat struct {
	Value string `json:"value"`
	Label string `json:"label"`
}

type PresentationColumn struct {
	Label string   `json:"label"`
	Items []string `json:"items"`
}

type PresentationTakeaway struct {
	Title       string `json:"title"`
	Description string `json:"description"`
}

type PresentationSlide struct {
	ID           string                 `json:"id,omitempty"`
	Index        int                    `json:"index"`
	Type         string                 `json:"type"`
	Title        string                 `json:"title,omitempty"`
	Subtitle     *string                `json:"subtitle,omitempty"`
	Icon         *string                `json:"icon,omitempty"`
	Bullets      []string               `json:"bullets,omitempty"`
	ImageURL     *string                `json:"imageUrl,omitempty"`
	ImageAlt     *string                `json:"imageAlt,omitempty"`
	ImageQuery   *string                `json:"imageQuery,omitempty"`
	Columns      []PresentationColumn   `json:"columns,omitempty"`
	LeftColumn   []string               `json:"leftColumn,omitempty"`
	RightColumn  []string               `json:"rightColumn,omitempty"`
	LeftLabel    *string                `json:"leftLabel,omitempty"`
	RightLabel   *string                `json:"rightLabel,omitempty"`
	Quote        *string                `json:"quote,omitempty"`
	QuoteAuthor  *string                `json:"quoteAuthor,omitempty"`
	Stats        []PresentationStat     `json:"stats,omitempty"`
	Takeaways    []PresentationTakeaway `json:"takeaways,omitempty"`
	SectionLabel *string                `json:"sectionLabel,omitempty"`
	Notes        *string                `json:"notes,omitempty"`
	SpeakerNotes string                 `json:"speakerNotes,omitempty"`
}

type Presentation struct {
	ID              uuid.UUID           `json:"id"`
	UserID          uuid.UUID           `json:"user_id"`
	ContentID       *uuid.UUID          `json:"content_id"`
	Title           string              `json:"title"`
	Topic           *string             `json:"topic,omitempty"`
	Language        string              `json:"language"`
	Theme           string              `json:"theme"`
	SlideCount      int                 `json:"slide_count"`
	Slides          []PresentationSlide `json:"slides"`
	Status          string              `json:"status"`
	QualityFallback bool                `json:"quality_fallback"`
	IsFavorite      bool                `json:"is_favorite"`
	CreatedAt       time.Time           `json:"created_at"`
	UpdatedAt       time.Time           `json:"updated_at"`
	LastAccessedAt  *time.Time          `json:"last_accessed_at,omitempty"`
	ConfigJSON      json.RawMessage     `json:"config,omitempty"`
}

type GeneratePresentationRequest struct {
	ContentID  uuid.UUID `json:"content_id"`
	SlideCount int       `json:"slide_count"`
	Language   string    `json:"language"`
	TextStyle  string    `json:"text_style"`
	Theme      string    `json:"theme"`
	FocusAreas []string  `json:"focus_areas"`
}
