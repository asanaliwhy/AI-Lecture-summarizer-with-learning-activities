package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"lectura-backend/internal/middleware"
	"lectura-backend/internal/models"
)

type stubFlashcardRepoForRateCard struct {
	card        *models.FlashcardCard
	cardErr     error
	deck        *models.FlashcardDeck
	deckErr     error
	rateErr     error
	rated       bool
	ratedCardID uuid.UUID
	ratedValue  int
}

func (s *stubFlashcardRepoForRateCard) CreateDeck(ctx context.Context, d *models.FlashcardDeck) error {
	return nil
}

func (s *stubFlashcardRepoForRateCard) ListDecksByUser(ctx context.Context, userID uuid.UUID) ([]*models.FlashcardDeck, error) {
	return nil, nil
}

func (s *stubFlashcardRepoForRateCard) GetDeckByID(ctx context.Context, id uuid.UUID) (*models.FlashcardDeck, error) {
	if s.deckErr != nil {
		return nil, s.deckErr
	}
	if s.deck == nil {
		return nil, pgx.ErrNoRows
	}
	return s.deck, nil
}

func (s *stubFlashcardRepoForRateCard) GetCardsByDeck(ctx context.Context, deckID uuid.UUID) ([]models.FlashcardCard, error) {
	return nil, nil
}

func (s *stubFlashcardRepoForRateCard) ToggleFavorite(ctx context.Context, id uuid.UUID, userID uuid.UUID) error {
	return nil
}

func (s *stubFlashcardRepoForRateCard) DeleteDeck(ctx context.Context, id uuid.UUID) error {
	return nil
}

func (s *stubFlashcardRepoForRateCard) TouchLastAccessed(ctx context.Context, id uuid.UUID) (bool, error) {
	return true, nil
}

func (s *stubFlashcardRepoForRateCard) GetCardByID(ctx context.Context, id uuid.UUID) (*models.FlashcardCard, error) {
	if s.cardErr != nil {
		return nil, s.cardErr
	}
	if s.card == nil {
		return nil, pgx.ErrNoRows
	}
	return s.card, nil
}

func (s *stubFlashcardRepoForRateCard) RateCard(ctx context.Context, cardID uuid.UUID, rating int) error {
	s.rated = true
	s.ratedCardID = cardID
	s.ratedValue = rating
	return s.rateErr
}

func (s *stubFlashcardRepoForRateCard) GetDeckStats(ctx context.Context, deckID uuid.UUID) (*models.DeckStats, error) {
	return &models.DeckStats{}, nil
}

func makeRateCardRequest(t *testing.T, userID uuid.UUID, cardID uuid.UUID, body string) *http.Request {
	t.Helper()
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", cardID.String())

	req := httptest.NewRequest(http.MethodPost, "/api/v1/flashcards/cards/"+cardID.String()+"/rating", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	return req
}

func TestRateCard_Owner_Returns204(t *testing.T) {
	ownerID := uuid.New()
	deckID := uuid.New()
	cardID := uuid.New()

	repo := &stubFlashcardRepoForRateCard{
		card: &models.FlashcardCard{ID: cardID, DeckID: deckID},
		deck: &models.FlashcardDeck{ID: deckID, UserID: ownerID},
	}
	h := &FlashcardHandler{flashRepo: repo}

	req := makeRateCardRequest(t, ownerID, cardID, `{"rating":3}`)
	rr := httptest.NewRecorder()

	h.RateCard(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Fatalf("expected status %d, got %d", http.StatusNoContent, rr.Code)
	}
	if !repo.rated {
		t.Fatalf("expected RateCard to be called")
	}
	if repo.ratedCardID != cardID || repo.ratedValue != 3 {
		t.Fatalf("unexpected rate call args: cardID=%s rating=%d", repo.ratedCardID, repo.ratedValue)
	}
}

func TestRateCard_NonOwner_Returns403(t *testing.T) {
	ownerID := uuid.New()
	otherUserID := uuid.New()
	deckID := uuid.New()
	cardID := uuid.New()

	repo := &stubFlashcardRepoForRateCard{
		card: &models.FlashcardCard{ID: cardID, DeckID: deckID},
		deck: &models.FlashcardDeck{ID: deckID, UserID: ownerID},
	}
	h := &FlashcardHandler{flashRepo: repo}

	req := makeRateCardRequest(t, otherUserID, cardID, `{"rating":2}`)
	rr := httptest.NewRecorder()

	h.RateCard(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("expected status %d, got %d", http.StatusForbidden, rr.Code)
	}
	if repo.rated {
		t.Fatalf("rate should not execute for non-owner")
	}
	if code := errorCodeFromBody(t, rr); code != "FORBIDDEN" {
		t.Fatalf("expected FORBIDDEN, got %q", code)
	}
}

func TestRateCard_CardNotFound_Returns404(t *testing.T) {
	userID := uuid.New()
	cardID := uuid.New()

	repo := &stubFlashcardRepoForRateCard{cardErr: pgx.ErrNoRows}
	h := &FlashcardHandler{flashRepo: repo}

	req := makeRateCardRequest(t, userID, cardID, `{"rating":1}`)
	rr := httptest.NewRecorder()

	h.RateCard(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("expected status %d, got %d", http.StatusNotFound, rr.Code)
	}
	if code := errorCodeFromBody(t, rr); code != "NOT_FOUND" {
		t.Fatalf("expected NOT_FOUND, got %q", code)
	}
}

func TestRateCard_InvalidRating_Returns400(t *testing.T) {
	userID := uuid.New()
	cardID := uuid.New()

	repo := &stubFlashcardRepoForRateCard{}
	h := &FlashcardHandler{flashRepo: repo}

	req := makeRateCardRequest(t, userID, cardID, `{"rating":9}`)
	rr := httptest.NewRecorder()

	h.RateCard(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, rr.Code)
	}
	if repo.rated {
		t.Fatalf("rate should not execute for invalid rating")
	}
	if code := errorCodeFromBody(t, rr); code != "VALIDATION_ERROR" {
		t.Fatalf("expected VALIDATION_ERROR, got %q", code)
	}
}
