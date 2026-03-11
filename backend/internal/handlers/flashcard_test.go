package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/redis/go-redis/v9"

	"lectura-backend/internal/middleware"
	"lectura-backend/internal/models"
)

type stubFlashcardRepoForRateCard struct {
	createDeckErr error
	createdDecks  []*models.FlashcardDeck

	card        *models.FlashcardCard
	cardErr     error
	deck        *models.FlashcardDeck
	deckErr     error
	cards       []models.FlashcardCard
	cardsErr    error
	rateErr     error
	rated       bool
	ratedCardID uuid.UUID
	ratedValue  int
}

func (s *stubFlashcardRepoForRateCard) CreateDeck(ctx context.Context, d *models.FlashcardDeck) error {
	if s.createDeckErr != nil {
		return s.createDeckErr
	}
	if d.ID == uuid.Nil {
		d.ID = uuid.New()
	}
	s.createdDecks = append(s.createdDecks, d)
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
	if s.cardsErr != nil {
		return nil, s.cardsErr
	}
	return s.cards, nil
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

type stubFlashcardSummaryRepo struct {
	summary *models.Summary
}

func (s *stubFlashcardSummaryRepo) GetByID(ctx context.Context, id uuid.UUID) (*models.Summary, error) {
	if s.summary == nil {
		return nil, context.Canceled
	}
	return s.summary, nil
}

type stubFlashcardJobRepo struct {
	created         []*models.Job
	updatedStatuses []string
	updatedIDs      []uuid.UUID
}

func (s *stubFlashcardJobRepo) Create(ctx context.Context, j *models.Job) error {
	if j.ID == uuid.Nil {
		j.ID = uuid.New()
	}
	j.Status = "pending"
	s.created = append(s.created, j)
	return nil
}

func (s *stubFlashcardJobRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status string) error {
	s.updatedIDs = append(s.updatedIDs, id)
	s.updatedStatuses = append(s.updatedStatuses, status)
	return nil
}

type flashcardFakeQueuePusher struct {
	err    error
	key    string
	values []interface{}
}

func (f *flashcardFakeQueuePusher) LPush(ctx context.Context, key string, values ...interface{}) *redis.IntCmd {
	f.key = key
	f.values = append(f.values, values...)
	if f.err != nil {
		return redis.NewIntResult(0, f.err)
	}
	return redis.NewIntResult(1, nil)
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

func TestGetDeck_CardFetchError_Returns500(t *testing.T) {
	userID := uuid.New()
	deckID := uuid.New()

	repo := &stubFlashcardRepoForRateCard{
		deck:     &models.FlashcardDeck{ID: deckID, UserID: userID, Title: "Deck"},
		cardsErr: context.Canceled,
	}
	h := &FlashcardHandler{flashRepo: repo}

	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", deckID.String())
	req := httptest.NewRequest(http.MethodGet, "/api/v1/flashcards/decks/"+deckID.String(), nil)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	rr := httptest.NewRecorder()

	h.GetDeck(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("expected status %d, got %d", http.StatusInternalServerError, rr.Code)
	}
	if code := errorCodeFromBody(t, rr); code != "INTERNAL_ERROR" {
		t.Fatalf("expected INTERNAL_ERROR, got %q", code)
	}
}

func TestGetDeck_EmptyDeck_Returns200WithEmptyCards(t *testing.T) {
	userID := uuid.New()
	deckID := uuid.New()

	repo := &stubFlashcardRepoForRateCard{
		deck:  &models.FlashcardDeck{ID: deckID, UserID: userID, Title: "Deck"},
		cards: []models.FlashcardCard{},
	}
	h := &FlashcardHandler{flashRepo: repo}

	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", deckID.String())
	req := httptest.NewRequest(http.MethodGet, "/api/v1/flashcards/decks/"+deckID.String(), nil)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	rr := httptest.NewRecorder()

	h.GetDeck(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rr.Code)
	}

	var payload struct {
		Cards []models.FlashcardCard `json:"cards"`
	}
	if err := json.NewDecoder(rr.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(payload.Cards) != 0 {
		t.Fatalf("expected empty cards list, got %d", len(payload.Cards))
	}
}

func TestGetDeckStats_Owner_Returns200(t *testing.T) {
	userID := uuid.New()
	deckID := uuid.New()

	repo := &stubFlashcardRepoForRateCard{
		deck: &models.FlashcardDeck{ID: deckID, UserID: userID, Title: "Deck"},
	}
	h := &FlashcardHandler{flashRepo: repo}

	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", deckID.String())
	req := httptest.NewRequest(http.MethodGet, "/api/v1/flashcards/decks/"+deckID.String()+"/stats", nil)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	rr := httptest.NewRecorder()

	h.GetDeckStats(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rr.Code)
	}
}

func TestGetDeckStats_NonOwner_Returns403(t *testing.T) {
	ownerID := uuid.New()
	otherUserID := uuid.New()
	deckID := uuid.New()

	repo := &stubFlashcardRepoForRateCard{
		deck: &models.FlashcardDeck{ID: deckID, UserID: ownerID, Title: "Deck"},
	}
	h := &FlashcardHandler{flashRepo: repo}

	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", deckID.String())
	req := httptest.NewRequest(http.MethodGet, "/api/v1/flashcards/decks/"+deckID.String()+"/stats", nil)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, otherUserID))
	rr := httptest.NewRecorder()

	h.GetDeckStats(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("expected status %d, got %d", http.StatusForbidden, rr.Code)
	}
	if code := errorCodeFromBody(t, rr); code != "FORBIDDEN" {
		t.Fatalf("expected FORBIDDEN, got %q", code)
	}
}

func TestGetDeckStats_DeckNotFound_Returns404(t *testing.T) {
	userID := uuid.New()
	deckID := uuid.New()

	repo := &stubFlashcardRepoForRateCard{deckErr: pgx.ErrNoRows}
	h := &FlashcardHandler{flashRepo: repo}

	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", deckID.String())
	req := httptest.NewRequest(http.MethodGet, "/api/v1/flashcards/decks/"+deckID.String()+"/stats", nil)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	rr := httptest.NewRecorder()

	h.GetDeckStats(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("expected status %d, got %d", http.StatusNotFound, rr.Code)
	}
	if code := errorCodeFromBody(t, rr); code != "NOT_FOUND" {
		t.Fatalf("expected NOT_FOUND, got %q", code)
	}
}

func TestFlashcardGenerate_QueueFailure_MarksJobFailed(t *testing.T) {
	userID := uuid.New()
	summaryID := uuid.New()

	flashRepo := &stubFlashcardRepoForRateCard{}
	summaryRepo := &stubFlashcardSummaryRepo{summary: &models.Summary{ID: summaryID, UserID: userID}}
	jobRepo := &stubFlashcardJobRepo{}
	queue := &flashcardFakeQueuePusher{err: errors.New("redis down")}

	h := &FlashcardHandler{flashRepo: flashRepo, summaryRepo: summaryRepo, jobRepo: jobRepo, redis: queue}

	body := `{"summary_id":"` + summaryID.String() + `","title":"Deck","num_cards":8,"strategy":"term_definition"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/flashcards/generate", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	rr := httptest.NewRecorder()

	h.Generate(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("expected status %d, got %d", http.StatusInternalServerError, rr.Code)
	}
	if code := errorCodeFromBody(t, rr); code != "QUEUE_ERROR" {
		t.Fatalf("expected QUEUE_ERROR, got %q", code)
	}
	if len(flashRepo.createdDecks) != 1 {
		t.Fatalf("expected deck to be created before enqueue failure")
	}
	if len(jobRepo.created) != 1 {
		t.Fatalf("expected job to be created before enqueue failure")
	}
	if len(jobRepo.updatedStatuses) == 0 || jobRepo.updatedStatuses[len(jobRepo.updatedStatuses)-1] != "failed" {
		t.Fatalf("expected job status to be marked failed")
	}
	if queue.key != "queue:flashcard-generation" {
		t.Fatalf("expected queue key queue:flashcard-generation, got %q", queue.key)
	}
}

func TestFlashcardGenerate_QueueSuccess_Returns202(t *testing.T) {
	userID := uuid.New()
	summaryID := uuid.New()

	flashRepo := &stubFlashcardRepoForRateCard{}
	summaryRepo := &stubFlashcardSummaryRepo{summary: &models.Summary{ID: summaryID, UserID: userID}}
	jobRepo := &stubFlashcardJobRepo{}
	queue := &flashcardFakeQueuePusher{}

	h := &FlashcardHandler{flashRepo: flashRepo, summaryRepo: summaryRepo, jobRepo: jobRepo, redis: queue}

	body := `{"summary_id":"` + summaryID.String() + `","title":"Deck","num_cards":8,"strategy":"term_definition"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/flashcards/generate", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
	rr := httptest.NewRecorder()

	h.Generate(rr, req)

	if rr.Code != http.StatusAccepted {
		t.Fatalf("expected status %d, got %d", http.StatusAccepted, rr.Code)
	}
	if len(jobRepo.updatedStatuses) != 0 {
		t.Fatalf("did not expect failed status updates on successful enqueue")
	}

	var payload map[string]interface{}
	if err := json.NewDecoder(rr.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if payload["job_id"] == nil {
		t.Fatalf("expected job_id in response")
	}
	if payload["deck_id"] == nil {
		t.Fatalf("expected deck_id in response")
	}
}
