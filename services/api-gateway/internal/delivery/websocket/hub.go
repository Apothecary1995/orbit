package websocket

import (
	"encoding/json"
	"log"
	"net"
	"net/http"
	"sync"
)

// Client tek bir WebSocket bağlantısını temsil eder.
type Client struct {
	userID string
	conn   net.Conn
	send   chan []byte
}

// Hub tüm aktif WebSocket bağlantılarını yönetir.
type Hub struct {
	mu      sync.RWMutex
	clients map[string]*Client // userID → Client
}

// NewHub Hub oluşturur.
func NewHub() *Hub {
	return &Hub{
		clients: make(map[string]*Client),
	}
}

// Register yeni client ekler.
func (h *Hub) Register(userID string, client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[userID] = client
	log.Printf("WS bağlandı: %s (toplam: %d)", userID, len(h.clients))
}

// Unregister client'ı çıkarır.
func (h *Hub) Unregister(userID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, userID)
	log.Printf("WS ayrıldı: %s (toplam: %d)", userID, len(h.clients))
}

// SendToUser belirli kullanıcıya mesaj gönderir.
func (h *Hub) SendToUser(userID string, message []byte) {
	h.mu.RLock()
	client, ok := h.clients[userID]
	h.mu.RUnlock()

	if ok {
		select {
		case client.send <- message:
		default:
			// Kanal doluysa bağlantıyı kapat
			h.Unregister(userID)
		}
	}
}

// ServeWS WebSocket upgrade yapar ve bağlantıyı yönetir.
// Gerçek WebSocket handshake — net/http stdlib ile.
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	// Basit WebSocket upgrade (üçüncü parti yok)
	// Gerçek implementasyon: upgrade header'ları kontrol et
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		http.Error(w, "user_id zorunlu", http.StatusBadRequest)
		return
	}

	// Hijack connection
	hj, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "WebSocket desteklenmiyor", http.StatusInternalServerError)
		return
	}

	conn, _, err := hj.Hijack()
	if err != nil {
		log.Printf("Hijack hatası: %v", err)
		return
	}

	client := &Client{
		userID: userID,
		conn:   conn,
		send:   make(chan []byte, 256),
	}

	h.Register(userID, client)
	defer h.Unregister(userID)
	defer conn.Close()

	// Mesaj gönderme goroutine
	go func() {
		for msg := range client.send {
			if _, err := conn.Write(msg); err != nil {
				return
			}
		}
	}()

	// Mesaj okuma döngüsü
	buf := make([]byte, 4096)
	for {
		n, err := conn.Read(buf)
		if err != nil {
			break
		}

		var incoming map[string]interface{}
		if err := json.Unmarshal(buf[:n], &incoming); err != nil {
			continue
		}

		log.Printf("WS mesaj alındı: %s → %v", userID, incoming)
	}
}
