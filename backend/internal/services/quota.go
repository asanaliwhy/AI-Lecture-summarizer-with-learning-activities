package services

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type QuotaService struct {
	pool *pgxpool.Pool
}

func NewQuotaService(pool *pgxpool.Pool) *QuotaService {
	return &QuotaService{pool: pool}
}

type QuotaLimits struct {
	Summaries     int
	Quizzes       int
	Presentations int
	Flashcards    int
}

var FreeLimits = QuotaLimits{
	Summaries:     5,
	Quizzes:       5,
	Presentations: 3,
	Flashcards:    5,
}

var StudentLimits = QuotaLimits{
	Summaries:     50,
	Quizzes:       50,
	Presentations: 30,
	Flashcards:    50,
}

func GetLimitsForPlan(plan string) QuotaLimits {
	switch plan {
	case "student":
		return StudentLimits
	case "pro":
		// Pro is essentially unlimited in our system, but let's return high values
		return QuotaLimits{
			Summaries:     10000,
			Quizzes:       10000,
			Presentations: 10000,
			Flashcards:    10000,
		}
	default:
		return FreeLimits
	}
}

// CheckQuota limits the user's monthly generation
// Returns true if allowed, false if quota exceeded
func (s *QuotaService) CheckQuota(ctx context.Context, userID uuid.UUID, plan string, jobType string) (bool, error) {
	if plan == "pro" {
		return true, nil
	}

	limits := GetLimitsForPlan(plan)
	
	// Query the number of items generated this month
	var count int
	var err error

	switch jobType {
	case "summary":
		err = s.pool.QueryRow(ctx, "SELECT COUNT(*) FROM summaries WHERE user_id = $1 AND date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE)", userID).Scan(&count)
		if err != nil {
			return false, err
		}
		if count >= limits.Summaries {
			return false, nil
		}
	case "quiz":
		err = s.pool.QueryRow(ctx, "SELECT COUNT(*) FROM quizzes WHERE user_id = $1 AND date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE)", userID).Scan(&count)
		if err != nil {
			return false, err
		}
		if count >= limits.Quizzes {
			return false, nil
		}
	case "presentation":
		err = s.pool.QueryRow(ctx, "SELECT COUNT(*) FROM presentations WHERE user_id = $1 AND date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE)", userID).Scan(&count)
		if err != nil {
			return false, err
		}
		if count >= limits.Presentations {
			return false, nil
		}
	case "flashcard_deck":
		err = s.pool.QueryRow(ctx, "SELECT COUNT(*) FROM flashcard_decks WHERE user_id = $1 AND date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE)", userID).Scan(&count)
		if err != nil {
			return false, err
		}
		if count >= limits.Flashcards {
			return false, nil
		}
	}

	return true, nil
}
