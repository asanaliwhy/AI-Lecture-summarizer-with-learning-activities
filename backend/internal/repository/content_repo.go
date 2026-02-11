package repository

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"lectura-backend/internal/models"
)

type ContentRepo struct {
	pool *pgxpool.Pool
}

func NewContentRepo(pool *pgxpool.Pool) *ContentRepo {
	return &ContentRepo{pool: pool}
}

func (r *ContentRepo) Create(ctx context.Context, c *models.Content) error {
	c.ID = uuid.New()

	metaBytes, _ := json.Marshal(c.MetadataJSON)
	if c.MetadataJSON == nil {
		metaBytes = []byte("{}")
	}

	query := `INSERT INTO content (id, user_id, type, status, source_url, file_path, title, duration_seconds, metadata_json)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING created_at`

	return r.pool.QueryRow(ctx, query,
		c.ID, c.UserID, c.Type, c.Status, c.SourceURL, c.FilePath, c.Title,
		c.DurationSeconds, metaBytes,
	).Scan(&c.CreatedAt)
}

func (r *ContentRepo) GetByID(ctx context.Context, id uuid.UUID) (*models.Content, error) {
	c := &models.Content{}
	query := `SELECT id, user_id, type, status, source_url, file_path, title, duration_seconds, transcript, metadata_json, created_at
		FROM content WHERE id = $1`

	err := r.pool.QueryRow(ctx, query, id).Scan(
		&c.ID, &c.UserID, &c.Type, &c.Status, &c.SourceURL, &c.FilePath,
		&c.Title, &c.DurationSeconds, &c.Transcript, &c.MetadataJSON, &c.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return c, nil
}

func (r *ContentRepo) UpdateTranscript(ctx context.Context, id uuid.UUID, transcript string) error {
	_, err := r.pool.Exec(ctx, "UPDATE content SET transcript = $1, status = 'completed' WHERE id = $2", transcript, id)
	return err
}

func (r *ContentRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status string) error {
	_, err := r.pool.Exec(ctx, "UPDATE content SET status = $1 WHERE id = $2", status, id)
	return err
}
