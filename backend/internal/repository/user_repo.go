package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"lectura-backend/internal/models"
)

type UserRepo struct {
	pool *pgxpool.Pool
}

type NotificationRecipient struct {
	ID            uuid.UUID
	Email         string
	FullName      string
	CreatedAt     time.Time
	LastSentAtRaw string
}

func NewUserRepo(pool *pgxpool.Pool) *UserRepo {
	return &UserRepo{pool: pool}
}

func (r *UserRepo) Create(ctx context.Context, user *models.User) error {
	query := `
		INSERT INTO users (id, email, password_hash, full_name, is_verified, plan)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING created_at`

	user.ID = uuid.New()
	user.Plan = "free"
	user.IsActive = true

	return r.pool.QueryRow(ctx, query,
		user.ID, user.Email, user.PasswordHash, user.FullName, user.IsVerified, user.Plan,
	).Scan(&user.CreatedAt)
}

func (r *UserRepo) GetByEmail(ctx context.Context, email string) (*models.User, error) {
	user := &models.User{}
	query := `SELECT id, email, password_hash, full_name, avatar_url, is_verified, is_active, plan, created_at, last_login_at
		FROM users WHERE email = $1`

	err := r.pool.QueryRow(ctx, query, email).Scan(
		&user.ID, &user.Email, &user.PasswordHash, &user.FullName, &user.AvatarURL,
		&user.IsVerified, &user.IsActive, &user.Plan, &user.CreatedAt, &user.LastLoginAt,
	)
	if err != nil {
		return nil, err
	}
	return user, nil
}

func (r *UserRepo) GetByID(ctx context.Context, id uuid.UUID) (*models.User, error) {
	user := &models.User{}
	query := `SELECT id, email, password_hash, full_name, avatar_url, is_verified, is_active, plan, created_at, last_login_at
		FROM users WHERE id = $1`

	err := r.pool.QueryRow(ctx, query, id).Scan(
		&user.ID, &user.Email, &user.PasswordHash, &user.FullName, &user.AvatarURL,
		&user.IsVerified, &user.IsActive, &user.Plan, &user.CreatedAt, &user.LastLoginAt,
	)
	if err != nil {
		return nil, err
	}
	return user, nil
}

func (r *UserRepo) VerifyEmail(ctx context.Context, userID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, "UPDATE users SET is_verified = TRUE WHERE id = $1", userID)
	return err
}

func (r *UserRepo) UpdateLastLogin(ctx context.Context, userID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, "UPDATE users SET last_login_at = $1 WHERE id = $2", time.Now(), userID)
	return err
}

func (r *UserRepo) Update(ctx context.Context, user *models.User) error {
	_, err := r.pool.Exec(ctx,
		"UPDATE users SET full_name = $1, email = $2, avatar_url = $3 WHERE id = $4",
		user.FullName, user.Email, user.AvatarURL, user.ID,
	)
	return err
}

func (r *UserRepo) UpdatePassword(ctx context.Context, userID uuid.UUID, passwordHash string) error {
	_, err := r.pool.Exec(ctx, "UPDATE users SET password_hash = $1 WHERE id = $2", passwordHash, userID)
	return err
}

func (r *UserRepo) Delete(ctx context.Context, userID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, "DELETE FROM users WHERE id = $1", userID)
	return err
}

func (r *UserRepo) CreateSettings(ctx context.Context, userID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, "INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING", userID)
	return err
}

func (r *UserRepo) GetSettings(ctx context.Context, userID uuid.UUID) (*models.UserSettings, error) {
	s := &models.UserSettings{}
	query := `SELECT user_id, default_summary_length, default_format, default_difficulty, language, notifications_json, updated_at
		FROM user_settings WHERE user_id = $1`
	err := r.pool.QueryRow(ctx, query, userID).Scan(
		&s.UserID, &s.DefaultSummaryLength, &s.DefaultFormat, &s.DefaultDifficulty,
		&s.Language, &s.NotificationsJSON, &s.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return s, nil
}

func (r *UserRepo) UpdateSettings(ctx context.Context, s *models.UserSettings) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE user_settings SET default_summary_length = $1, default_format = $2, default_difficulty = $3,
		 language = $4, notifications_json = $5, updated_at = NOW() WHERE user_id = $6`,
		s.DefaultSummaryLength, s.DefaultFormat, s.DefaultDifficulty, s.Language, s.NotificationsJSON, s.UserID,
	)
	return err
}

func (r *UserRepo) GetNotificationSetting(ctx context.Context, userID uuid.UUID, key string, defaultValue bool) (bool, error) {
	var enabled bool
	err := r.pool.QueryRow(ctx, `
		SELECT COALESCE((
			SELECT CASE
				WHEN LOWER(COALESCE(notifications_json->>$2, '')) IN ('true', 'false')
					THEN (notifications_json->>$2)::boolean
				ELSE NULL
			END
			FROM user_settings
			WHERE user_id = $1
		), $3)
	`, userID, key, defaultValue).Scan(&enabled)
	if err != nil {
		return defaultValue, err
	}

	return enabled, nil
}

func (r *UserRepo) SetNotificationSetting(ctx context.Context, userID uuid.UUID, key string, enabled bool) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO user_settings (user_id, notifications_json, updated_at)
		VALUES (
			$1,
			jsonb_build_object($2::text, to_jsonb($3::boolean)),
			NOW()
		)
		ON CONFLICT (user_id) DO UPDATE
		SET notifications_json = COALESCE(user_settings.notifications_json, '{}'::jsonb) ||
			jsonb_build_object($2::text, to_jsonb($3::boolean)),
			updated_at = NOW()
	`, userID, key, enabled)
	return err
}

func (r *UserRepo) SetNotificationTimestamp(ctx context.Context, userID uuid.UUID, key string, at time.Time) error {
	formatted := at.UTC().Format(time.RFC3339)

	_, err := r.pool.Exec(ctx, `
		INSERT INTO user_settings (user_id, notifications_json, updated_at)
		VALUES (
			$1,
			jsonb_build_object($2::text, to_jsonb($3::text)),
			NOW()
		)
		ON CONFLICT (user_id) DO UPDATE
		SET notifications_json = COALESCE(user_settings.notifications_json, '{}'::jsonb) ||
			jsonb_build_object($2::text, to_jsonb($3::text)),
			updated_at = NOW()
	`, userID, key, formatted)
	return err
}

func (r *UserRepo) ListUsersWithNotificationEnabled(ctx context.Context, notificationKey, lastSentKey string) ([]NotificationRecipient, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT
			u.id,
			u.email,
			u.full_name,
			u.created_at,
			COALESCE(us.notifications_json->>$2, '') AS last_sent_at
		FROM users u
		LEFT JOIN user_settings us ON us.user_id = u.id
		WHERE u.is_active = TRUE
		  AND u.is_verified = TRUE
		  AND COALESCE((
			CASE
				WHEN LOWER(COALESCE(us.notifications_json->>$1, '')) IN ('true', 'false')
				THEN (us.notifications_json->>$1)::boolean
				ELSE false
			END
		  ), false) = TRUE
	`, notificationKey, lastSentKey)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	recipients := make([]NotificationRecipient, 0)
	for rows.Next() {
		var recipient NotificationRecipient
		if scanErr := rows.Scan(
			&recipient.ID,
			&recipient.Email,
			&recipient.FullName,
			&recipient.CreatedAt,
			&recipient.LastSentAtRaw,
		); scanErr != nil {
			return nil, scanErr
		}
		recipients = append(recipients, recipient)
	}

	return recipients, rows.Err()
}

func (r *UserRepo) GetWeeklyDigestStats(ctx context.Context, userID uuid.UUID) (summaries int, quizzes int, flashcards int, studyHours float64, err error) {
	err = r.pool.QueryRow(ctx, `
		SELECT
			(SELECT COUNT(*) FROM summaries WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '7 days') AS summaries,
			(SELECT COUNT(*) FROM quizzes WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '7 days') AS quizzes,
			(SELECT COUNT(*) FROM flashcard_decks WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '7 days') AS flashcards,
			COALESCE((
				SELECT SUM(duration_seconds)::float8 / 3600.0
				FROM study_sessions
				WHERE user_id = $1
				  AND started_at >= NOW() - INTERVAL '7 days'
			), 0) AS study_hours
	`, userID).Scan(&summaries, &quizzes, &flashcards, &studyHours)
	return
}

func (r *UserRepo) GetLatestActivityAt(ctx context.Context, userID uuid.UUID) (*time.Time, error) {
	var ts pgtype.Timestamptz
	err := r.pool.QueryRow(ctx, `
		SELECT MAX(last_activity_at) FROM (
			SELECT MAX(created_at) AS last_activity_at FROM summaries WHERE user_id = $1
			UNION ALL
			SELECT MAX(created_at) AS last_activity_at FROM quizzes WHERE user_id = $1
			UNION ALL
			SELECT MAX(created_at) AS last_activity_at FROM flashcard_decks WHERE user_id = $1
			UNION ALL
			SELECT MAX(started_at) AS last_activity_at FROM study_sessions WHERE user_id = $1
		) activity
	`, userID).Scan(&ts)
	if err != nil {
		return nil, err
	}

	if !ts.Valid {
		return nil, nil
	}

	t := ts.Time
	return &t, nil
}

func (r *UserRepo) SetWeeklyGoalTarget(ctx context.Context, userID uuid.UUID, target int, goalType string) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO user_settings (user_id, notifications_json, updated_at)
		VALUES (
			$1,
			jsonb_build_object(
				'weekly_goal_target', to_jsonb($2::int),
				'weekly_goal_type', to_jsonb($3::text)
			),
			NOW()
		)
		ON CONFLICT (user_id) DO UPDATE
		SET notifications_json = COALESCE(user_settings.notifications_json, '{}'::jsonb) ||
			jsonb_build_object(
				'weekly_goal_target', to_jsonb($2::int),
				'weekly_goal_type', to_jsonb($3::text)
			),
			updated_at = NOW()
	`, userID, target, goalType)
	return err
}
