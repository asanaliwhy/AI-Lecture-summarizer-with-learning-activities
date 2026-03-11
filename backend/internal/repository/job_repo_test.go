package repository

import (
	"context"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"lectura-backend/internal/database"
)

func TestUpdateStatusSetsCompletedAt_Completed(t *testing.T) {
	if !updateStatusSetsCompletedAt("completed") {
		t.Fatalf("expected completed to set completed_at")
	}
}

func TestUpdateStatusSetsCompletedAt_Failed(t *testing.T) {
	if !updateStatusSetsCompletedAt("failed") {
		t.Fatalf("expected failed to set completed_at")
	}
}

func TestUpdateStatusSetsCompletedAt_Cancelled(t *testing.T) {
	if !updateStatusSetsCompletedAt("cancelled") {
		t.Fatalf("expected cancelled to set completed_at")
	}
}

func TestUpdateStatusSetsCompletedAt_Processing(t *testing.T) {
	if updateStatusSetsCompletedAt("processing") {
		t.Fatalf("expected processing to not set completed_at")
	}
}

func openJobRepoTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL is not set")
	}

	pool, err := database.NewPostgresPool(dsn)
	if err != nil {
		t.Skipf("skipping job repo test, db unavailable: %v", err)
	}

	return pool
}

func prepareJobsTable(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()

	_, _ = pool.Exec(ctx, `DROP TABLE IF EXISTS jobs`)
	_, err := pool.Exec(ctx, `
		CREATE TABLE jobs (
			id UUID PRIMARY KEY,
			user_id UUID NOT NULL,
			type VARCHAR(30) NOT NULL,
			reference_id UUID NOT NULL,
			config_json JSONB DEFAULT '{}',
			status VARCHAR(20) NOT NULL DEFAULT 'pending',
			retry_count SMALLINT DEFAULT 0,
			error_message TEXT,
			created_at TIMESTAMPTZ DEFAULT NOW(),
			completed_at TIMESTAMPTZ
		)
	`)
	if err != nil {
		t.Fatalf("create jobs table: %v", err)
	}
}

func insertJobWithStatus(t *testing.T, pool *pgxpool.Pool, status string) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	id := uuid.New()
	err := pool.QueryRow(ctx, `
		INSERT INTO jobs (id, user_id, type, reference_id, status)
		VALUES ($1, $2, 'summary-generation', $3, $4)
		RETURNING id
	`, id, uuid.New(), uuid.New(), status).Scan(&id)
	if err != nil {
		t.Fatalf("insert job (%s): %v", status, err)
	}
	return id
}

func TestUpdateStatusIfNotTerminal_FromPending_Succeeds(t *testing.T) {
	pool := openJobRepoTestPool(t)
	defer pool.Close()
	prepareJobsTable(t, pool)

	repo := NewJobRepo(pool)
	jobID := insertJobWithStatus(t, pool, "pending")

	updated, err := repo.UpdateStatusIfNotTerminal(context.Background(), jobID, "completed")
	if err != nil {
		t.Fatalf("UpdateStatusIfNotTerminal returned error: %v", err)
	}
	if !updated {
		t.Fatalf("expected updated=true")
	}

	job, err := repo.GetByID(context.Background(), jobID)
	if err != nil {
		t.Fatalf("GetByID returned error: %v", err)
	}
	if job.Status != "completed" {
		t.Fatalf("status = %q, want completed", job.Status)
	}
	if job.CompletedAt == nil {
		t.Fatalf("completed_at should be set for completed job")
	}
}

func TestUpdateStatusIfNotTerminal_FromCancelled_Skips(t *testing.T) {
	pool := openJobRepoTestPool(t)
	defer pool.Close()
	prepareJobsTable(t, pool)

	repo := NewJobRepo(pool)
	jobID := insertJobWithStatus(t, pool, "cancelled")

	updated, err := repo.UpdateStatusIfNotTerminal(context.Background(), jobID, "completed")
	if err != nil {
		t.Fatalf("UpdateStatusIfNotTerminal returned error: %v", err)
	}
	if updated {
		t.Fatalf("expected updated=false for terminal cancelled job")
	}

	job, err := repo.GetByID(context.Background(), jobID)
	if err != nil {
		t.Fatalf("GetByID returned error: %v", err)
	}
	if job.Status != "cancelled" {
		t.Fatalf("status = %q, want cancelled", job.Status)
	}
}

func TestUpdateStatusIfNotTerminal_FromCompleted_Skips(t *testing.T) {
	pool := openJobRepoTestPool(t)
	defer pool.Close()
	prepareJobsTable(t, pool)

	repo := NewJobRepo(pool)
	jobID := insertJobWithStatus(t, pool, "completed")

	updated, err := repo.UpdateStatusIfNotTerminal(context.Background(), jobID, "failed")
	if err != nil {
		t.Fatalf("UpdateStatusIfNotTerminal returned error: %v", err)
	}
	if updated {
		t.Fatalf("expected updated=false for terminal completed job")
	}

	job, err := repo.GetByID(context.Background(), jobID)
	if err != nil {
		t.Fatalf("GetByID returned error: %v", err)
	}
	if job.Status != "completed" {
		t.Fatalf("status = %q, want completed", job.Status)
	}
}
