package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"lectura-backend/internal/middleware"
	"lectura-backend/internal/models"
	"lectura-backend/internal/repository"
)

var themeIDPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,63}$`)

type PresentationHandler struct {
	presentationRepo presentationRepository
	contentRepo      *repository.ContentRepo
	jobRepo          presentationJobRepository
	redis            *redis.Client
}

type presentationRepository interface {
	Create(ctx context.Context, p *models.Presentation) error
	GetByID(ctx context.Context, id uuid.UUID) (*models.Presentation, error)
	GetByUser(ctx context.Context, userID uuid.UUID, search, sortBy string, limit, offset int) ([]*models.Presentation, int, error)
	Delete(ctx context.Context, id uuid.UUID) error
	UpdateLastAccessed(ctx context.Context, id uuid.UUID) error
	ToggleFavorite(ctx context.Context, id uuid.UUID, userID uuid.UUID) error
}

type presentationJobRepository interface {
	Create(ctx context.Context, j *models.Job) error
	UpdateStatus(ctx context.Context, id uuid.UUID, status string) error
	DeleteByReference(ctx context.Context, referenceID uuid.UUID, jobTypes ...string) error
}

func NewPresentationHandler(presentationRepo *repository.PresentationRepo, contentRepo *repository.ContentRepo, jobRepo *repository.JobRepo, redisClient *redis.Client) *PresentationHandler {
	return &PresentationHandler{
		presentationRepo: presentationRepo,
		contentRepo:      contentRepo,
		jobRepo:          jobRepo,
		redis:            redisClient,
	}
}

func (h *PresentationHandler) CreatePresentation(w http.ResponseWriter, r *http.Request) {
	var req models.GeneratePresentationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}

	if req.ContentID == uuid.Nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "content_id is required", r))
		return
	}
	if req.SlideCount <= 0 {
		req.SlideCount = 7
	}
	if req.SlideCount > 30 {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "slide_count must be 30 or less", r))
		return
	}
	req.Language = strings.TrimSpace(req.Language)
	if req.Language == "" {
		req.Language = "en"
	}
	req.TextStyle = strings.ToLower(strings.TrimSpace(req.TextStyle))
	if req.TextStyle == "" {
		req.TextStyle = "formal"
	}
	if req.TextStyle != "formal" && req.TextStyle != "academic" && req.TextStyle != "conversational" {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "text_style must be formal, academic, or conversational", r))
		return
	}
	req.Theme = strings.ToLower(strings.TrimSpace(req.Theme))
	if req.Theme == "" {
		req.Theme = "navy"
	}
	if !themeIDPattern.MatchString(req.Theme) {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "theme must be a valid theme id", r))
		return
	}
	if req.FocusAreas == nil {
		req.FocusAreas = []string{}
	}

	userID := middleware.GetUserID(r.Context())
	content, err := h.contentRepo.GetByID(r.Context(), req.ContentID)
	if err != nil || content.UserID != userID {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Content not found", r))
		return
	}
	if content.Type != "youtube" {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Presentations currently support validated YouTube content only", r))
		return
	}

	topic := content.Title
	presentation := &models.Presentation{
		UserID:          userID,
		ContentID:       &req.ContentID,
		Title:           content.Title,
		Topic:           &topic,
		Language:        req.Language,
		Theme:           req.Theme,
		SlideCount:      req.SlideCount,
		Slides:          []models.PresentationSlide{},
		Status:          "pending",
		QualityFallback: false,
	}

	configBytes, _ := json.Marshal(req)
	presentation.ConfigJSON = configBytes
	if err := h.presentationRepo.Create(r.Context(), presentation); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to create presentation", r))
		return
	}

	job := &models.Job{
		UserID:      userID,
		Type:        "presentation",
		ReferenceID: presentation.ID,
		ConfigJSON:  configBytes,
	}
	if err := h.jobRepo.Create(r.Context(), job); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to create job", r))
		return
	}

	if h.redis == nil {
		_ = h.jobRepo.UpdateStatus(r.Context(), job.ID, "failed")
		writeJSON(w, http.StatusInternalServerError, errorResp("QUEUE_ERROR", "Failed to queue generation job", r))
		return
	}

	jobBytes, _ := json.Marshal(job)
	if err := h.redis.LPush(r.Context(), "queue:presentation", string(jobBytes)).Err(); err != nil {
		_ = h.jobRepo.UpdateStatus(r.Context(), job.ID, "failed")
		writeJSON(w, http.StatusInternalServerError, errorResp("QUEUE_ERROR", "Failed to queue generation job", r))
		return
	}

	writeJSON(w, http.StatusAccepted, map[string]interface{}{
		"job_id":          job.ID,
		"presentation_id": presentation.ID,
	})
}

func (h *PresentationHandler) GetPresentation(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid presentation ID", r))
		return
	}

	presentation, err := h.presentationRepo.GetByID(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Presentation not found", r))
		return
	}

	userID := middleware.GetUserID(r.Context())
	if presentation.UserID != userID {
		writeJSON(w, http.StatusForbidden, errorResp("FORBIDDEN", "Access denied", r))
		return
	}

	go func(presentationID uuid.UUID) {
		_ = h.presentationRepo.UpdateLastAccessed(context.Background(), presentationID)
	}(presentation.ID)

	writeJSON(w, http.StatusOK, presentation)
}

func (h *PresentationHandler) ListPresentations(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	search := r.URL.Query().Get("search")
	sortBy := r.URL.Query().Get("sort")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if limit <= 0 || limit > 1000 {
		limit = 1000
	}

	presentations, total, err := h.presentationRepo.GetByUser(r.Context(), userID, search, sortBy, limit, offset)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to fetch presentations", r))
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"presentations": presentations,
		"total":         total,
		"limit":         limit,
		"offset":        offset,
	})
}

func (h *PresentationHandler) DeletePresentation(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid presentation ID", r))
		return
	}

	presentation, err := h.presentationRepo.GetByID(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Presentation not found", r))
		return
	}

	userID := middleware.GetUserID(r.Context())
	if presentation.UserID != userID {
		writeJSON(w, http.StatusForbidden, errorResp("FORBIDDEN", "Access denied", r))
		return
	}

	if err := h.jobRepo.DeleteByReference(r.Context(), id, "presentation"); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to delete presentation jobs", r))
		return
	}
	if err := h.presentationRepo.Delete(r.Context(), id); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to delete presentation", r))
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Presentation deleted"})
}

func (h *PresentationHandler) ToggleFavorite(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid presentation ID", r))
		return
	}

	presentation, err := h.presentationRepo.GetByID(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Presentation not found", r))
		return
	}

	userID := middleware.GetUserID(r.Context())
	if presentation.UserID != userID {
		writeJSON(w, http.StatusForbidden, errorResp("FORBIDDEN", "Access denied", r))
		return
	}

	if err := h.presentationRepo.ToggleFavorite(r.Context(), id, userID); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to update favorite", r))
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Favorite toggled"})
}
