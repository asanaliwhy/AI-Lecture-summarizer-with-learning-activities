package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type Quiz struct {
	ID            uuid.UUID       `json:"id"`
	UserID        uuid.UUID       `json:"user_id"`
	SummaryID     *uuid.UUID      `json:"summary_id"`
	Title         string          `json:"title"`
	ConfigJSON    json.RawMessage `json:"config"`
	QuestionsJSON json.RawMessage `json:"questions"`
	QuestionCount int             `json:"question_count"`
	CreatedAt     time.Time       `json:"created_at"`
}

type QuizAttempt struct {
	ID               uuid.UUID       `json:"id"`
	QuizID           uuid.UUID       `json:"quiz_id"`
	UserID           uuid.UUID       `json:"user_id"`
	AnswersJSON      json.RawMessage `json:"answers"`
	ScorePercent     *float64        `json:"score_percent"`
	CorrectCount     *int            `json:"correct_count"`
	StartedAt        time.Time       `json:"started_at"`
	CompletedAt      *time.Time      `json:"completed_at"`
	TimeTakenSeconds *int            `json:"time_taken_seconds"`
}

type GenerateQuizRequest struct {
	SummaryID        uuid.UUID `json:"summary_id"`
	Title            string    `json:"title"`
	NumQuestions     int       `json:"num_questions"`
	Difficulty       string    `json:"difficulty"`
	QuestionTypes    []string  `json:"question_types"`
	EnableTimer      bool      `json:"enable_timer"`
	ShuffleQuestions bool      `json:"shuffle_questions"`
	EnableHints      bool      `json:"enable_hints"`
	Topics           []string  `json:"topics"`
}

type QuizQuestion struct {
	Question     string   `json:"question"`
	Type         string   `json:"type"`
	Options      []string `json:"options"`
	CorrectIndex int      `json:"correct_index"`
	Explanation  string   `json:"explanation"`
	Hint         string   `json:"hint"`
	Difficulty   string   `json:"difficulty"`
	Topic        string   `json:"topic"`
}

type SaveProgressRequest struct {
	QuestionIndex int `json:"question_index"`
	AnswerIndex   int `json:"answer_index"`
}
