package http

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	authpb "github.com/Apothecary1995/cengsta-paradise/gen/auth/v1"
	chatpb "github.com/Apothecary1995/cengsta-paradise/gen/chat/v1"
	"github.com/Apothecary1995/cengsta-paradise/services/api-gateway/internal/delivery/websocket"
	"github.com/Apothecary1995/cengsta-paradise/services/api-gateway/internal/grpcclient"
	pushpkg "github.com/Apothecary1995/cengsta-paradise/services/api-gateway/internal/push"
)

type Handler struct {
	clients *grpcclient.Clients
	hub     *websocket.Hub
}

func NewHandler(clients *grpcclient.Clients, hub *websocket.Hub) *Handler {
	return &Handler{clients: clients, hub: hub}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/health", h.health)
	mux.HandleFunc("/api/v1/auth/register", h.register)
	mux.HandleFunc("/api/v1/auth/login", h.login)
	mux.HandleFunc("/api/v1/auth/refresh", h.refresh)
	mux.HandleFunc("/api/v1/auth/logout", h.logout)
	mux.HandleFunc("/api/v1/auth/search", h.searchUser)
	mux.HandleFunc("/api/v1/auth/users/", h.getUser)
	mux.HandleFunc("/api/v1/notifications/subscribe", h.pushSubscribe)
	mux.HandleFunc("/api/v1/notifications/vapid-public-key", h.vapidPublicKey)
	mux.HandleFunc("/api/v1/stories", h.stories)
	mux.HandleFunc("/api/v1/chat/conversations", h.conversations)
	mux.HandleFunc("/api/v1/chat/conversations/", h.conversationDetail)
	mux.HandleFunc("/api/v1/media/upload", h.uploadMedia)

}

// ── Auth handler'ları ────────────────────────────────────

func (h *Handler) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) register(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "sadece POST")
		return
	}
	var req struct {
		Username   string `json:"username"`
		Phone      string `json:"phone"`
		Password   string `json:"password"`
		DeviceName string `json:"device_name"`
		PublicKey  string `json:"public_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "geçersiz istek")
		return
	}
	resp, err := h.clients.AuthService.Register(r.Context(), &authpb.RegisterRequest{
		Username: req.Username,
		Phone:    req.Phone,
		Password: req.Password,
		Device:   &authpb.DeviceInfo{Name: req.DeviceName, PublicKey: req.PublicKey},
	})
	if err != nil {
		log.Printf("Register hatası: %v", err)
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"access_token":  resp.AccessToken,
		"refresh_token": resp.RefreshToken,
		"user": map[string]interface{}{
			"id": resp.User.Id, "username": resp.User.Username, "phone": resp.User.Phone,
		},
	})
}

func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "sadece POST")
		return
	}
	var req struct {
		Phone      string `json:"phone"`
		Password   string `json:"password"`
		DeviceName string `json:"device_name"`
		PublicKey  string `json:"public_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "geçersiz istek")
		return
	}
	resp, err := h.clients.AuthService.Login(r.Context(), &authpb.LoginRequest{
		Phone:    req.Phone,
		Password: req.Password,
		Device:   &authpb.DeviceInfo{Name: req.DeviceName, PublicKey: req.PublicKey},
	})
	if err != nil {
		writeError(w, http.StatusUnauthorized, "telefon veya şifre hatalı")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"access_token":  resp.AccessToken,
		"refresh_token": resp.RefreshToken,
		"user": map[string]interface{}{
			"id": resp.User.Id, "username": resp.User.Username, "phone": resp.User.Phone,
		},
	})
}

func (h *Handler) refresh(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "sadece POST")
		return
	}
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "geçersiz istek")
		return
	}
	resp, err := h.clients.AuthService.RefreshToken(r.Context(), &authpb.RefreshRequest{RefreshToken: req.RefreshToken})
	if err != nil {
		writeError(w, http.StatusUnauthorized, "geçersiz token")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"access_token": resp.AccessToken, "refresh_token": resp.RefreshToken,
	})
}

func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "sadece POST")
		return
	}
	var req struct {
		SessionID string `json:"session_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "geçersiz istek")
		return
	}
	h.clients.AuthService.Logout(r.Context(), &authpb.LogoutRequest{SessionId: req.SessionID})
	writeJSON(w, http.StatusOK, map[string]string{"message": "çıkış yapıldı"})
}

// ── Chat handler'ları ────────────────────────────────────

// GET  /api/v1/chat/conversations        → sohbet listesi
// POST /api/v1/chat/conversations        → yeni sohbet oluştur
func (h *Handler) conversations(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")

	switch r.Method {
	case http.MethodGet:
		if userID == "" {
			writeError(w, http.StatusBadRequest, "user_id zorunlu")
			return
		}
		resp, err := h.clients.ChatService.GetConversations(r.Context(), &chatpb.GetConversationsRequest{
			UserId: userID,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		// Direct sohbetlerde other_user_id'yi ekle
		type convWithOther struct {
			*chatpb.Conversation
			OtherUserID string `json:"other_user_id,omitempty"`
		}
		enriched := make([]convWithOther, 0, len(resp.Conversations))
		for _, c := range resp.Conversations {
			entry := convWithOther{Conversation: c}
			if c.Type == "direct" {
				mResp, err := h.clients.ChatService.GetMembers(r.Context(), &chatpb.GetMembersRequest{
					ConversationId: c.Id,
				})
				if err == nil {
					for _, id := range mResp.MemberIds {
						if id != userID {
							entry.OtherUserID = id
							break
						}
					}
				}
			}
			enriched = append(enriched, entry)
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"conversations": enriched})

	case http.MethodPost:
		var req struct {
			Type      string   `json:"type"`
			Name      string   `json:"name"`
			CreatedBy string   `json:"created_by"`
			MemberIDs []string `json:"member_ids"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "geçersiz istek")
			return
		}
		resp, err := h.clients.ChatService.CreateConversation(r.Context(), &chatpb.CreateConversationRequest{
			Type:      req.Type,
			Name:      req.Name,
			CreatedBy: req.CreatedBy,
			MemberIds: req.MemberIDs,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusCreated, map[string]interface{}{"conversation": resp.Conversation})

	default:
		writeError(w, http.StatusMethodNotAllowed, "desteklenmiyor")
	}
}

// GET  /api/v1/chat/conversations/{id}/messages          → mesaj geçmişi
// POST /api/v1/chat/conversations/{id}/messages          → mesaj gönder
// POST /api/v1/chat/conversations/{id}/messages/{msgId}/read → okundu işaretle
func (h *Handler) conversationDetail(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/v1/chat/conversations/"), "/")
	if len(parts) < 2 {
		writeError(w, http.StatusBadRequest, "geçersiz URL")
		return
	}
	convID := parts[0]
	resource := parts[1] // "messages"

	if resource != "messages" {
		writeError(w, http.StatusNotFound, "bulunamadı")
		return
	}

	// /messages/{msgId}/{action}
	if len(parts) == 4 && r.Method == http.MethodPost {
		msgID := parts[2]
		action := parts[3]
		switch action {
		case "read":
			var req struct {
				UserID string `json:"user_id"`
			}
			json.NewDecoder(r.Body).Decode(&req)
			_, err := h.clients.ChatService.MarkAsRead(r.Context(), &chatpb.MarkAsReadRequest{
				MessageId: msgID,
				UserId:    req.UserID,
			})
			if err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			writeJSON(w, http.StatusOK, map[string]bool{"success": true})
		case "edit":
			var req struct {
				UserID  string `json:"user_id"`
				Content string `json:"content"`
			}
			json.NewDecoder(r.Body).Decode(&req)
			resp, err := h.clients.ChatService.EditMessage(r.Context(), &chatpb.EditMessageRequest{
				MessageId: msgID,
				UserId:    req.UserID,
				Content:   req.Content,
			})
			if err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			h.hub.BroadcastToConv(convID, map[string]interface{}{
				"type": "message_edited", "message_id": msgID,
				"content": req.Content, "edited_at": resp.EditedAt,
			})
			writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "edited_at": resp.EditedAt})
		case "delete":
			var req struct {
				UserID string `json:"user_id"`
			}
			json.NewDecoder(r.Body).Decode(&req)
			_, err := h.clients.ChatService.DeleteMessage(r.Context(), &chatpb.DeleteMessageRequest{
				MessageId: msgID,
				UserId:    req.UserID,
			})
			if err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			h.hub.BroadcastToConv(convID, map[string]interface{}{
				"type": "message_deleted", "message_id": msgID,
			})
			writeJSON(w, http.StatusOK, map[string]bool{"success": true})
		default:
			writeError(w, http.StatusNotFound, "bulunamadı")
		}
		return
	}

	switch r.Method {
	case http.MethodGet:
		resp, err := h.clients.ChatService.GetHistory(r.Context(), &chatpb.GetHistoryRequest{
			ConversationId: convID,
			Limit:          50,
			Offset:         0,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"messages": resp.Messages})

	case http.MethodPost:
		var req struct {
			SenderID string `json:"sender_id"`
			Content  string `json:"content"`
			Type     string `json:"type"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "geçersiz istek")
			return
		}
		if req.Type == "" {
			req.Type = "text"
		}
		resp, err := h.clients.ChatService.SendMessage(r.Context(), &chatpb.SendMessageRequest{
			ConversationId: convID,
			SenderId:       req.SenderID,
			Content:        req.Content,
			Type:           req.Type,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		// Direkt hub'a broadcast et — Redis pub/sub'a gerek yok
		h.hub.BroadcastToConv(convID, map[string]interface{}{
			"id":              resp.MessageId,
			"conversation_id": convID,
			"sender_id":       req.SenderID,
			"content":         req.Content,
			"type":            req.Type,
			"status":          "sent",
			"created_at":      resp.CreatedAt,
		})

		writeJSON(w, http.StatusCreated, map[string]interface{}{
			"message_id": resp.MessageId,
			"created_at": resp.CreatedAt,
		})

	default:
		writeError(w, http.StatusMethodNotAllowed, "desteklenmiyor")
	}
}

// ── Yardımcılar ──────────────────────────────────────────

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
func (h *Handler) searchUser(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "sadece GET")
		return
	}
	q := r.URL.Query().Get("q")
	if q == "" {
		writeError(w, http.StatusBadRequest, "q parametresi zorunlu")
		return
	}
	resp, err := h.clients.AuthService.SearchUser(r.Context(), &authpb.SearchUserRequest{Query: q})
	if err != nil {
		writeError(w, http.StatusNotFound, "kullanıcı bulunamadı")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"users": resp.Users,
	})
}

func (h *Handler) getUser(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "sadece GET")
		return
	}
	userID := strings.TrimPrefix(r.URL.Path, "/api/v1/auth/users/")
	if userID == "" {
		writeError(w, http.StatusBadRequest, "user_id zorunlu")
		return
	}
	resp, err := h.clients.AuthService.GetUser(r.Context(), &authpb.GetUserRequest{UserId: userID})
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"user": resp.User})
}

// GET  /api/v1/stories?user_ids=a,b,c   → aktif hikayeler
// POST /api/v1/stories                  → hikaye oluştur
func (h *Handler) stories(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		raw := r.URL.Query().Get("user_ids")
		userIDs := strings.Split(raw, ",")
		filtered := userIDs[:0]
		for _, id := range userIDs {
			if id != "" {
				filtered = append(filtered, id)
			}
		}
		resp, err := h.clients.ChatService.GetStories(r.Context(), &chatpb.GetStoriesRequest{UserIds: filtered})
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"stories": resp.Stories})
	case http.MethodPost:
		var req struct {
			UserID  string `json:"user_id"`
			Type    string `json:"type"`
			Content string `json:"content"`
			Caption string `json:"caption"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.UserID == "" || req.Content == "" {
			writeError(w, http.StatusBadRequest, "user_id ve content zorunlu")
			return
		}
		resp, err := h.clients.ChatService.CreateStory(r.Context(), &chatpb.CreateStoryRequest{
			UserId: req.UserID, Type: req.Type, Content: req.Content, Caption: req.Caption,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusCreated, map[string]interface{}{"story": resp.Story})
	default:
		writeError(w, http.StatusMethodNotAllowed, "desteklenmiyor")
	}
}

func (h *Handler) vapidPublicKey(w http.ResponseWriter, r *http.Request) {
	if h.hub.Push == nil {
		writeError(w, http.StatusServiceUnavailable, "push devre dışı")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"public_key": h.hub.Push.PublicKey()})
}

func (h *Handler) pushSubscribe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "sadece POST")
		return
	}
	var req struct {
		UserID       string      `json:"user_id"`
		Subscription interface{} `json:"subscription"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.UserID == "" {
		writeError(w, http.StatusBadRequest, "user_id ve subscription zorunlu")
		return
	}
	if h.hub.Push == nil {
		writeError(w, http.StatusServiceUnavailable, "push devre dışı")
		return
	}
	raw, _ := json.Marshal(req.Subscription)
	var sub pushpkg.Subscription
	if err := json.Unmarshal(raw, &sub); err != nil {
		writeError(w, http.StatusBadRequest, "geçersiz subscription")
		return
	}
	h.hub.Push.Save(req.UserID, sub)
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *Handler) uploadMedia(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "sadece POST")
		return
	}

	r.ParseMultipartForm(10 << 20) // 10MB

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "dosya okunamadı")
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "dosya okunamadı")
		return
	}

	fileName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), header.Filename)
	minioURL := fmt.Sprintf("http://localhost:9000/cengsta-files/%s", fileName)
	publicURL := fmt.Sprintf("http://localhost:9000/cengsta-files/%s", fileName)

	req, err := http.NewRequest("PUT", minioURL, bytes.NewReader(data))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "yükleme isteği oluşturulamadı")
		return
	}
	req.Header.Set("Content-Type", header.Header.Get("Content-Type"))
	req.ContentLength = int64(len(data))

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil || resp.StatusCode >= 400 {
		writeError(w, http.StatusInternalServerError, "MinIO yükleme başarısız")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"url": publicURL})
}
