package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRateLimiter_UsesXRealIP(t *testing.T) {
	rl := NewRateLimiter(1, time.Minute)
	handler := rl.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	makeReq := func(realIP string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "172.18.0.2:54321"
		req.Header.Set("X-Real-IP", realIP)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		return rr
	}

	if rr := makeReq("203.0.113.10"); rr.Code != http.StatusOK {
		t.Fatalf("expected first request from ip1 to pass, got %d", rr.Code)
	}
	if rr := makeReq("203.0.113.11"); rr.Code != http.StatusOK {
		t.Fatalf("expected first request from ip2 to pass, got %d", rr.Code)
	}
	if rr := makeReq("203.0.113.10"); rr.Code != http.StatusTooManyRequests {
		t.Fatalf("expected second request from ip1 to be rate limited, got %d", rr.Code)
	}
}

func TestRateLimiter_FallsBackToRemoteAddr(t *testing.T) {
	rl := NewRateLimiter(1, time.Minute)
	handler := rl.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	makeReq := func(remoteAddr string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = remoteAddr
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		return rr
	}

	if rr := makeReq("198.51.100.10:1111"); rr.Code != http.StatusOK {
		t.Fatalf("expected first request to pass, got %d", rr.Code)
	}
	if rr := makeReq("198.51.100.10:2222"); rr.Code != http.StatusTooManyRequests {
		t.Fatalf("expected second request from same host to be rate limited, got %d", rr.Code)
	}
	if rr := makeReq("198.51.100.11:3333"); rr.Code != http.StatusOK {
		t.Fatalf("expected different remote host to have separate counter, got %d", rr.Code)
	}
}
