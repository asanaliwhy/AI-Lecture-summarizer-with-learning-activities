package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"
	"unicode"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/sync/errgroup"

	"lectura-backend/internal/middleware"
	"lectura-backend/internal/models"
	"lectura-backend/internal/repository"
)

type DashboardHandler struct {
	pool          *pgxpool.Pool
	userRepo      *repository.UserRepo
	recentFetcher func(ctx context.Context, userID uuid.UUID, limit int) ([]dashboardRecentItem, error)
}

func NewDashboardHandler(pool *pgxpool.Pool, userRepo *repository.UserRepo) *DashboardHandler {
	return &DashboardHandler{pool: pool, userRepo: userRepo}
}

type dashboardRecentItem struct {
	ID        uuid.UUID `json:"id"`
	Type      string    `json:"type"`
	Title     string    `json:"title"`
	CreatedAt time.Time `json:"created_at"`
	Progress  float64   `json:"progress,omitempty"`
}

const recentActivityQuery = `
	SELECT type, id, title, last_accessed_at, progress
	FROM (
		SELECT
			'summary'::text AS type,
			s.id,
			s.title,
			COALESCE(s.last_accessed_at, s.created_at) AS last_accessed_at,
			0::float8 AS progress
		FROM summaries s
		WHERE s.user_id = $1
		  AND s.is_archived = FALSE

		UNION ALL

		SELECT
			'quiz'::text AS type,
			q.id,
			q.title,
			COALESCE(q.last_accessed_at, q.created_at) AS last_accessed_at,
			COALESCE(qa.score_percent::float8, 0) AS progress
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

		UNION ALL

		SELECT
			'flashcard_deck'::text AS type,
			f.id,
			f.title,
			COALESCE(f.last_accessed_at, f.created_at) AS last_accessed_at,
			0::float8 AS progress
		FROM flashcard_decks f
		WHERE f.user_id = $1

		UNION ALL

		SELECT
			'presentation'::text AS type,
			p.id,
			p.title,
			COALESCE(p.last_accessed_at, p.created_at) AS last_accessed_at,
			0::float8 AS progress
		FROM presentations p
		WHERE p.user_id = $1
	) recent
	ORDER BY last_accessed_at DESC NULLS LAST
	LIMIT $2
`

func (h *DashboardHandler) fetchRecentFromDB(ctx context.Context, userID uuid.UUID, limit int) ([]dashboardRecentItem, error) {
	rows, err := h.pool.Query(ctx, recentActivityQuery, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]dashboardRecentItem, 0, limit)
	for rows.Next() {
		var item dashboardRecentItem
		if err := rows.Scan(&item.Type, &item.ID, &item.Title, &item.CreatedAt, &item.Progress); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return items, nil
}

func (h *DashboardHandler) Stats(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	g, gctx := errgroup.WithContext(r.Context())

	var summaryCount, quizCount, flashcardCount, presentationCount, weeklySummaryCount int
	var weeklyQuizCount, weeklyFlashcardCount, weeklyPresentationCount int
	var prevWeeklySummaryCount, prevWeeklyQuizCount, prevWeeklyFlashcardCount, prevWeeklyPresentationCount int
	var weeklyGoalTarget int
	var weeklyGoalType string

	g.Go(func() error {
		return h.pool.QueryRow(gctx, "SELECT COUNT(*) FROM summaries WHERE user_id = $1", userID).Scan(&summaryCount)
	})

	g.Go(func() error {
		return h.pool.QueryRow(gctx, "SELECT COUNT(*) FROM quizzes WHERE user_id = $1", userID).Scan(&quizCount)
	})

	g.Go(func() error {
		return h.pool.QueryRow(gctx, "SELECT COUNT(*) FROM flashcard_decks WHERE user_id = $1", userID).Scan(&flashcardCount)
	})

	g.Go(func() error {
		return h.pool.QueryRow(gctx, "SELECT COUNT(*) FROM presentations WHERE user_id = $1", userID).Scan(&presentationCount)
	})

	g.Go(func() error {
		return h.pool.QueryRow(gctx, `
			SELECT COUNT(*)
			FROM summaries
			WHERE user_id = $1
			  AND is_archived = FALSE
			  AND created_at >= NOW() - INTERVAL '7 days'
		`, userID).Scan(&weeklySummaryCount)
	})

	g.Go(func() error {
		return h.pool.QueryRow(gctx, `
			SELECT COUNT(*)
			FROM quizzes
			WHERE user_id = $1
			  AND created_at >= NOW() - INTERVAL '7 days'
		`, userID).Scan(&weeklyQuizCount)
	})

	g.Go(func() error {
		return h.pool.QueryRow(gctx, `
			SELECT COUNT(*)
			FROM flashcard_decks
			WHERE user_id = $1
			  AND created_at >= NOW() - INTERVAL '7 days'
		`, userID).Scan(&weeklyFlashcardCount)
	})

	g.Go(func() error {
		return h.pool.QueryRow(gctx, `
			SELECT COUNT(*)
			FROM presentations
			WHERE user_id = $1
			  AND created_at >= NOW() - INTERVAL '7 days'
		`, userID).Scan(&weeklyPresentationCount)
	})

	g.Go(func() error {
		return h.pool.QueryRow(gctx, `
			SELECT COUNT(*)
			FROM summaries
			WHERE user_id = $1
			  AND is_archived = FALSE
			  AND created_at >= NOW() - INTERVAL '14 days'
			  AND created_at < NOW() - INTERVAL '7 days'
		`, userID).Scan(&prevWeeklySummaryCount)
	})

	g.Go(func() error {
		return h.pool.QueryRow(gctx, `
			SELECT COUNT(*)
			FROM quizzes
			WHERE user_id = $1
			  AND created_at >= NOW() - INTERVAL '14 days'
			  AND created_at < NOW() - INTERVAL '7 days'
		`, userID).Scan(&prevWeeklyQuizCount)
	})

	g.Go(func() error {
		return h.pool.QueryRow(gctx, `
			SELECT COUNT(*)
			FROM flashcard_decks
			WHERE user_id = $1
			  AND created_at >= NOW() - INTERVAL '14 days'
			  AND created_at < NOW() - INTERVAL '7 days'
		`, userID).Scan(&prevWeeklyFlashcardCount)
	})

	g.Go(func() error {
		return h.pool.QueryRow(gctx, `
			SELECT COUNT(*)
			FROM presentations
			WHERE user_id = $1
			  AND created_at >= NOW() - INTERVAL '14 days'
			  AND created_at < NOW() - INTERVAL '7 days'
		`, userID).Scan(&prevWeeklyPresentationCount)
	})

	g.Go(func() error {
		return h.pool.QueryRow(gctx, `
			SELECT COALESCE((notifications_json->>'weekly_goal_target')::int, 5)
			FROM user_settings
			WHERE user_id = $1
		`, userID).Scan(&weeklyGoalTarget)
	})

	g.Go(func() error {
		return h.pool.QueryRow(gctx, `
			SELECT COALESCE(notifications_json->>'weekly_goal_type', 'summary')
			FROM user_settings
			WHERE user_id = $1
		`, userID).Scan(&weeklyGoalType)
	})

	var studyHours, weeklyStudyHours, prevWeeklyStudyHours float64

	g.Go(func() error {
		return h.pool.QueryRow(gctx, `
			SELECT COALESCE(SUM(duration_seconds), 0)::float8 / 3600.0
			FROM study_sessions
			WHERE user_id = $1
		`, userID).Scan(&studyHours)
	})

	g.Go(func() error {
		return h.pool.QueryRow(gctx, `
			SELECT COALESCE(SUM(duration_seconds), 0)::float8 / 3600.0
			FROM study_sessions
			WHERE user_id = $1
			  AND started_at >= NOW() - INTERVAL '7 days'
		`, userID).Scan(&weeklyStudyHours)
	})

	g.Go(func() error {
		return h.pool.QueryRow(gctx, `
			SELECT COALESCE(SUM(duration_seconds), 0)::float8 / 3600.0
			FROM study_sessions
			WHERE user_id = $1
			  AND started_at >= NOW() - INTERVAL '14 days'
			  AND started_at < NOW() - INTERVAL '7 days'
		`, userID).Scan(&prevWeeklyStudyHours)
	})

	if err := g.Wait(); err != nil {
		log.Printf("Stats: query failed for user %s: %v", userID, err)
		writeJSON(w, http.StatusInternalServerError, errorResp("DB_ERROR", "Failed to retrieve stats", r))
		return
	}

	if weeklyGoalTarget <= 0 {
		weeklyGoalTarget = 5
	}
	if weeklyGoalType == "" {
		weeklyGoalType = "summary"
	}

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
	presentationsTrend := calcTrend(float64(weeklyPresentationCount), float64(prevWeeklyPresentationCount))
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
		"summaries":            summaryCount,
		"quizzes_taken":        quizCount,
		"flashcard_decks":      flashcardCount,
		"presentations":        presentationCount,
		"study_hours":          studyHours,
		"summaries_trend":      summariesTrend,
		"quizzes_trend":        quizzesTrend,
		"flashcards_trend":     flashcardsTrend,
		"presentations_trend":  presentationsTrend,
		"study_hours_trend":    studyHoursTrend,
		"weekly_summaries":     weeklySummaryCount,
		"weekly_quizzes":       weeklyQuizCount,
		"weekly_flashcards":    weeklyFlashcardCount,
		"weekly_presentations": weeklyPresentationCount,
		"weekly_goal_target":   weeklyGoalTarget,
		"weekly_goal_type":     weeklyGoalType,
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

	if req.GoalType != "summary" && req.GoalType != "quiz" && req.GoalType != "flashcard" && req.GoalType != "presentation" {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Goal type must be summary, quiz, flashcard, or presentation", r))
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
	const recentLimit = 12

	fetchRecent := h.recentFetcher
	if fetchRecent == nil {
		fetchRecent = h.fetchRecentFromDB
	}

	items, err := fetchRecent(ctx, userID, recentLimit)
	if err != nil {
		log.Printf("Recent: query failed for user %s: %v", userID, err)
		writeJSON(w, http.StatusInternalServerError, errorResp("DB_ERROR", "Failed to retrieve recent items", r))
		return
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
			UNION
			SELECT DISTINCT DATE(created_at) FROM presentations WHERE user_id = $1 AND status = 'completed'
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
		  AND started_at >= date_trunc('week', CURRENT_DATE::timestamp)
		  AND started_at < date_trunc('week', CURRENT_DATE::timestamp) + INTERVAL '7 days'
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
			  AND created_at >= date_trunc('week', CURRENT_DATE::timestamp)
			  AND created_at < date_trunc('week', CURRENT_DATE::timestamp) + INTERVAL '7 days'
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
		ID         uuid.UUID `json:"id"`
		Type       string    `json:"type"`
		Title      string    `json:"title"`
		Tags       []string  `json:"tags,omitempty"`
		IsFavorite bool      `json:"is_favorite"`
		CreatedAt  time.Time `json:"created_at"`
	}

	var items []LibraryItem

	if typeFilter == "" || typeFilter == "summary" {
		query := "SELECT id, title, tags, is_favorite, created_at FROM summaries WHERE user_id = $1 AND is_archived = FALSE"
		args := []interface{}{userID}
		if searchQuery != "" {
			query += " AND LOWER(title) LIKE $2"
			args = append(args, searchLike)
		}
		query += " ORDER BY created_at DESC"

		rows, err := h.pool.Query(ctx, query, args...)
		if err != nil {
			log.Printf("LibraryHandler.List: failed to query summaries for user %s: %v", userID, err)
			writeJSON(w, http.StatusInternalServerError, errorResp("DB_ERROR", "Failed to retrieve library", r))
			return
		}
		for rows.Next() {
			item := LibraryItem{Type: "summary"}
			if err := rows.Scan(&item.ID, &item.Title, &item.Tags, &item.IsFavorite, &item.CreatedAt); err != nil {
				rows.Close()
				log.Printf("LibraryHandler.List: failed to scan summary row for user %s: %v", userID, err)
				writeJSON(w, http.StatusInternalServerError, errorResp("DB_ERROR", "Failed to retrieve library", r))
				return
			}
			items = append(items, item)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			log.Printf("LibraryHandler.List: summary rows iteration failed for user %s: %v", userID, err)
			writeJSON(w, http.StatusInternalServerError, errorResp("DB_ERROR", "Failed to retrieve library", r))
			return
		}
		rows.Close()
	}

	if typeFilter == "" || typeFilter == "quiz" {
		query := "SELECT id, title, is_favorite, created_at FROM quizzes WHERE user_id = $1"
		args := []interface{}{userID}
		if searchQuery != "" {
			query += " AND LOWER(title) LIKE $2"
			args = append(args, searchLike)
		}
		query += " ORDER BY created_at DESC"

		rows, err := h.pool.Query(ctx, query, args...)
		if err != nil {
			log.Printf("LibraryHandler.List: failed to query quizzes for user %s: %v", userID, err)
			writeJSON(w, http.StatusInternalServerError, errorResp("DB_ERROR", "Failed to retrieve library", r))
			return
		}
		for rows.Next() {
			item := LibraryItem{Type: "quiz"}
			if err := rows.Scan(&item.ID, &item.Title, &item.IsFavorite, &item.CreatedAt); err != nil {
				rows.Close()
				log.Printf("LibraryHandler.List: failed to scan quiz row for user %s: %v", userID, err)
				writeJSON(w, http.StatusInternalServerError, errorResp("DB_ERROR", "Failed to retrieve library", r))
				return
			}
			items = append(items, item)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			log.Printf("LibraryHandler.List: quiz rows iteration failed for user %s: %v", userID, err)
			writeJSON(w, http.StatusInternalServerError, errorResp("DB_ERROR", "Failed to retrieve library", r))
			return
		}
		rows.Close()
	}

	if typeFilter == "" || typeFilter == "flashcard" || typeFilter == "flashcards" {
		query := "SELECT id, title, is_favorite, created_at FROM flashcard_decks WHERE user_id = $1"
		args := []interface{}{userID}
		if searchQuery != "" {
			query += " AND LOWER(title) LIKE $2"
			args = append(args, searchLike)
		}
		query += " ORDER BY created_at DESC"

		rows, err := h.pool.Query(ctx, query, args...)
		if err != nil {
			log.Printf("LibraryHandler.List: failed to query flashcard decks for user %s: %v", userID, err)
			writeJSON(w, http.StatusInternalServerError, errorResp("DB_ERROR", "Failed to retrieve library", r))
			return
		}
		for rows.Next() {
			item := LibraryItem{Type: "flashcard"}
			if err := rows.Scan(&item.ID, &item.Title, &item.IsFavorite, &item.CreatedAt); err != nil {
				rows.Close()
				log.Printf("LibraryHandler.List: failed to scan flashcard row for user %s: %v", userID, err)
				writeJSON(w, http.StatusInternalServerError, errorResp("DB_ERROR", "Failed to retrieve library", r))
				return
			}
			items = append(items, item)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			log.Printf("LibraryHandler.List: flashcard rows iteration failed for user %s: %v", userID, err)
			writeJSON(w, http.StatusInternalServerError, errorResp("DB_ERROR", "Failed to retrieve library", r))
			return
		}
		rows.Close()
	}

	if typeFilter == "" || typeFilter == "presentation" || typeFilter == "presentations" {
		query := "SELECT id, title, is_favorite, created_at FROM presentations WHERE user_id = $1"
		args := []interface{}{userID}
		if searchQuery != "" {
			query += " AND LOWER(title) LIKE $2"
			args = append(args, searchLike)
		}
		query += " ORDER BY created_at DESC"

		rows, err := h.pool.Query(ctx, query, args...)
		if err != nil {
			log.Printf("LibraryHandler.List: failed to query presentations for user %s: %v", userID, err)
			writeJSON(w, http.StatusInternalServerError, errorResp("DB_ERROR", "Failed to retrieve library", r))
			return
		}
		for rows.Next() {
			item := LibraryItem{Type: "presentation"}
			if err := rows.Scan(&item.ID, &item.Title, &item.IsFavorite, &item.CreatedAt); err != nil {
				rows.Close()
				log.Printf("LibraryHandler.List: failed to scan presentation row for user %s: %v", userID, err)
				writeJSON(w, http.StatusInternalServerError, errorResp("DB_ERROR", "Failed to retrieve library", r))
				return
			}
			items = append(items, item)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			log.Printf("LibraryHandler.List: presentation rows iteration failed for user %s: %v", userID, err)
			writeJSON(w, http.StatusInternalServerError, errorResp("DB_ERROR", "Failed to retrieve library", r))
			return
		}
		rows.Close()
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"items": items})
}

// User & Settings handler

type UserHandler struct {
	userRepo userSettingsRepo
}

type userSettingsRepo interface {
	GetByID(ctx context.Context, id uuid.UUID) (*models.User, error)
	Update(ctx context.Context, user *models.User) error
	UpdatePassword(ctx context.Context, userID uuid.UUID, passwordHash string) error
	Delete(ctx context.Context, id uuid.UUID) error
	GetSettings(ctx context.Context, userID uuid.UUID) (*models.UserSettings, error)
	UpdateSettings(ctx context.Context, settings *models.UserSettings) error
	SetNotificationSetting(ctx context.Context, userID uuid.UUID, key string, enabled bool) error
}

var allowedNotificationKeys = map[string]struct{}{
	"processing_complete": {},
	"weekly_digest":       {},
	"study_reminders":     {},
}

func defaultNotificationPreferences() map[string]bool {
	return map[string]bool{
		"processing_complete": true,
		"weekly_digest":       false,
		"study_reminders":     false,
	}
}

func mergeNotificationPreferences(raw json.RawMessage) map[string]bool {
	prefs := defaultNotificationPreferences()
	if len(raw) == 0 {
		return prefs
	}

	var parsed map[string]interface{}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return prefs
	}

	for key, value := range parsed {
		if _, allowed := allowedNotificationKeys[key]; !allowed {
			continue
		}
		if enabled, ok := value.(bool); ok {
			prefs[key] = enabled
		}
	}

	return prefs
}

func defaultSettings(userID uuid.UUID) *models.UserSettings {
	notificationsJSON, err := json.Marshal(defaultNotificationPreferences())
	if err != nil {
		notificationsJSON = []byte(`{"processing_complete":true,"weekly_digest":false,"study_reminders":false}`)
	}

	return &models.UserSettings{
		UserID:               userID,
		DefaultSummaryLength: "standard",
		DefaultFormat:        "cornell",
		DefaultDifficulty:    "medium",
		Language:             "en",
		NotificationsJSON:    notificationsJSON,
		UpdatedAt:            time.Now(),
	}
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
		Bio      *string `json:"bio"`
	}
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&update); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}

	if update.FullName != "" {
		user.FullName = strings.TrimSpace(update.FullName)
	}
	if update.Email != "" {
		user.Email = strings.ToLower(strings.TrimSpace(update.Email))
	}
	if update.Avatar != nil {
		user.AvatarURL = update.Avatar
	}
	if update.Bio != nil {
		trimmedBio := strings.TrimSpace(*update.Bio)
		if len(trimmedBio) > 300 {
			writeJSON(w, http.StatusBadRequest, errorRespWithFields("VALIDATION_ERROR", "Validation failed", map[string]string{
				"bio": "Bio must be 300 characters or fewer",
			}, r))
			return
		}
		user.Bio = &trimmedBio
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
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}

	fieldErrors := make(map[string]string)
	if strings.TrimSpace(req.CurrentPassword) == "" {
		fieldErrors["current_password"] = "Current password is required"
	}
	if strings.TrimSpace(req.NewPassword) == "" {
		fieldErrors["new_password"] = "New password is required"
	}
	if len(req.NewPassword) > 0 && len(req.NewPassword) < 8 {
		fieldErrors["new_password"] = "New password must be at least 8 characters"
	}
	if len(req.NewPassword) > 0 {
		hasNumber := false
		for _, ch := range req.NewPassword {
			if unicode.IsDigit(ch) {
				hasNumber = true
				break
			}
		}
		if !hasNumber {
			fieldErrors["new_password"] = "New password must contain at least one number"
		}
	}
	if req.CurrentPassword != "" && req.NewPassword != "" && req.CurrentPassword == req.NewPassword {
		fieldErrors["new_password"] = "New password must be different from current password"
	}
	if len(fieldErrors) > 0 {
		writeJSON(w, http.StatusBadRequest, errorRespWithFields("VALIDATION_ERROR", "Validation failed", fieldErrors, r))
		return
	}

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

	if err := h.userRepo.UpdatePassword(r.Context(), userID, string(hash)); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to update password", r))
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Password changed successfully"})
}

func (h *UserHandler) DeleteMe(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if err := h.userRepo.Delete(r.Context(), userID); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to delete account", r))
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "Account deleted"})
}

func (h *UserHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	settings, err := h.userRepo.GetSettings(r.Context(), userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSON(w, http.StatusOK, defaultSettings(userID))
			return
		}
		log.Printf("GetSettings: DB error for user %s: %v", userID, err)
		writeJSON(w, http.StatusInternalServerError, errorResp("DB_ERROR", "Failed to retrieve settings", r))
		return
	}
	writeJSON(w, http.StatusOK, settings)
}

func (h *UserHandler) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())

	var s models.UserSettings
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&s); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}
	s.UserID = userID

	if err := h.userRepo.UpdateSettings(r.Context(), &s); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to update settings", r))
		return
	}

	writeJSON(w, http.StatusOK, s)
}

func (h *UserHandler) GetNotificationSettings(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	settings, err := h.userRepo.GetSettings(r.Context(), userID)
	if err != nil {
		writeJSON(w, http.StatusOK, defaultNotificationPreferences())
		return
	}

	writeJSON(w, http.StatusOK, mergeNotificationPreferences(settings.NotificationsJSON))
}

func (h *UserHandler) UpdateNotificationSetting(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())

	var req struct {
		Key     string `json:"key"`
		Enabled bool   `json:"enabled"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid request body", r))
		return
	}

	if _, ok := allowedNotificationKeys[req.Key]; !ok {
		writeJSON(w, http.StatusBadRequest, errorResp("VALIDATION_ERROR", "Invalid notification key", r))
		return
	}

	if err := h.userRepo.SetNotificationSetting(r.Context(), userID, req.Key, req.Enabled); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to update notification setting", r))
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"key":     req.Key,
		"enabled": req.Enabled,
	})
}

// Job handler

type JobHandler struct {
	jobRepo          *repository.JobRepo
	summaryRepo      *repository.SummaryRepo
	quizRepo         *repository.QuizRepo
	flashcardRepo    *repository.FlashcardRepo
	presentationRepo *repository.PresentationRepo
}

func NewJobHandler(jobRepo *repository.JobRepo, summaryRepo *repository.SummaryRepo, quizRepo *repository.QuizRepo, flashcardRepo *repository.FlashcardRepo, presentationRepo *repository.PresentationRepo) *JobHandler {
	return &JobHandler{
		jobRepo:          jobRepo,
		summaryRepo:      summaryRepo,
		quizRepo:         quizRepo,
		flashcardRepo:    flashcardRepo,
		presentationRepo: presentationRepo,
	}
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

	if job.Status == "completed" || job.Status == "failed" || job.Status == "cancelled" {
		writeJSON(w, http.StatusConflict, errorResp("CONFLICT", "Job is already in a terminal state and cannot be cancelled", r))
		return
	}

	if err := h.jobRepo.UpdateStatus(r.Context(), id, "cancelled"); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp("INTERNAL_ERROR", "Failed to cancel job", r))
		return
	}

	if job.ReferenceID != uuid.Nil {
		switch job.Type {
		case "summary-generation":
			if err := h.summaryRepo.Delete(r.Context(), job.ReferenceID); err != nil {
				log.Printf("CancelJob: failed to delete orphaned summary %s: %v", job.ReferenceID, err)
			}
		case "quiz-generation":
			if err := h.quizRepo.Delete(r.Context(), job.ReferenceID); err != nil {
				log.Printf("CancelJob: failed to delete orphaned quiz %s: %v", job.ReferenceID, err)
			}
		case "flashcard-generation":
			if err := h.flashcardRepo.DeleteDeck(r.Context(), job.ReferenceID); err != nil {
				log.Printf("CancelJob: failed to delete orphaned flashcard deck %s: %v", job.ReferenceID, err)
			}
		case "presentation":
			if err := h.presentationRepo.Delete(r.Context(), job.ReferenceID); err != nil {
				log.Printf("CancelJob: failed to delete orphaned presentation %s: %v", job.ReferenceID, err)
			}
		}
	}

	w.WriteHeader(http.StatusNoContent)
}
