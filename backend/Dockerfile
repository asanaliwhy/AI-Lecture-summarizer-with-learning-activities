# ─── Stage 1: Build ───
FROM golang:1.24.1-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /app

# Cache dependencies
COPY go.mod go.sum ./
RUN go mod download

# Build
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /lectura-server ./cmd/server/main.go

# ─── Stage 2: Run ───
FROM python:3.11-alpine

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=builder /lectura-server .
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/scripts/fetch_transcript.py ./scripts/fetch_transcript.py
COPY --from=builder /app/requirements.txt ./requirements.txt

RUN python3 -m pip install --no-cache-dir -r ./requirements.txt

# Create non-root user and writable runtime directories
RUN addgroup -S appgroup \
    && adduser -S appuser -G appgroup \
    && mkdir -p /app/uploads /app/scripts \
    && chown -R appuser:appgroup /app

USER appuser

EXPOSE 8081

CMD ["./lectura-server"]
