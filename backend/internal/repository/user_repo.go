package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"lectura-backend/internal/models"
)

type UserRepo struct {
	pool *pgxpool.Pool
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
	_, err := r.pool.Exec(ctx, "UPDATE users SET is_active = FALSE WHERE id = $1", userID)
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

func (r *UserRepo) SetWeeklyGoalTarget(ctx context.Context, userID uuid.UUID, target int) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO user_settings (user_id, notifications_json)
		VALUES ($1, jsonb_build_object('weekly_goal_target', $2))
		ON CONFLICT (user_id) DO UPDATE
		SET notifications_json = jsonb_set(
			COALESCE(user_settings.notifications_json, '{}'::jsonb),
			'{weekly_goal_target}',
			to_jsonb($2::int),
			true
		),
		updated_at = NOW()
	`, userID, target)
	return err
}
