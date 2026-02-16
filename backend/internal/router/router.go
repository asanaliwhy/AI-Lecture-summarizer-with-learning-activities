package router

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"

	"lectura-backend/internal/handlers"
	"lectura-backend/internal/middleware"
	"lectura-backend/internal/websocket"
)

func New(
	jwtAuth *middleware.JWTAuth,
	authHandler *handlers.AuthHandler,
	contentHandler *handlers.ContentHandler,
	summaryHandler *handlers.SummaryHandler,
	quizHandler *handlers.QuizHandler,
	flashcardHandler *handlers.FlashcardHandler,
	studySessionHandler *handlers.StudySessionHandler,
	dashboardHandler *handlers.DashboardHandler,
	libraryHandler *handlers.LibraryHandler,
	userHandler *handlers.UserHandler,
	jobHandler *handlers.JobHandler,
	wsHub *websocket.Hub,
	frontendURL string,
) http.Handler {
	r := chi.NewRouter()

	// Global middleware
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.RealIP)
	r.Use(middleware.RequestID)
	r.Use(middleware.CORS(frontendURL))

	// Auth rate limiter (10 req/min per IP)
	authLimiter := middleware.NewRateLimiter(10, time.Minute)

	// Health check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	r.Route("/api/v1", func(r chi.Router) {

		// ──── Auth Routes (public) ────
		r.Route("/auth", func(r chi.Router) {
			r.Use(authLimiter.Middleware)
			r.Post("/register", authHandler.Register)
			r.Post("/login", authHandler.Login)
			r.Post("/refresh", authHandler.Refresh)
			r.Get("/verify-email", authHandler.VerifyEmail)
			r.Post("/resend-verification", authHandler.ResendVerification)

			// Logout requires auth
			r.Group(func(r chi.Router) {
				r.Use(jwtAuth.Middleware)
				r.Post("/logout", authHandler.Logout)
			})
		})

		// ──── Content Routes ────
		r.Route("/content", func(r chi.Router) {
			r.Get("/supported-formats", contentHandler.SupportedFormats) // Public

			r.Group(func(r chi.Router) {
				r.Use(jwtAuth.Middleware)
				r.Post("/validate-youtube", contentHandler.ValidateYouTube)
				r.Post("/upload", contentHandler.Upload)
				r.Get("/{id}", contentHandler.GetContent)
			})
		})

		// ──── Summary Routes ────
		r.Route("/summaries", func(r chi.Router) {
			r.Use(jwtAuth.Middleware)
			r.Post("/generate", summaryHandler.Generate)
			r.Get("/", summaryHandler.List)
			r.Get("/{id}", summaryHandler.Get)
			r.Put("/{id}", summaryHandler.Update)
			r.Delete("/{id}", summaryHandler.Delete)
			r.Post("/{id}/regenerate", summaryHandler.Regenerate)
			r.Put("/{id}/favorite", summaryHandler.ToggleFavorite)
		})

		// ──── Quiz Routes ────
		r.Route("/quizzes", func(r chi.Router) {
			r.Use(jwtAuth.Middleware)
			r.Post("/generate", quizHandler.Generate)
			r.Get("/", quizHandler.List)
			r.Get("/{id}", quizHandler.Get)
			r.Put("/{id}/favorite", quizHandler.ToggleFavorite)
			r.Delete("/{id}", quizHandler.Delete)
			r.Post("/{id}/start", quizHandler.StartAttempt)
		})

		r.Route("/quiz-attempts", func(r chi.Router) {
			r.Use(jwtAuth.Middleware)
			r.Post("/{id}/save-progress", quizHandler.SaveProgress)
			r.Post("/{id}/submit", quizHandler.SubmitAttempt)
			r.Get("/{id}", quizHandler.GetAttempt)
		})

		// ──── Flashcard Routes ────
		r.Route("/flashcards", func(r chi.Router) {
			r.Use(jwtAuth.Middleware)
			r.Post("/generate", flashcardHandler.Generate)

			r.Route("/decks", func(r chi.Router) {
				r.Get("/", flashcardHandler.ListDecks)
				r.Get("/{id}", flashcardHandler.GetDeck)
				r.Get("/{id}/stats", flashcardHandler.GetDeckStats)
				r.Put("/{id}/favorite", flashcardHandler.ToggleFavorite)
				r.Delete("/{id}", flashcardHandler.DeleteDeck)
			})

			r.Route("/cards", func(r chi.Router) {
				r.Post("/{id}/rating", flashcardHandler.RateCard)
			})
		})

		// ──── Study Session Routes ────
		r.Route("/study-sessions", func(r chi.Router) {
			r.Use(jwtAuth.Middleware)
			r.Post("/start", studySessionHandler.Start)
			r.Post("/{id}/heartbeat", studySessionHandler.Heartbeat)
			r.Post("/{id}/stop", studySessionHandler.Stop)
		})

		// ──── Dashboard Routes ────
		r.Route("/dashboard", func(r chi.Router) {
			r.Use(jwtAuth.Middleware)
			r.Get("/stats", dashboardHandler.Stats)
			r.Put("/weekly-goal", dashboardHandler.SetWeeklyGoal)
			r.Get("/recent", dashboardHandler.Recent)
			r.Get("/streak", dashboardHandler.Streak)
			r.Get("/activity", dashboardHandler.Activity)
		})

		// ──── Library Routes ────
		r.Route("/library", func(r chi.Router) {
			r.Use(jwtAuth.Middleware)
			r.Get("/", libraryHandler.List)
		})

		// ──── User & Settings Routes ────
		r.Route("/user", func(r chi.Router) {
			r.Use(jwtAuth.Middleware)
			r.Get("/me", userHandler.GetMe)
			r.Put("/me", userHandler.UpdateMe)
			r.Put("/password", userHandler.ChangePassword)
			r.Delete("/me", userHandler.DeleteMe)
			r.Get("/settings", userHandler.GetSettings)
			r.Put("/settings", userHandler.UpdateSettings)
			r.Get("/notifications", userHandler.GetNotificationSettings)
			r.Put("/notifications", userHandler.UpdateNotificationSetting)
		})

		// ──── Job Routes ────
		r.Route("/jobs", func(r chi.Router) {
			r.Use(jwtAuth.Middleware)
			r.Get("/{id}", jobHandler.GetJob)
			r.Delete("/{id}", jobHandler.CancelJob)
		})

		// ──── WebSocket ────
		r.Get("/ws", wsHub.HandleWebSocket)
	})

	return r
}
