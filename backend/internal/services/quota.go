package services

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type QuotaService struct {
	pool *pgxpool.Pool
}

func NewQuotaService(pool *pgxpool.Pool) *QuotaService {
	return &QuotaService{pool: pool}
}

var JobCreditCost = map[string]int{
	"summary":        10,
	"quiz":           10,
	"flashcard_deck": 10,
	"presentation":   20,
}

func GetMonthlyCreditLimit(plan string) int {
	switch plan {
	case "ultra":
		return 20000
	case "pro":
		return 4000
	case "plus":
		return 0 // Handled separately (BYOK, practically unlimited on our side)
	default:
		return 100 // Free
	}
}

// GetUserCreditStatus returns (usedCredits, totalCredits, error)
func (s *QuotaService) GetUserCreditStatus(ctx context.Context, userID uuid.UUID, plan string) (int, int, error) {
	if plan == "plus" {
		// Plus is unlimited BYOK
		return 0, -1, nil
	}

	limit := GetMonthlyCreditLimit(plan)

	query := `
		SELECT 
			COALESCE((SELECT COUNT(*) FROM summaries WHERE user_id = $1 AND date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE)), 0) * 10 +
			COALESCE((SELECT COUNT(*) FROM quizzes WHERE user_id = $1 AND date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE)), 0) * 10 +
			COALESCE((SELECT COUNT(*) FROM flashcard_decks WHERE user_id = $1 AND date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE)), 0) * 10 +
			COALESCE((SELECT COUNT(*) FROM presentations WHERE user_id = $1 AND date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE)), 0) * 20
	`

	var usedCredits int
	err := s.pool.QueryRow(ctx, query, userID).Scan(&usedCredits)
	if err != nil {
		return 0, limit, fmt.Errorf("failed to count used credits: %w", err)
	}

	return usedCredits, limit, nil
}

// CheckQuota limits the user's monthly generation based on credits
// Returns true if allowed, false if quota exceeded
func (s *QuotaService) CheckQuota(ctx context.Context, userID uuid.UUID, plan string, jobType string) (bool, error) {
	if plan == "plus" {
		var hasKey bool
		err := s.pool.QueryRow(ctx, "SELECT has_gemini_key FROM users WHERE id = $1", userID).Scan(&hasKey)
		if err != nil {
			return false, fmt.Errorf("failed to check api key status: %w", err)
		}
		if !hasKey {
			return false, fmt.Errorf("API_KEY_REQUIRED")
		}
		return true, nil
	}

	cost, ok := JobCreditCost[jobType]
	if !ok {
		return false, fmt.Errorf("unknown job type for quota: %s", jobType)
	}

	used, total, err := s.GetUserCreditStatus(ctx, userID, plan)
	if err != nil {
		return false, err
	}

	if used+cost > total {
		return false, nil
	}

	return true, nil
}
