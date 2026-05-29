package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"lectura-backend/internal/config"
	"lectura-backend/internal/database"
	"lectura-backend/internal/handlers"
	"lectura-backend/internal/middleware"
	"lectura-backend/internal/repository"
	"lectura-backend/internal/router"
	"lectura-backend/internal/services"
	"lectura-backend/internal/websocket"
	"lectura-backend/internal/worker"
)

func main() {
	log.Println(" Starting Lectura Backend...")

	// ──── Step 1: Load Environment Variables ────
	cfg := config.Load()
	log.Println(" Environment variables loaded")

	// ──── Step 2: Initialize PostgreSQL Connection Pool ────
	pool, err := database.NewPostgresPool(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf(" PostgreSQL connection failed: %v", err)
	}
	defer pool.Close()
	log.Println(" PostgreSQL connected")

	// ──── Step 3: Initialize Redis Clients ────
	redisClients, err := database.NewRedisClients(cfg.RedisURL)
	if err != nil {
		log.Fatalf(" Redis connection failed: %v", err)
	}
	defer redisClients.Close()
	log.Println(" Redis connected")

	// ──── Step 5: Run Database Migrations ────
	if err := database.RunMigrations(pool, "migrations"); err != nil {
		log.Fatalf(" Database migration failed: %v", err)
	}
	log.Println(" Database migrations applied")

	// ──── Initialize Repositories ────
	userRepo := repository.NewUserRepo(pool)
	contentRepo := repository.NewContentRepo(pool)
	summaryRepo := repository.NewSummaryRepo(pool)
	presentationRepo := repository.NewPresentationRepo(pool)
	quizRepo := repository.NewQuizRepo(pool)
	flashcardRepo := repository.NewFlashcardRepo(pool)
	jobRepo := repository.NewJobRepo(pool)
	studySessionRepo := repository.NewStudySessionRepo(pool)
	chatMessageRepo := repository.NewChatMessageRepo(pool)

	// ──── Step 4: Initialize Gemini Client ────
	geminiService, err := services.NewGeminiService(
		cfg.GeminiAPIKey,
		cfg.GeminiConcurrentReqs,
		summaryRepo,
		presentationRepo,
		quizRepo,
		flashcardRepo,
		jobRepo,
		userRepo,
		redisClients.Queue,
		cfg.UnsplashAccessKey,
		cfg.JWTSecret,
	)
	if err != nil {
		log.Fatalf("✗ Gemini client initialization failed: %v", err)
	}
	defer geminiService.Close()
	log.Println("✓ Gemini Flash client initialized")

	// ──── Initialize Services ────
	jwtAuth := middleware.NewJWTAuth(cfg.JWTSecret)
	emailService := services.NewEmailService(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUser, cfg.SMTPPass, cfg.SMTPFrom, cfg.FrontendURL)
	youtubeService := services.NewYouTubeService(cfg.SupadataAPIKey)
	fileExtractService := services.NewFileExtractService()
	authService := services.NewAuthService(
		userRepo,
		redisClients.Queue,
		jwtAuth,
		emailService,
		cfg.GoogleClientID,
		cfg.GoogleClientSecret,
		cfg.GoogleRedirectURI,
	)
	stripeService := services.NewStripeService()

	quotaService := services.NewQuotaService(pool)

	// ──── Initialize Handlers ────
	authHandler := handlers.NewAuthHandler(authService, cfg.FrontendURL, cfg.Env == "production")
	wsTicketHandler := handlers.NewWSTicketHandler(redisClients.Queue)
	contentHandler := handlers.NewContentHandler(contentRepo, jobRepo, redisClients.Queue, cfg.StoragePath, youtubeService)
	summaryHandler := handlers.NewSummaryHandler(summaryRepo, contentRepo, jobRepo, redisClients.Queue, quotaService, userRepo)
	presentationHandler := handlers.NewPresentationHandler(presentationRepo, contentRepo, jobRepo, redisClients.Queue, quotaService, userRepo)
	quizHandler := handlers.NewQuizHandler(quizRepo, summaryRepo, jobRepo, redisClients.Queue, quotaService, userRepo)
	flashcardHandler := handlers.NewFlashcardHandler(flashcardRepo, summaryRepo, jobRepo, redisClients.Queue, quotaService, userRepo)
	studySessionHandler := handlers.NewStudySessionHandler(studySessionRepo)
	dashboardHandler := handlers.NewDashboardHandler(pool, userRepo)
	libraryHandler := handlers.NewLibraryHandler(pool)
	userHandler := handlers.NewUserHandler(userRepo, quotaService, cfg.JWTSecret)
	jobHandler := handlers.NewJobHandler(jobRepo, summaryRepo, quizRepo, flashcardRepo, presentationRepo)
	screenOCRService := services.NewScreenOCRService(contentRepo, youtubeService, geminiService)
	chatHandler := handlers.NewChatHandler(summaryRepo, chatMessageRepo, geminiService, contentRepo, screenOCRService)
	billingHandler := handlers.NewBillingHandler(stripeService, userRepo)

	// ──── Step 6: Start Job Worker Pool ────
	workerPool := worker.NewPool(
		redisClients.Queue,
		geminiService,
		emailService,
		userRepo,
		youtubeService,
		fileExtractService,
		jobRepo,
		contentRepo,
		summaryRepo,
		presentationRepo,
		quizRepo,
		flashcardRepo,
		cfg.StoragePath,
		5,
		cfg.ContentReadyTimeout,
	)
	workerPool.Start()
	log.Println("✓ Worker pool started (5 goroutines)")

	notificationScheduler := services.NewNotificationScheduler(userRepo, emailService)
	notificationScheduler.Start()
	log.Println("✓ Notification scheduler started")

	// ──── Step 7: Start WebSocket Hub ────
	wsHub := websocket.NewHub(redisClients.PubSub, cfg.FrontendURL)
	log.Println("✓ WebSocket hub started")

	// ──── Step 8: Start HTTP Server ────
	r := router.New(
		jwtAuth,
		authHandler,
		wsTicketHandler,
		contentHandler,
		summaryHandler,
		presentationHandler,
		quizHandler,
		flashcardHandler,
		studySessionHandler,
		dashboardHandler,
		libraryHandler,
		userHandler,
		jobHandler,
		chatHandler,
		billingHandler,
		wsHub,
		cfg.FrontendURL,
		cfg.TrustedProxyCIDRs,
	)

	server := &http.Server{
		Addr:        fmt.Sprintf(":%s", cfg.Port),
		Handler:     r,
		ReadTimeout: 15 * time.Second,
		// WriteTimeout is intentionally omitted: it applies to the entire
		// connection lifetime after request headers are read, which kills
		// long-lived WebSocket connections.  Per-write deadlines are already
		// enforced in writePump() via conn.SetWriteDeadline().
		IdleTimeout: 60 * time.Second,
	}

	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan

		log.Println("Shutting down...")
		workerPool.Stop()
		notificationScheduler.Stop()

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		server.Shutdown(ctx)
	}()

	log.Printf("✓ Lectura Backend ready on http://localhost:%s", cfg.Port)
	log.Printf("  API: http://localhost:%s/api/v1", cfg.Port)
	log.Printf("  WS:  ws://localhost:%s/api/v1/ws", cfg.Port)

	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
	}
}
