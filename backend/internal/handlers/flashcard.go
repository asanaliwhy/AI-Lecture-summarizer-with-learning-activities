package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"lectura-backend/internal/middleware"
	"lectura-backend/internal/models"
	"lectura-backend/internal/repository"
)

type FlashcardHandler struct {
	flashRepo   *repository.FlashcardRepo
	summaryRepo *repository.SummaryRepo
	jobRepo     *repository.JobRepo
	redis       *redis.Client
}

func NewFlashcardHandler(flashRepo *repository.FlashcardRepo, summaryRepo *repository.SummaryRepo, jobRepo *repository.JobRepo, redisClient *redis.Client) *FlashcardHandler {
	return &FlashcardHandler{
		flashRepo:   flashRepo,
		summaryRepo: summaryRepo,
		jobRepo:     jobRepo,
		redis:       redisClient,
	}
}

func (h *FlashcardHandler) Generate(w http.ResponseWriter, r *http.Request) {
	var req models.GenerateFlashcardsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}

	if req.SummaryID == uuid.Nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "summary_id is required", r))
		return
	}

	if req.NumCards <= 0 {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "num_cards must be greater than 0", r))
		return
	}

	if req.Strategy == "" {
		req.Strategy = "term_definition"
	}
	if req.Strategy == "definitions" {
		req.Strategy = "term_definition"
	}
	if req.Strategy == "qa" {
		req.Strategy = "question_answer"
	}
	if req.Strategy != "term_definition" && req.Strategy != "question_answer" {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "strategy must be term_definition or question_answer", r))
		return
	}

	userID := middleware.GetUserID(r.Context())

	summary, err := h.summaryRepo.GetByID(r.Context(), req.SummaryID)
	if err != nil || summary.UserID != userID {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Summary not found", r))
		return
	}

	deck := &models.FlashcardDeck{
		UserID:    userID,
		SummaryID: &req.SummaryID,
		Title:     req.Title,
		CardCount: req.NumCards,
	}
	configBytes, _ := json.Marshal(req)
	deck.ConfigJSON = configBytes

	if err := h.flashRepo.CreateDeck(r.Context(), deck); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to create deck", r))
		return
	}

	job := &models.Job{
		UserID:      userID,
		Type:        "flashcard-generation",
		ReferenceID: deck.ID,
		ConfigJSON:  configBytes,
	}

	if err := h.jobRepo.Create(r.Context(), job); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to create job", r))
		return
	}

	jobBytes, _ := json.Marshal(job)
	h.redis.LPush(r.Context(), "queue:flashcard-generation", string(jobBytes))

	writeJSON(w, http.StatusAccepted, map[string]interface{}{
		"job_id":  job.ID,
		"deck_id": deck.ID,
		"job": map[string]interface{}{
			"id": job.ID,
		},
		"deck": map[string]interface{}{
			"id": deck.ID,
		},
	})
}

func (h *FlashcardHandler) ListDecks(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())

	decks, err := h.flashRepo.ListDecksByUser(r.Context(), userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to fetch decks", r))
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"decks": decks})
}

func (h *FlashcardHandler) GetDeck(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid deck ID", r))
		return
	}

	deck, err := h.flashRepo.GetDeckByID(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Deck not found", r))
		return
	}

	userID := middleware.GetUserID(r.Context())
	if deck.UserID != userID {
		writeJSON(w, http.StatusForbidden, errorResp("FORBIDDEN", "Access denied", r))
		return
	}

	cards, _ := h.flashRepo.GetCardsByDeck(r.Context(), id)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"deck":  deck,
		"cards": cards,
	})
}

func (h *FlashcardHandler) ToggleFavorite(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid deck ID", r))
		return
	}

	deck, err := h.flashRepo.GetDeckByID(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Deck not found", r))
		return
	}

	userID := middleware.GetUserID(r.Context())
	if deck.UserID != userID {
		writeJSON(w, http.StatusForbidden, errorResp("FORBIDDEN", "Access denied", r))
		return
	}

	if err := h.flashRepo.ToggleFavorite(r.Context(), id, userID); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to update favorite", r))
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Favorite toggled"})
}

func (h *FlashcardHandler) DeleteDeck(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid deck ID", r))
		return
	}

	deck, err := h.flashRepo.GetDeckByID(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Deck not found", r))
		return
	}

	userID := middleware.GetUserID(r.Context())
	if deck.UserID != userID {
		writeJSON(w, http.StatusForbidden, errorResp("FORBIDDEN", "Access denied", r))
		return
	}

	if err := h.flashRepo.DeleteDeck(r.Context(), id); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to delete deck", r))
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Deck deleted"})
}

func (h *FlashcardHandler) RateCard(w http.ResponseWriter, r *http.Request) {
	cardID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid card ID", r))
		return
	}

	var req models.CardRatingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}

	if req.Rating < 0 || req.Rating > 3 {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Rating must be 0-3", r))
		return
	}

	if err := h.flashRepo.RateCard(r.Context(), cardID, req.Rating); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to rate card", r))
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Card rated"})
}

func (h *FlashcardHandler) GetDeckStats(w http.ResponseWriter, r *http.Request) {
	deckID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid deck ID", r))
		return
	}

	stats, err := h.flashRepo.GetDeckStats(r.Context(), deckID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to fetch stats", r))
		return
	}

	writeJSON(w, http.StatusOK, stats)
}
