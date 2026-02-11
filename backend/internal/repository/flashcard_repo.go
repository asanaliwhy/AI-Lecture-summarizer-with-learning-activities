package repository

import (
	"context"
	"encoding/json"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"lectura-backend/internal/models"
)

type FlashcardRepo struct {
	pool *pgxpool.Pool
}

func NewFlashcardRepo(pool *pgxpool.Pool) *FlashcardRepo {
	return &FlashcardRepo{pool: pool}
}

// Deck operations

func (r *FlashcardRepo) CreateDeck(ctx context.Context, d *models.FlashcardDeck) error {
	d.ID = uuid.New()
	configBytes, _ := json.Marshal(d.ConfigJSON)
	if configBytes == nil {
		configBytes = []byte("{}")
	}

	query := `INSERT INTO flashcard_decks (id, user_id, summary_id, title, config_json, card_count)
		VALUES ($1, $2, $3, $4, $5, $6) RETURNING created_at`

	return r.pool.QueryRow(ctx, query,
		d.ID, d.UserID, d.SummaryID, d.Title, configBytes, d.CardCount,
	).Scan(&d.CreatedAt)
}

func (r *FlashcardRepo) GetDeckByID(ctx context.Context, id uuid.UUID) (*models.FlashcardDeck, error) {
	d := &models.FlashcardDeck{}
	query := `SELECT id, user_id, summary_id, title, config_json, card_count, created_at
		FROM flashcard_decks WHERE id = $1`

	err := r.pool.QueryRow(ctx, query, id).Scan(
		&d.ID, &d.UserID, &d.SummaryID, &d.Title, &d.ConfigJSON, &d.CardCount, &d.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return d, nil
}

func (r *FlashcardRepo) ListDecksByUser(ctx context.Context, userID uuid.UUID) ([]*models.FlashcardDeck, error) {
	query := `SELECT id, user_id, summary_id, title, config_json, card_count, created_at
		FROM flashcard_decks WHERE user_id = $1 ORDER BY created_at DESC`

	rows, err := r.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var decks []*models.FlashcardDeck
	for rows.Next() {
		d := &models.FlashcardDeck{}
		err := rows.Scan(&d.ID, &d.UserID, &d.SummaryID, &d.Title, &d.ConfigJSON, &d.CardCount, &d.CreatedAt)
		if err != nil {
			return nil, err
		}
		decks = append(decks, d)
	}
	return decks, nil
}

func (r *FlashcardRepo) DeleteDeck(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, "DELETE FROM flashcard_decks WHERE id = $1", id)
	return err
}

// Card operations

func (r *FlashcardRepo) CreateCards(ctx context.Context, deckID uuid.UUID, cards []models.FlashcardCard) error {
	for i := range cards {
		cards[i].ID = uuid.New()
		cards[i].DeckID = deckID

		_, err := r.pool.Exec(ctx,
			`INSERT INTO flashcard_cards (id, deck_id, front, back, mnemonic, example, topic, difficulty, interval_days, ease_factor, repetitions, next_review_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
			cards[i].ID, deckID, cards[i].Front, cards[i].Back, cards[i].Mnemonic, cards[i].Example,
			cards[i].Topic, cards[i].Difficulty, 1, 2.50, 0, time.Now().AddDate(0, 0, 1),
		)
		if err != nil {
			return err
		}
	}

	// Update card_count on deck
	_, err := r.pool.Exec(ctx, "UPDATE flashcard_decks SET card_count = $1 WHERE id = $2", len(cards), deckID)
	return err
}

func (r *FlashcardRepo) GetCardsByDeck(ctx context.Context, deckID uuid.UUID) ([]models.FlashcardCard, error) {
	query := `SELECT id, deck_id, front, back, mnemonic, example, topic, difficulty,
		interval_days, ease_factor, repetitions, next_review_at, last_reviewed_at
		FROM flashcard_cards WHERE deck_id = $1 ORDER BY next_review_at ASC`

	rows, err := r.pool.Query(ctx, query, deckID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cards []models.FlashcardCard
	for rows.Next() {
		c := models.FlashcardCard{}
		err := rows.Scan(
			&c.ID, &c.DeckID, &c.Front, &c.Back, &c.Mnemonic, &c.Example, &c.Topic,
			&c.Difficulty, &c.IntervalDays, &c.EaseFactor, &c.Repetitions, &c.NextReviewAt, &c.LastReviewedAt,
		)
		if err != nil {
			return nil, err
		}
		cards = append(cards, c)
	}
	return cards, nil
}

// SM-2 Algorithm — pure math, no Gemini
func (r *FlashcardRepo) RateCard(ctx context.Context, cardID uuid.UUID, rating int) error {
	// Get current card values
	var interval int
	var easeFactor float64
	var repetitions int

	err := r.pool.QueryRow(ctx,
		"SELECT interval_days, ease_factor, repetitions FROM flashcard_cards WHERE id = $1",
		cardID,
	).Scan(&interval, &easeFactor, &repetitions)
	if err != nil {
		return err
	}

	// SM-2 calculation
	if rating < 2 {
		// Again or Hard — reset
		repetitions = 0
		interval = 1
	} else {
		// Good or Easy
		repetitions++
		switch repetitions {
		case 1:
			interval = 1
		case 2:
			interval = 6
		default:
			interval = int(math.Round(float64(interval) * easeFactor))
		}
	}

	// Update ease factor: EF' = EF + (0.1 - (3 - rating) * (0.08 + (3 - rating) * 0.02))
	easeFactor = easeFactor + (0.1 - float64(3-rating)*(0.08+float64(3-rating)*0.02))
	if easeFactor < 1.3 {
		easeFactor = 1.3
	}

	nextReview := time.Now().AddDate(0, 0, interval)

	_, err = r.pool.Exec(ctx,
		`UPDATE flashcard_cards SET interval_days = $1, ease_factor = $2, repetitions = $3,
		 next_review_at = $4, last_reviewed_at = NOW() WHERE id = $5`,
		interval, easeFactor, repetitions, nextReview, cardID,
	)
	return err
}

func (r *FlashcardRepo) GetDeckStats(ctx context.Context, deckID uuid.UUID) (*models.DeckStats, error) {
	stats := &models.DeckStats{}

	err := r.pool.QueryRow(ctx, "SELECT COUNT(*) FROM flashcard_cards WHERE deck_id = $1", deckID).Scan(&stats.TotalCards)
	if err != nil {
		return nil, err
	}

	r.pool.QueryRow(ctx,
		"SELECT COUNT(*) FROM flashcard_cards WHERE deck_id = $1 AND repetitions >= 3 AND ease_factor >= 2.5",
		deckID).Scan(&stats.Mastered)

	r.pool.QueryRow(ctx,
		"SELECT COUNT(*) FROM flashcard_cards WHERE deck_id = $1 AND repetitions > 0 AND (repetitions < 3 OR ease_factor < 2.5)",
		deckID).Scan(&stats.Learning)

	r.pool.QueryRow(ctx,
		"SELECT COUNT(*) FROM flashcard_cards WHERE deck_id = $1 AND repetitions = 0",
		deckID).Scan(&stats.New)

	r.pool.QueryRow(ctx,
		"SELECT COUNT(*) FROM flashcard_cards WHERE deck_id = $1 AND next_review_at <= CURRENT_DATE",
		deckID).Scan(&stats.DueToday)

	if stats.TotalCards > 0 {
		stats.MasteryRate = float64(stats.Mastered) / float64(stats.TotalCards) * 100
	}

	return stats, nil
}
