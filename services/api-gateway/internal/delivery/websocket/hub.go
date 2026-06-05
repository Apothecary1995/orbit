package websocket

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	authpb "github.com/Apothecary1995/cengsta-paradise/gen/auth/v1"
	"github.com/Apothecary1995/cengsta-paradise/services/api-gateway/internal/push"
)

type Client struct {
	userID  string
	conn    *Conn
	convIDs []string
	send    chan []byte
}

type Hub struct {
	mu           sync.RWMutex
	clients      map[string]*Client
	convMembers  map[string][]string
	authClient   authpb.AuthServiceClient
	Push         *push.Manager
	parseToken   func(token string) (userID string, err error)

	voiceMu      sync.RWMutex
	voiceChannels map[string]map[string]bool // channelID → set of userIDs
}

type OutgoingMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

func NewHub(authClient authpb.AuthServiceClient, pushMgr *push.Manager, parseToken func(string) (string, error)) *Hub {
	return &Hub{
		clients:       make(map[string]*Client),
		convMembers:   make(map[string][]string),
		authClient:    authClient,
		Push:          pushMgr,
		parseToken:    parseToken,
		voiceChannels: make(map[string]map[string]bool),
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
	// Sesli kanallardan temizle — mu kilidi olmadan, kendi voiceMu kilidiyle
	h.cleanupVoiceForUser(userID)

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

	if h.authClient != nil {
		go func() {
			h.authClient.UpdateLastSeen(context.Background(), &authpb.UpdateLastSeenRequest{UserId: userID})
		}()
	}
}

// cleanupVoiceForUser kullanıcıyı tüm sesli kanallardan çıkarır.
func (h *Hub) cleanupVoiceForUser(userID string) {
	type entry struct {
		channelID string
		remaining []string
	}

	h.voiceMu.Lock()
	var affected []entry
	for channelID, users := range h.voiceChannels {
		if !users[userID] {
			continue
		}
		delete(users, userID)
		rem := make([]string, 0, len(users))
		for uid := range users {
			rem = append(rem, uid)
		}
		affected = append(affected, entry{channelID, rem})
	}
	h.voiceMu.Unlock()

	// Kilit dışında bildir
	for _, e := range affected {
		for _, uid := range e.remaining {
			h.SendToUser(uid, OutgoingMessage{
				Type: "voice_user_left",
				Payload: map[string]interface{}{
					"channel_id": e.channelID,
					"user_id":    userID,
				},
			})
		}
	}
}

// ── Sesli kanal yardımcıları ─────────────────────────────

// voiceJoin kullanıcıyı kanala ekler; mevcut katılımcıları döner.
func (h *Hub) voiceJoin(channelID, userID string) []string {
	h.voiceMu.Lock()
	defer h.voiceMu.Unlock()
	if h.voiceChannels[channelID] == nil {
		h.voiceChannels[channelID] = make(map[string]bool)
	}
	existing := make([]string, 0, len(h.voiceChannels[channelID]))
	for uid := range h.voiceChannels[channelID] {
		existing = append(existing, uid)
	}
	h.voiceChannels[channelID][userID] = true
	return existing
}

// voiceLeave kullanıcıyı kanaldan çıkarır; kalan katılımcıları döner.
func (h *Hub) voiceLeave(channelID, userID string) []string {
	h.voiceMu.Lock()
	defer h.voiceMu.Unlock()
	if users, ok := h.voiceChannels[channelID]; ok {
		delete(users, userID)
	}
	remaining := make([]string, 0)
	for uid := range h.voiceChannels[channelID] {
		remaining = append(remaining, uid)
	}
	return remaining
}

// voiceParticipants kanalın mevcut katılımcılarını döner.
func (h *Hub) voiceParticipants(channelID string) []string {
	h.voiceMu.RLock()
	defer h.voiceMu.RUnlock()
	out := make([]string, 0, len(h.voiceChannels[channelID]))
	for uid := range h.voiceChannels[channelID] {
		out = append(out, uid)
	}
	return out
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
		} else if h.Push != nil {
			// Kullanıcı çevrimdışı — push gönder
			go h.Push.Send(userID, message)
		}
	}
}

// BroadcastTypedToConv belirli bir type ile konuşma üyelerine mesaj gönderir.
func (h *Hub) BroadcastTypedToConv(convID string, msgType string, payload interface{}) {
	data, err := json.Marshal(OutgoingMessage{Type: msgType, Payload: payload})
	if err != nil {
		return
	}
	h.mu.RLock()
	memberIDs := h.convMembers[convID]
	h.mu.RUnlock()
	for _, userID := range memberIDs {
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
	// Token ile kimlik doğrulama
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "token zorunlu", http.StatusUnauthorized)
		return
	}
	userID, err := h.parseToken(token)
	if err != nil {
		http.Error(w, "geçersiz token", http.StatusUnauthorized)
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

	// writeLoop: mesajları ve 30 saniyelik ping'i seri olarak yazar.
	// Tek goroutine yazıcı olduğu için wsConn üzerinde yarış koşulu yoktur.
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case msg, ok := <-client.send:
				if !ok {
					// Unregister tarafından kanal kapatıldı — temiz çıkış
					return
				}
				if err := wsConn.WriteMessage(OpText, msg); err != nil {
					log.Printf("WS yazma hatası [%s]: %v", userID, err)
					wsConn.conn.Close()
					return
				}
			case <-ticker.C:
				if err := wsConn.WriteMessage(OpPing, []byte{}); err != nil {
					log.Printf("WS ping hatası [%s]: %v", userID, err)
					wsConn.conn.Close()
					return
				}
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
		opcode, payload, err := wsConn.ReadMessage()
		if err != nil {
			break
		}
		// Pong: client ping'e yanıt verdi — bağlantı sağlıklı, devam et
		if opcode == OpPong {
			continue
		}
		// Close frame: karşı taraf bağlantıyı düzgün kapattı
		if opcode == OpClose {
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

		// ── Sesli kanal mesajları ────────────────────────────

		case "join_voice":
			channelID, _ := payloadMap["channel_id"].(string)
			if channelID == "" {
				continue
			}
			existing := h.voiceJoin(channelID, userID)

			// Katılan kullanıcıya mevcut listesi gönder
			h.SendToUser(userID, OutgoingMessage{
				Type: "voice_participants",
				Payload: map[string]interface{}{
					"channel_id": channelID,
					"user_ids":   existing,
				},
			})

			// Mevcut katılımcılara yeni kullanıcıyı bildir
			for _, uid := range existing {
				h.SendToUser(uid, OutgoingMessage{
					Type: "voice_user_joined",
					Payload: map[string]interface{}{
						"channel_id": channelID,
						"user_id":    userID,
					},
				})
			}

		case "leave_voice":
			channelID, _ := payloadMap["channel_id"].(string)
			if channelID == "" {
				continue
			}
			remaining := h.voiceLeave(channelID, userID)
			for _, uid := range remaining {
				h.SendToUser(uid, OutgoingMessage{
					Type: "voice_user_left",
					Payload: map[string]interface{}{
						"channel_id": channelID,
						"user_id":    userID,
					},
				})
			}

		case "voice_signal":
			// Hedef kullanıcıya yönlendir (P2P sinyalizasyon)
			targetUserID, _ := payloadMap["target_user_id"].(string)
			channelID, _ := payloadMap["channel_id"].(string)
			if targetUserID == "" || channelID == "" {
				continue
			}
			h.SendToUser(targetUserID, OutgoingMessage{
				Type: "voice_signal",
				Payload: map[string]interface{}{
					"channel_id":   channelID,
					"from_user_id": userID,
					"type":         payloadMap["type"],
					"data":         payloadMap["data"],
				},
			})

		case "voice_meta":
			// Kamera/ekran paylaşımı durumu — kanal katılımcılarına yayınla
			channelID, _ := payloadMap["channel_id"].(string)
			metaType, _ := payloadMap["meta_type"].(string)
			if channelID == "" || metaType == "" {
				continue
			}
			participants := h.voiceParticipants(channelID)
			for _, uid := range participants {
				if uid == userID {
					continue
				}
				h.SendToUser(uid, OutgoingMessage{
					Type: "voice_meta",
					Payload: map[string]interface{}{
						"channel_id":   channelID,
						"from_user_id": userID,
						"meta_type":    metaType,
					},
				})
			}

		case "read_receipt":
			// Client: {message_id, sender_id} → gönderenin tikini ✓✓ yap
			msgID, _ := payloadMap["message_id"].(string)
			senderID, _ := payloadMap["sender_id"].(string)
			if msgID == "" || senderID == "" || senderID == userID {
				continue
			}
			h.SendToUser(senderID, OutgoingMessage{
				Type: "read_receipt",
				Payload: map[string]interface{}{
					"message_id": msgID,
					"reader_id":  userID,
				},
			})
		}
	}
}
