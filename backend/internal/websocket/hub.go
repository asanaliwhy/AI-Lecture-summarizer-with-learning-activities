package websocket

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
)

var (
	writeWait            = 10 * time.Second
	pongWait             = 60 * time.Second
	maxMessageSize int64 = 512
	sendBufferSize       = 256
)

func pingPeriod() time.Duration {
	return (pongWait * 9) / 10
}

type Client struct {
	hub    *Hub
	conn   *websocket.Conn
	send   chan []byte
	userID uuid.UUID
}

type Hub struct {
	mu          sync.RWMutex
	connections map[uuid.UUID]map[*Client]bool
	redisClient *redis.Client
	cancelFuncs map[uuid.UUID]context.CancelFunc
	frontendURL string
	register    chan *Client
	unregister  chan *Client
}

func NewHub(redisClient *redis.Client, frontendURL string) *Hub {
	h := &Hub{
		connections: make(map[uuid.UUID]map[*Client]bool),
		redisClient: redisClient,
		cancelFuncs: make(map[uuid.UUID]context.CancelFunc),
		frontendURL: frontendURL,
		register:    make(chan *Client, 1024),
		unregister:  make(chan *Client, 1024),
	}
	go h.run()
	return h
}

func (h *Hub) run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			if h.connections[client.userID] == nil {
				h.connections[client.userID] = make(map[*Client]bool)
			}
			h.connections[client.userID][client] = true

			if len(h.connections[client.userID]) == 1 && h.redisClient != nil {
				ctx, cancel := context.WithCancel(context.Background())
				h.cancelFuncs[client.userID] = cancel
				go h.subscribeToPubSub(ctx, client.userID)
			}

			total := len(h.connections[client.userID])
			h.mu.Unlock()
			log.Printf("WebSocket connected: user %s (total: %d)", client.userID, total)

		case client := <-h.unregister:
			h.mu.Lock()
			clients, ok := h.connections[client.userID]
			if ok {
				if _, exists := clients[client]; exists {
					delete(clients, client)
					close(client.send)
				}

				if len(clients) == 0 {
					delete(h.connections, client.userID)
					if cancel, ok := h.cancelFuncs[client.userID]; ok {
						cancel()
						delete(h.cancelFuncs, client.userID)
					}
				}
			}
			h.mu.Unlock()

			if client.conn != nil {
				_ = client.conn.Close()
			}
			log.Printf("WebSocket disconnected: user %s", client.userID)
		}
	}
}

func (h *Hub) enqueueUnregister(client *Client) {
	select {
	case h.unregister <- client:
	default:
		go func() {
			h.unregister <- client
		}()
	}
}

func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	log.Printf("WebSocket upgrade request: origin=%s remoteAddr=%s ticket=%s",
		r.Header.Get("Origin"), r.RemoteAddr, r.URL.Query().Get("ticket"))

	upgrader := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			origin := r.Header.Get("Origin")
			if origin == "" {
				log.Printf("WebSocket origin check: empty origin, allowing")
				return true
			}

			allowed := strings.Split(h.frontendURL, ",")
			for _, a := range allowed {
				if strings.TrimSpace(a) == origin {
					log.Printf("WebSocket origin check PASS: %s", origin)
					return true
				}
			}

			log.Printf("WebSocket origin check FAIL: got %q, allowed %q", origin, h.frontendURL)
			return false
		},
	}

	ticket := r.URL.Query().Get("ticket")
	if ticket == "" {
		http.Error(w, "missing ticket", http.StatusUnauthorized)
		return
	}

	key := fmt.Sprintf("ws_ticket:%s", ticket)
	userIDStr, err := h.redisClient.GetDel(r.Context(), key).Result()
	if err != nil {
		http.Error(w, "invalid or expired ticket", http.StatusUnauthorized)
		return
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		http.Error(w, "invalid user ID in ticket", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}

	client := &Client{
		hub:    h,
		conn:   conn,
		send:   make(chan []byte, sendBufferSize),
		userID: userID,
	}

	h.register <- client

	go client.writePump()
	go client.readPump()
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
	clientsByUser := h.connections[userID]
	clients := make([]*Client, 0, len(clientsByUser))
	for client := range clientsByUser {
		clients = append(clients, client)
	}
	h.mu.RUnlock()

	for _, client := range clients {
		select {
		case client.send <- data:
		default:
			h.enqueueUnregister(client)
		}
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

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod())
	defer func() {
		ticker.Stop()
		c.hub.enqueueUnregister(c)
	}()

	for {
		select {
		case msg, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}

		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) readPump() {
	defer func() {
		c.hub.enqueueUnregister(c)
	}()

	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongWait))
	})

	for {
		if _, _, err := c.conn.ReadMessage(); err != nil {
			break
		}
	}
}
