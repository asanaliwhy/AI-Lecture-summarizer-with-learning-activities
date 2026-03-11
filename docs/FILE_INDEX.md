# File Inventory

| File | Description |
|---|---|
| `.dockerignore` | Ignore patterns for VCS or Docker build context. |
| `.env` | Environment variable definitions/example values. |
| `.env.example` | Environment variable definitions/example values. |
| `.env.production` | Environment variable definitions/example values. |
| `.github/workflows/ci.yml` | GitHub automation/workflow configuration. |
| `.gitignore` | Ignore patterns for VCS or Docker build context. |
| `backend/.dockerignore` | Ignore patterns for VCS or Docker build context. |
| `backend/.env` | Project file. |
| `backend/backend_run.log` | Project file. |
| `backend/cmd/server/main.go` | Backend application entrypoint; wires config, services, router, and worker pool. |
| `backend/cmd/testyt/main.go` | Auxiliary backend command entrypoint for local testing/debugging. |
| `backend/demo_pdfs/demo_bullets.pdf` | Sample PDF artifacts for output format previews. |
| `backend/demo_pdfs/demo_cornell.pdf` | Sample PDF artifacts for output format previews. |
| `backend/demo_pdfs/demo_paragraph.pdf` | Sample PDF artifacts for output format previews. |
| `backend/demo_pdfs/demo_smart.pdf` | Sample PDF artifacts for output format previews. |
| `backend/docker-compose.yml` | Backend-focused local service orchestration config. |
| `backend/Dockerfile` | Backend service container build instructions. |
| `backend/go.mod` | Go module definition and backend dependency manifest. |
| `backend/go.sum` | Go dependency checksum lockfile. |
| `backend/internal/config/config.go` | Runtime configuration loading/validation and related tests. |
| `backend/internal/config/config_test.go` | Runtime configuration loading/validation and related tests. |
| `backend/internal/database/postgres.go` | Database client initialization for PostgreSQL and Redis. |
| `backend/internal/database/redis.go` | Database client initialization for PostgreSQL and Redis. |
| `backend/internal/handlers/api_integration_test.go` | HTTP handlers (auth, content, summary, quiz, flashcard, dashboard, chat, sessions) and tests. |
| `backend/internal/handlers/auth.go` | HTTP handlers (auth, content, summary, quiz, flashcard, dashboard, chat, sessions) and tests. |
| `backend/internal/handlers/chat.go` | HTTP handlers (auth, content, summary, quiz, flashcard, dashboard, chat, sessions) and tests. |
| `backend/internal/handlers/content.go` | HTTP handlers (auth, content, summary, quiz, flashcard, dashboard, chat, sessions) and tests. |
| `backend/internal/handlers/dashboard.go` | HTTP handlers (auth, content, summary, quiz, flashcard, dashboard, chat, sessions) and tests. |
| `backend/internal/handlers/dashboard_notifications_test.go` | HTTP handlers (auth, content, summary, quiz, flashcard, dashboard, chat, sessions) and tests. |
| `backend/internal/handlers/flashcard.go` | HTTP handlers (auth, content, summary, quiz, flashcard, dashboard, chat, sessions) and tests. |
| `backend/internal/handlers/handlers_test.go` | HTTP handlers (auth, content, summary, quiz, flashcard, dashboard, chat, sessions) and tests. |
| `backend/internal/handlers/quiz.go` | HTTP handlers (auth, content, summary, quiz, flashcard, dashboard, chat, sessions) and tests. |
| `backend/internal/handlers/study_session.go` | HTTP handlers (auth, content, summary, quiz, flashcard, dashboard, chat, sessions) and tests. |
| `backend/internal/handlers/summary.go` | HTTP handlers (auth, content, summary, quiz, flashcard, dashboard, chat, sessions) and tests. |
| `backend/internal/handlers/summary_toggle_favorite_test.go` | HTTP handlers (auth, content, summary, quiz, flashcard, dashboard, chat, sessions) and tests. |
| `backend/internal/handlers/user_change_password_test.go` | HTTP handlers (auth, content, summary, quiz, flashcard, dashboard, chat, sessions) and tests. |
| `backend/internal/handlers/user_settings_handlers_test.go` | HTTP handlers (auth, content, summary, quiz, flashcard, dashboard, chat, sessions) and tests. |
| `backend/internal/middleware/auth.go` | HTTP middleware (auth, rate limit, observability, shared helpers). |
| `backend/internal/middleware/middleware.go` | HTTP middleware (auth, rate limit, observability, shared helpers). |
| `backend/internal/middleware/observability.go` | HTTP middleware (auth, rate limit, observability, shared helpers). |
| `backend/internal/middleware/ratelimit.go` | HTTP middleware (auth, rate limit, observability, shared helpers). |
| `backend/internal/models/chat.go` | Domain/request/response data models used across backend layers. |
| `backend/internal/models/content.go` | Domain/request/response data models used across backend layers. |
| `backend/internal/models/flashcard.go` | Domain/request/response data models used across backend layers. |
| `backend/internal/models/job.go` | Domain/request/response data models used across backend layers. |
| `backend/internal/models/quiz.go` | Domain/request/response data models used across backend layers. |
| `backend/internal/models/study_session.go` | Domain/request/response data models used across backend layers. |
| `backend/internal/models/summary.go` | Domain/request/response data models used across backend layers. |
| `backend/internal/models/user.go` | Domain/request/response data models used across backend layers. |
| `backend/internal/repository/content_repo.go` | Data access layer for users, content, summaries, quizzes, flashcards, jobs, sessions. |
| `backend/internal/repository/flashcard_repo.go` | Data access layer for users, content, summaries, quizzes, flashcards, jobs, sessions. |
| `backend/internal/repository/job_repo.go` | Data access layer for users, content, summaries, quizzes, flashcards, jobs, sessions. |
| `backend/internal/repository/quiz_repo.go` | Data access layer for users, content, summaries, quizzes, flashcards, jobs, sessions. |
| `backend/internal/repository/study_session_repo.go` | Data access layer for users, content, summaries, quizzes, flashcards, jobs, sessions. |
| `backend/internal/repository/summary_repo.go` | Data access layer for users, content, summaries, quizzes, flashcards, jobs, sessions. |
| `backend/internal/repository/user_repo.go` | Data access layer for users, content, summaries, quizzes, flashcards, jobs, sessions. |
| `backend/internal/router/router.go` | HTTP route registration and router integration tests. |
| `backend/internal/router/router_integration_test.go` | HTTP route registration and router integration tests. |
| `backend/internal/services/auth.go` | Authentication/business logic (tokens, password flows, account operations). |
| `backend/internal/services/email.go` | Email delivery and templated notification workflows. |
| `backend/internal/services/fileextract.go` | Text extraction from uploaded files/media for processing. |
| `backend/internal/services/gemini.go` | AI orchestration: summary/quiz/flashcard/chat generation and post-processing. |
| `backend/internal/services/gemini_flashcard_options_test.go` | Service-layer unit tests. |
| `backend/internal/services/notifications.go` | Notification preference and dispatch helpers. |
| `backend/internal/services/notifications_test.go` | Service-layer unit tests. |
| `backend/internal/services/youtube.go` | YouTube transcript/audio/metadata retrieval utilities. |
| `backend/internal/websocket/hub.go` | WebSocket hub for real-time user update delivery. |
| `backend/internal/worker/pool.go` | Asynchronous worker/queue processor for background jobs. |
| `backend/migrations/001_initial_schema.sql` | SQL schema migrations and performance index updates. |
| `backend/migrations/002_study_sessions.sql` | SQL schema migrations and performance index updates. |
| `backend/migrations/003_summary_quality_flags.sql` | SQL schema migrations and performance index updates. |
| `backend/migrations/004_quiz_favorites.sql` | SQL schema migrations and performance index updates. |
| `backend/migrations/005_flashcard_favorites.sql` | SQL schema migrations and performance index updates. |
| `backend/migrations/006_user_bio.sql` | SQL schema migrations and performance index updates. |
| `backend/migrations/007_google_oauth.sql` | SQL schema migrations and performance index updates. |
| `backend/migrations/008_add_composite_indexes_for_stats.sql` | SQL schema migrations and performance index updates. |
| `backend/outputs/test_bullets.pdf` | Generated/output test PDF artifacts. |
| `backend/outputs/test_cornell.pdf` | Generated/output test PDF artifacts. |
| `backend/outputs/test_paragraph.pdf` | Generated/output test PDF artifacts. |
| `backend/outputs/test_smart.pdf` | Generated/output test PDF artifacts. |
| `backend/railway.toml` | Railway deployment configuration artifacts. |
| `backend/requirements.txt` | Project file. |
| `backend/scripts/fetch_transcript.py` | Python helper script to fetch YouTube transcript text. |
| `backend/scripts/pdf_export.py` | Python PDF rendering/export utility for summaries. |
| `CONTRIBUTING.md` | Contribution workflow and development guidelines. |
| `docker-compose.yml` | Top-level multi-service local container orchestration config. |
| `Dockerfile` | Top-level container build instructions. |
| `Dockerfile.railway` | Railway deployment configuration artifacts. |
| `docs/images/content-upload.png` | Documentation screenshots for UI/features. |
| `docs/images/dashboard.png` | Documentation screenshots for UI/features. |
| `docs/images/flashcard-study-page.png` | Documentation screenshots for UI/features. |
| `docs/images/library-page.png` | Documentation screenshots for UI/features. |
| `docs/images/login-page.png` | Documentation screenshots for UI/features. |
| `docs/images/quiz-page.png` | Documentation screenshots for UI/features. |
| `docs/images/register-page.png` | Documentation screenshots for UI/features. |
| `docs/images/settings-page.png` | Documentation screenshots for UI/features. |
| `docs/images/summary-result-page.png` | Documentation screenshots for UI/features. |
| `index.html` | Vite HTML template for frontend app mount. |
| `LICENSE` | Project license text. |
| `nginx.conf` | Nginx reverse-proxy/static serving configuration. |
| `nginx.railway.conf` | Railway deployment configuration artifacts. |
| `nginx.ssl.conf` | Nginx reverse-proxy/static serving configuration. |
| `package.json` | Frontend package manifest, scripts, and JS dependencies. |
| `package-lock.json` | Locked dependency tree for npm installs. |
| `postcss.config.js` | Frontend build/toolchain configuration. |
| `railway.toml` | Railway deployment configuration artifacts. |
| `README.md` | Project overview, setup, usage, and architecture notes. |
| `scripts/generate-ssl.sh` | Root utility scripts (SSL generation, smoke checks). |
| `scripts/smoke-check.sh` | Root utility scripts (SSL generation, smoke checks). |
| `src/__tests__/api.test.ts` | Frontend unit/integration tests (Vitest + React Testing Library). |
| `src/__tests__/ContentInputPage.test.tsx` | Frontend unit/integration tests (Vitest + React Testing Library). |
| `src/__tests__/DashboardPage.test.tsx` | Frontend unit/integration tests (Vitest + React Testing Library). |
| `src/__tests__/EmailVerificationPage.test.tsx` | Frontend unit/integration tests (Vitest + React Testing Library). |
| `src/__tests__/FlashcardConfigPage.test.tsx` | Frontend unit/integration tests (Vitest + React Testing Library). |
| `src/__tests__/FlashcardsPage.test.tsx` | Frontend unit/integration tests (Vitest + React Testing Library). |
| `src/__tests__/FlashcardStudyPage.test.tsx` | Frontend unit/integration tests (Vitest + React Testing Library). |
| `src/__tests__/LandingPage.test.tsx` | Frontend unit/integration tests (Vitest + React Testing Library). |
| `src/__tests__/LibraryPage.test.tsx` | Frontend unit/integration tests (Vitest + React Testing Library). |
| `src/__tests__/LoginPage.test.tsx` | Frontend unit/integration tests (Vitest + React Testing Library). |
| `src/__tests__/ProcessingPage.test.tsx` | Frontend unit/integration tests (Vitest + React Testing Library). |
| `src/__tests__/QuizConfigPage.test.tsx` | Frontend unit/integration tests (Vitest + React Testing Library). |
| `src/__tests__/QuizResultsPage.test.tsx` | Frontend unit/integration tests (Vitest + React Testing Library). |
| `src/__tests__/QuizTakePage.test.tsx` | Frontend unit/integration tests (Vitest + React Testing Library). |
| `src/__tests__/QuizzesPage.test.tsx` | Frontend unit/integration tests (Vitest + React Testing Library). |
| `src/__tests__/RegisterPage.test.tsx` | Frontend unit/integration tests (Vitest + React Testing Library). |
| `src/__tests__/sanity.test.ts` | Frontend unit/integration tests (Vitest + React Testing Library). |
| `src/__tests__/SettingsPage.test.tsx` | Frontend unit/integration tests (Vitest + React Testing Library). |
| `src/__tests__/SummariesPage.test.tsx` | Frontend unit/integration tests (Vitest + React Testing Library). |
| `src/__tests__/SummaryPage.test.tsx` | Frontend unit/integration tests (Vitest + React Testing Library). |
| `src/App.tsx` | Frontend root app with route/layout composition. |
| `src/assets/default-video-thumbnail.svg` | Static frontend assets (icons/images/svg). |
| `src/components/layout/AppLayout.tsx` | Shared app layout components (header/sidebar/offline banner). |
| `src/components/layout/Header.tsx` | Shared app layout components (header/sidebar/offline banner). |
| `src/components/layout/OfflineBanner.tsx` | Shared app layout components (header/sidebar/offline banner). |
| `src/components/layout/Sidebar.tsx` | Shared app layout components (header/sidebar/offline banner). |
| `src/components/SummaryChatPanel.tsx` | Feature-level React components (e.g., summary chat panel). |
| `src/components/ui/Avatar.tsx` | Reusable UI primitives/components (button/input/card/etc.). |
| `src/components/ui/Badge.tsx` | Reusable UI primitives/components (button/input/card/etc.). |
| `src/components/ui/Button.tsx` | Reusable UI primitives/components (button/input/card/etc.). |
| `src/components/ui/Card.tsx` | Reusable UI primitives/components (button/input/card/etc.). |
| `src/components/ui/Checkbox.tsx` | Reusable UI primitives/components (button/input/card/etc.). |
| `src/components/ui/ConfirmDialog.tsx` | Reusable UI primitives/components (button/input/card/etc.). |
| `src/components/ui/Input.tsx` | Reusable UI primitives/components (button/input/card/etc.). |
| `src/components/ui/Label.tsx` | Reusable UI primitives/components (button/input/card/etc.). |
| `src/components/ui/Progress.tsx` | Reusable UI primitives/components (button/input/card/etc.). |
| `src/components/ui/RadioGroup.tsx` | Reusable UI primitives/components (button/input/card/etc.). |
| `src/components/ui/Select.tsx` | Reusable UI primitives/components (button/input/card/etc.). |
| `src/components/ui/Skeleton.tsx` | Reusable UI primitives/components (button/input/card/etc.). |
| `src/components/ui/Slider.tsx` | Reusable UI primitives/components (button/input/card/etc.). |
| `src/components/ui/Switch.tsx` | Reusable UI primitives/components (button/input/card/etc.). |
| `src/components/ui/Tabs.tsx` | Reusable UI primitives/components (button/input/card/etc.). |
| `src/components/ui/Textarea.tsx` | Reusable UI primitives/components (button/input/card/etc.). |
| `src/components/ui/Toast.tsx` | Reusable UI primitives/components (button/input/card/etc.). |
| `src/hooks/useGoogleLogin.ts` | Custom React hooks for auth/login animation behavior. |
| `src/hooks/useScrollReveal.ts` | Custom React hooks for auth/login animation behavior. |
| `src/index.css` | Global styles and Tailwind/CSS base rules. |
| `src/index.tsx` | Frontend bootstrap/mount entrypoint. |
| `src/lib/api.ts` | Frontend API client methods for backend communication. |
| `src/lib/AuthContext.tsx` | Authentication context/provider for frontend state. |
| `src/lib/googleOAuth.ts` | Frontend helpers/utilities/preferences/network hooks. |
| `src/lib/summaryLengthPreference.ts` | Frontend helpers/utilities/preferences/network hooks. |
| `src/lib/themePreference.ts` | Frontend helpers/utilities/preferences/network hooks. |
| `src/lib/useNetwork.ts` | Frontend helpers/utilities/preferences/network hooks. |
| `src/lib/useStudySession.ts` | Frontend helpers/utilities/preferences/network hooks. |
| `src/lib/useWebSocket.ts` | WebSocket client hook for realtime backend events. |
| `src/lib/utils.ts` | Frontend helpers/utilities/preferences/network hooks. |
| `src/pages/AuthCallbackPage.tsx` | Routed React pages for auth, dashboard, content, summaries, quizzes, flashcards, settings. |
| `src/pages/ContentInputPage.tsx` | Routed React pages for auth, dashboard, content, summaries, quizzes, flashcards, settings. |
| `src/pages/DashboardPage.tsx` | Routed React pages for auth, dashboard, content, summaries, quizzes, flashcards, settings. |
| `src/pages/EmailVerificationPage.tsx` | Routed React pages for auth, dashboard, content, summaries, quizzes, flashcards, settings. |
| `src/pages/FlashcardConfigPage.tsx` | Routed React pages for auth, dashboard, content, summaries, quizzes, flashcards, settings. |
| `src/pages/FlashcardsPage.tsx` | Routed React pages for auth, dashboard, content, summaries, quizzes, flashcards, settings. |
| `src/pages/FlashcardStudyPage.tsx` | Routed React pages for auth, dashboard, content, summaries, quizzes, flashcards, settings. |
| `src/pages/LandingPage.css` | Routed React pages for auth, dashboard, content, summaries, quizzes, flashcards, settings. |
| `src/pages/LandingPage.tsx` | Routed React pages for auth, dashboard, content, summaries, quizzes, flashcards, settings. |
| `src/pages/LibraryPage.tsx` | Routed React pages for auth, dashboard, content, summaries, quizzes, flashcards, settings. |
| `src/pages/LoginPage.tsx` | Routed React pages for auth, dashboard, content, summaries, quizzes, flashcards, settings. |
| `src/pages/NotFoundPage.tsx` | Routed React pages for auth, dashboard, content, summaries, quizzes, flashcards, settings. |
| `src/pages/ProcessingPage.tsx` | Routed React pages for auth, dashboard, content, summaries, quizzes, flashcards, settings. |
| `src/pages/QuizConfigPage.tsx` | Routed React pages for auth, dashboard, content, summaries, quizzes, flashcards, settings. |
| `src/pages/QuizResultsPage.tsx` | Routed React pages for auth, dashboard, content, summaries, quizzes, flashcards, settings. |
| `src/pages/QuizTakePage.tsx` | Routed React pages for auth, dashboard, content, summaries, quizzes, flashcards, settings. |
| `src/pages/QuizzesPage.tsx` | Routed React pages for auth, dashboard, content, summaries, quizzes, flashcards, settings. |
| `src/pages/RegisterPage.tsx` | Routed React pages for auth, dashboard, content, summaries, quizzes, flashcards, settings. |
| `src/pages/SettingsPage.tsx` | Routed React pages for auth, dashboard, content, summaries, quizzes, flashcards, settings. |
| `src/pages/SummariesPage.tsx` | Routed React pages for auth, dashboard, content, summaries, quizzes, flashcards, settings. |
| `src/pages/SummaryPage.tsx` | Routed React pages for auth, dashboard, content, summaries, quizzes, flashcards, settings. |
| `src/vite-env.d.ts` | TypeScript/React source file. |
| `tailwind.config.js` | Frontend build/toolchain configuration. |
| `tsconfig.json` | Frontend build/toolchain configuration. |
| `vite.config.ts` | Frontend build/toolchain configuration. |
