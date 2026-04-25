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
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata ffmpeg python3 py3-pip \
    && pip3 install --no-cache-dir --break-system-packages -U yt-dlp \
    && rm -rf /root/.cache/pip

WORKDIR /app

COPY --from=builder /lectura-server .
COPY --from=builder /app/migrations ./migrations

# Create non-root user and writable runtime directories
RUN addgroup -S appgroup \
    && adduser -S appuser -G appgroup \
	&& mkdir -p /app/uploads \
    && chown -R appuser:appgroup /app

USER appuser

EXPOSE 8081

CMD ["./lectura-server"]
