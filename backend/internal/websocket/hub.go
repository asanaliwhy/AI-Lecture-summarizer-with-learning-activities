package websocket

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"

	"lectura-backend/internal/middleware"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

type Hub struct {
	mu          sync.RWMutex
	connections map[uuid.UUID][]*websocket.Conn
	redisClient *redis.Client
	cancelFuncs map[uuid.UUID]context.CancelFunc
}

func NewHub(redisClient *redis.Client, jwtSecret string) *Hub {
	_ = jwtSecret
	return &Hub{
		connections: make(map[uuid.UUID][]*websocket.Conn),
		redisClient: redisClient,
		cancelFuncs: make(map[uuid.UUID]context.CancelFunc),
	}
}

func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == uuid.Nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}

	h.registerConnection(userID, conn)

	// Keep connection alive and handle disconnect
	go func() {
		defer h.unregisterConnection(userID, conn)
		for {
			_, _, err := conn.ReadMessage()
			if err != nil {
				break
			}
		}
	}()
}

func (h *Hub) registerConnection(userID uuid.UUID, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.connections[userID] = append(h.connections[userID], conn)

	// Start pub/sub subscription if this is the first connection for this user
	if len(h.connections[userID]) == 1 {
		ctx, cancel := context.WithCancel(context.Background())
		h.cancelFuncs[userID] = cancel
		go h.subscribeToPubSub(ctx, userID)
	}

	log.Printf("WebSocket connected: user %s (total: %d)", userID, len(h.connections[userID]))
}

func (h *Hub) unregisterConnection(userID uuid.UUID, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()

	conn.Close()

	conns := h.connections[userID]
	for i, c := range conns {
		if c == conn {
			h.connections[userID] = append(conns[:i], conns[i+1:]...)
			break
		}
	}

	// If no more connections, cancel pub/sub
	if len(h.connections[userID]) == 0 {
		delete(h.connections, userID)
		if cancel, ok := h.cancelFuncs[userID]; ok {
			cancel()
			delete(h.cancelFuncs, userID)
		}
	}

	log.Printf("WebSocket disconnected: user %s", userID)
}

func (h *Hub) subscribeToPubSub(ctx context.Context, userID uuid.UUID) {
	channel := "user_updates:" + userID.String()
	pubsub := h.redisClient.Subscribe(ctx, channel)
	defer pubsub.Close()

	ch := pubsub.Channel()
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			h.broadcast(userID, []byte(msg.Payload))
		}
	}
}

func (h *Hub) broadcast(userID uuid.UUID, data []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for _, conn := range h.connections[userID] {
		conn.WriteMessage(websocket.TextMessage, data)
	}
}

// SendToUser sends a message directly to a user (for use outside pub/sub)
func (h *Hub) SendToUser(userID uuid.UUID, msg interface{}) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	h.broadcast(userID, data)
}
