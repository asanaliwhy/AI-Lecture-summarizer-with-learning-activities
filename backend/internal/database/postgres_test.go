package database

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func openTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL is not set")
	}

	pool, err := NewPostgresPool(dsn)
	if err != nil {
		t.Skipf("skipping migration test, db unavailable: %v", err)
	}

	return pool
}

func prepareUsersSchema(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()

	ctx := context.Background()

	_, _ = pool.Exec(ctx, `DROP TABLE IF EXISTS users`)
	_, _ = pool.Exec(ctx, `DROP TABLE IF EXISTS schema_migrations`)

	_, err := pool.Exec(ctx, `
		CREATE TABLE users (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			email VARCHAR(255) UNIQUE NOT NULL,
			password_hash VARCHAR(72),
			full_name VARCHAR(255) NOT NULL,
			is_active BOOLEAN DEFAULT TRUE,
			created_at TIMESTAMPTZ DEFAULT NOW()
		)
	`)
	if err != nil {
		t.Fatalf("create users table: %v", err)
	}
}

func runMigration010Only(t *testing.T, pool *pgxpool.Pool, sqlBody string) {
	t.Helper()

	tmpDir := t.TempDir()
	path := filepath.Join(tmpDir, "010_normalize_email_lowercase.sql")
	if err := os.WriteFile(path, []byte(sqlBody), 0o644); err != nil {
		t.Fatalf("write migration file: %v", err)
	}

	if err := RunMigrations(pool, tmpDir); err != nil {
		t.Fatalf("RunMigrations failed: %v", err)
	}
}

func TestMigration010_CollisionSafeNormalization(t *testing.T) {
	pool := openTestPool(t)
	defer pool.Close()
	prepareUsersSchema(t, pool)

	ctx := context.Background()

	var oldID, newID string
	err := pool.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, full_name, is_active, created_at)
		VALUES ('Ada@Example.com', 'x', 'Ada Old', TRUE, NOW() - INTERVAL '2 days')
		RETURNING id
	`).Scan(&oldID)
	if err != nil {
		t.Fatalf("insert old user: %v", err)
	}

	err = pool.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, full_name, is_active, created_at)
		VALUES ('ada@example.com', 'x', 'Ada New', TRUE, NOW() - INTERVAL '1 day')
		RETURNING id
	`).Scan(&newID)
	if err != nil {
		t.Fatalf("insert new user: %v", err)
	}

	sqlBody, err := os.ReadFile(filepath.Join("..", "migrations", "010_normalize_email_lowercase.sql"))
	if err != nil {
		t.Fatalf("read migration 010: %v", err)
	}
	runMigration010Only(t, pool, string(sqlBody))

	var oldEmail string
	var oldActive bool
	err = pool.QueryRow(ctx, `SELECT email, is_active FROM users WHERE id = $1`, oldID).Scan(&oldEmail, &oldActive)
	if err != nil {
		t.Fatalf("query old user: %v", err)
	}
	if oldEmail != "ada@example.com" {
		t.Fatalf("old user email = %q, want %q", oldEmail, "ada@example.com")
	}
	if !oldActive {
		t.Fatalf("old user should stay active")
	}

	var newEmail string
	var newActive bool
	err = pool.QueryRow(ctx, `SELECT email, is_active FROM users WHERE id = $1`, newID).Scan(&newEmail, &newActive)
	if err != nil {
		t.Fatalf("query new user: %v", err)
	}
	expectedNewEmail := fmt.Sprintf("deactivated_duplicate_%s@lectura.invalid", newID)
	if newEmail != expectedNewEmail {
		t.Fatalf("new user email = %q, want %q", newEmail, expectedNewEmail)
	}
	if newActive {
		t.Fatalf("new user should be deactivated")
	}

	var dupCount int
	err = pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM (
			SELECT LOWER(email)
			FROM users
			GROUP BY LOWER(email)
			HAVING COUNT(*) > 1
		) d
	`).Scan(&dupCount)
	if err != nil {
		t.Fatalf("query duplicate count: %v", err)
	}
	if dupCount != 0 {
		t.Fatalf("duplicate groups remain: %d", dupCount)
	}
}

func TestMigration010_NoCollisions_NormalizesCleanly(t *testing.T) {
	pool := openTestPool(t)
	defer pool.Close()
	prepareUsersSchema(t, pool)

	ctx := context.Background()

	var userID string
	err := pool.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, full_name, is_active)
		VALUES ('Unique.Mixed@Example.com', 'x', 'Unique User', TRUE)
		RETURNING id
	`).Scan(&userID)
	if err != nil {
		t.Fatalf("insert user: %v", err)
	}

	sqlBody, err := os.ReadFile(filepath.Join("..", "migrations", "010_normalize_email_lowercase.sql"))
	if err != nil {
		t.Fatalf("read migration 010: %v", err)
	}
	runMigration010Only(t, pool, string(sqlBody))

	var email string
	var active bool
	err = pool.QueryRow(ctx, `SELECT email, is_active FROM users WHERE id = $1`, userID).Scan(&email, &active)
	if err != nil {
		t.Fatalf("query user: %v", err)
	}
	if email != "unique.mixed@example.com" {
		t.Fatalf("normalized email = %q, want %q", email, "unique.mixed@example.com")
	}
	if !active {
		t.Fatalf("user should remain active")
	}
}

func TestMigration010_AlreadyNormalized_IsNoOp(t *testing.T) {
	pool := openTestPool(t)
	defer pool.Close()
	prepareUsersSchema(t, pool)

	ctx := context.Background()

	_, err := pool.Exec(ctx, `
		INSERT INTO users (email, password_hash, full_name, is_active)
		VALUES ('lower@example.com', 'x', 'Lower User', TRUE)
	`)
	if err != nil {
		t.Fatalf("insert user: %v", err)
	}

	sqlBody, err := os.ReadFile(filepath.Join("..", "migrations", "010_normalize_email_lowercase.sql"))
	if err != nil {
		t.Fatalf("read migration 010: %v", err)
	}
	runMigration010Only(t, pool, string(sqlBody))

	var deactivatedCount int
	err = pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM users
		WHERE email LIKE 'deactivated_duplicate_%@lectura.invalid'
	`).Scan(&deactivatedCount)
	if err != nil {
		t.Fatalf("query deactivated count: %v", err)
	}
	if deactivatedCount != 0 {
		t.Fatalf("expected 0 deactivated duplicates, got %d", deactivatedCount)
	}

	var normalizedCount int
	err = pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM users WHERE email = LOWER(email)
	`).Scan(&normalizedCount)
	if err != nil {
		t.Fatalf("query normalized count: %v", err)
	}
	if normalizedCount != 1 {
		t.Fatalf("expected 1 normalized user, got %d", normalizedCount)
	}
}
