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
FROM python:3.11-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /lectura-server .
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/requirements.txt ./requirements.txt

RUN python3 -m pip install --no-cache-dir -r ./requirements.txt

# Create uploads directory
RUN mkdir -p /app/uploads

EXPOSE 8081

CMD ["./lectura-server"]
