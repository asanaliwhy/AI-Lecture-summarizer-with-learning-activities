package repository

import (
	"context"
	"encoding/json"

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
	query := `SELECT s.id, s.user_id, s.content_id, COALESCE(c.type, '') AS source, s.title, s.format, s.length_setting, s.config_json,
		s.content_raw, s.cornell_cues, s.cornell_notes, s.cornell_summary,
		s.tags, s.description, s.word_count, s.is_favorite, s.is_archived, s.is_quality_fallback, s.quality_fallback_reason, s.created_at, s.last_accessed_at
		FROM summaries s
		LEFT JOIN content c ON c.id = s.content_id
		WHERE s.id = $1`

	err := r.pool.QueryRow(ctx, query, id).Scan(
		&s.ID, &s.UserID, &s.ContentID, &s.Source, &s.Title, &s.Format, &s.LengthSetting, &s.ConfigJSON,
		&s.ContentRaw, &s.CornellCues, &s.CornellNotes, &s.CornellSummary,
		&s.Tags, &s.Description, &s.WordCount, &s.IsFavorite, &s.IsArchived, &s.IsQualityFallback, &s.QualityFallbackReason,
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
	searchLike := "%" + search + "%"

	// Count total
	var total int
	countQuery := `SELECT COUNT(*)
		FROM summaries s
		WHERE s.user_id = $1
		  AND s.is_archived = FALSE
		  AND ($2 = '' OR s.title ILIKE $3 OR s.description ILIKE $3)`
	err := r.pool.QueryRow(ctx, countQuery, userID, search, searchLike).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	var query string
	switch sortBy {
	case "title":
		query = `SELECT s.id, s.user_id, s.content_id, COALESCE(c.type, '') AS source, s.title, s.format, s.length_setting, s.config_json,
			s.content_raw, s.cornell_cues, s.cornell_notes, s.cornell_summary,
			s.tags, s.description, s.word_count, s.is_favorite, s.is_archived, s.is_quality_fallback, s.quality_fallback_reason, s.created_at, s.last_accessed_at
			FROM summaries s
			LEFT JOIN content c ON c.id = s.content_id
			WHERE s.user_id = $1
			  AND s.is_archived = FALSE
			  AND ($2 = '' OR s.title ILIKE $3 OR s.description ILIKE $3)
			ORDER BY s.title ASC
			LIMIT $4 OFFSET $5`
	case "oldest":
		query = `SELECT s.id, s.user_id, s.content_id, COALESCE(c.type, '') AS source, s.title, s.format, s.length_setting, s.config_json,
			s.content_raw, s.cornell_cues, s.cornell_notes, s.cornell_summary,
			s.tags, s.description, s.word_count, s.is_favorite, s.is_archived, s.is_quality_fallback, s.quality_fallback_reason, s.created_at, s.last_accessed_at
			FROM summaries s
			LEFT JOIN content c ON c.id = s.content_id
			WHERE s.user_id = $1
			  AND s.is_archived = FALSE
			  AND ($2 = '' OR s.title ILIKE $3 OR s.description ILIKE $3)
			ORDER BY s.created_at ASC
			LIMIT $4 OFFSET $5`
	case "recent":
		query = `SELECT s.id, s.user_id, s.content_id, COALESCE(c.type, '') AS source, s.title, s.format, s.length_setting, s.config_json,
			s.content_raw, s.cornell_cues, s.cornell_notes, s.cornell_summary,
			s.tags, s.description, s.word_count, s.is_favorite, s.is_archived, s.is_quality_fallback, s.quality_fallback_reason, s.created_at, s.last_accessed_at
			FROM summaries s
			LEFT JOIN content c ON c.id = s.content_id
			WHERE s.user_id = $1
			  AND s.is_archived = FALSE
			  AND ($2 = '' OR s.title ILIKE $3 OR s.description ILIKE $3)
			ORDER BY s.last_accessed_at DESC NULLS LAST
			LIMIT $4 OFFSET $5`
	default:
		query = `SELECT s.id, s.user_id, s.content_id, COALESCE(c.type, '') AS source, s.title, s.format, s.length_setting, s.config_json,
			s.content_raw, s.cornell_cues, s.cornell_notes, s.cornell_summary,
			s.tags, s.description, s.word_count, s.is_favorite, s.is_archived, s.is_quality_fallback, s.quality_fallback_reason, s.created_at, s.last_accessed_at
			FROM summaries s
			LEFT JOIN content c ON c.id = s.content_id
			WHERE s.user_id = $1
			  AND s.is_archived = FALSE
			  AND ($2 = '' OR s.title ILIKE $3 OR s.description ILIKE $3)
			ORDER BY s.created_at DESC
			LIMIT $4 OFFSET $5`
	}

	rows, err := r.pool.Query(ctx, query, userID, search, searchLike, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var summaries []*models.Summary
	for rows.Next() {
		s := &models.Summary{}
		err := rows.Scan(
			&s.ID, &s.UserID, &s.ContentID, &s.Source, &s.Title, &s.Format, &s.LengthSetting, &s.ConfigJSON,
			&s.ContentRaw, &s.CornellCues, &s.CornellNotes, &s.CornellSummary,
			&s.Tags, &s.Description, &s.WordCount, &s.IsFavorite, &s.IsArchived, &s.IsQualityFallback, &s.QualityFallbackReason,
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

func (r *SummaryRepo) UpdateTitle(ctx context.Context, id uuid.UUID, title string) error {
	_, err := r.pool.Exec(ctx,
		"UPDATE summaries SET title = $1 WHERE id = $2",
		title, id,
	)
	return err
}

func (r *SummaryRepo) UpdateContent(
	ctx context.Context,
	id uuid.UUID,
	raw string,
	cues, notes, summary *string,
	tags []string,
	desc *string,
	wordCount int,
	isQualityFallback bool,
	qualityFallbackReason *string,
) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE summaries SET content_raw = $1, cornell_cues = $2, cornell_notes = $3, cornell_summary = $4,
		 tags = $5, description = $6, word_count = $7, is_quality_fallback = $8, quality_fallback_reason = $9 WHERE id = $10`,
		raw, cues, notes, summary, tags, desc, wordCount, isQualityFallback, qualityFallbackReason, id,
	)
	return err
}

func (r *SummaryRepo) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, "DELETE FROM summaries WHERE id = $1", id)
	return err
}

func (r *SummaryRepo) ToggleFavorite(ctx context.Context, id uuid.UUID, userID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, "UPDATE summaries SET is_favorite = NOT is_favorite WHERE id = $1 AND user_id = $2", id, userID)
	return err
}

func (r *SummaryRepo) BulkDelete(ctx context.Context, ids []uuid.UUID, userID uuid.UUID) error {
	if len(ids) == 0 {
		return nil
	}

	query := `DELETE FROM summaries WHERE user_id = $1 AND id = ANY($2::uuid[])`
	_, err := r.pool.Exec(ctx, query, userID, ids)
	return err
}

// Ensure pgx import is used
var _ pgx.Rows = (pgx.Rows)(nil)
