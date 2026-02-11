# ─── Stage 1: Build ───
FROM golang:1.23-alpine AS builder

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

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=builder /lectura-server .
COPY --from=builder /app/internal/database/migrations ./internal/database/migrations

# Create uploads directory
RUN mkdir -p /app/uploads

EXPOSE 8081

CMD ["./lectura-server"]
