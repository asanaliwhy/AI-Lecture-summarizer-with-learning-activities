<div align="center">
  <h1>🎓 Lectura — AI-Powered Study Assistant</h1>
  <p><strong>Transform lectures into smart summaries, quizzes, and flashcards with AI</strong></p>

  <p>
    <img src="https://img.shields.io/badge/Go-1.23-00ADD8?style=for-the-badge&logo=go&logoColor=white" alt="Go" />
    <img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
    <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
    <img src="https://img.shields.io/badge/Gemini_AI-Powered-8E75B2?style=for-the-badge&logo=google&logoColor=white" alt="Gemini" />
    <img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
  </p>

  <p>
    <a href="#-features">Features</a> •
    <a href="#-tech-stack">Tech Stack</a> •
    <a href="#-architecture">Architecture</a> •
    <a href="#-getting-started">Getting Started</a> •
    <a href="#-api-reference">API</a> •
    <a href="#-testing">Testing</a>
  </p>
</div>

---

## ✨ Features

### 🤖 AI-Powered Learning
| Feature | Description |
|---------|-------------|
| 🎬 **YouTube Import** | Paste a YouTube URL → AI extracts transcript and generates study materials |
| 📄 **File Upload** | Upload PDFs, DOCX, or plain text files for AI processing |
| 📝 **Smart Summaries** | Cornell notes, bullet points, or paragraph summaries with configurable length |
| 🧠 **Quiz Generation** | Multiple choice, true/false, and open-ended questions with difficulty levels |
| 🃏 **Flashcards** | Spaced repetition decks with confidence tracking and study sessions |
| 📊 **Dashboard** | Real-time stats: summaries, quizzes, study hours, streak, weekly goals |
| 📚 **Library** | Unified search across all summaries, quizzes, and flashcard decks |

### 🔐 Authentication & Security
| Feature | Description |
|---------|-------------|
| 🔑 **JWT Authentication** | Access + refresh token flow with secure rotation |
| 📧 **Email Verification** | Verification emails with resend throttling and rate limiting |
| 🌐 **Google Sign-In** | One-click authentication via Google OAuth 2.0 |
| 🛡️ **Rate Limiting** | Per-endpoint rate limiting with Redis-backed counters |

### 🎨 User Experience
| Feature | Description |
|---------|-------------|
| ⚡ **Real-time Updates** | WebSocket-powered live processing status for AI jobs |
| 📱 **Mobile Responsive** | Full mobile experience with collapsible sidebar |
| 🌙 **Dark Mode** | System-aware dark/light theme toggle |
| 🔔 **Toast Notifications** | Contextual feedback (success, error, warning, info) |
| ⭐ **Favorites** | Star summaries, quizzes, and flashcard decks |
| 📄 **PDF Export** | Download summaries as formatted PDFs |

---

## 🛠 Tech Stack

<table>
<tr>
<th>Layer</th>
<th>Technology</th>
<th>Purpose</th>
</tr>
<tr>
<td rowspan="6"><strong>Backend</strong></td>
<td>Go 1.23</td>
<td>Server language</td>
</tr>
<tr><td>Chi v5</td><td>HTTP router</td></tr>
<tr><td>PostgreSQL 16 (pgx)</td><td>Primary database — all user data, content, summaries, quizzes, flashcards</td></tr>
<tr><td>Redis 7</td><td>Session tokens, rate limiting, email verification tokens</td></tr>
<tr><td>Google Gemini API</td><td>AI summarization, quiz generation, flashcard creation</td></tr>
<tr><td>gorilla/websocket</td><td>Real-time processing updates</td></tr>
<tr>
<td rowspan="6"><strong>Frontend</strong></td>
<td>React 18</td>
<td>UI framework</td>
</tr>
<tr><td>TypeScript 5</td><td>Type safety</td></tr>
<tr><td>Vite 6</td><td>Build tool & dev server</td></tr>
<tr><td>Tailwind CSS 3</td><td>Utility-first styling</td></tr>
<tr><td>Radix UI</td><td>Accessible component primitives</td></tr>
<tr><td>Lucide React</td><td>Icon library</td></tr>
<tr>
<td rowspan="3"><strong>Infrastructure</strong></td>
<td>Docker + Compose</td>
<td>Container orchestration</td>
</tr>
<tr><td>Nginx</td><td>Reverse proxy, SPA routing, gzip, caching</td></tr>
<tr><td>TLS/SSL</td><td>HTTPS with security headers (HSTS, CSP)</td></tr>
</table>

---

## 🏗 Architecture

```
                              ┌──────────────────────────────────────────────┐
                              │              Docker Compose                 │
                              │                                              │
 ┌──────────┐    HTTP/WS      │  ┌──────────┐      ┌──────────────────┐     │
 │  Browser  │───────────────▶│  │  Nginx   │─────▶│   Go Backend     │     │
 │ React SPA │                │  │  :80/443 │      │     :8081        │     │
 └──────────┘                 │  └──────────┘      └────────┬─────────┘     │
                              │                             │               │
                              │            ┌────────────────┼────────┐      │
                              │            │                │        │      │
                              │     ┌──────▼─────┐  ┌──────▼──┐  ┌──▼───┐  │
                              │     │ PostgreSQL │  │  Redis  │  │Gemini│  │
                              │     │   :5432    │  │  :6379  │  │  API │  │
                              │     └────────────┘  └─────────┘  └──────┘  │
                              └──────────────────────────────────────────────┘
```

**Data Flow:**
1. User uploads content or pastes YouTube URL
2. Backend validates input, creates a job, dispatches to worker pool (5 goroutines)
3. Worker calls Gemini AI with rate limiting (requests/min, tokens/min, concurrency)
4. Results stored in PostgreSQL, progress pushed via WebSocket
5. Frontend receives real-time updates and displays results

---

## 🚀 Getting Started

### Prerequisites

- [Docker Desktop](https://docs.docker.com/get-docker/) & Docker Compose
- [Go 1.23+](https://go.dev/dl/) (for local development)
- [Node.js 20+](https://nodejs.org/) & npm (for local development)
- [Google Gemini API Key](https://aistudio.google.com/apikey)

### Option 1: Docker (Recommended)

```bash
# 1. Clone
git clone https://github.com/asanaliwhy/AI-Lecture-summarizer-with-learning-activities.git
cd AI-Lecture-summarizer-with-learning-activities

# 2. Configure
cp .env.production backend/.env
# Edit backend/.env — set GEMINI_API_KEY, JWT_SECRET, SMTP credentials

# 3. Start
docker compose up -d --build

# 4. Open
# → http://localhost:3000
```

### Option 2: Local Development

```bash
# ─── Start database & cache ───
docker compose up postgres redis -d

# ─── Backend (terminal 1) ───
cd backend
# Create backend/.env from .env.production template and fill in values
go mod download
go run cmd/server/main.go
# → API running at http://localhost:8081

# ─── Frontend (terminal 2) ───
npm install
npm run dev
# → App running at http://localhost:5173
```

### Environment Variables

#### Backend (`backend/.env`)

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | ✅ |
| `REDIS_URL` | Redis connection string | ✅ |
| `JWT_SECRET` | JWT signing secret (generate with `openssl rand -hex 64`) | ✅ |
| `GEMINI_API_KEY` | Google Gemini API key | ✅ |
| `SMTP_HOST` / `SMTP_PORT` | Email server for verification | ✅ |
| `SMTP_USER` / `SMTP_PASS` | Email credentials (Gmail App Password) | ✅ |
| `FRONTEND_URL` | Frontend URL for CORS & email links | ✅ |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | Optional |
| `GEMINI_REQUESTS_PER_MINUTE` | AI rate limit | Default: `60` |
| `GEMINI_TOKENS_PER_MINUTE` | AI token rate limit | Default: `1000000` |

#### Frontend (`.env`)

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | Backend API URL (`/api/v1` in Docker) | `http://localhost:8081/api/v1` |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID | `123...apps.googleusercontent.com` |

---

## 🐳 Docker Deployment

### Services

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `postgres` | postgres:16-alpine | 5432 | Primary database |
| `redis` | redis:7-alpine | 6379 | Sessions, rate limiting |
| `backend` | Go multi-stage build | 8081 | REST API + WebSocket |
| `frontend` | Vite + Nginx | 3000 (80) | Static SPA + reverse proxy |

### Production with HTTPS

```bash
# 1. Generate SSL certificates
bash scripts/generate-ssl.sh
# Or use Let's Encrypt: certbot certonly --standalone -d your-domain.com

# 2. Update nginx.conf → nginx.ssl.conf in Dockerfile
# 3. Mount certs in docker-compose.yml:
#    volumes:
#      - ./ssl:/etc/nginx/ssl:ro

# 4. Deploy
docker compose up -d --build
```

The SSL config includes modern TLS (1.2/1.3), HSTS, `X-Content-Type-Options`, `X-Frame-Options`, and `X-XSS-Protection` headers.

---

## 📡 API Reference

All protected endpoints require `Authorization: Bearer <access_token>` header.

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/v1/auth/register` | — | Register with email & password |
| `POST` | `/api/v1/auth/login` | — | Login, returns JWT tokens |
| `POST` | `/api/v1/auth/google` | — | Google OAuth sign-in |
| `GET` | `/api/v1/auth/verify-email?token=…` | — | Verify email address |
| `POST` | `/api/v1/auth/resend-verification` | — | Resend verification email |
| `POST` | `/api/v1/auth/refresh` | — | Refresh access token |
| `POST` | `/api/v1/auth/logout` | 🔒 | Invalidate refresh token |

### Content

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/content/supported-formats` | List supported file formats |
| `POST` | `/api/v1/content/validate-youtube` | 🔒 Validate YouTube URL & get metadata |
| `POST` | `/api/v1/content/upload` | 🔒 Upload file (PDF, DOCX, TXT) |
| `GET` | `/api/v1/content/:id` | 🔒 Get content details |

### Summaries

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/summaries/generate` | 🔒 Generate AI summary from content |
| `GET` | `/api/v1/summaries` | 🔒 List user's summaries |
| `GET` | `/api/v1/summaries/:id` | 🔒 Get summary details |
| `PUT` | `/api/v1/summaries/:id` | 🔒 Update summary |
| `DELETE` | `/api/v1/summaries/:id` | 🔒 Delete summary |
| `POST` | `/api/v1/summaries/:id/regenerate` | 🔒 Regenerate summary |
| `PUT` | `/api/v1/summaries/:id/favorite` | 🔒 Toggle favorite |

### Quizzes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/quizzes/generate` | 🔒 Generate quiz from summary |
| `GET` | `/api/v1/quizzes` | 🔒 List user's quizzes |
| `GET` | `/api/v1/quizzes/:id` | 🔒 Get quiz details |
| `DELETE` | `/api/v1/quizzes/:id` | 🔒 Delete quiz |
| `PUT` | `/api/v1/quizzes/:id/favorite` | 🔒 Toggle favorite |
| `POST` | `/api/v1/quizzes/:id/start` | 🔒 Start quiz attempt |
| `POST` | `/api/v1/quiz-attempts/:id/save-progress` | 🔒 Auto-save progress |
| `POST` | `/api/v1/quiz-attempts/:id/submit` | 🔒 Submit quiz answers |
| `GET` | `/api/v1/quiz-attempts/:id` | 🔒 Get attempt details |

### Flashcards

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/flashcards/generate` | 🔒 Generate flashcard deck |
| `GET` | `/api/v1/flashcards/decks` | 🔒 List decks |
| `GET` | `/api/v1/flashcards/decks/:id` | 🔒 Get deck with cards |
| `GET` | `/api/v1/flashcards/decks/:id/stats` | 🔒 Get deck study stats |
| `PUT` | `/api/v1/flashcards/decks/:id/favorite` | 🔒 Toggle favorite |
| `DELETE` | `/api/v1/flashcards/decks/:id` | 🔒 Delete deck |
| `POST` | `/api/v1/flashcards/cards/:id/rating` | 🔒 Rate card confidence |

### Dashboard & User

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/dashboard/stats` | 🔒 User statistics |
| `GET` | `/api/v1/dashboard/recent` | 🔒 Recent activity |
| `GET` | `/api/v1/dashboard/streak` | 🔒 Study streak |
| `GET` | `/api/v1/dashboard/activity` | 🔒 Activity heatmap data |
| `PUT` | `/api/v1/dashboard/weekly-goal` | 🔒 Set weekly goal |
| `GET` | `/api/v1/library` | 🔒 Unified search across all content |
| `GET` | `/api/v1/user/me` | 🔒 Get profile |
| `PUT` | `/api/v1/user/me` | 🔒 Update profile |
| `PUT` | `/api/v1/user/password` | 🔒 Change password |
| `DELETE` | `/api/v1/user/me` | 🔒 Delete account |
| `GET/PUT` | `/api/v1/user/settings` | 🔒 App preferences |
| `GET/PUT` | `/api/v1/user/notifications` | 🔒 Notification preferences |

### Other

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/v1/ws` | WebSocket for real-time job updates |
| `GET` | `/api/v1/jobs/:id` | 🔒 Get job status |
| `DELETE` | `/api/v1/jobs/:id` | 🔒 Cancel job |

---

## 🧪 Testing

### Frontend Tests (87 tests, 16 files)

```bash
# Run all tests
npx vitest run

# Watch mode
npx vitest

# TypeScript check
npx tsc --noEmit
```

**Tested pages:** Dashboard, ContentInput, Library, Settings, Summaries, Summary, Quizzes, QuizConfig, QuizTake, QuizResults, Flashcards, FlashcardConfig, FlashcardStudy, EmailVerification, and API client.

### Post-deploy smoke checks

After deployment, run:

```bash
# Uses BASE_URL=https://localhost:3443 by default
npm run smoke
```

This smoke script checks:
- Auth endpoint reachability (`/api/v1/auth/login`)
- Summary generation endpoint reachability (`/api/v1/summaries/generate`)
- WebSocket handshake reachability (`/api/v1/ws`)

### Backend Tests

```bash
cd backend
go test ./...

# With coverage
go test -v -race -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

---

## 📁 Project Structure

```
lectura/
├── backend/                        # Go API server
│   ├── cmd/server/main.go          # Entry point, wiring
│   ├── internal/
│   │   ├── config/                 # Environment configuration
│   │   ├── database/               # PostgreSQL connection pool
│   │   ├── handlers/               # HTTP handlers (auth, content, quiz, etc.)
│   │   ├── middleware/             # JWT auth, CORS, rate limiting, logging
│   │   ├── models/                 # Data models & request/response types
│   │   ├── repository/            # Database queries (pgx)
│   │   ├── router/                # Chi router setup
│   │   ├── services/              # Business logic (AI, auth, email, study)
│   │   └── worker/                # Async job processing (5 goroutines)
│   ├── migrations/                # SQL migrations (001–007)
│   └── Dockerfile                 # Multi-stage Go build
│
├── src/                            # React frontend
│   ├── components/
│   │   ├── layout/                # AppLayout, Sidebar, Header
│   │   └── ui/                    # Button, Card, Toast, Input, Select, etc.
│   ├── hooks/                     # useGoogleLogin, useWebSocket, etc.
│   ├── lib/
│   │   ├── api.ts                 # Typed API client with token refresh
│   │   ├── AuthContext.tsx        # Auth state & protected routes
│   │   ├── useWebSocket.ts        # Real-time job updates
│   │   └── themePreference.ts     # Dark/light mode persistence
│   ├── pages/                     # 19 route pages
│   └── __tests__/                 # 16 Vitest test files (87 tests)
│
├── docker-compose.yml              # PostgreSQL + Redis + Backend + Frontend
├── Dockerfile                      # Frontend: Vite build → Nginx
├── nginx.conf                      # SPA routing + API reverse proxy
├── nginx.ssl.conf                  # Production HTTPS config
├── .env.production                 # Production environment template
└── scripts/
    ├── generate-ssl.sh             # Self-signed SSL certificate generator
    └── smoke-check.sh              # Post-deploy smoke checks
```

---

## 🧰 Operations Runbook (PostgreSQL/Redis)

### Backup

```bash
# PostgreSQL logical backup
docker compose exec -T postgres pg_dump -U ${POSTGRES_USER:-postgres} ${POSTGRES_DB:-lectura} > ./backup-postgres.sql

# Redis snapshot backup
docker compose exec -T redis redis-cli BGSAVE
docker compose cp redis:/data/dump.rdb ./backup-redis.rdb
```

### Restore

```bash
# PostgreSQL restore (WARNING: overwrites target db objects)
cat ./backup-postgres.sql | docker compose exec -T postgres psql -U ${POSTGRES_USER:-postgres} ${POSTGRES_DB:-lectura}

# Redis restore (requires restart with restored dump)
docker compose down
copy ./backup-redis.rdb ./data/redis/dump.rdb
docker compose up -d
```

### Verification

```bash
# App/API health
curl -k https://localhost:3443/api/v1/health

# Metrics endpoint (uptime + avg latency)
curl -k https://localhost:3443/metrics
```

---

## 📊 Database Schema

7 sequential migrations building up:

| Table | Purpose |
|-------|---------|
| `users` | Accounts, auth provider, Google ID, verification status |
| `content` | Uploaded files & YouTube transcripts |
| `summaries` | AI-generated summaries with format & quality flags |
| `quizzes` / `quiz_attempts` | Generated quizzes, attempts, scores |
| `flashcard_decks` / `flashcard_cards` | Decks with spaced repetition ratings |
| `study_sessions` | Time tracking with heartbeat |
| `user_settings` | Per-user preferences & notification config |
| `jobs` | Async AI processing job queue |

---

## 📄 License

This project is part of a diploma thesis at Astana IT University and is provided for educational purposes.

---

<div align="center">
  <p>Built with ❤️ using Go, React, and Google Gemini AI</p>
  <p><sub>Diploma Project — 2026</sub></p>
</div>
