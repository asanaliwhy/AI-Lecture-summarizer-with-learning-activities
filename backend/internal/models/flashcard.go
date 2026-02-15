package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type FlashcardDeck struct {
	ID         uuid.UUID       `json:"id"`
	UserID     uuid.UUID       `json:"user_id"`
	SummaryID  *uuid.UUID      `json:"summary_id"`
	Title      string          `json:"title"`
	ConfigJSON json.RawMessage `json:"config"`
	CardCount  int             `json:"card_count"`
	IsFavorite bool            `json:"is_favorite"`
	CreatedAt  time.Time       `json:"created_at"`
}

type FlashcardCard struct {
	ID             uuid.UUID  `json:"id"`
	DeckID         uuid.UUID  `json:"deck_id"`
	Front          string     `json:"front"`
	Back           string     `json:"back"`
	Mnemonic       *string    `json:"mnemonic"`
	Example        *string    `json:"example"`
	Topic          string     `json:"topic"`
	Difficulty     int        `json:"difficulty"` // 1=easy, 2=medium, 3=hard
	IntervalDays   int        `json:"interval_days"`
	EaseFactor     float64    `json:"ease_factor"`
	Repetitions    int        `json:"repetitions"`
	NextReviewAt   time.Time  `json:"next_review_at"`
	LastReviewedAt *time.Time `json:"last_reviewed_at"`
}

type GenerateFlashcardsRequest struct {
	SummaryID              uuid.UUID `json:"summary_id"`
	Title                  string    `json:"title"`
	NumCards               int       `json:"num_cards"`
	Strategy               string    `json:"strategy"` // "term_definition" | "question_answer"
	Topics                 []string  `json:"topics"`
	EnableSpacedRepetition bool      `json:"enable_spaced_repetition"`
	IncludeMnemonics       bool      `json:"include_mnemonics"`
	IncludeExamples        bool      `json:"include_examples"`
}

type CardRatingRequest struct {
	Rating int `json:"rating"` // 0=Again, 1=Hard, 2=Good, 3=Easy
}

type DeckStats struct {
	TotalCards  int     `json:"total_cards"`
	Mastered    int     `json:"mastered"`
	Learning    int     `json:"learning"`
	New         int     `json:"new"`
	DueToday    int     `json:"due_today"`
	MasteryRate float64 `json:"mastery_rate"`
}
