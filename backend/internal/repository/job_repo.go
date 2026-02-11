package repository

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"lectura-backend/internal/models"
)

type JobRepo struct {
	pool *pgxpool.Pool
}

func NewJobRepo(pool *pgxpool.Pool) *JobRepo {
	return &JobRepo{pool: pool}
}

func (r *JobRepo) Create(ctx context.Context, j *models.Job) error {
	j.ID = uuid.New()
	j.Status = "pending"
	j.RetryCount = 0
	j.MaxRetries = 3

	configBytes, _ := json.Marshal(j.ConfigJSON)
	if configBytes == nil {
		configBytes = []byte("{}")
	}

	query := `INSERT INTO jobs (id, user_id, type, reference_id, config_json, status, retry_count)
		VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING created_at`

	return r.pool.QueryRow(ctx, query,
		j.ID, j.UserID, j.Type, j.ReferenceID, configBytes, j.Status, j.RetryCount,
	).Scan(&j.CreatedAt)
}

func (r *JobRepo) GetByID(ctx context.Context, id uuid.UUID) (*models.Job, error) {
	j := &models.Job{}
	query := `SELECT id, user_id, type, reference_id, config_json, status, retry_count, error_message, created_at, completed_at
		FROM jobs WHERE id = $1`

	err := r.pool.QueryRow(ctx, query, id).Scan(
		&j.ID, &j.UserID, &j.Type, &j.ReferenceID, &j.ConfigJSON, &j.Status,
		&j.RetryCount, &j.ErrorMessage, &j.CreatedAt, &j.CompletedAt,
	)
	if err != nil {
		return nil, err
	}
	return j, nil
}

func (r *JobRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status string) error {
	query := "UPDATE jobs SET status = $1 WHERE id = $2"
	if status == "completed" || status == "failed" {
		now := time.Now()
		query = "UPDATE jobs SET status = $1, completed_at = $2 WHERE id = $3"
		_, err := r.pool.Exec(ctx, query, status, now, id)
		return err
	}
	_, err := r.pool.Exec(ctx, query, status, id)
	return err
}

func (r *JobRepo) UpdateError(ctx context.Context, id uuid.UUID, errMsg string, retryCount int) error {
	_, err := r.pool.Exec(ctx,
		"UPDATE jobs SET error_message = $1, retry_count = $2 WHERE id = $3",
		errMsg, retryCount, id,
	)
	return err
}
