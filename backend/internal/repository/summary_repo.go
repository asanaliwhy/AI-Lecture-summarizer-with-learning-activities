package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"lectura-backend/internal/models"
)

type SummaryRepo struct {
	pool *pgxpool.Pool
}

func NewSummaryRepo(pool *pgxpool.Pool) *SummaryRepo {
	return &SummaryRepo{pool: pool}
}

func (r *SummaryRepo) Create(ctx context.Context, s *models.Summary) error {
	s.ID = uuid.New()
	configBytes, _ := json.Marshal(s.ConfigJSON)
	if s.ConfigJSON == nil {
		configBytes = []byte("{}")
	}

	query := `INSERT INTO summaries (id, user_id, content_id, title, format, length_setting, config_json)
		VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING created_at`

	return r.pool.QueryRow(ctx, query,
		s.ID, s.UserID, s.ContentID, s.Title, s.Format, s.LengthSetting, configBytes,
	).Scan(&s.CreatedAt)
}

func (r *SummaryRepo) GetByID(ctx context.Context, id uuid.UUID) (*models.Summary, error) {
	s := &models.Summary{}
	query := `SELECT id, user_id, content_id, title, format, length_setting, config_json,
		content_raw, cornell_cues, cornell_notes, cornell_summary,
		tags, description, word_count, is_favorite, is_archived, created_at, last_accessed_at
		FROM summaries WHERE id = $1`

	err := r.pool.QueryRow(ctx, query, id).Scan(
		&s.ID, &s.UserID, &s.ContentID, &s.Title, &s.Format, &s.LengthSetting, &s.ConfigJSON,
		&s.ContentRaw, &s.CornellCues, &s.CornellNotes, &s.CornellSummary,
		&s.Tags, &s.Description, &s.WordCount, &s.IsFavorite, &s.IsArchived,
		&s.CreatedAt, &s.LastAccessedAt,
	)
	if err != nil {
		return nil, err
	}

	// Update last_accessed_at
	r.pool.Exec(ctx, "UPDATE summaries SET last_accessed_at = NOW() WHERE id = $1", id)
	return s, nil
}

func (r *SummaryRepo) ListByUser(ctx context.Context, userID uuid.UUID, search, sortBy string, limit, offset int) ([]*models.Summary, int, error) {
	var args []interface{}
	argIdx := 1

	where := fmt.Sprintf("WHERE user_id = $%d AND is_archived = FALSE", argIdx)
	args = append(args, userID)
	argIdx++

	if search != "" {
		where += fmt.Sprintf(" AND (title ILIKE $%d OR description ILIKE $%d)", argIdx, argIdx)
		args = append(args, "%"+search+"%")
		argIdx++
	}

	// Count total
	var total int
	countQuery := "SELECT COUNT(*) FROM summaries " + where
	err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	// Order
	orderBy := "created_at DESC"
	switch sortBy {
	case "title":
		orderBy = "title ASC"
	case "oldest":
		orderBy = "created_at ASC"
	case "recent":
		orderBy = "last_accessed_at DESC NULLS LAST"
	}

	query := fmt.Sprintf(`SELECT id, user_id, content_id, title, format, length_setting, config_json,
		content_raw, cornell_cues, cornell_notes, cornell_summary,
		tags, description, word_count, is_favorite, is_archived, created_at, last_accessed_at
		FROM summaries %s ORDER BY %s LIMIT $%d OFFSET $%d`,
		where, orderBy, argIdx, argIdx+1)

	args = append(args, limit, offset)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var summaries []*models.Summary
	for rows.Next() {
		s := &models.Summary{}
		err := rows.Scan(
			&s.ID, &s.UserID, &s.ContentID, &s.Title, &s.Format, &s.LengthSetting, &s.ConfigJSON,
			&s.ContentRaw, &s.CornellCues, &s.CornellNotes, &s.CornellSummary,
			&s.Tags, &s.Description, &s.WordCount, &s.IsFavorite, &s.IsArchived,
			&s.CreatedAt, &s.LastAccessedAt,
		)
		if err != nil {
			return nil, 0, err
		}
		summaries = append(summaries, s)
	}

	return summaries, total, nil
}

func (r *SummaryRepo) Update(ctx context.Context, s *models.Summary) error {
	_, err := r.pool.Exec(ctx,
		"UPDATE summaries SET title = $1, tags = $2, description = $3 WHERE id = $4",
		s.Title, s.Tags, s.Description, s.ID,
	)
	return err
}

func (r *SummaryRepo) UpdateContent(ctx context.Context, id uuid.UUID, raw string, cues, notes, summary *string, tags []string, desc *string, wordCount int) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE summaries SET content_raw = $1, cornell_cues = $2, cornell_notes = $3, cornell_summary = $4,
		 tags = $5, description = $6, word_count = $7 WHERE id = $8`,
		raw, cues, notes, summary, tags, desc, wordCount, id,
	)
	return err
}

func (r *SummaryRepo) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, "DELETE FROM summaries WHERE id = $1", id)
	return err
}

func (r *SummaryRepo) ToggleFavorite(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, "UPDATE summaries SET is_favorite = NOT is_favorite WHERE id = $1", id)
	return err
}

func (r *SummaryRepo) BulkDelete(ctx context.Context, ids []uuid.UUID, userID uuid.UUID) error {
	placeholders := make([]string, len(ids))
	args := []interface{}{userID}
	for i, id := range ids {
		placeholders[i] = fmt.Sprintf("$%d", i+2)
		args = append(args, id)
	}

	query := fmt.Sprintf("DELETE FROM summaries WHERE user_id = $1 AND id IN (%s)", strings.Join(placeholders, ","))
	_, err := r.pool.Exec(ctx, query, args...)
	return err
}

// Ensure pgx import is used
var _ pgx.Rows = (pgx.Rows)(nil)
