package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"lectura-backend/internal/models"
)

type FolderRepo struct {
	pool *pgxpool.Pool
}

func NewFolderRepo(pool *pgxpool.Pool) *FolderRepo {
	return &FolderRepo{pool: pool}
}

func (r *FolderRepo) CreateFolder(ctx context.Context, userID uuid.UUID, name, color string) (*models.Folder, error) {
	if color == "" {
		color = "blue"
	}

	query := `
		INSERT INTO folders (user_id, name, color)
		VALUES ($1, $2, $3)
		RETURNING id, user_id, name, color, created_at, updated_at
	`
	f := &models.Folder{}
	err := r.pool.QueryRow(ctx, query, userID, name, color).Scan(
		&f.ID, &f.UserID, &f.Name, &f.Color, &f.CreatedAt, &f.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return f, nil
}

func (r *FolderRepo) GetFoldersByUserID(ctx context.Context, userID uuid.UUID) ([]*models.Folder, error) {
	query := `
		SELECT id, user_id, name, color, created_at, updated_at
		FROM folders
		WHERE user_id = $1
		ORDER BY created_at DESC
	`
	rows, err := r.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var folders []*models.Folder
	for rows.Next() {
		f := &models.Folder{}
		if err := rows.Scan(&f.ID, &f.UserID, &f.Name, &f.Color, &f.CreatedAt, &f.UpdatedAt); err != nil {
			return nil, err
		}
		folders = append(folders, f)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if folders == nil {
		folders = []*models.Folder{}
	}
	return folders, nil
}

func (r *FolderRepo) UpdateFolder(ctx context.Context, id, userID uuid.UUID, name, color string) (*models.Folder, error) {
	query := `
		UPDATE folders
		SET name = $1, color = $2, updated_at = NOW()
		WHERE id = $3 AND user_id = $4
		RETURNING id, user_id, name, color, created_at, updated_at
	`
	f := &models.Folder{}
	err := r.pool.QueryRow(ctx, query, name, color, id, userID).Scan(
		&f.ID, &f.UserID, &f.Name, &f.Color, &f.CreatedAt, &f.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return f, nil
}

func (r *FolderRepo) DeleteFolder(ctx context.Context, id, userID uuid.UUID) error {
	query := `DELETE FROM folders WHERE id = $1 AND user_id = $2`
	_, err := r.pool.Exec(ctx, query, id, userID)
	return err
}

// MoveItems assigns items of a specific type to a folder.
func (r *FolderRepo) MoveItems(ctx context.Context, userID, folderID uuid.UUID, itemIDs []uuid.UUID, itemType string) error {
	if len(itemIDs) == 0 {
		return nil
	}

	var query string
	switch itemType {
	case "summary":
		query = `UPDATE summaries SET folder_id = $1 WHERE id = ANY($2) AND user_id = $3`
	case "quiz":
		query = `UPDATE quizzes SET folder_id = $1 WHERE id = ANY($2) AND user_id = $3`
	case "flashcard":
		query = `UPDATE flashcard_decks SET folder_id = $1 WHERE id = ANY($2) AND user_id = $3`
	case "presentation":
		query = `UPDATE presentations SET folder_id = $1 WHERE id = ANY($2) AND user_id = $3`
	default:
		return nil // unsupported type
	}

	_, err := r.pool.Exec(ctx, query, folderID, itemIDs, userID)
	return err
}

func (r *FolderRepo) RemoveItems(ctx context.Context, userID uuid.UUID, itemIDs []uuid.UUID, itemType string) error {
	if len(itemIDs) == 0 {
		return nil
	}

	var query string
	switch itemType {
	case "summary":
		query = `UPDATE summaries SET folder_id = NULL WHERE id = ANY($1) AND user_id = $2`
	case "quiz":
		query = `UPDATE quizzes SET folder_id = NULL WHERE id = ANY($1) AND user_id = $2`
	case "flashcard":
		query = `UPDATE flashcard_decks SET folder_id = NULL WHERE id = ANY($1) AND user_id = $2`
	case "presentation":
		query = `UPDATE presentations SET folder_id = NULL WHERE id = ANY($1) AND user_id = $2`
	default:
		return nil
	}

	_, err := r.pool.Exec(ctx, query, itemIDs, userID)
	return err
}
