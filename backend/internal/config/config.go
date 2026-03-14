package config

import (
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	// Server
	Port string
	Env  string

	// Database
	DatabaseURL string

	// Redis
	RedisURL string

	// JWT
	JWTSecret string

	// Gemini AI
	GeminiAPIKey         string
	SupadataAPIKey       string
	GeminiRequestsPerMin int
	GeminiTokensPerMin   int
	GeminiConcurrentReqs int

	// Storage
	StorageType         string
	StoragePath         string
	ContentReadyTimeout time.Duration

	// SMTP
	SMTPHost string
	SMTPPort string
	SMTPUser string
	SMTPPass string
	SMTPFrom string

	// Frontend
	FrontendURL string

	// Proxy trust (for forwarded headers)
	TrustedProxyCIDRs []string

	// Google OAuth
	GoogleClientID     string
	GoogleClientSecret string
	GoogleRedirectURI  string
}

func Load() *Config {
	// Load .env file if it exists
	godotenv.Load()

	cfg := &Config{
		Port:                 getEnvOrDefault("PORT", "8080"),
		Env:                  getEnvOrDefault("ENV", "development"),
		DatabaseURL:          mustGetEnv("DATABASE_URL"),
		RedisURL:             mustGetEnv("REDIS_URL"),
		JWTSecret:            mustGetEnv("JWT_SECRET"),
		GeminiAPIKey:         mustGetEnv("GEMINI_API_KEY"),
		SupadataAPIKey:       os.Getenv("SUPADATA_API_KEY"),
		GeminiRequestsPerMin: getEnvAsIntOrDefault("GEMINI_REQUESTS_PER_MINUTE", 60),
		GeminiTokensPerMin:   getEnvAsIntOrDefault("GEMINI_TOKENS_PER_MINUTE", 1000000),
		GeminiConcurrentReqs: getEnvAsIntOrDefault("GEMINI_CONCURRENT_REQUESTS", 5),
		StorageType:          getEnvOrDefault("STORAGE_TYPE", "local"),
		StoragePath:          getEnvOrDefault("STORAGE_PATH", "./uploads"),
		ContentReadyTimeout:  time.Duration(getEnvAsIntOrDefault("CONTENT_READY_TIMEOUT_SECONDS", 120)) * time.Second,
		SMTPHost:             getEnvOrDefault("SMTP_HOST", ""),
		SMTPPort:             getEnvOrDefault("SMTP_PORT", "587"),
		SMTPUser:             getEnvOrDefault("SMTP_USER", ""),
		SMTPPass:             getEnvOrDefault("SMTP_PASS", ""),
		SMTPFrom:             getEnvOrDefault("SMTP_FROM", "noreply@lectura.app"),
		FrontendURL:          getEnvOrDefault("FRONTEND_URL", "http://localhost:5173"),
		TrustedProxyCIDRs:    getEnvAsCSV("TRUSTED_PROXY_CIDRS"),
		GoogleClientID:       getEnvOrDefault("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret:   getEnvOrDefault("GOOGLE_CLIENT_SECRET", ""),
		GoogleRedirectURI:    getEnvOrDefault("GOOGLE_REDIRECT_URI", ""),
	}

	return cfg
}

func mustGetEnv(key string) string {
	val := os.Getenv(key)
	if val == "" {
		log.Fatalf("required environment variable %s is not set", key)
	}
	return val
}

func getEnvOrDefault(key, defaultVal string) string {
	val := os.Getenv(key)
	if val == "" {
		return defaultVal
	}
	return val
}

func getEnvAsIntOrDefault(key string, defaultVal int) int {
	val := os.Getenv(key)
	if val == "" {
		return defaultVal
	}
	n, err := strconv.Atoi(val)
	if err != nil {
		return defaultVal
	}
	return n
}

func getEnvAsCSV(key string) []string {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return nil
	}

	parts := strings.Split(val, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		trimmed := strings.TrimSpace(p)
		if trimmed != "" {
			out = append(out, trimmed)
		}
	}

	if len(out) == 0 {
		return nil
	}

	return out
}
