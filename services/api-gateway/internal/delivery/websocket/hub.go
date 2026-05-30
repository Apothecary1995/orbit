package websocket

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
)

type Client struct {
	userID  string
	conn    *Conn
	convIDs []string
	send    chan []byte
}

type Hub struct {
	mu          sync.RWMutex
	clients     map[string]*Client
	convMembers map[string][]string
}

type OutgoingMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

func NewHub() *Hub {
	return &Hub{
		clients:     make(map[string]*Client),
		convMembers: make(map[string][]string),
	}
}

func (h *Hub) Register(client *Client) {
	online, _ := json.Marshal(OutgoingMessage{
		Type:    "presence",
		Payload: map[string]interface{}{"user_id": client.userID, "online": true},
	})

	h.mu.Lock()
	h.clients[client.userID] = client
	for id, c := range h.clients {
		if id != client.userID {
			select {
			case c.send <- online:
			default:
			}
		}
	}
	h.mu.Unlock()
	log.Printf("WS bağlandı: %s (toplam: %d)", client.userID, len(h.clients))
}

func (h *Hub) Unregister(userID string) {
	offline, _ := json.Marshal(OutgoingMessage{
		Type:    "presence",
		Payload: map[string]interface{}{"user_id": userID, "online": false},
	})

	h.mu.Lock()
	if c, ok := h.clients[userID]; ok {
		close(c.send)
		delete(h.clients, userID)
	}
	for _, c := range h.clients {
		select {
		case c.send <- offline:
		default:
		}
	}
	h.mu.Unlock()
	log.Printf("WS ayrıldı: %s (toplam: %d)", userID, len(h.clients))
}

// GetOnlineUserIDs returns a snapshot of currently connected user IDs, excluding the caller.
func (h *Hub) GetOnlineUserIDs(excludeUserID string) []string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	ids := make([]string, 0, len(h.clients))
	for id := range h.clients {
		if id != excludeUserID {
			ids = append(ids, id)
		}
	}
	return ids
}

func (h *Hub) BroadcastToConv(convID string, message interface{}) {
	data, err := json.Marshal(OutgoingMessage{Type: "new_message", Payload: message})
	if err != nil {
		return
	}
	h.mu.RLock()
	memberIDs := h.convMembers[convID]
	h.mu.RUnlock()

	log.Printf("BroadcastToConv: conv=%s üyeler=%v", convID, memberIDs)

	for _, userID := range memberIDs {
		h.mu.RLock()
		client, ok := h.clients[userID]
		h.mu.RUnlock()
		if ok {
			select {
			case client.send <- data:
				log.Printf("Mesaj gönderildi: %s", userID)
			default:
				log.Printf("Mesaj gönderilemedi (kanal dolu): %s", userID)
			}
		}
	}
}

func (h *Hub) SendToUser(userID string, msg interface{}) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	h.mu.RLock()
	client, ok := h.clients[userID]
	h.mu.RUnlock()
	if ok {
		select {
		case client.send <- data:
		default:
		}
	}
}

func (h *Hub) SetConvMembers(convID string, memberIDs []string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.convMembers[convID] = memberIDs
	log.Printf("SetConvMembers: conv=%s üyeler=%v", convID, memberIDs)
}

func (h *Hub) HandleRedisMessage(channel string, payload []byte) {
	if len(channel) < 6 {
		return
	}
	convID := channel[5:]
	var msg interface{}
	if err := json.Unmarshal(payload, &msg); err != nil {
		return
	}
	h.BroadcastToConv(convID, msg)
}

func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		http.Error(w, "user_id zorunlu", http.StatusBadRequest)
		return
	}

	wsConn, err := Upgrade(w, r)
	if err != nil {
		log.Printf("WS upgrade hatası: %v", err)
		return
	}

	client := &Client{
		userID: userID,
		conn:   wsConn,
		send:   make(chan []byte, 256),
	}

	h.Register(client)
	defer h.Unregister(userID)

	go func() {
		for msg := range client.send {
			if err := wsConn.WriteMessage(OpText, msg); err != nil {
				log.Printf("WS yazma hatası: %v", err)
				return
			}
		}
	}()

	welcome, _ := json.Marshal(OutgoingMessage{
		Type:    "connected",
		Payload: map[string]string{"user_id": userID},
	})
	client.send <- welcome

	onlineUsers, _ := json.Marshal(OutgoingMessage{
		Type:    "online_users",
		Payload: map[string]interface{}{"user_ids": h.GetOnlineUserIDs(userID)},
	})
	client.send <- onlineUsers

	for {
		_, payload, err := wsConn.ReadMessage()
		if err != nil {
			break
		}

		var incoming map[string]interface{}
		if err := json.Unmarshal(payload, &incoming); err != nil {
			continue
		}

		msgType, _ := incoming["type"].(string)

		// payload alanından veriyi al
		payloadMap, _ := incoming["payload"].(map[string]interface{})

		switch msgType {
		case "join_conv":
			convID := ""
			if payloadMap != nil {
				convID, _ = payloadMap["conversation_id"].(string)
			}
			if convID != "" {
				h.mu.Lock()
				found := false
				for _, id := range h.convMembers[convID] {
					if id == userID {
						found = true
						break
					}
				}
				if !found {
					h.convMembers[convID] = append(h.convMembers[convID], userID)
					log.Printf("join_conv: %s → conv:%s (toplam üye: %d)", userID, convID, len(h.convMembers[convID]))
				}
				h.mu.Unlock()
			}

		case "typing":
			convID := ""
			if payloadMap != nil {
				convID, _ = payloadMap["conversation_id"].(string)
			}
			if convID != "" {
				data, _ := json.Marshal(OutgoingMessage{
					Type: "typing",
					Payload: map[string]string{
						"user_id":         userID,
						"conversation_id": convID,
					},
				})
				h.mu.RLock()
				memberIDs := h.convMembers[convID]
				h.mu.RUnlock()
				for _, mid := range memberIDs {
					if mid != userID {
						h.mu.RLock()
						c, ok := h.clients[mid]
						h.mu.RUnlock()
						if ok {
							select {
							case c.send <- data:
							default:
							}
						}
					}
				}
			}
		case "call_signal":
			convID := ""
			if payloadMap != nil {
				convID, _ = payloadMap["conversation_id"].(string)
			}
			if convID != "" {
				data, _ := json.Marshal(OutgoingMessage{
					Type:    "call_signal",
					Payload: payloadMap,
				})
				h.mu.RLock()
				memberIDs := h.convMembers[convID]
				h.mu.RUnlock()
				for _, mid := range memberIDs {
					if mid != userID {
						h.mu.RLock()
						c, ok := h.clients[mid]
						h.mu.RUnlock()
						if ok {
							select {
							case c.send <- data:
							default:
							}
						}
					}
				}
			}

		}
	}
}
