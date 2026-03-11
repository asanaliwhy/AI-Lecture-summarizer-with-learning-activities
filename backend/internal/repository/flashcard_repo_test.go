package repository

import (
	"context"
	"errors"
	"math"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type fakeDeckStatsRow struct {
	scanErr error
	values  []int
}

func (r fakeDeckStatsRow) Scan(dest ...interface{}) error {
	if r.scanErr != nil {
		return r.scanErr
	}
	if len(dest) != 5 {
		return errors.New("unexpected destination count")
	}
	if len(r.values) != 5 {
		return errors.New("unexpected values count")
	}

	for i := range dest {
		ptr, ok := dest[i].(*int)
		if !ok {
			return errors.New("unexpected destination type")
		}
		*ptr = r.values[i]
	}

	return nil
}

func TestGetDeckStats_DBError_ReturnsError(t *testing.T) {
	deckID := uuid.New()

	stats, err := getDeckStatsWithQueryRow(context.Background(), deckID, func(context.Context, string, ...interface{}) pgx.Row {
		return fakeDeckStatsRow{scanErr: errors.New("db unavailable")}
	})

	if err == nil {
		t.Fatalf("expected error, got nil")
	}
	if stats != nil {
		t.Fatalf("expected nil stats on db error")
	}
}

func TestGetDeckStats_EmptyDeck_ReturnsZeroStats(t *testing.T) {
	deckID := uuid.New()

	stats, err := getDeckStatsWithQueryRow(context.Background(), deckID, func(context.Context, string, ...interface{}) pgx.Row {
		return fakeDeckStatsRow{values: []int{0, 0, 0, 0, 0}}
	})

	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if stats.TotalCards != 0 || stats.Mastered != 0 || stats.Learning != 0 || stats.New != 0 || stats.DueToday != 0 {
		t.Fatalf("expected zero stats, got %+v", stats)
	}
	if stats.MasteryRate != 0 {
		t.Fatalf("expected mastery rate 0, got %f", stats.MasteryRate)
	}
}

func TestGetDeckStats_MixedCards_CorrectCounts(t *testing.T) {
	deckID := uuid.New()

	stats, err := getDeckStatsWithQueryRow(context.Background(), deckID, func(context.Context, string, ...interface{}) pgx.Row {
		// total, mastered, learning, new, due_today
		return fakeDeckStatsRow{values: []int{10, 4, 3, 3, 2}}
	})

	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if stats.TotalCards != 10 || stats.Mastered != 4 || stats.Learning != 3 || stats.New != 3 || stats.DueToday != 2 {
		t.Fatalf("unexpected stats: %+v", stats)
	}
	if math.Abs(stats.MasteryRate-40.0) > 0.0001 {
		t.Fatalf("expected mastery rate 40.0, got %f", stats.MasteryRate)
	}
}

