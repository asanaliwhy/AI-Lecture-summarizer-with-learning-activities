<div align="center">

# Lectura

### AI-Powered Lecture Summarizer with Learning Activities

Paste a YouTube link or upload a file — get structured notes, adaptive quizzes,<br>
spaced-repetition flashcards, and presentation decks in seconds.

[![React](https://img.shields.io/badge/React_18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Go](https://img.shields.io/badge/Go_1.24-00ADD8?style=for-the-badge&logo=go&logoColor=white)](https://go.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io)
[![Gemini](https://img.shields.io/badge/Gemini_API-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white)](https://ai.google.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

<br>

<img src="docs/images/landing-page.png" alt="Lectura Landing Page" width="100%">

</div>

---

## 📋 Table of Contents

- [Key Features](#-key-features)
- [Screenshots](#-screenshots)
- [Product Flow](#-product-flow)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Repository Structure](#-repository-structure)
- [Getting Started](#-getting-started)
- [API Surface](#-api-surface)
- [Scripts](#-scripts)
- [Deployment](#-deployment)
- [Contributing](#-contributing)
- [License](#-license)

---

## ✨ Key Features

### 📝 Multi-Format Summaries

Paste a YouTube URL or upload a document and get structured notes in **four distinct formats** — each engineered for a different kind of thinking:

| Format | Purpose | Best For |
|:---|:---|:---|
| **Cornell Method** | Two-column cue/note layout with synthesis summary | Exam prep & long-term retention |
| **Bullet Points** | Structured breakdowns with definitions and examples | Fast scanning & quick review |
| **Paragraph** | Flowing prose with subheadings and closing analysis | Essay preparation & deep comprehension |
| **Smart Summary** | Key concepts with real-world applications and data tables | Context-rich understanding |

---

### 🎯 Adaptive Quizzes

AI-generated quizzes with **multiple-choice** and **true/false** questions at three difficulty levels. Each question includes a timer, optional hints, and detailed explanations for every answer — turning passive review into active recall.

<table>
<tr>
<td><strong>Easy</strong> — Recall-level questions on key definitions and facts</td>
</tr>
<tr>
<td><strong>Medium</strong> — Application-level questions requiring understanding of relationships</td>
</tr>
<tr>
<td><strong>Hard</strong> — Analysis-level questions that test deeper critical thinking</td>
</tr>
</table>

---

### 🧠 Spaced-Repetition Flashcards

Flashcard decks built directly from your summaries using the **SM-2 algorithm**. Rate difficulty after each review and let the system schedule optimal review intervals. Mnemonics and contextual examples are generated automatically to reinforce understanding.

---

### 🖥️ AI Presentation Generation

Turn any lecture into a polished, structured slide deck — ready to present or export.

| Capability | Details |
|:---|:---|
| **Configurable generation** | Choose slide count (Short / Medium / Large), text style (Formal, Academic, Conversational), and language (EN, KZ, RU, FR, ES) |
| **Theme engine** | 20+ curated themes across Light, Dark, Warm, and Cool categories with gradient backgrounds and matched typography |
| **Rich slide types** | Title, section, content with bullets, two-column comparisons, stats grids, prose, and summary/takeaway layouts |
| **Inline editing** | Click any text on a slide to edit in place — changes auto-save with debounced persistence |
| **Present mode** | Immersive fullscreen presentation with keyboard navigation (←→ arrows, Esc to exit) |
| **Export** | High-fidelity **PDF** and **PPTX** exports that match on-screen rendering pixel-for-pixel |
| **Thumbnail sidebar** | Visual thumbnail panel synced to the active slide for quick navigation |

---

### 💬 Ask AI Chat

Context-grounded Q&A about your summaries. The AI stays anchored to the source material and **refuses to drift off-topic** — no hallucinations, just verified answers from your content.

---

### 📊 Dashboard & Analytics

Track your learning with **daily streaks**, activity stats, recent items, and **weekly goal tracking** across all resource types.

---

### 📚 Unified Library

Search, filter, sort, and favorite all summaries, quizzes, flashcards, and presentations in a single, unified interface.

---

## 📸 Screenshots

<details open>
<summary><strong>🔐 Authentication</strong></summary>
<br>
<p align="center">
<img src="docs/images/login-page.png" alt="Login Page" width="48%">&nbsp;&nbsp;
<img src="docs/images/register-page.png" alt="Register Page" width="48%">
</p>
</details>

<details open>
<summary><strong>📄 Content & Summary</strong></summary>
<br>
<p align="center">
<img src="docs/images/content-upload.png" alt="Content Upload" width="48%">&nbsp;&nbsp;
<img src="docs/images/summary-result-page.png" alt="Summary Result" width="48%">
</p>
</details>

<details open>
<summary><strong>🎯 Learning Activities</strong></summary>
<br>
<p align="center">
<img src="docs/images/quiz-page.png" alt="Quiz Page" width="48%">&nbsp;&nbsp;
<img src="docs/images/flashcard-study-page.png" alt="Flashcard Study" width="48%">
</p>
</details>

<details open>
<summary><strong>🖥️ Presentation Generation</strong></summary>
<br>
<p align="center">
<img src="docs/images/presentation-config.png" alt="Presentation Configuration" width="100%">
</p>
<p align="center">
<img src="docs/images/presentation-viewer.png" alt="Presentation Viewer" width="48%">&nbsp;&nbsp;
<img src="docs/images/presentation-present-mode.png" alt="Present Mode" width="48%">
</p>
</details>

<details open>
<summary><strong>📊 Navigation & Insights</strong></summary>
<br>
<p align="center">
<img src="docs/images/library-page.png" alt="Library" width="32%">&nbsp;
<img src="docs/images/dashboard.png" alt="Dashboard" width="32%">&nbsp;
<img src="docs/images/settings-page.png" alt="Settings" width="32%">
</p>
</details>

---

## 🔄 Product Flow

```mermaid
flowchart LR
  A["📎 Paste YouTube URL\nor upload file"] --> B["🤖 AI processes\ncontent"]
  B --> C["📝 Multi-format\nsummary"]
  C --> D["🎯 Quiz"]
  C --> E["🧠 Flashcards"]
  C --> F["🖥️ Presentation"]
  F --> G["✏️ Edit · 🎬 Present · 📤 Export"]
  D --> H["📊 Dashboard\nanalytics"]
  E --> H
  G --> H
```

---

## 🛠 Tech Stack

<table>
<tr>
<td width="33%" valign="top">

### Frontend
- **React 18** + TypeScript
- **Vite** for build tooling
- **React Router** for routing
- **TanStack Query** for server-state
- **Tailwind CSS** for styling
- **Vitest** for testing

</td>
<td width="33%" valign="top">

### Backend
- **Go 1.24** with Chi router
- **PostgreSQL** via pgx driver
- **Redis** for job queues & cache
- **Gorilla WebSocket** for live updates
- **Google Gemini API** for AI generation
- **Unsplash API** for imagery

</td>
<td width="33%" valign="top">

### Infrastructure
- **Docker Compose** for local dev
- **Railway** deployment configs
- **Nginx** reverse proxy + SSL
- **Auto-migrations** on startup

</td>
</tr>
</table>

---

## ⚙️ Architecture

```mermaid
flowchart LR
  subgraph Client
    A[React SPA]
  end
  subgraph API
    B[Chi Router + Handlers]
  end
  subgraph Workers
    D[Job Worker Pool]
  end
  subgraph Storage
    F[(PostgreSQL)]
    G[(Redis Queue)]
  end
  subgraph External
    E[Gemini API]
    U[Unsplash API]
  end

  A -- "REST API" --> B
  A <-- "WebSocket" --> B
  B --> G
  G --> D
  D --> E
  D --> U
  D --> F
  B --> F
```

---

## 📂 Repository Structure

```
.
├── src/                              # React frontend
│   ├── pages/                        # Route-level page components
│   ├── components/
│   │   ├── presentation/             # SlideViewer, SlideRenderer, ThemeSelector
│   │   ├── layout/                   # AppLayout, Header, Sidebar
│   │   └── ui/                       # Button, Card, Toast, Dialog, etc.
│   ├── lib/                          # API client, types, themes, export utils
│   └── hooks/                        # Custom React hooks
├── backend/
│   ├── cmd/server/                   # Main entrypoint
│   ├── internal/
│   │   ├── handlers/                 # HTTP handlers per domain
│   │   ├── services/                 # Gemini AI, auth, email, YouTube
│   │   ├── repository/               # Data access layer
│   │   ├── worker/                   # Async AI generation workers
│   │   ├── router/                   # Route composition
│   │   ├── middleware/               # Auth, CORS, logging
│   │   ├── models/                   # Domain models
│   │   └── websocket/                # Real-time progress updates
│   └── migrations/                   # SQL schema migrations
├── docs/images/                      # README screenshots
├── docker-compose.yml
├── Dockerfile / Dockerfile.railway
└── nginx.conf / nginx.ssl.conf
```

---

## 🚀 Getting Started

### Prerequisites

| Requirement | Version |
|:---|:---|
| Node.js | 18+ |
| Go | 1.24+ |
| Docker Desktop | Latest (recommended) |

### 1. Clone the repository

```bash
git clone https://github.com/asanaliwhy/AI-Lecture-summarizer-with-learning-activities.git
cd AI-Lecture-summarizer-with-learning-activities
```

### 2. Configure environment

<details>
<summary><strong>Frontend <code>.env</code></strong> (repo root)</summary>

```env
VITE_API_BASE_URL=http://localhost:8082/api/v1
VITE_GOOGLE_CLIENT_ID=your_google_client_id
VITE_GOOGLE_REDIRECT_URI=http://localhost:5173/auth/callback
```
</details>

<details>
<summary><strong>Backend <code>backend/.env</code></strong></summary>

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
</details>

> **Tip:** Copy from `.env.example` and `backend/.env.example` to get started quickly.

### 3. Start services

```bash
# Start Postgres and Redis
docker compose up -d postgres redis

# Start backend (auto-applies migrations)
cd backend
go run ./cmd/server

# Start frontend (from repo root)
npm install
npm run dev
```

### 4. Open in browser

| Service | URL |
|:---|:---|
| Frontend | [`http://localhost:5173`](http://localhost:5173) |
| Backend API | [`http://localhost:8082/api/v1`](http://localhost:8082/api/v1) |
| Health Check | [`http://localhost:8082/api/v1/health`](http://localhost:8082/api/v1/health) |

---

## 📡 API Surface

| Domain | Endpoints |
|:---|:---|
| **Auth** | Login, register, Google OAuth, email verification, password change |
| **Content** | YouTube URL validation, file upload, transcript extraction |
| **Summary** | Generate (4 formats), list, detail, favorite, AI chat |
| **Quiz** | Generate (3 difficulties), attempt, results, favorite |
| **Flashcards** | Generate, deck management, spaced-repetition study, favorite |
| **Presentation** | Generate, list, view, inline slide editing, delete, theme, PDF/PPTX export, favorite |
| **Dashboard** | Stats, recent activity, streak, weekly goals, notifications |
| **Library** | Unified cross-resource search, filter, sort |
| **Jobs / WS** | Async processing queue, real-time WebSocket progress |

---

## 📋 Scripts

| Command | Location | Description |
|:---|:---|:---|
| `npm run dev` | Root | Start Vite dev server |
| `npm run build` | Root | TypeScript check + production build |
| `npm run test` | Root | Run Vitest test suite |
| `npm run typecheck` | Root | Strict TypeScript checks |
| `go run ./cmd/server` | `backend/` | Start backend server |
| `go test ./...` | `backend/` | Run all backend tests |

---

## 🚢 Deployment

- Production-ready `Dockerfile`, `Dockerfile.railway`, `railway.toml`, and Nginx configs included
- Configure production environment variables before deployment
- Backend auto-applies database migrations on startup
- **Never** commit real secrets to version control

---

## 🤝 Contributing

1. Create a feature branch from `main`
2. Keep changes focused and testable
3. Run `npm run typecheck`, `npm run test`, and `go test ./...`
4. Open a PR with a clear summary and screenshots for UI changes

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">
<br>
<strong>Built with ❤️ for students who want to study smarter</strong>
<br><br>
<a href="https://github.com/asanaliwhy/AI-Lecture-summarizer-with-learning-activities">⭐ Star this repo</a> if you found it useful!
</div>
