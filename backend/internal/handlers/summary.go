package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"lectura-backend/internal/middleware"
	"lectura-backend/internal/models"
	"lectura-backend/internal/repository"
)

type SummaryHandler struct {
	summaryRepo *repository.SummaryRepo
	contentRepo *repository.ContentRepo
	jobRepo     *repository.JobRepo
	redis       *redis.Client
}

func NewSummaryHandler(summaryRepo *repository.SummaryRepo, contentRepo *repository.ContentRepo, jobRepo *repository.JobRepo, redisClient *redis.Client) *SummaryHandler {
	return &SummaryHandler{
		summaryRepo: summaryRepo,
		contentRepo: contentRepo,
		jobRepo:     jobRepo,
		redis:       redisClient,
	}
}

func (h *SummaryHandler) Generate(w http.ResponseWriter, r *http.Request) {
	var req models.GenerateSummaryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}

	userID := middleware.GetUserID(r.Context())

	// Verify content exists and belongs to user
	content, err := h.contentRepo.GetByID(r.Context(), req.ContentID)
	if err != nil || content.UserID != userID {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Content not found", r))
		return
	}

	// Create summary record
	summary := &models.Summary{
		UserID:        userID,
		ContentID:     &req.ContentID,
		Format:        req.Format,
		LengthSetting: req.Length,
	}
	configBytes, _ := json.Marshal(req)
	summary.ConfigJSON = configBytes

	if err := h.summaryRepo.Create(r.Context(), summary); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to create summary", r))
		return
	}

	// Create and queue job
	job := &models.Job{
		UserID:      userID,
		Type:        "summary-generation",
		ReferenceID: summary.ID,
		ConfigJSON:  configBytes,
	}

	if err := h.jobRepo.Create(r.Context(), job); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to create job", r))
		return
	}

	// Push to Redis queue
	jobBytes, _ := json.Marshal(job)
	h.redis.LPush(r.Context(), "queue:summary-generation", string(jobBytes))

	writeJSON(w, http.StatusAccepted, map[string]interface{}{
		"job_id":     job.ID,
		"summary_id": summary.ID,
	})
}

func (h *SummaryHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	search := r.URL.Query().Get("search")
	sortBy := r.URL.Query().Get("sort")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	if limit <= 0 || limit > 50 {
		limit = 20
	}

	summaries, total, err := h.summaryRepo.ListByUser(r.Context(), userID, search, sortBy, limit, offset)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to fetch summaries", r))
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"summaries": summaries,
		"total":     total,
		"limit":     limit,
		"offset":    offset,
	})
}

func (h *SummaryHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid summary ID", r))
		return
	}

	summary, err := h.summaryRepo.GetByID(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Summary not found", r))
		return
	}

	userID := middleware.GetUserID(r.Context())
	if summary.UserID != userID {
		writeJSON(w, http.StatusForbidden, errorResp("FORBIDDEN", "Access denied", r))
		return
	}

	writeJSON(w, http.StatusOK, summary)
}

func (h *SummaryHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid summary ID", r))
		return
	}

	summary, err := h.summaryRepo.GetByID(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Summary not found", r))
		return
	}

	userID := middleware.GetUserID(r.Context())
	if summary.UserID != userID {
		writeJSON(w, http.StatusForbidden, errorResp("FORBIDDEN", "Access denied", r))
		return
	}

	var update struct {
		Title string   `json:"title"`
		Tags  []string `json:"tags"`
	}
	json.NewDecoder(r.Body).Decode(&update)

	if update.Title != "" {
		summary.Title = update.Title
	}
	if update.Tags != nil {
		summary.Tags = update.Tags
	}

	if err := h.summaryRepo.Update(r.Context(), summary); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to update summary", r))
		return
	}

	writeJSON(w, http.StatusOK, summary)
}

func (h *SummaryHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid summary ID", r))
		return
	}

	summary, err := h.summaryRepo.GetByID(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Summary not found", r))
		return
	}

	userID := middleware.GetUserID(r.Context())
	if summary.UserID != userID {
		writeJSON(w, http.StatusForbidden, errorResp("FORBIDDEN", "Access denied", r))
		return
	}

	if err := h.summaryRepo.Delete(r.Context(), id); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to delete summary", r))
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Summary deleted"})
}

func (h *SummaryHandler) ToggleFavorite(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid summary ID", r))
		return
	}

	if err := h.summaryRepo.ToggleFavorite(r.Context(), id); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to update favorite", r))
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Favorite toggled"})
}

func (h *SummaryHandler) Regenerate(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid summary ID", r))
		return
	}

	userID := middleware.GetUserID(r.Context())

	// Read new config
	var req models.GenerateSummaryRequest
	json.NewDecoder(r.Body).Decode(&req)

	configBytes, _ := json.Marshal(req)

	// Create job
	job := &models.Job{
		UserID:      userID,
		Type:        "summary-generation",
		ReferenceID: id,
		ConfigJSON:  configBytes,
	}

	if err := h.jobRepo.Create(r.Context(), job); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to create job", r))
		return
	}

	jobBytes, _ := json.Marshal(job)
	h.redis.LPush(r.Context(), "queue:summary-generation", string(jobBytes))

	writeJSON(w, http.StatusAccepted, map[string]interface{}{
		"job_id":     job.ID,
		"summary_id": id,
	})
}
