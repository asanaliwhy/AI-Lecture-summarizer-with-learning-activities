package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"lectura-backend/internal/models"
)

type ChatMessageRepo struct {
	pool *pgxpool.Pool
}

func NewChatMessageRepo(pool *pgxpool.Pool) *ChatMessageRepo {
	return &ChatMessageRepo{pool: pool}
}

func (r *ChatMessageRepo) GetBySummaryAndUser(ctx context.Context, summaryID, userID uuid.UUID) ([]models.ChatHistoryMessage, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, summary_id, user_id, role, content, created_at
		FROM chat_messages
		WHERE summary_id = $1 AND user_id = $2
		ORDER BY created_at ASC
	`, summaryID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]models.ChatHistoryMessage, 0)
	for rows.Next() {
		var msg models.ChatHistoryMessage
		if err := rows.Scan(&msg.ID, &msg.SummaryID, &msg.UserID, &msg.Role, &msg.Content, &msg.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, msg)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return out, nil
}

func (r *ChatMessageRepo) Create(ctx context.Context, summaryID, userID uuid.UUID, role, content string) (*models.ChatHistoryMessage, error) {
	msg := &models.ChatHistoryMessage{}
	err := r.pool.QueryRow(ctx, `
		INSERT INTO chat_messages (summary_id, user_id, role, content)
		VALUES ($1, $2, $3, $4)
		RETURNING id, summary_id, user_id, role, content, created_at
	`, summaryID, userID, role, content).Scan(&msg.ID, &msg.SummaryID, &msg.UserID, &msg.Role, &msg.Content, &msg.CreatedAt)
	if err != nil {
		return nil, err
	}

	return msg, nil
}

func (r *ChatMessageRepo) DeleteBySummaryAndUser(ctx context.Context, summaryID, userID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		DELETE FROM chat_messages
		WHERE summary_id = $1 AND user_id = $2
	`, summaryID, userID)
	return err
}

