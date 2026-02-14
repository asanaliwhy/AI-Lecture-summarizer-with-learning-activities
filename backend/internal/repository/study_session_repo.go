package repository

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"lectura-backend/internal/models"
)

type StudySessionRepo struct {
	pool *pgxpool.Pool
}

func NewStudySessionRepo(pool *pgxpool.Pool) *StudySessionRepo {
	return &StudySessionRepo{pool: pool}
}

func (r *StudySessionRepo) Start(ctx context.Context, s *models.StudySession) error {
	if len(s.ClientMetaJSON) == 0 {
		s.ClientMetaJSON = json.RawMessage("{}")
	}

	// Close previous active session for same user/activity/resource (idempotent behavior)
	_, _ = r.pool.Exec(ctx, `
		UPDATE study_sessions
		SET ended_at = NOW(),
			duration_seconds = GREATEST(0, LEAST(43200, EXTRACT(EPOCH FROM (NOW() - started_at))::INT)),
			last_heartbeat_at = NOW()
		WHERE user_id = $1
		  AND activity_type = $2
		  AND resource_id = $3
		  AND ended_at IS NULL
	`, s.UserID, s.ActivityType, s.ResourceID)

	query := `
		INSERT INTO study_sessions (user_id, activity_type, resource_id, client_meta_json)
		VALUES ($1, $2, $3, $4)
		RETURNING id, started_at, last_heartbeat_at, created_at
	`

	return r.pool.QueryRow(ctx, query, s.UserID, s.ActivityType, s.ResourceID, s.ClientMetaJSON).Scan(
		&s.ID,
		&s.StartedAt,
		&s.LastHeartbeatAt,
		&s.CreatedAt,
	)
}

func (r *StudySessionRepo) Heartbeat(ctx context.Context, sessionID, userID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE study_sessions
		SET last_heartbeat_at = NOW()
		WHERE id = $1
		  AND user_id = $2
		  AND ended_at IS NULL
	`, sessionID, userID)
	return err
}

func (r *StudySessionRepo) Stop(ctx context.Context, sessionID, userID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE study_sessions
		SET ended_at = CASE WHEN ended_at IS NULL THEN NOW() ELSE ended_at END,
			last_heartbeat_at = NOW(),
			duration_seconds = CASE
				WHEN ended_at IS NULL THEN GREATEST(0, LEAST(43200, EXTRACT(EPOCH FROM (NOW() - started_at))::INT))
				ELSE duration_seconds
			END
		WHERE id = $1
		  AND user_id = $2
	`, sessionID, userID)
	return err
}
