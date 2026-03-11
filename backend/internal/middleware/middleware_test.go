package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
)

func TestRequestID_NoHeader_GeneratesUUID(t *testing.T) {
	handler := RequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	got := rr.Header().Get("X-Request-ID")
	if got == "" {
		t.Fatalf("expected X-Request-ID response header to be set")
	}
	if _, err := uuid.Parse(got); err != nil {
		t.Fatalf("expected generated request ID to be valid UUID, got %q: %v", got, err)
	}
}

func TestRequestID_ValidUUID_Accepted(t *testing.T) {
	expected := uuid.New().String()
	handler := RequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("X-Request-ID"); got != expected {
			t.Fatalf("expected request header X-Request-ID=%q, got %q", expected, got)
		}
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("X-Request-ID", expected)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if got := rr.Header().Get("X-Request-ID"); got != expected {
		t.Fatalf("expected response X-Request-ID=%q, got %q", expected, got)
	}
}

func TestRequestID_InjectionAttempt_Rejected(t *testing.T) {
	malicious := `{"injected":"payload"}`
	handler := RequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("X-Request-ID", malicious)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	got := rr.Header().Get("X-Request-ID")
	if got == malicious {
		t.Fatalf("expected malicious request ID to be rejected")
	}
	if _, err := uuid.Parse(got); err != nil {
		t.Fatalf("expected fallback request ID to be valid UUID, got %q: %v", got, err)
	}
}

func TestRequestID_TooLong_Rejected(t *testing.T) {
	tooLong := strings.Repeat("a", 200)
	handler := RequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("X-Request-ID", tooLong)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	got := rr.Header().Get("X-Request-ID")
	if got == tooLong {
		t.Fatalf("expected overly long request ID to be rejected")
	}
	if _, err := uuid.Parse(got); err != nil {
		t.Fatalf("expected fallback request ID to be valid UUID, got %q: %v", got, err)
	}
}
