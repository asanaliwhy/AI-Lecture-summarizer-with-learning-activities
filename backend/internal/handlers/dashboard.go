package handlers

import (
	"encoding/json"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"lectura-backend/internal/middleware"
	"lectura-backend/internal/models"
	"lectura-backend/internal/repository"
)

type DashboardHandler struct {
	pool *pgxpool.Pool
}

func NewDashboardHandler(pool *pgxpool.Pool) *DashboardHandler {
	return &DashboardHandler{pool: pool}
}

func (h *DashboardHandler) Stats(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	ctx := r.Context()

	var summaryCount, quizCount, flashcardCount, weeklySummaryCount int
	h.pool.QueryRow(ctx, "SELECT COUNT(*) FROM summaries WHERE user_id = $1", userID).Scan(&summaryCount)
	h.pool.QueryRow(ctx, "SELECT COUNT(*) FROM quizzes WHERE user_id = $1", userID).Scan(&quizCount)
	h.pool.QueryRow(ctx, "SELECT COUNT(*) FROM flashcard_decks WHERE user_id = $1", userID).Scan(&flashcardCount)
	h.pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM summaries
		WHERE user_id = $1
		  AND created_at >= date_trunc('week', now())
	`, userID).Scan(&weeklySummaryCount)

	weeklyGoalTarget := 5

	// Estimate study hours based on content count
	studyHours := float64(summaryCount+quizCount+flashcardCount) * 0.5

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"summaries":          summaryCount,
		"quizzes_taken":      quizCount,
		"flashcard_decks":    flashcardCount,
		"study_hours":        studyHours,
		"weekly_summaries":   weeklySummaryCount,
		"weekly_goal_target": weeklyGoalTarget,
	})
}

func (h *DashboardHandler) Recent(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	ctx := r.Context()

	type RecentItem struct {
		ID        uuid.UUID `json:"id"`
		Type      string    `json:"type"`
		Title     string    `json:"title"`
		CreatedAt time.Time `json:"created_at"`
	}

	var items []RecentItem

	// Recent summaries
	rows, _ := h.pool.Query(ctx,
		"SELECT id, title, created_at FROM summaries WHERE user_id = $1 ORDER BY COALESCE(last_accessed_at, created_at) DESC LIMIT 3", userID)
	for rows.Next() {
		var item RecentItem
		rows.Scan(&item.ID, &item.Title, &item.CreatedAt)
		item.Type = "summary"
		items = append(items, item)
	}
	rows.Close()

	// Recent quizzes
	rows, _ = h.pool.Query(ctx,
		"SELECT id, title, created_at FROM quizzes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3", userID)
	for rows.Next() {
		var item RecentItem
		rows.Scan(&item.ID, &item.Title, &item.CreatedAt)
		item.Type = "quiz"
		items = append(items, item)
	}
	rows.Close()

	// Recent flashcard decks
	rows, _ = h.pool.Query(ctx,
		"SELECT id, title, created_at FROM flashcard_decks WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3", userID)
	for rows.Next() {
		var item RecentItem
		rows.Scan(&item.ID, &item.Title, &item.CreatedAt)
		item.Type = "flashcard"
		items = append(items, item)
	}
	rows.Close()

	// Global sort across all item types so the truly latest activity is first
	sort.Slice(items, func(i, j int) bool {
		return items[i].CreatedAt.After(items[j].CreatedAt)
	})

	if len(items) > 12 {
		items = items[:12]
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"recent": items})
}

func (h *DashboardHandler) Streak(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	ctx := r.Context()

	// Count consecutive days with activity
	var streak int
	h.pool.QueryRow(ctx, `
		WITH activity_days AS (
			SELECT DISTINCT DATE(created_at) as d FROM summaries WHERE user_id = $1
			UNION
			SELECT DISTINCT DATE(started_at) FROM quiz_attempts WHERE user_id = $1
			UNION
			SELECT DISTINCT DATE(last_reviewed_at) FROM flashcard_cards fc
			JOIN flashcard_decks fd ON fc.deck_id = fd.id WHERE fd.user_id = $1 AND fc.last_reviewed_at IS NOT NULL
		)
		SELECT COUNT(*) FROM activity_days WHERE d >= CURRENT_DATE - INTERVAL '30 days'
	`, userID).Scan(&streak)

	writeJSON(w, http.StatusOK, map[string]interface{}{"streak": streak})
}

func (h *DashboardHandler) Activity(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	ctx := r.Context()

	// Weekly activity (Mon-Sun)
	activity := make([]float64, 7)
	rows, _ := h.pool.Query(ctx, `
		SELECT EXTRACT(DOW FROM created_at)::int as dow, COUNT(*) 
		FROM summaries WHERE user_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '7 days'
		GROUP BY dow`, userID)
	for rows.Next() {
		var dow, count int
		rows.Scan(&dow, &count)
		if dow >= 0 && dow < 7 {
			activity[dow] = float64(count) * 0.5
		}
	}
	rows.Close()

	writeJSON(w, http.StatusOK, map[string]interface{}{"activity": activity})
}

// Library handler

type LibraryHandler struct {
	pool *pgxpool.Pool
}

func NewLibraryHandler(pool *pgxpool.Pool) *LibraryHandler {
	return &LibraryHandler{pool: pool}
}

func (h *LibraryHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	ctx := r.Context()
	typeFilter := r.URL.Query().Get("type")
	searchQuery := strings.TrimSpace(r.URL.Query().Get("search"))
	searchLike := "%" + strings.ToLower(searchQuery) + "%"

	type LibraryItem struct {
		ID        uuid.UUID `json:"id"`
		Type      string    `json:"type"`
		Title     string    `json:"title"`
		Tags      []string  `json:"tags,omitempty"`
		CreatedAt time.Time `json:"created_at"`
	}

	var items []LibraryItem

	if typeFilter == "" || typeFilter == "summary" {
		query := "SELECT id, title, tags, created_at FROM summaries WHERE user_id = $1 AND is_archived = FALSE"
		args := []interface{}{userID}
		if searchQuery != "" {
			query += " AND LOWER(title) LIKE $2"
			args = append(args, searchLike)
		}
		query += " ORDER BY created_at DESC"

		rows, _ := h.pool.Query(ctx, query, args...)
		for rows.Next() {
			item := LibraryItem{Type: "summary"}
			rows.Scan(&item.ID, &item.Title, &item.Tags, &item.CreatedAt)
			items = append(items, item)
		}
		rows.Close()
	}

	if typeFilter == "" || typeFilter == "quiz" {
		query := "SELECT id, title, created_at FROM quizzes WHERE user_id = $1"
		args := []interface{}{userID}
		if searchQuery != "" {
			query += " AND LOWER(title) LIKE $2"
			args = append(args, searchLike)
		}
		query += " ORDER BY created_at DESC"

		rows, _ := h.pool.Query(ctx, query, args...)
		for rows.Next() {
			item := LibraryItem{Type: "quiz"}
			rows.Scan(&item.ID, &item.Title, &item.CreatedAt)
			items = append(items, item)
		}
		rows.Close()
	}

	if typeFilter == "" || typeFilter == "flashcard" || typeFilter == "flashcards" {
		query := "SELECT id, title, created_at FROM flashcard_decks WHERE user_id = $1"
		args := []interface{}{userID}
		if searchQuery != "" {
			query += " AND LOWER(title) LIKE $2"
			args = append(args, searchLike)
		}
		query += " ORDER BY created_at DESC"

		rows, _ := h.pool.Query(ctx, query, args...)
		for rows.Next() {
			item := LibraryItem{Type: "flashcard"}
			rows.Scan(&item.ID, &item.Title, &item.CreatedAt)
			items = append(items, item)
		}
		rows.Close()
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"items": items})
}

// User & Settings handler

type UserHandler struct {
	userRepo *repository.UserRepo
}

func NewUserHandler(userRepo *repository.UserRepo) *UserHandler {
	return &UserHandler{userRepo: userRepo}
}

func (h *UserHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	user, err := h.userRepo.GetByID(r.Context(), userID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "User not found", r))
		return
	}
	writeJSON(w, http.StatusOK, user)
}

func (h *UserHandler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	user, err := h.userRepo.GetByID(r.Context(), userID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "User not found", r))
		return
	}

	var update struct {
		FullName string  `json:"full_name"`
		Email    string  `json:"email"`
		Avatar   *string `json:"avatar_url"`
	}
	json.NewDecoder(r.Body).Decode(&update)

	if update.FullName != "" {
		user.FullName = update.FullName
	}
	if update.Email != "" {
		user.Email = update.Email
	}
	if update.Avatar != nil {
		user.AvatarURL = update.Avatar
	}

	if err := h.userRepo.Update(r.Context(), user); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to update profile", r))
		return
	}

	writeJSON(w, http.StatusOK, user)
}

func (h *UserHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())

	var req struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	user, err := h.userRepo.GetByID(r.Context(), userID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "User not found", r))
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.CurrentPassword)); err != nil {
		writeJSON(w, http.StatusUnauthorized, errorResp("UNAUTHORIZED", "Current password is incorrect", r))
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), 12)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to hash password", r))
		return
	}

	h.userRepo.UpdatePassword(r.Context(), userID, string(hash))
	writeJSON(w, http.StatusOK, map[string]string{"message": "Password changed successfully"})
}

func (h *UserHandler) DeleteMe(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	h.userRepo.Delete(r.Context(), userID)
	writeJSON(w, http.StatusOK, map[string]string{"message": "Account deleted"})
}

func (h *UserHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	settings, err := h.userRepo.GetSettings(r.Context(), userID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Settings not found", r))
		return
	}
	writeJSON(w, http.StatusOK, settings)
}

func (h *UserHandler) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())

	var s models.UserSettings
	json.NewDecoder(r.Body).Decode(&s)
	s.UserID = userID

	if err := h.userRepo.UpdateSettings(r.Context(), &s); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to update settings", r))
		return
	}

	writeJSON(w, http.StatusOK, s)
}

// Job handler

type JobHandler struct {
	jobRepo *repository.JobRepo
}

func NewJobHandler(jobRepo *repository.JobRepo) *JobHandler {
	return &JobHandler{jobRepo: jobRepo}
}

func (h *JobHandler) GetJob(w http.ResponseWriter, r *http.Request) {
	idStr := r.URL.Query().Get("id")
	if idStr == "" {
		// Try chi URL param
		idStr = chi.URLParam(r, "id")
	}
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid job ID", r))
		return
	}

	job, err := h.jobRepo.GetByID(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Job not found", r))
		return
	}

	userID := middleware.GetUserID(r.Context())
	if job.UserID != userID {
		writeJSON(w, http.StatusForbidden, errorResp("FORBIDDEN", "Access denied", r))
		return
	}

	writeJSON(w, http.StatusOK, job)
}

func (h *JobHandler) CancelJob(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid job ID", r))
		return
	}

	job, err := h.jobRepo.GetByID(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp("NOT_FOUND", "Job not found", r))
		return
	}

	userID := middleware.GetUserID(r.Context())
	if job.UserID != userID {
		writeJSON(w, http.StatusForbidden, errorResp("FORBIDDEN", "Access denied", r))
		return
	}

	h.jobRepo.UpdateStatus(r.Context(), id, "failed")
	writeJSON(w, http.StatusOK, map[string]string{"message": "Job cancelled"})
}
