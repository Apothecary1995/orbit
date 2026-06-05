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
	"github.com/Apothecary1995/cengsta-paradise/services/api-gateway/config"
	"github.com/Apothecary1995/cengsta-paradise/services/api-gateway/internal/delivery/websocket"
	"github.com/Apothecary1995/cengsta-paradise/services/api-gateway/internal/grpcclient"
	pushpkg "github.com/Apothecary1995/cengsta-paradise/services/api-gateway/internal/push"
)

var allowedMimeTypes = map[string]bool{
	"image/jpeg":       true,
	"image/png":        true,
	"image/gif":        true,
	"image/webp":       true,
	"video/mp4":        true,
	"video/webm":       true,
	"application/pdf":  true,
	"audio/mpeg":       true,
	"audio/ogg":        true,
	"audio/webm":       true,
}

type Handler struct {
	clients    *grpcclient.Clients
	hub        *websocket.Hub
	jwtSecret  string
	minioURL   string
}

func NewHandler(clients *grpcclient.Clients, hub *websocket.Hub, cfg *config.Config) *Handler {
	return &Handler{
		clients:   clients,
		hub:       hub,
		jwtSecret: cfg.JWT.Secret,
		minioURL:  cfg.MinioPublicURL,
	}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	auth := func(fn http.HandlerFunc) http.HandlerFunc {
		return requireAuth(h.jwtSecret, fn)
	}

	mux.HandleFunc("/health", h.health)

	// Public auth endpoint'leri
	mux.HandleFunc("/api/v1/auth/register", h.register)
	mux.HandleFunc("/api/v1/auth/login", h.login)
	mux.HandleFunc("/api/v1/auth/refresh", h.refresh)
	mux.HandleFunc("/api/v1/notifications/vapid-public-key", h.vapidPublicKey)

	// Protected auth endpoint'leri
	mux.HandleFunc("/api/v1/auth/logout", auth(h.logout))
	mux.HandleFunc("/api/v1/auth/search", auth(h.searchUser))
	mux.HandleFunc("/api/v1/auth/users/", auth(h.getUser))

	// Protected chat endpoint'leri
	mux.HandleFunc("/api/v1/notifications/subscribe", auth(h.pushSubscribe))
	mux.HandleFunc("/api/v1/stories", auth(h.stories))
	mux.HandleFunc("/api/v1/chat/conversations", auth(h.conversations))
	mux.HandleFunc("/api/v1/chat/conversations/", auth(h.conversationDetail))
	mux.HandleFunc("/api/v1/media/upload", auth(h.uploadMedia))

	// Protected server & kanal route'ları
	mux.HandleFunc("/api/v1/servers", auth(h.servers))
	mux.HandleFunc("/api/v1/servers/", auth(h.serverDetail))
	mux.HandleFunc("/api/v1/channels/", auth(h.channelDetail))
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
	if req.Username == "" || req.Phone == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "kullanıcı adı, telefon ve şifre zorunlu")
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
		writeError(w, http.StatusBadRequest, grpcErrMsg(err))
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

func (h *Handler) conversations(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromCtx(r.Context())

	switch r.Method {
	case http.MethodGet:
		resp, err := h.clients.ChatService.GetConversations(r.Context(), &chatpb.GetConversationsRequest{
			UserId: userID,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "sohbetler yüklenemedi")
			return
		}

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
			MemberIDs []string `json:"member_ids"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "geçersiz istek")
			return
		}
		// member_ids içinde mevcut kullanıcı yoksa ekle
		hasUser := false
		for _, id := range req.MemberIDs {
			if id == userID {
				hasUser = true
				break
			}
		}
		if !hasUser {
			req.MemberIDs = append(req.MemberIDs, userID)
		}
		resp, err := h.clients.ChatService.CreateConversation(r.Context(), &chatpb.CreateConversationRequest{
			Type:      req.Type,
			Name:      req.Name,
			CreatedBy: userID, // JWT'den
			MemberIds: req.MemberIDs,
		})
		if err != nil {
			log.Printf("CreateConversation hatası: %v", err)
			writeError(w, http.StatusInternalServerError, "sohbet oluşturulamadı")
			return
		}
		writeJSON(w, http.StatusCreated, map[string]interface{}{"conversation": resp.Conversation})

	default:
		writeError(w, http.StatusMethodNotAllowed, "desteklenmiyor")
	}
}

func (h *Handler) conversationDetail(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/v1/chat/conversations/"), "/")
	if len(parts) < 2 {
		writeError(w, http.StatusBadRequest, "geçersiz URL")
		return
	}
	convID := parts[0]
	resource := parts[1]

	if resource != "messages" {
		writeError(w, http.StatusNotFound, "bulunamadı")
		return
	}

	userID := userIDFromCtx(r.Context())

	if len(parts) == 4 && r.Method == http.MethodPost {
		msgID := parts[2]
		action := parts[3]
		switch action {
		case "read":
			_, err := h.clients.ChatService.MarkAsRead(r.Context(), &chatpb.MarkAsReadRequest{
				MessageId: msgID,
				UserId:    userID,
			})
			if err != nil {
				writeError(w, http.StatusInternalServerError, "işlem başarısız")
				return
			}
			h.hub.BroadcastTypedToConv(convID, "read_receipt", map[string]interface{}{
				"message_id":      msgID,
				"reader_id":       userID,
				"conversation_id": convID,
			})
			writeJSON(w, http.StatusOK, map[string]bool{"success": true})
		case "edit":
			var req struct {
				Content string `json:"content"`
			}
			json.NewDecoder(r.Body).Decode(&req)
			resp, err := h.clients.ChatService.EditMessage(r.Context(), &chatpb.EditMessageRequest{
				MessageId: msgID,
				UserId:    userID,
				Content:   req.Content,
			})
			if err != nil {
				writeError(w, http.StatusInternalServerError, "mesaj düzenlenemedi")
				return
			}
			h.hub.BroadcastToConv(convID, map[string]interface{}{
				"type": "message_edited", "message_id": msgID,
				"content": req.Content, "edited_at": resp.EditedAt,
			})
			writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "edited_at": resp.EditedAt})
		case "delete":
			_, err := h.clients.ChatService.DeleteMessage(r.Context(), &chatpb.DeleteMessageRequest{
				MessageId: msgID,
				UserId:    userID,
			})
			if err != nil {
				writeError(w, http.StatusInternalServerError, "mesaj silinemedi")
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
			writeError(w, http.StatusInternalServerError, "mesajlar yüklenemedi")
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"messages": resp.Messages})

	case http.MethodPost:
		var req struct {
			Content   string `json:"content"`
			Type      string `json:"type"`
			ReplyToID string `json:"reply_to_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "geçersiz istek")
			return
		}
		if req.Content == "" {
			writeError(w, http.StatusBadRequest, "içerik boş olamaz")
			return
		}
		if req.Type == "" {
			req.Type = "text"
		}
		resp, err := h.clients.ChatService.SendMessage(r.Context(), &chatpb.SendMessageRequest{
			ConversationId: convID,
			SenderId:       userID, // JWT'den
			Content:        req.Content,
			Type:           req.Type,
			ReplyToId:      req.ReplyToID,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "mesaj gönderilemedi")
			return
		}

		h.hub.BroadcastToConv(convID, map[string]interface{}{
			"id":              resp.MessageId,
			"conversation_id": convID,
			"sender_id":       userID,
			"content":         req.Content,
			"type":            req.Type,
			"reply_to_id":     req.ReplyToID,
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

// grpcErrMsg gRPC hata mesajından kullanıcıya gösterilebilir kısım çıkarır.
func grpcErrMsg(err error) string {
	s := err.Error()
	// gRPC hataları "rpc error: code = ... desc = ..." formatındadır
	if idx := strings.Index(s, "desc = "); idx != -1 {
		return s[idx+7:]
	}
	return s
}

func serverToMap(s interface {
	GetId() string
	GetName() string
	GetIconUrl() string
	GetOwnerId() string
	GetInviteCode() string
	GetCreatedAt() string
}) map[string]interface{} {
	return map[string]interface{}{
		"id":          s.GetId(),
		"name":        s.GetName(),
		"icon_url":    s.GetIconUrl(),
		"owner_id":    s.GetOwnerId(),
		"invite_code": s.GetInviteCode(),
		"created_at":  s.GetCreatedAt(),
	}
}

func channelToMap(ch interface {
	GetId() string
	GetServerId() string
	GetName() string
	GetTopic() string
	GetType() string
	GetPosition() int32
	GetConversationId() string
	GetCreatedAt() string
}) map[string]interface{} {
	return map[string]interface{}{
		"id":              ch.GetId(),
		"server_id":       ch.GetServerId(),
		"name":            ch.GetName(),
		"topic":           ch.GetTopic(),
		"type":            ch.GetType(),
		"position":        ch.GetPosition(),
		"conversation_id": ch.GetConversationId(),
		"created_at":      ch.GetCreatedAt(),
	}
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
		writeError(w, http.StatusNotFound, "kullanıcı bulunamadı")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"user": resp.User})
}

func (h *Handler) stories(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromCtx(r.Context())

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
			writeError(w, http.StatusInternalServerError, "hikayeler yüklenemedi")
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"stories": resp.Stories})
	case http.MethodPost:
		var req struct {
			Type    string `json:"type"`
			Content string `json:"content"`
			Caption string `json:"caption"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Content == "" {
			writeError(w, http.StatusBadRequest, "content zorunlu")
			return
		}
		resp, err := h.clients.ChatService.CreateStory(r.Context(), &chatpb.CreateStoryRequest{
			UserId:  userID, // JWT'den
			Type:    req.Type,
			Content: req.Content,
			Caption: req.Caption,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "hikaye oluşturulamadı")
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
	userID := userIDFromCtx(r.Context())
	var req struct {
		Subscription interface{} `json:"subscription"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "geçersiz istek")
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
	h.hub.Push.Save(userID, sub)
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// ── Server handler'ları ──────────────────────────────────

func (h *Handler) servers(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromCtx(r.Context())

	switch r.Method {
	case http.MethodGet:
		resp, err := h.clients.ChatService.ListUserServers(r.Context(), &chatpb.ListUserServersRequest{UserId: userID})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "sunucular yüklenemedi")
			return
		}
		servers := make([]map[string]interface{}, len(resp.Servers))
		for i, s := range resp.Servers {
			servers[i] = serverToMap(s)
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"servers": servers})

	case http.MethodPost:
		var req struct {
			Name    string `json:"name"`
			IconURL string `json:"icon_url"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
			writeError(w, http.StatusBadRequest, "name zorunlu")
			return
		}
		resp, err := h.clients.ChatService.CreateServer(r.Context(), &chatpb.CreateServerRequest{
			Name:    req.Name,
			IconUrl: req.IconURL,
			OwnerId: userID, // JWT'den
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "sunucu oluşturulamadı")
			return
		}
		writeJSON(w, http.StatusCreated, map[string]interface{}{"server": serverToMap(resp.Server)})

	default:
		writeError(w, http.StatusMethodNotAllowed, "desteklenmiyor")
	}
}

func (h *Handler) serverDetail(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromCtx(r.Context())
	path := strings.TrimPrefix(r.URL.Path, "/api/v1/servers/")
	parts := strings.SplitN(path, "/", 2)
	serverID := parts[0]
	sub := ""
	if len(parts) == 2 {
		sub = parts[1]
	}

	if serverID == "join" && r.Method == http.MethodPost {
		var req struct {
			InviteCode string `json:"invite_code"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.InviteCode == "" {
			writeError(w, http.StatusBadRequest, "invite_code zorunlu")
			return
		}
		resp, err := h.clients.ChatService.JoinServer(r.Context(), &chatpb.JoinServerRequest{
			InviteCode: req.InviteCode,
			UserId:     userID, // JWT'den
		})
		if err != nil {
			writeError(w, http.StatusNotFound, "geçersiz davet kodu")
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"server": serverToMap(resp.Server)})
		return
	}

	switch sub {
	case "":
		switch r.Method {
		case http.MethodGet:
			resp, err := h.clients.ChatService.GetServer(r.Context(), &chatpb.GetServerRequest{
				ServerId: serverID, UserId: userID,
			})
			if err != nil {
				writeError(w, http.StatusNotFound, "sunucu bulunamadı")
				return
			}
			writeJSON(w, http.StatusOK, map[string]interface{}{"server": serverToMap(resp.Server)})
		case http.MethodDelete:
			_, err := h.clients.ChatService.DeleteServer(r.Context(), &chatpb.DeleteServerRequest{
				ServerId: serverID, UserId: userID, // JWT'den
			})
			if err != nil {
				writeError(w, http.StatusForbidden, "sunucu silinemedi")
				return
			}
			writeJSON(w, http.StatusOK, map[string]bool{"success": true})
		default:
			writeError(w, http.StatusMethodNotAllowed, "desteklenmiyor")
		}

	case "members":
		memberPath := strings.TrimPrefix(r.URL.Path, "/api/v1/servers/"+serverID+"/members")
		memberPath = strings.TrimPrefix(memberPath, "/")
		memberParts := strings.SplitN(memberPath, "/", 2)
		targetUserID := ""
		memberSub := ""
		if len(memberParts) >= 1 {
			targetUserID = memberParts[0]
		}
		if len(memberParts) == 2 {
			memberSub = memberParts[1]
		}

		switch {
		case targetUserID == "" && r.Method == http.MethodGet:
			resp, err := h.clients.ChatService.ListServerMembers(r.Context(), &chatpb.ListServerMembersRequest{
				ServerId: serverID, RequesterId: userID, // JWT'den
			})
			if err != nil {
				writeError(w, http.StatusForbidden, "üyeler listelenemedi")
				return
			}
			writeJSON(w, http.StatusOK, map[string]interface{}{"members": resp.Members})

		case targetUserID != "" && memberSub == "role" && r.Method == http.MethodPut:
			var req struct {
				Role string `json:"role"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeError(w, http.StatusBadRequest, "geçersiz istek")
				return
			}
			_, err := h.clients.ChatService.SetMemberRole(r.Context(), &chatpb.SetMemberRoleRequest{
				ServerId:     serverID,
				RequesterId:  userID, // JWT'den
				TargetUserId: targetUserID,
				Role:         req.Role,
			})
			if err != nil {
				writeError(w, http.StatusForbidden, "rol değiştirilemedi")
				return
			}
			writeJSON(w, http.StatusOK, map[string]bool{"success": true})

		case targetUserID != "" && r.Method == http.MethodDelete:
			_, err := h.clients.ChatService.KickMember(r.Context(), &chatpb.KickMemberRequest{
				ServerId:     serverID,
				RequesterId:  userID, // JWT'den
				TargetUserId: targetUserID,
			})
			if err != nil {
				writeError(w, http.StatusForbidden, "üye atılamadı")
				return
			}
			writeJSON(w, http.StatusOK, map[string]bool{"success": true})

		default:
			writeError(w, http.StatusMethodNotAllowed, "desteklenmiyor")
		}

	case "channels":
		switch r.Method {
		case http.MethodGet:
			resp, err := h.clients.ChatService.ListChannels(r.Context(), &chatpb.ListChannelsRequest{
				ServerId: serverID, UserId: userID,
			})
			if err != nil {
				writeError(w, http.StatusForbidden, "kanallar listelenemedi")
				return
			}
			channels := make([]map[string]interface{}, len(resp.Channels))
			for i, ch := range resp.Channels {
				channels[i] = channelToMap(ch)
			}
			writeJSON(w, http.StatusOK, map[string]interface{}{"channels": channels})
		case http.MethodPost:
			var req struct {
				Name  string `json:"name"`
				Topic string `json:"topic"`
				Type  string `json:"type"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
				writeError(w, http.StatusBadRequest, "name zorunlu")
				return
			}
			if req.Type != "voice" {
				req.Type = "text"
			}
			resp, err := h.clients.ChatService.CreateChannel(r.Context(), &chatpb.CreateChannelRequest{
				ServerId: serverID,
				Name:     req.Name,
				Topic:    req.Topic,
				OwnerId:  userID, // JWT'den
				Type:     req.Type,
			})
			if err != nil {
				writeError(w, http.StatusInternalServerError, "kanal oluşturulamadı")
				return
			}
			writeJSON(w, http.StatusCreated, map[string]interface{}{"channel": channelToMap(resp.Channel)})
		default:
			writeError(w, http.StatusMethodNotAllowed, "desteklenmiyor")
		}

	default:
		writeError(w, http.StatusNotFound, "bulunamadı")
	}
}

func (h *Handler) channelDetail(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromCtx(r.Context())
	path := strings.TrimPrefix(r.URL.Path, "/api/v1/channels/")
	parts := strings.SplitN(path, "/", 2)
	channelID := parts[0]
	sub := ""
	if len(parts) == 2 {
		sub = parts[1]
	}

	if sub == "" && r.Method == http.MethodDelete {
		_, err := h.clients.ChatService.DeleteChannel(r.Context(), &chatpb.DeleteChannelRequest{
			ChannelId: channelID, UserId: userID, // JWT'den
		})
		if err != nil {
			writeError(w, http.StatusForbidden, "kanal silinemedi")
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"success": true})
		return
	}

	if sub != "messages" {
		writeError(w, http.StatusNotFound, "bulunamadı")
		return
	}

	convResp, err := h.clients.ChatService.GetChannelConversation(r.Context(), &chatpb.GetChannelConversationRequest{
		ChannelId: channelID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "kanal bulunamadı")
		return
	}
	convID := convResp.ConversationId

	switch r.Method {
	case http.MethodGet:
		resp, err := h.clients.ChatService.GetHistory(r.Context(), &chatpb.GetHistoryRequest{
			ConversationId: convID, Limit: 50, Offset: 0,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "mesajlar yüklenemedi")
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"messages": resp.Messages})

	case http.MethodPost:
		var req struct {
			Content string `json:"content"`
			Type    string `json:"type"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "geçersiz istek")
			return
		}
		if req.Content == "" {
			writeError(w, http.StatusBadRequest, "içerik boş olamaz")
			return
		}
		if req.Type == "" {
			req.Type = "text"
		}
		resp, err := h.clients.ChatService.SendMessage(r.Context(), &chatpb.SendMessageRequest{
			ConversationId: convID,
			SenderId:       userID, // JWT'den
			Content:        req.Content,
			Type:           req.Type,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "mesaj gönderilemedi")
			return
		}
		h.hub.BroadcastToConv(convID, map[string]interface{}{
			"id":              resp.MessageId,
			"conversation_id": convID,
			"channel_id":      channelID,
			"sender_id":       userID,
			"content":         req.Content,
			"type":            req.Type,
			"status":          "sent",
			"created_at":      resp.CreatedAt,
		})
		writeJSON(w, http.StatusCreated, map[string]interface{}{
			"message_id": resp.MessageId, "created_at": resp.CreatedAt,
		})

	default:
		writeError(w, http.StatusMethodNotAllowed, "desteklenmiyor")
	}
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

	// Dosya tipi doğrula
	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		// İlk 512 byte ile detect et
		buf := make([]byte, 512)
		n, _ := file.Read(buf)
		contentType = http.DetectContentType(buf[:n])
		file.Seek(0, io.SeekStart)
	}
	if !allowedMimeTypes[contentType] {
		writeError(w, http.StatusBadRequest, "desteklenmeyen dosya türü")
		return
	}

	data, err := io.ReadAll(file)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "dosya okunamadı")
		return
	}

	fileName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), header.Filename)
	minioURL := fmt.Sprintf("%s/%s", h.minioURL, fileName)

	req, err := http.NewRequest("PUT", minioURL, bytes.NewReader(data))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "yükleme isteği oluşturulamadı")
		return
	}
	req.Header.Set("Content-Type", contentType)
	req.ContentLength = int64(len(data))

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil || resp.StatusCode >= 400 {
		writeError(w, http.StatusInternalServerError, "dosya yüklenemedi")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"url": minioURL})
}
