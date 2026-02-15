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
	pool     *pgxpool.Pool
	userRepo *repository.UserRepo
}

func NewDashboardHandler(pool *pgxpool.Pool, userRepo *repository.UserRepo) *DashboardHandler {
	return &DashboardHandler{pool: pool, userRepo: userRepo}
}

func (h *DashboardHandler) Stats(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	ctx := r.Context()

	var summaryCount, quizCount, flashcardCount, weeklySummaryCount int
	var weeklyQuizCount, weeklyFlashcardCount int
	var prevWeeklySummaryCount, prevWeeklyQuizCount, prevWeeklyFlashcardCount int
	var weeklyGoalTarget int
	var weeklyGoalType string
	h.pool.QueryRow(ctx, "SELECT COUNT(*) FROM summaries WHERE user_id = $1", userID).Scan(&summaryCount)
	h.pool.QueryRow(ctx, "SELECT COUNT(*) FROM quizzes WHERE user_id = $1", userID).Scan(&quizCount)
	h.pool.QueryRow(ctx, "SELECT COUNT(*) FROM flashcard_decks WHERE user_id = $1", userID).Scan(&flashcardCount)
	h.pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM summaries
		WHERE user_id = $1
		  AND is_archived = FALSE
		  AND created_at >= NOW() - INTERVAL '7 days'
	`, userID).Scan(&weeklySummaryCount)

	h.pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM quizzes
		WHERE user_id = $1
		  AND created_at >= NOW() - INTERVAL '7 days'
	`, userID).Scan(&weeklyQuizCount)

	h.pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM flashcard_decks
		WHERE user_id = $1
		  AND created_at >= NOW() - INTERVAL '7 days'
	`, userID).Scan(&weeklyFlashcardCount)

	h.pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM summaries
		WHERE user_id = $1
		  AND is_archived = FALSE
		  AND created_at >= NOW() - INTERVAL '14 days'
		  AND created_at < NOW() - INTERVAL '7 days'
	`, userID).Scan(&prevWeeklySummaryCount)

	h.pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM quizzes
		WHERE user_id = $1
		  AND created_at >= NOW() - INTERVAL '14 days'
		  AND created_at < NOW() - INTERVAL '7 days'
	`, userID).Scan(&prevWeeklyQuizCount)

	h.pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM flashcard_decks
		WHERE user_id = $1
		  AND created_at >= NOW() - INTERVAL '14 days'
		  AND created_at < NOW() - INTERVAL '7 days'
	`, userID).Scan(&prevWeeklyFlashcardCount)

	h.pool.QueryRow(ctx, `
		SELECT COALESCE((notifications_json->>'weekly_goal_target')::int, 5)
		FROM user_settings
		WHERE user_id = $1
	`, userID).Scan(&weeklyGoalTarget)

	h.pool.QueryRow(ctx, `
		SELECT COALESCE(notifications_json->>'weekly_goal_type', 'summary')
		FROM user_settings
		WHERE user_id = $1
	`, userID).Scan(&weeklyGoalType)
	if weeklyGoalTarget <= 0 {
		weeklyGoalTarget = 5
	}
	if weeklyGoalType == "" {
		weeklyGoalType = "summary"
	}

	var studyHours, weeklyStudyHours, prevWeeklyStudyHours float64
	h.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(duration_seconds), 0)::float8 / 3600.0
		FROM study_sessions
		WHERE user_id = $1
	`, userID).Scan(&studyHours)
	h.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(duration_seconds), 0)::float8 / 3600.0
		FROM study_sessions
		WHERE user_id = $1
		  AND started_at >= NOW() - INTERVAL '7 days'
	`, userID).Scan(&weeklyStudyHours)
	h.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(duration_seconds), 0)::float8 / 3600.0
		FROM study_sessions
		WHERE user_id = $1
		  AND started_at >= NOW() - INTERVAL '14 days'
		  AND started_at < NOW() - INTERVAL '7 days'
	`, userID).Scan(&prevWeeklyStudyHours)

	calcTrend := func(current, previous float64) float64 {
		if previous <= 0 {
			if current > 0 {
				return 100
			}
			return 0
		}
		return ((current - previous) / previous) * 100
	}

	summariesTrend := calcTrend(float64(weeklySummaryCount), float64(prevWeeklySummaryCount))
	quizzesTrend := calcTrend(float64(weeklyQuizCount), float64(prevWeeklyQuizCount))
	flashcardsTrend := calcTrend(float64(weeklyFlashcardCount), float64(prevWeeklyFlashcardCount))
	studyHoursTrend := calcTrend(weeklyStudyHours, prevWeeklyStudyHours)

	if studyHours < 0 {
		studyHours = 0
	}
	if weeklyStudyHours < 0 {
		weeklyStudyHours = 0
	}
	if prevWeeklyStudyHours < 0 {
		prevWeeklyStudyHours = 0
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"summaries":          summaryCount,
		"quizzes_taken":      quizCount,
		"flashcard_decks":    flashcardCount,
		"study_hours":        studyHours,
		"summaries_trend":    summariesTrend,
		"quizzes_trend":      quizzesTrend,
		"flashcards_trend":   flashcardsTrend,
		"study_hours_trend":  studyHoursTrend,
		"weekly_summaries":   weeklySummaryCount,
		"weekly_quizzes":     weeklyQuizCount,
		"weekly_flashcards":  weeklyFlashcardCount,
		"weekly_goal_target": weeklyGoalTarget,
		"weekly_goal_type":   weeklyGoalType,
	})
}

func (h *DashboardHandler) SetWeeklyGoal(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())

	var req struct {
		Target   int    `json:"target"`
		GoalType string `json:"goal_type"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}

	if req.Target < 1 || req.Target > 50 {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Target must be between 1 and 50", r))
		return
	}

	if req.GoalType != "summary" && req.GoalType != "quiz" && req.GoalType != "flashcard" {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Goal type must be summary, quiz, or flashcard", r))
		return
	}

	if err := h.userRepo.SetWeeklyGoalTarget(r.Context(), userID, req.Target, req.GoalType); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to save weekly goal", r))
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"weekly_goal_target": req.Target,
		"weekly_goal_type":   req.GoalType,
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
		Progress  float64   `json:"progress,omitempty"`
	}

	var items []RecentItem

	// Recent summaries
	rows, _ := h.pool.Query(ctx,
		"SELECT id, title, created_at FROM summaries WHERE user_id = $1 ORDER BY COALESCE(last_accessed_at, created_at) DESC LIMIT 3", userID)
	for rows.Next() {
		var item RecentItem
		rows.Scan(&item.ID, &item.Title, &item.CreatedAt)
		item.Type = "summary"
		item.Progress = 0
		items = append(items, item)
	}
	rows.Close()

	// Recent quizzes
	rows, _ = h.pool.Query(ctx,
		`SELECT q.id, q.title, q.created_at, COALESCE(qa.score_percent::float8, 0)
		 FROM quizzes q
		 LEFT JOIN LATERAL (
		 	SELECT score_percent
		 	FROM quiz_attempts
		 	WHERE quiz_id = q.id
		 	  AND user_id = $1
		 	  AND completed_at IS NOT NULL
		 	ORDER BY completed_at DESC, started_at DESC
		 	LIMIT 1
		 ) qa ON true
		 WHERE q.user_id = $1
		 ORDER BY q.created_at DESC
		 LIMIT 3`, userID)
	for rows.Next() {
		var item RecentItem
		rows.Scan(&item.ID, &item.Title, &item.CreatedAt, &item.Progress)
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
		item.Progress = 0
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

	var streak int
	err := h.pool.QueryRow(ctx, `
		WITH RECURSIVE activity_days AS (
			SELECT DISTINCT DATE(created_at) AS d FROM summaries WHERE user_id = $1
			UNION
			SELECT DISTINCT DATE(started_at) FROM quiz_attempts WHERE user_id = $1
			UNION
			SELECT DISTINCT DATE(last_reviewed_at) FROM flashcard_cards fc
			JOIN flashcard_decks fd ON fc.deck_id = fd.id
			WHERE fd.user_id = $1 AND fc.last_reviewed_at IS NOT NULL
		),
		start_day AS (
			SELECT CASE
				WHEN EXISTS (SELECT 1 FROM activity_days WHERE d = CURRENT_DATE) THEN CURRENT_DATE
				WHEN EXISTS (SELECT 1 FROM activity_days WHERE d = CURRENT_DATE - INTERVAL '1 day') THEN (CURRENT_DATE - INTERVAL '1 day')::date
				ELSE NULL::date
			END AS d
		),
		streak_days AS (
			SELECT d FROM start_day WHERE d IS NOT NULL
			UNION ALL
			SELECT (sd.d - INTERVAL '1 day')::date
			FROM streak_days sd
			JOIN activity_days a ON a.d = (sd.d - INTERVAL '1 day')::date
		)
		SELECT COUNT(*) FROM streak_days
	`, userID).Scan(&streak)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to load streak", r))
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"streak":         streak,
		"current_streak": streak,
	})
}

func (h *DashboardHandler) Activity(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	ctx := r.Context()

	// Weekly activity (Sun-Sat in backend response; frontend maps to Mon-first)
	activity := make([]float64, 7)
	estimated := false
	rows, err := h.pool.Query(ctx, `
		SELECT
			EXTRACT(DOW FROM started_at)::int AS dow,
			COALESCE(SUM(duration_seconds), 0)::float8 / 3600.0 AS hours
		FROM study_sessions
		WHERE user_id = $1
		  AND started_at >= CURRENT_DATE - INTERVAL '7 days'
		GROUP BY dow
	`, userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to load activity", r))
		return
	}

	totalHours := 0.0
	for rows.Next() {
		var dow int
		var hours float64
		if err := rows.Scan(&dow, &hours); err != nil {
			rows.Close()
			writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to parse activity", r))
			return
		}
		if dow >= 0 && dow < 7 {
			if hours < 0 {
				hours = 0
			}
			activity[dow] = hours
			totalHours += hours
		}
	}
	rows.Close()

	if totalHours <= 0 {
		// Backward compatibility fallback for older accounts without tracked study sessions yet.
		estimated = true
		fallbackRows, fallbackErr := h.pool.Query(ctx, `
			SELECT EXTRACT(DOW FROM created_at)::int AS dow, COUNT(*)
			FROM summaries
			WHERE user_id = $1
			  AND created_at >= CURRENT_DATE - INTERVAL '7 days'
			GROUP BY dow
		`, userID)
		if fallbackErr == nil {
			for fallbackRows.Next() {
				var dow, count int
				if err := fallbackRows.Scan(&dow, &count); err == nil {
					if dow >= 0 && dow < 7 {
						activity[dow] = float64(count) * 0.5
					}
				}
			}
			fallbackRows.Close()
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"activity":  activity,
		"estimated": estimated,
	})
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
