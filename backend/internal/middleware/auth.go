package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type contextKey string

const UserIDKey contextKey = "user_id"

type JWTAuth struct {
	Secret []byte
}

func NewJWTAuth(secret string) *JWTAuth {
	return &JWTAuth{Secret: []byte(secret)}
}

// GenerateAccessToken creates a JWT with 15 minute expiry
func (j *JWTAuth) GenerateAccessToken(userID uuid.UUID, email, plan string) (string, error) {
	claims := jwt.MapClaims{
		"user_id": userID.String(),
		"email":   email,
		"plan":    plan,
		"exp":     time.Now().Add(15 * time.Minute).Unix(),
		"iat":     time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(j.Secret)
}

// Middleware validates JWT and attaches user_id to context
func (j *JWTAuth) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Extract Authorization header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Missing authorization header", r)
			return
		}

		// Must be Bearer format
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Invalid authorization format", r)
			return
		}

		tokenStr := parts[1]

		// Parse and verify
		token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return j.Secret, nil
		})

		if err != nil {
			if strings.Contains(err.Error(), "expired") {
				writeError(w, http.StatusUnauthorized, "TOKEN_EXPIRED", "Token has expired", r)
			} else {
				writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Invalid token", r)
			}
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok || !token.Valid {
			writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Invalid token claims", r)
			return
		}

		userIDStr, ok := claims["user_id"].(string)
		if !ok {
			writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Invalid user ID in token", r)
			return
		}

		userID, err := uuid.Parse(userIDStr)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Invalid user ID format", r)
			return
		}

		// Attach user_id to context
		ctx := context.WithValue(r.Context(), UserIDKey, userID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// GetUserID extracts user_id from request context
func GetUserID(ctx context.Context) uuid.UUID {
	id, _ := ctx.Value(UserIDKey).(uuid.UUID)
	return id
}

func writeError(w http.ResponseWriter, status int, code, message string, r *http.Request) {
	requestID := r.Header.Get("X-Request-ID")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"error": map[string]interface{}{
			"code":       code,
			"message":    message,
			"request_id": requestID,
		},
	})
}
