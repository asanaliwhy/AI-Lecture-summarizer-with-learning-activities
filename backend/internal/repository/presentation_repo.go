package repository

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"lectura-backend/internal/models"
)

type PresentationRepo struct {
	pool *pgxpool.Pool
}

func NewPresentationRepo(pool *pgxpool.Pool) *PresentationRepo {
	return &PresentationRepo{pool: pool}
}

func (r *PresentationRepo) Create(ctx context.Context, p *models.Presentation) error {
	p.ID = uuid.New()
	slidesJSON, _ := json.Marshal(p.Slides)
	if slidesJSON == nil {
		slidesJSON = []byte("[]")
	}

	query := `INSERT INTO presentations (id, user_id, content_id, title, topic, language, theme, slide_count, slides, status, quality_fallback, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
		RETURNING created_at, updated_at`

	return r.pool.QueryRow(ctx, query,
		p.ID, p.UserID, p.ContentID, p.Title, p.Topic, p.Language, p.Theme, p.SlideCount, slidesJSON, p.Status, p.QualityFallback,
	).Scan(&p.CreatedAt, &p.UpdatedAt)
}

func (r *PresentationRepo) GetByID(ctx context.Context, id uuid.UUID) (*models.Presentation, error) {
	p := &models.Presentation{}
	var slidesRaw []byte

	query := `SELECT id, user_id, content_id, title, topic, language, theme, slide_count,
		COALESCE(slides, '[]'::jsonb), status, quality_fallback, is_favorite, created_at, updated_at, last_accessed_at
		FROM presentations WHERE id = $1`

	err := r.pool.QueryRow(ctx, query, id).Scan(
		&p.ID, &p.UserID, &p.ContentID, &p.Title, &p.Topic, &p.Language, &p.Theme, &p.SlideCount,
		&slidesRaw, &p.Status, &p.QualityFallback, &p.IsFavorite, &p.CreatedAt, &p.UpdatedAt, &p.LastAccessedAt,
	)
	if err != nil {
		return nil, err
	}
	if len(slidesRaw) == 0 || json.Unmarshal(slidesRaw, &p.Slides) != nil || p.Slides == nil {
		p.Slides = []models.PresentationSlide{}
	}

	return p, nil
}

func (r *PresentationRepo) GetByUser(ctx context.Context, userID uuid.UUID, search, sortBy string, limit, offset int) ([]*models.Presentation, int, error) {
	search = strings.TrimSpace(search)
	searchLike := "%" + search + "%"

	var total int
	countQuery := `SELECT COUNT(*) FROM presentations WHERE user_id = $1 AND ($2 = '' OR title ILIKE $3 OR COALESCE(topic, '') ILIKE $3)`
	if err := r.pool.QueryRow(ctx, countQuery, userID, search, searchLike).Scan(&total); err != nil {
		return nil, 0, err
	}

	orderBy := "created_at DESC"
	switch sortBy {
	case "title":
		orderBy = "title ASC"
	case "oldest":
		orderBy = "created_at ASC"
	case "recent":
		orderBy = "last_accessed_at DESC NULLS LAST, created_at DESC"
	}

	query := `SELECT id, user_id, content_id, title, topic, language, theme, slide_count,
		COALESCE(slides, '[]'::jsonb), status, quality_fallback, is_favorite, created_at, updated_at, last_accessed_at
		FROM presentations
		WHERE user_id = $1 AND ($2 = '' OR title ILIKE $3 OR COALESCE(topic, '') ILIKE $3)
		ORDER BY ` + orderBy + `
		LIMIT $4 OFFSET $5`

	rows, err := r.pool.Query(ctx, query, userID, search, searchLike, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	presentations := make([]*models.Presentation, 0)
	for rows.Next() {
		p := &models.Presentation{}
		var slidesRaw []byte
		if err := rows.Scan(
			&p.ID, &p.UserID, &p.ContentID, &p.Title, &p.Topic, &p.Language, &p.Theme, &p.SlideCount,
			&slidesRaw, &p.Status, &p.QualityFallback, &p.IsFavorite, &p.CreatedAt, &p.UpdatedAt, &p.LastAccessedAt,
		); err != nil {
			return nil, 0, err
		}
		if len(slidesRaw) == 0 || json.Unmarshal(slidesRaw, &p.Slides) != nil || p.Slides == nil {
			p.Slides = []models.PresentationSlide{}
		}
		presentations = append(presentations, p)
	}

	return presentations, total, rows.Err()
}

func (r *PresentationRepo) UpdateSlides(ctx context.Context, id uuid.UUID, slides []models.PresentationSlide, status string, qualityFallback bool) error {
	data, err := json.Marshal(slides)
	if err != nil {
		return err
	}
	_, err = r.pool.Exec(ctx,
		`UPDATE presentations
		 SET slides = $1, slide_count = $2, status = $3, quality_fallback = $4, updated_at = NOW()
		 WHERE id = $5`,
		data, len(slides), status, qualityFallback, id,
	)
	return err
}

func (r *PresentationRepo) UpdateTitle(ctx context.Context, id uuid.UUID, title string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE presentations SET title = $1, updated_at = NOW() WHERE id = $2`,
		title, id,
	)
	return err
}

func (r *PresentationRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE presentations SET status = $1, updated_at = NOW() WHERE id = $2`,
		status, id,
	)
	return err
}

func (r *PresentationRepo) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM presentations WHERE id = $1`, id)
	return err
}

func (r *PresentationRepo) UpdateLastAccessed(ctx context.Context, id uuid.UUID) error {
	now := time.Now()
	_, err := r.pool.Exec(ctx,
		`UPDATE presentations SET last_accessed_at = $1, updated_at = NOW() WHERE id = $2`,
		now, id,
	)
	return err
}

func (r *PresentationRepo) ToggleFavorite(ctx context.Context, id uuid.UUID, userID uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE presentations SET is_favorite = NOT is_favorite, updated_at = NOW() WHERE id = $1 AND user_id = $2`,
		id, userID,
	)
	return err
}
