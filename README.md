# Lectura — AI Lecture Summarizer with Learning Activities

Lectura transforms raw study content into active-learning outputs: multi-format summaries, adaptive quizzes, spaced-repetition flashcards, and **AI-generated presentation decks** — all from a single YouTube link or uploaded file.

![Landing Page](docs/images/landing-page.png)

## ✨ Key Features

### 📝 Multi-Format Summaries
Paste a YouTube URL or upload a document and get structured notes in four distinct formats — each engineered for a different kind of thinking:

| Format | Purpose |
|---|---|
| **Cornell Method** | Two-column cue/note layout with synthesis — the gold standard for lecture retention |
| **Bullet Points** | Structured breakdowns with definitions, examples, and key takeaways |
| **Paragraph** | Flowing prose with subheadings — ideal for essay prep |
| **Smart Summary** | Key concepts with real-world applications, data tables, and memorable facts |

### 🎯 Adaptive Quizzes
AI-generated quizzes with multiple-choice and true/false questions at three difficulty levels (Easy, Medium, Hard). Includes timers, hints, and detailed explanations for every answer.

### 🧠 Spaced-Repetition Flashcards
Flashcard decks built directly from your summaries using the **SM-2 algorithm**. Rate difficulty after each review and let the system schedule optimal review intervals. Mnemonics and examples are included automatically.

### 🖥️ AI Presentation Generation
Turn any lecture into a polished, structured slide deck — ready to present or export.

- **Configurable generation** — choose slide count (Short / Medium / Large), text style (Formal, Academic, Conversational), and output language (English, Kazakh, Russian, French, Spanish)
- **Theme engine** — 20+ curated themes across Light, Dark, Warm, and Cool categories with gradient backgrounds, accent colors, and matched typography
- **Rich slide types** — title, section, content with bullets, two-column comparisons, stats grids, prose, and summary/takeaway layouts
- **Inline editing** — click any text on a slide to edit it in place; changes auto-save with debounced persistence
- **Fullscreen present mode** — immersive, distraction-free presentation with keyboard navigation
- **Export to PDF & PPTX** — high-fidelity vector exports that match the on-screen rendering pixel-for-pixel
- **Thumbnail sidebar** — scroll through all slides with a visual thumbnail panel, synced to the active slide

### 💬 Ask AI Chat
Context-grounded Q&A about your summaries. The AI stays anchored to the source material and refuses to drift off-topic.

### 📊 Dashboard & Analytics
Track your learning with daily streaks, activity stats, recent items, and weekly goal tracking across all resource types.

### 📚 Unified Library
Search, filter, sort, and favorite all summaries, quizzes, flashcards, and presentations in one place.

## 🔄 Product Flow

```mermaid
flowchart LR
  A[Paste YouTube URL or upload file] --> B[Generate summary]
  B --> C[Study with quiz & flashcards]
  B --> D[Generate presentation deck]
  D --> E[Edit · Present · Export]
  C --> F[Track progress on dashboard]
  D --> F
```

## 📸 Screenshots

### Authentication

![Login](docs/images/login-page.png)
![Register](docs/images/register-page.png)

### Content & Summary

![Content Upload](docs/images/content-upload.png)
![Summary Result](docs/images/summary-result-page.png)

### Learning Activities

![Quiz](docs/images/quiz-page.png)
![Flashcards](docs/images/flashcard-study-page.png)

### Presentation Generation

![Presentation Config](docs/images/presentation-config.png)
![Presentation Viewer](docs/images/presentation-viewer.png)
![Present Mode](docs/images/presentation-present-mode.png)

### Navigation & Insights

![Library](docs/images/library-page.png)
![Dashboard](docs/images/dashboard.png)
![Settings](docs/images/settings-page.png)

## 🛠 Tech Stack

### Frontend

- **React 18** + TypeScript
- **Vite** build tooling
- **React Router** for client-side routing
- **TanStack Query** for server-state management
- **Vitest** for unit tests
- Tailwind CSS for styling

### Backend

- **Go 1.24** with Chi router
- **PostgreSQL** (pgx driver) for persistent storage
- **Redis** for job queuing and caching
- **Gorilla WebSocket** for real-time processing updates
- **Google Gemini API** for AI generation (summaries, quizzes, flashcards, presentations)
- **Unsplash API** for presentation imagery

### Infrastructure

- Docker Compose for local orchestration (Postgres, Redis)
- Railway-ready deployment configuration
- Nginx reverse proxy with SSL support

## 📂 Repository Structure

```text
.
├── src/                              # Frontend
│   ├── pages/                        # Route-level page components
│   ├── components/
│   │   ├── presentation/             # SlideViewer, SlideRenderer, ThemeSelector, SlideThumbnail
│   │   ├── layout/                   # AppLayout, navigation
│   │   └── ui/                       # Shared UI primitives (Button, Card, Toast, etc.)
│   ├── lib/                          # API client, types, themes, export utilities
│   └── hooks/                        # Custom React hooks
├── backend/
│   ├── cmd/server/                   # Entrypoint
│   ├── internal/
│   │   ├── handlers/                 # HTTP handlers (auth, content, summary, quiz, flashcard, presentation, dashboard, chat)
│   │   ├── services/                 # Gemini AI, auth, email, YouTube, file extraction
│   │   ├── repository/               # Data access layer
│   │   ├── worker/                   # Async job workers for AI generation
│   │   ├── router/                   # Route composition
│   │   ├── middleware/               # Auth, CORS, logging
│   │   ├── models/                   # Domain models
│   │   └── websocket/                # Real-time progress updates
│   └── migrations/                   # SQL migrations
├── docs/images/                      # README screenshots
├── docker-compose.yml
├── Dockerfile / Dockerfile.railway
└── nginx.conf / nginx.ssl.conf
```

## 🚀 Local Development

### Prerequisites

- Node.js 18+
- Go 1.24+
- Docker Desktop (recommended for Postgres/Redis)

### 1. Clone

```bash
git clone https://github.com/asanaliwhy/AI-Lecture-summarizer-with-learning-activities.git
cd AI-Lecture-summarizer-with-learning-activities
```

### 2. Configure Environment

Frontend (`.env` at repo root):

```env
VITE_API_BASE_URL=http://localhost:8082/api/v1
VITE_GOOGLE_CLIENT_ID=your_google_client_id
VITE_GOOGLE_REDIRECT_URI=http://localhost:5173/auth/callback
```

Backend (`backend/.env`):

```env
PORT=8082
ENV=development
DATABASE_URL=postgres://postgres:postgres@localhost:5432/lectura?sslmode=disable
REDIS_URL=redis://localhost:6379/0
JWT_SECRET=your_jwt_secret
GEMINI_API_KEY=your_gemini_api_key
SUPADATA_API_KEY=your_supadata_api_key
UNSPLASH_ACCESS_KEY=your_unsplash_access_key
FRONTEND_URL=http://localhost:5173
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:5173/callback
```

You can also start from `.env.example` and `backend/.env.example`.

### 3. Start Database & Redis

```bash
docker compose up -d postgres redis
```

### 4. Run Backend

```bash
cd backend
go run ./cmd/server
```

Backend auto-applies migrations at startup.

### 5. Run Frontend

```bash
npm install
npm run dev
```

## 🌐 Default Local URLs

| Service | URL |
|---|---|
| Frontend | `http://localhost:5173` |
| Backend API | `http://localhost:8082/api/v1` |
| Health Check | `http://localhost:8082/api/v1/health` |

## 📡 API Surface

| Domain | Endpoints |
|---|---|
| **Auth** | Login, register, Google OAuth, email verification, password change |
| **Content** | YouTube validation, file upload, transcript extraction |
| **Summary** | Generate (4 formats), list, detail, favorite, chat |
| **Quiz** | Generate (3 difficulties), attempt, results, favorite |
| **Flashcards** | Generate, deck management, spaced-repetition study, favorite |
| **Presentation** | Generate, list, view, update slides (inline edit), delete, theme, export, favorite |
| **Dashboard** | Stats, recent activity, streak, weekly goals, notifications |
| **Library** | Unified cross-resource search, filter, sort |
| **Jobs / WebSocket** | Async processing queue, real-time progress updates |

## ⚙️ Processing Architecture

```mermaid
flowchart LR
  A[Client Request] --> B[API Handler]
  B --> C[Job Queue — Redis]
  C --> D[Worker Pool]
  D --> E[Gemini API + Extractors]
  E --> F[(PostgreSQL)]
  D --> G[WebSocket Progress]
  G --> A
```

## 📋 Scripts

**Frontend** (from project root):

| Command | Description |
|---|---|
| `npm run dev` | Start frontend dev server |
| `npm run build` | TypeScript check + production build |
| `npm run test` | Run Vitest test suite |
| `npm run typecheck` | Strict TypeScript checks |

**Backend** (from `backend/`):

| Command | Description |
|---|---|
| `go run ./cmd/server` | Start backend server |
| `go test ./...` | Run all backend tests |

## ✅ Quality & Testing

- Frontend type safety with strict TypeScript
- Frontend unit tests with Vitest
- Backend unit and integration tests across handlers, services, and repositories
- Job retry and error handling with fallback paths
- Debounced auto-save for inline slide editing

## 🚢 Deployment

- `Dockerfile`, `Dockerfile.railway`, `railway.toml`, and Nginx configs included
- Configure production environment variables before deployment
- Never commit real secrets to version control

## 🤝 Contributing

1. Create a feature branch from `main`
2. Keep changes focused and testable
3. Run `npm run typecheck`, `npm run test`, and `go test ./...`
4. Open a PR with a clear summary and screenshots for UI changes

## 📄 License

MIT — see [LICENSE](LICENSE).
