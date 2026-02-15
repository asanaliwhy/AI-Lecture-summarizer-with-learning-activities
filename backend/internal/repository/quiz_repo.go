package repository

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"lectura-backend/internal/models"
)

type QuizRepo struct {
	pool *pgxpool.Pool
}

func NewQuizRepo(pool *pgxpool.Pool) *QuizRepo {
	return &QuizRepo{pool: pool}
}

func (r *QuizRepo) Create(ctx context.Context, q *models.Quiz) error {
	q.ID = uuid.New()
	configBytes, _ := json.Marshal(q.ConfigJSON)
	questionsBytes, _ := json.Marshal(q.QuestionsJSON)
	if configBytes == nil {
		configBytes = []byte("{}")
	}
	if questionsBytes == nil {
		questionsBytes = []byte("[]")
	}

	query := `INSERT INTO quizzes (id, user_id, summary_id, title, config_json, questions_json, question_count)
		VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING created_at`

	return r.pool.QueryRow(ctx, query,
		q.ID, q.UserID, q.SummaryID, q.Title, configBytes, questionsBytes, q.QuestionCount,
	).Scan(&q.CreatedAt)
}

func (r *QuizRepo) GetByID(ctx context.Context, id uuid.UUID) (*models.Quiz, error) {
	q := &models.Quiz{}
	query := `SELECT id, user_id, summary_id, title, config_json, questions_json, question_count, created_at
		FROM quizzes WHERE id = $1`

	err := r.pool.QueryRow(ctx, query, id).Scan(
		&q.ID, &q.UserID, &q.SummaryID, &q.Title, &q.ConfigJSON, &q.QuestionsJSON, &q.QuestionCount, &q.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return q, nil
}

func (r *QuizRepo) ListByUser(ctx context.Context, userID uuid.UUID) ([]*models.Quiz, error) {
	query := `SELECT
		q.id,
		q.user_id,
		q.summary_id,
		q.title,
		q.config_json,
		q.questions_json,
		q.question_count,
		q.is_favorite,
		q.created_at,
		qa.score_percent::float8 AS last_score,
		qa.id AS last_attempt_id
	FROM quizzes q
	LEFT JOIN LATERAL (
		SELECT id, score_percent
		FROM quiz_attempts
		WHERE quiz_id = q.id
		  AND user_id = $1
		  AND completed_at IS NOT NULL
		ORDER BY completed_at DESC, started_at DESC
		LIMIT 1
	) qa ON true
	WHERE q.user_id = $1
	ORDER BY q.created_at DESC`

	rows, err := r.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var quizzes []*models.Quiz
	for rows.Next() {
		q := &models.Quiz{}
		err := rows.Scan(
			&q.ID,
			&q.UserID,
			&q.SummaryID,
			&q.Title,
			&q.ConfigJSON,
			&q.QuestionsJSON,
			&q.QuestionCount,
			&q.IsFavorite,
			&q.CreatedAt,
			&q.LastScore,
			&q.LastAttemptID,
		)
		if err != nil {
			return nil, err
		}
		quizzes = append(quizzes, q)
	}
	return quizzes, nil
}

func (r *QuizRepo) UpdateQuestions(ctx context.Context, id uuid.UUID, questions json.RawMessage, count int) error {
	_, err := r.pool.Exec(ctx,
		"UPDATE quizzes SET questions_json = $1, question_count = $2 WHERE id = $3",
		questions, count, id,
	)
	return err
}

func (r *QuizRepo) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, "DELETE FROM quizzes WHERE id = $1", id)
	return err
}

func (r *QuizRepo) ToggleFavorite(ctx context.Context, id uuid.UUID, userID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, "UPDATE quizzes SET is_favorite = NOT is_favorite WHERE id = $1 AND user_id = $2", id, userID)
	return err
}

// Quiz Attempts

func (r *QuizRepo) CreateAttempt(ctx context.Context, a *models.QuizAttempt) error {
	a.ID = uuid.New()
	a.StartedAt = time.Now()
	query := `INSERT INTO quiz_attempts (id, quiz_id, user_id, started_at)
		VALUES ($1, $2, $3, $4)`

	_, err := r.pool.Exec(ctx, query, a.ID, a.QuizID, a.UserID, a.StartedAt)
	return err
}

func (r *QuizRepo) GetAttemptByID(ctx context.Context, id uuid.UUID) (*models.QuizAttempt, error) {
	a := &models.QuizAttempt{}
	query := `SELECT id, quiz_id, user_id, answers_json, score_percent, correct_count, started_at, completed_at, time_taken_seconds
		FROM quiz_attempts WHERE id = $1`

	err := r.pool.QueryRow(ctx, query, id).Scan(
		&a.ID, &a.QuizID, &a.UserID, &a.AnswersJSON, &a.ScorePercent, &a.CorrectCount,
		&a.StartedAt, &a.CompletedAt, &a.TimeTakenSeconds,
	)
	if err != nil {
		return nil, err
	}
	return a, nil
}

func (r *QuizRepo) SaveProgress(ctx context.Context, attemptID uuid.UUID, answers json.RawMessage) error {
	_, err := r.pool.Exec(ctx, "UPDATE quiz_attempts SET answers_json = $1 WHERE id = $2", answers, attemptID)
	return err
}

func (r *QuizRepo) SubmitAttempt(ctx context.Context, attemptID uuid.UUID, score float64, correct int, answers json.RawMessage) error {
	now := time.Now()
	_, err := r.pool.Exec(ctx,
		`UPDATE quiz_attempts SET answers_json = $1, score_percent = $2, correct_count = $3,
		 completed_at = $4, time_taken_seconds = EXTRACT(EPOCH FROM ($4 - started_at))::INTEGER
		 WHERE id = $5`,
		answers, score, correct, now, attemptID,
	)
	return err
}
