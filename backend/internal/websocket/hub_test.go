package websocket

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
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

func TestBroadcast_SlowClient_DoesNotBlockOtherClients(t *testing.T) {
	userID := uuid.New()
	fast := &Client{userID: userID, send: make(chan []byte, 1)}
	slow := &Client{userID: userID, send: make(chan []byte, 1)}
	slow.send <- []byte("pre-filled")

	h := &Hub{
		connections: map[uuid.UUID]map[*Client]bool{
			userID: {
				fast: true,
				slow: true,
			},
		},
		unregister: make(chan *Client, 1),
	}

	start := time.Now()
	h.broadcast(userID, []byte("hello"))
	if time.Since(start) > 100*time.Millisecond {
		t.Fatalf("broadcast should not block on slow client")
	}

	select {
	case got := <-fast.send:
		if string(got) != "hello" {
			t.Fatalf("expected fast client payload hello, got %q", string(got))
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatalf("expected fast client to receive message")
	}

	select {
	case c := <-h.unregister:
		if c != slow {
			t.Fatalf("expected slow client to be unregistered")
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatalf("expected slow client unregister signal")
	}
}

func TestWritePump_DeadConnection_ExitsCleanly(t *testing.T) {
	serverConn, peerConn, closeAll := newWebSocketPair(t)
	defer closeAll()

	h := &Hub{unregister: make(chan *Client, 1)}
	client := &Client{hub: h, conn: serverConn, send: make(chan []byte, 1), userID: uuid.New()}

	done := make(chan struct{})
	go func() {
		client.writePump()
		close(done)
	}()

	_ = peerConn.Close()
	_ = serverConn.Close()
	client.send <- []byte("payload")

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatalf("writePump did not exit after dead connection")
	}

	select {
	case c := <-h.unregister:
		if c != client {
			t.Fatalf("expected same client to be unregistered")
		}
	case <-time.After(time.Second):
		t.Fatalf("expected unregister signal from writePump")
	}
}

func TestReadPump_PongTimeout_UnregistersClient(t *testing.T) {
	serverConn, _, closeAll := newWebSocketPair(t)
	defer closeAll()

	originalPongWait := pongWait
	pongWait = 50 * time.Millisecond
	defer func() { pongWait = originalPongWait }()

	h := &Hub{unregister: make(chan *Client, 1)}
	client := &Client{hub: h, conn: serverConn, send: make(chan []byte, 1), userID: uuid.New()}

	go client.readPump()

	select {
	case c := <-h.unregister:
		if c != client {
			t.Fatalf("expected same client to be unregistered")
		}
	case <-time.After(time.Second):
		t.Fatalf("expected unregister due to pong timeout")
	}
}

func TestHub_UnregisterCleansUpEmptyUserEntry(t *testing.T) {
	h := &Hub{
		connections: make(map[uuid.UUID]map[*Client]bool),
		cancelFuncs: make(map[uuid.UUID]context.CancelFunc),
		register:    make(chan *Client, 1),
		unregister:  make(chan *Client, 1),
	}
	go h.run()

	userID := uuid.New()
	client := &Client{hub: h, userID: userID, send: make(chan []byte, 1)}
	h.register <- client

	if !waitForCondition(time.Second, func() bool {
		h.mu.RLock()
		defer h.mu.RUnlock()
		_, ok := h.connections[userID]
		return ok
	}) {
		t.Fatalf("expected user entry to exist after register")
	}

	h.unregister <- client

	if !waitForCondition(time.Second, func() bool {
		h.mu.RLock()
		defer h.mu.RUnlock()
		_, ok := h.connections[userID]
		return !ok
	}) {
		t.Fatalf("expected user entry to be removed after unregister")
	}
}

func waitForCondition(timeout time.Duration, check func() bool) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if check() {
			return true
		}
		time.Sleep(10 * time.Millisecond)
	}
	return false
}

func newWebSocketPair(t *testing.T) (*websocket.Conn, *websocket.Conn, func()) {
	t.Helper()

	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	serverConnCh := make(chan *websocket.Conn, 1)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Errorf("upgrade failed: %v", err)
			return
		}
		serverConnCh <- conn
	}))

	dialURL := "ws" + strings.TrimPrefix(server.URL, "http")
	peerConn, _, err := websocket.DefaultDialer.Dial(dialURL, nil)
	if err != nil {
		server.Close()
		t.Fatalf("dial failed: %v", err)
	}

	var serverConn *websocket.Conn
	select {
	case serverConn = <-serverConnCh:
	case <-time.After(time.Second):
		_ = peerConn.Close()
		server.Close()
		t.Fatalf("timed out waiting for server websocket conn")
	}

	cleanup := func() {
		_ = serverConn.Close()
		_ = peerConn.Close()
		server.Close()
	}

	return serverConn, peerConn, cleanup
}
