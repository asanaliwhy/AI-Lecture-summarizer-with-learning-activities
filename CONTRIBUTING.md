# Contributing to Lectura

> By participating, you agree to maintain a respectful and inclusive environment.

Thanks for your interest in improving Lectura.

## 1) Development Setup

### Prerequisites
- Node.js 20+
- Go 1.24+
- Docker + Docker Compose

### Quick setup
```bash
git clone https://github.com/asanaliwhy/AI-Lecture-summarizer-with-learning-activities.git
cd AI-Lecture-summarizer-with-learning-activities

cp .env.example .env
cp .env.production backend/.env

# Start infra
docker compose up postgres redis -d

# Backend
cd backend
go mod download
go run cmd/server/main.go

# Frontend (new terminal)
cd ..
npm install
npm run dev
```

## 2) Branch Strategy

- Create feature branches from `main`.
- Naming examples:
  - `feat/summary-chat-improvements`
  - `fix/google-oauth-callback-timeout`
  - `docs/readme-railway-section`

## 3) Commit Message Style

Use clear conventional-style messages:
- `feat(auth): add remember-me session extension`
- `fix(router): handle websocket reconnect edge-case`
- `docs(readme): add env table for backend vars`

## 4) Code Quality Checklist

Before opening a PR, run:

### Frontend
```bash
npm run typecheck
npm run test:ci
npm run build
```

### Backend
```bash
cd backend
go test ./...
```

### Optional smoke
```bash
npm run smoke
```

## 5) Pull Request Checklist

- [ ] Scope is focused and minimal.
- [ ] Tests pass locally.
- [ ] Any config/env changes are documented.
- [ ] README/docs updated if behavior changed.
- [ ] Screenshots included for UI changes.

## 6) Reporting Issues

Please include:
- Steps to reproduce,
- Expected vs actual behavior,
- Browser/OS details (for frontend issues),
- API status codes and `X-Request-Id` where available.

## 7) Security

- Never commit secrets.
- Use environment variables for credentials.
- If secrets were exposed, rotate immediately.
