package websocket

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/redis/go-redis/v9"
)

func TestHandleWebSocket_MissingTicket_Unauthorized(t *testing.T) {
	hub := NewHub(nil, "http://localhost:5173")

	req := httptest.NewRequest(http.MethodGet, "/api/v1/ws", nil)
	rr := httptest.NewRecorder()

	hub.HandleWebSocket(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected %d, got %d", http.StatusUnauthorized, rr.Code)
	}
}

func TestHandleWebSocket_InvalidTicket_Unauthorized(t *testing.T) {
	redisClient := redis.NewClient(&redis.Options{Addr: "127.0.0.1:0"})
	defer redisClient.Close()

	hub := NewHub(redisClient, "http://localhost:5173")

	req := httptest.NewRequest(http.MethodGet, "/api/v1/ws?ticket=invalid", nil)
	rr := httptest.NewRecorder()

	hub.HandleWebSocket(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected %d, got %d", http.StatusUnauthorized, rr.Code)
	}
}
