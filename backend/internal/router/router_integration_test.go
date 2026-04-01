package router

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"lectura-backend/internal/handlers"
	"lectura-backend/internal/middleware"
	"lectura-backend/internal/websocket"
)

func buildTestRouter() http.Handler {
	jwtAuth := middleware.NewJWTAuth("test-jwt-secret")
	wsHub := websocket.NewHub(nil, "https://app.example.com")

	return New(
		jwtAuth,
		(*handlers.AuthHandler)(nil),
		(*handlers.WSTicketHandler)(nil),
		(*handlers.ContentHandler)(nil),
		(*handlers.SummaryHandler)(nil),
		(*handlers.PresentationHandler)(nil),
		(*handlers.QuizHandler)(nil),
		(*handlers.FlashcardHandler)(nil),
		(*handlers.StudySessionHandler)(nil),
		(*handlers.DashboardHandler)(nil),
		(*handlers.LibraryHandler)(nil),
		(*handlers.UserHandler)(nil),
		(*handlers.JobHandler)(nil),
		(*handlers.ChatHandler)(nil),
		wsHub,
		"https://app.example.com",
		nil,
	)
}

func errorCodeFromRouterResponse(t *testing.T, rr *httptest.ResponseRecorder) string {
	t.Helper()

	var payload map[string]interface{}
	if err := json.NewDecoder(rr.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode response body: %v", err)
	}

	errObj, ok := payload["error"].(map[string]interface{})
	if !ok {
		t.Fatalf("response body missing error object: %#v", payload)
	}

	code, ok := errObj["code"].(string)
	if !ok {
		t.Fatalf("response error missing code: %#v", errObj)
	}

	return code
}

func TestRouterNew_HealthEndpointsAndRequestID(t *testing.T) {
	r := buildTestRouter()

	for _, path := range []string{"/health", "/api/v1/health"} {
		t.Run(path, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, path, nil)
			rr := httptest.NewRecorder()

			r.ServeHTTP(rr, req)

			if rr.Code != http.StatusOK {
				t.Fatalf("expected %d, got %d", http.StatusOK, rr.Code)
			}
			if rr.Header().Get("X-Request-ID") == "" {
				t.Fatalf("expected X-Request-ID header to be set")
			}
			if rr.Header().Get("Access-Control-Allow-Origin") != "https://app.example.com" {
				t.Fatalf("unexpected Access-Control-Allow-Origin: %q", rr.Header().Get("Access-Control-Allow-Origin"))
			}
		})
	}
}

func TestRouterNew_CORSPreflightShortCircuit(t *testing.T) {
	r := buildTestRouter()
	req := httptest.NewRequest(http.MethodOptions, "/api/v1/health", nil)
	req.Header.Set("Origin", "https://app.example.com")
	req.Header.Set("Access-Control-Request-Method", "GET")
	rr := httptest.NewRecorder()

	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Fatalf("expected %d, got %d", http.StatusNoContent, rr.Code)
	}
	if rr.Header().Get("Access-Control-Allow-Origin") != "https://app.example.com" {
		t.Fatalf("unexpected Access-Control-Allow-Origin: %q", rr.Header().Get("Access-Control-Allow-Origin"))
	}
}

func TestRouterNew_ProtectedRouteRequiresJWT(t *testing.T) {
	r := buildTestRouter()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/summaries/", nil)
	rr := httptest.NewRecorder()

	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected %d, got %d", http.StatusUnauthorized, rr.Code)
	}
	if code := errorCodeFromRouterResponse(t, rr); code != "UNAUTHORIZED" {
		t.Fatalf("expected UNAUTHORIZED, got %q", code)
	}
}

func TestRouterNew_PublicAuthRouteWired(t *testing.T) {
	r := buildTestRouter()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewBufferString("{"))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected %d, got %d", http.StatusBadRequest, rr.Code)
	}
	if code := errorCodeFromRouterResponse(t, rr); code != "VALIDATION_ERROR" {
		t.Fatalf("expected VALIDATION_ERROR, got %q", code)
	}
}
