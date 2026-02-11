<div align="center">
  <h1>🎓 AI Lecture Summarizer with Learning Activities (Lectura)</h1>
  <p><strong>AI-powered study assistant to transform lectures into summaries, quizzes, and flashcards</strong></p>

  <p>
    <img src="https://img.shields.io/badge/Go-1.23-00ADD8?style=flat-square&logo=go" alt="Go" />
    <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react" alt="React" />
    <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript" alt="TypeScript" />
    <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql" alt="PostgreSQL" />
    <img src="https://img.shields.io/badge/Gemini_AI-Powered-8E75B2?style=flat-square&logo=google" alt="Gemini" />
  </p>
</div>

---

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Getting Started](#-getting-started)
- [Docker Deployment](#-docker-deployment)
- [API Reference](#-api-reference)
- [Testing](#-testing)
- [Project Structure](#-project-structure)
- [Contributing](#-contributing)
- [License](#-license)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🎬 **YouTube Import** | Paste a YouTube URL → AI extracts transcript and generates study materials |
| 📄 **File Upload** | Upload PDFs, DOCX, or text files for AI processing |
| 📝 **Smart Summaries** | AI-generated Cornell notes, bullet points, or paragraph summaries |
| 🧠 **Quiz Generation** | Auto-generated multiple choice, true/false, and open-ended questions |
| 🃏 **Flashcards** | Spaced repetition flashcard decks with confidence tracking |
| 📊 **Dashboard** | Real-time stats: summaries created, quizzes taken, study hours, streak |
| 🔐 **Authentication** | JWT-based auth with email verification and token refresh |
| ⚡ **Real-time Updates** | WebSocket-powered live processing status |
| 📱 **Mobile Responsive** | Full mobile experience with slide-out sidebar |
| 🔔 **Toast Notifications** | Success, error, warning, and info feedback |

---

## 🛠 Tech Stack

### Backend
- **Language:** Go 1.23
- **Router:** Chi v5
- **Database:** PostgreSQL 16 with pgx
- **Cache:** Redis 7
- **AI:** Google Gemini API
- **Auth:** JWT (access + refresh tokens)
- **Real-time:** WebSocket (gorilla/websocket)
- **Worker Pool:** 5 goroutines for async AI processing

### Frontend
- **Framework:** React 18 + TypeScript 5
- **Build Tool:** Vite
- **Styling:** Tailwind CSS
- **Components:** shadcn/ui
- **Icons:** Lucide React
- **Routing:** React Router v6

### Infrastructure
- **Containers:** Docker + Docker Compose
- **Reverse Proxy:** Nginx (SPA routing + API proxy)
- **CI/CD:** GitHub Actions
- **TLS:** Self-signed or Let's Encrypt

---

## 🏗 Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Browser    │────▶│  Nginx :80   │────▶│  Go API :8081│
│  React SPA   │     │  (frontend)  │     │  (backend)   │
└─────────────┘     └──────────────┘     └──────┬───────┘
                                                │
                           ┌────────────────────┼────────────────────┐
                           │                    │                    │
                    ┌──────▼─────┐     ┌───────▼──────┐     ┌──────▼──────┐
                    │ PostgreSQL │     │    Redis     │     │ Gemini API  │
                    │   :5432    │     │    :6379     │     │  (Google)   │
                    └────────────┘     └──────────────┘     └─────────────┘
```

---

## 🚀 Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- [Go 1.23+](https://go.dev/dl/) (for local development)
- [Node.js 20+](https://nodejs.org/) & npm (for local development)
- [Google Gemini API Key](https://aistudio.google.com/apikey)

### Quick Start (Docker)

```bash
# 1. Clone the repository
git clone https://github.com/asanaliwhy/AI-Lecture-summarizer-with-learning-activities.git
cd AI-Lecture-summarizer-with-learning-activities

# 2. Set up environment variables
cp .env.production backend/.env
# Edit backend/.env — fill in GEMINI_API_KEY, JWT_SECRET, and SMTP credentials

# 3. Start everything
docker compose up -d

# 4. Open in browser
# Frontend: http://localhost:3000
# API:      http://localhost:8081
```

### Local Development

```bash
# ─── Start infrastructure ───
docker compose up postgres redis -d

# ─── Backend ───
cd backend
cp .env.example .env  # or create from .env.production template
go mod download
go run cmd/server/main.go

# ─── Frontend (new terminal) ───
npm install
npm run dev
```

---

## 🐳 Docker Deployment

### Development

```bash
docker compose up -d
```

### Production with HTTPS

```bash
# 1. Generate SSL certificates (self-signed for testing)
bash scripts/generate-ssl.sh

# 2. Or use Let's Encrypt (recommended for production)
# certbot certonly --standalone -d your-domain.com

# 3. Update nginx config
# Replace nginx.conf with nginx.ssl.conf in Dockerfile

# 4. Mount certificates in docker-compose.yml
# Add to frontend service:
#   volumes:
#     - ./ssl:/etc/nginx/ssl:ro

# 5. Deploy
docker compose up -d --build
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Backend server port | `8081` |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `REDIS_URL` | Redis connection string | Required |
| `JWT_SECRET` | JWT signing secret (64+ hex chars) | Required |
| `GEMINI_API_KEY` | Google Gemini API key | Required |
| `SMTP_HOST` | Email server host | `smtp.gmail.com` |
| `SMTP_PORT` | Email server port | `587` |
| `SMTP_USER` | Email username | Required for email |
| `SMTP_PASS` | Email password/app password | Required for email |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:5173` |

---

## 📡 API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/auth/register` | Register new user |
| `POST` | `/api/v1/auth/login` | Login, returns JWT tokens |
| `POST` | `/api/v1/auth/refresh` | Refresh access token |
| `POST` | `/api/v1/auth/logout` | Invalidate refresh token |
| `GET`  | `/api/v1/auth/verify-email?token=…` | Verify email address |

### Content & Summaries

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/content/validate-youtube` | Validate YouTube URL |
| `POST` | `/api/v1/content/upload` | Upload file for processing |
| `POST` | `/api/v1/summaries/generate` | Generate AI summary |
| `GET`  | `/api/v1/summaries` | List user summaries |
| `GET`  | `/api/v1/summaries/:id` | Get summary details |
| `DELETE` | `/api/v1/summaries/:id` | Delete summary |

### Quizzes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/quizzes/generate` | Generate quiz from summary |
| `GET`  | `/api/v1/quizzes` | List user quizzes |
| `GET`  | `/api/v1/quizzes/:id` | Get quiz details |
| `POST` | `/api/v1/quizzes/:id/submit` | Submit quiz answers |

### Flashcards

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/flashcards/generate` | Generate flashcard deck |
| `GET`  | `/api/v1/flashcards` | List flashcard decks |
| `GET`  | `/api/v1/flashcards/:id` | Get deck with cards |
| `PUT`  | `/api/v1/flashcards/:id/cards/:cardId` | Update card confidence |

### Dashboard & User

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/v1/dashboard/stats` | Get user statistics |
| `GET`  | `/api/v1/dashboard/recent` | Get recent activity |
| `GET`  | `/api/v1/dashboard/streak` | Get study streak |
| `GET`  | `/api/v1/users/me` | Get current user profile |
| `PUT`  | `/api/v1/users/me` | Update profile |

---

## 🧪 Testing

### Backend Tests

```bash
cd backend
go test -v ./...

# With coverage
go test -v -race -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

### Frontend Tests

```bash
# TypeScript check
npx tsc --noEmit

# Unit/integration tests
npx vitest run

# Watch mode
npx vitest
```

### CI/CD

Tests run automatically on push to `main` or `develop` branches via GitHub Actions:
- ✅ Backend: Go test with PostgreSQL + Redis services
- ✅ Frontend: TypeScript check + Vitest + production build
- ✅ Docker: Image builds verified on main branch

---

## 📁 Project Structure

```
AI-Lecture-summarizer-with-learning-activities/
├── backend/                    # Go API server
│   ├── cmd/server/main.go      # Entry point
│   ├── internal/
│   │   ├── config/             # Environment configuration
│   │   ├── database/           # PostgreSQL connection + migrations
│   │   ├── handlers/           # HTTP route handlers
│   │   ├── middleware/         # Auth, CORS, rate limiting
│   │   ├── models/             # Data models
│   │   ├── services/           # Business logic (AI, auth, email)
│   │   └── worker/             # Async job processing
│   ├── Dockerfile
│   └── go.mod
├── src/                        # React frontend
│   ├── components/
│   │   ├── layout/             # AppLayout, Sidebar, Header
│   │   └── ui/                 # Button, Card, Toast, Skeleton, etc.
│   ├── lib/
│   │   ├── api.ts              # Typed API client
│   │   ├── AuthContext.tsx      # Auth state management
│   │   └── useNetwork.ts       # Online status + retry logic
│   ├── pages/                  # 18 route pages
│   └── __tests__/              # Vitest integration tests
├── docker-compose.yml          # All services (postgres, redis, backend, frontend)
├── Dockerfile                  # Frontend (Vite build + nginx)
├── nginx.conf                  # SPA routing + API proxy
├── nginx.ssl.conf              # HTTPS/TLS configuration
├── .env.production             # Production env template
├── .github/workflows/ci.yml   # CI/CD pipeline
└── scripts/
    └── generate-ssl.sh         # Self-signed SSL cert generator
```

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📄 License

This project is part of a diploma thesis and is provided for educational purposes.

---

<div align="center">
  <p>Built with ❤️ using Go, React, and Gemini AI</p>
</div>
