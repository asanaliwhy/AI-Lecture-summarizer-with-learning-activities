package database

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func NewPostgresPool(databaseURL string) (*pgxpool.Pool, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database URL: %w", err)
	}

	config.MaxConns = 25
	config.MinConns = 5
	config.MaxConnLifetime = 30 * time.Minute
	config.MaxConnIdleTime = 5 * time.Minute

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return pool, nil
}

func RunMigrations(pool *pgxpool.Pool, migrationsDir string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Create migrations tracking table
	_, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			applied_at TIMESTAMPTZ DEFAULT NOW()
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to create migrations table: %w", err)
	}

	// Read migration files
	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		return fmt.Errorf("failed to read migrations directory: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		// Extract version number from filename (e.g., "001_initial_schema.sql" → 1)
		name := entry.Name()
		if len(name) < 4 {
			continue
		}
		version := 0
		fmt.Sscanf(name[:3], "%d", &version)
		if version == 0 {
			continue
		}

		// Check if already applied
		var exists bool
		err := pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = $1)", version).Scan(&exists)
		if err != nil {
			return fmt.Errorf("failed to check migration %d: %w", version, err)
		}
		if exists {
			continue
		}

		// Read and execute migration
		content, err := os.ReadFile(filepath.Join(migrationsDir, name))
		if err != nil {
			return fmt.Errorf("failed to read migration %s: %w", name, err)
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			return fmt.Errorf("failed to begin transaction for migration %d: %w", version, err)
		}

		if _, err := tx.Exec(ctx, string(content)); err != nil {
			tx.Rollback(ctx)
			return fmt.Errorf("failed to execute migration %d: %w", version, err)
		}

		if _, err := tx.Exec(ctx, "INSERT INTO schema_migrations (version) VALUES ($1)", version); err != nil {
			tx.Rollback(ctx)
			return fmt.Errorf("failed to record migration %d: %w", version, err)
		}

		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("failed to commit migration %d: %w", version, err)
		}

		fmt.Printf("Applied migration %03d: %s\n", version, name)
	}

	return nil
}
