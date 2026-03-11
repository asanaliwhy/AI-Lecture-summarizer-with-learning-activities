package middleware

import (
	"net/url"
	"net/http"
	"strings"

	"github.com/google/uuid"
)

// RequestID adds a unique request ID to each request
func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID := strings.TrimSpace(r.Header.Get("X-Request-ID"))
		if requestID != "" {
			if _, err := uuid.Parse(requestID); err != nil {
				requestID = uuid.New().String()
			}
		} else {
			requestID = uuid.New().String()
		}
		w.Header().Set("X-Request-ID", requestID)
		r.Header.Set("X-Request-ID", requestID)
		next.ServeHTTP(w, r)
	})
}

// CORS handles cross-origin requests
func CORS(frontendURL string) func(http.Handler) http.Handler {
	allowedOrigins := make([]string, 0)
	seen := make(map[string]struct{})
	for _, origin := range strings.Split(frontendURL, ",") {
		normalized := normalizeOrigin(origin)
		if normalized == "" {
			continue
		}
		if _, exists := seen[normalized]; exists {
			continue
		}
		seen[normalized] = struct{}{}
		allowedOrigins = append(allowedOrigins, normalized)
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			requestOrigin := normalizeOrigin(r.Header.Get("Origin"))
			allowOrigin := ""

			if requestOrigin != "" {
				for _, origin := range allowedOrigins {
					if origin == "*" || origin == requestOrigin {
						allowOrigin = requestOrigin
						break
					}
				}
			}

			if allowOrigin == "" && requestOrigin == "" && len(allowedOrigins) > 0 && allowedOrigins[0] != "*" {
				allowOrigin = allowedOrigins[0]
			}

			if allowOrigin != "" {
				w.Header().Set("Access-Control-Allow-Origin", allowOrigin)
				w.Header().Set("Vary", "Origin")
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Max-Age", "86400")

			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func normalizeOrigin(origin string) string {
	trimmed := strings.TrimSpace(origin)
	if trimmed == "" {
		return ""
	}

	trimmed = strings.TrimSuffix(trimmed, "/")
	if trimmed == "*" {
		return "*"
	}

	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return strings.ToLower(trimmed)
	}

	return strings.ToLower(parsed.Scheme + "://" + parsed.Host)
}
