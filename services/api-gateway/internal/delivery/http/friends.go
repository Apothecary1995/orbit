package http

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	authpb "github.com/Apothecary1995/cengsta-paradise/gen/auth/v1"
	"github.com/Apothecary1995/cengsta-paradise/services/api-gateway/internal/delivery/websocket"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ── Friend System ────────────────────────────────────────

// friends handles GET /api/v1/friends and POST /api/v1/friends/request
func (h *Handler) friends(w http.ResponseWriter, r *http.Request) {
	if h.friendsDB == nil {
		writeError(w, http.StatusServiceUnavailable, "arkadaşlık sistemi devre dışı")
		return
	}
	userID := userIDFromCtx(r.Context())

	switch r.Method {
	case http.MethodGet:
		// List accepted friends
		rows, err := h.friendsDB.Query(r.Context(), `
			SELECT id,
			       CASE WHEN user_id = $1 THEN friend_id ELSE user_id END AS other_id,
			       status, created_at
			FROM friendships
			WHERE (user_id = $1 OR friend_id = $1) AND status = 'accepted'
		`, userID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "arkadaşlar listelenemedi")
			return
		}
		defer rows.Close()

		type friendRow struct {
			ID        string    `json:"id"`
			OtherID   string    `json:"user_id"`
			Status    string    `json:"status"`
			CreatedAt time.Time `json:"created_at"`
		}

		var result []map[string]interface{}
		for rows.Next() {
			var fr friendRow
			if err := rows.Scan(&fr.ID, &fr.OtherID, &fr.Status, &fr.CreatedAt); err != nil {
				continue
			}
			// Fetch username from auth-svc
			uResp, uErr := h.clients.AuthService.GetUser(r.Context(), &authpb.GetUserRequest{UserId: fr.OtherID})
			username := ""
			if uErr == nil && uResp.User != nil {
				username = uResp.User.Username
			}
			result = append(result, map[string]interface{}{
				"id":         fr.ID,
				"user_id":    fr.OtherID,
				"username":   username,
				"status":     fr.Status,
				"created_at": fr.CreatedAt,
			})
		}
		if result == nil {
			result = []map[string]interface{}{}
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"friends": result})

	default:
		writeError(w, http.StatusMethodNotAllowed, "desteklenmiyor")
	}
}

// friendDetail handles sub-routes: /api/v1/friends/request, /api/v1/friends/accept,
// /api/v1/friends/reject, /api/v1/friends/pending, /api/v1/friends/{id} DELETE
func (h *Handler) friendDetail(w http.ResponseWriter, r *http.Request) {
	if h.friendsDB == nil {
		writeError(w, http.StatusServiceUnavailable, "arkadaşlık sistemi devre dışı")
		return
	}
	userID := userIDFromCtx(r.Context())
	sub := strings.TrimPrefix(r.URL.Path, "/api/v1/friends/")

	switch {
	case sub == "request" && r.Method == http.MethodPost:
		var req struct {
			TargetUserID string `json:"target_user_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.TargetUserID == "" {
			writeError(w, http.StatusBadRequest, "target_user_id zorunlu")
			return
		}
		if req.TargetUserID == userID {
			writeError(w, http.StatusBadRequest, "kendinize istek gönderemezsiniz")
			return
		}

		// Check if friendship already exists
		var existing string
		h.friendsDB.QueryRow(r.Context(), `
			SELECT status FROM friendships
			WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)
		`, userID, req.TargetUserID).Scan(&existing)
		if existing == "accepted" {
			writeError(w, http.StatusConflict, "zaten arkadaşsınız")
			return
		}
		if existing == "pending" {
			writeError(w, http.StatusConflict, "istek zaten gönderildi")
			return
		}

		var friendshipID string
		err := h.friendsDB.QueryRow(r.Context(), `
			INSERT INTO friendships (user_id, friend_id, status)
			VALUES ($1, $2, 'pending')
			ON CONFLICT (user_id, friend_id) DO UPDATE SET status = 'pending'
			RETURNING id
		`, userID, req.TargetUserID).Scan(&friendshipID)
		if err != nil {
			log.Printf("friend request insert hatası: %v", err)
			writeError(w, http.StatusInternalServerError, "istek gönderilemedi")
			return
		}

		// Notify target via WS
		senderResp, _ := h.clients.AuthService.GetUser(r.Context(), &authpb.GetUserRequest{UserId: userID})
		senderName := ""
		if senderResp != nil && senderResp.User != nil {
			senderName = senderResp.User.Username
		}
		h.hub.SendToUser(req.TargetUserID, websocket.OutgoingMessage{
			Type: "friend_request",
			Payload: map[string]interface{}{
				"friendship_id":   friendshipID,
				"from_user_id":    userID,
				"from_username":   senderName,
			},
		})

		writeJSON(w, http.StatusCreated, map[string]interface{}{
			"friendship_id": friendshipID,
			"status":        "pending",
		})

	case sub == "accept" && r.Method == http.MethodPost:
		var req struct {
			FriendshipID string `json:"friendship_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.FriendshipID == "" {
			writeError(w, http.StatusBadRequest, "friendship_id zorunlu")
			return
		}

		// Verify this user is the recipient
		var senderID string
		err := h.friendsDB.QueryRow(r.Context(), `
			SELECT user_id FROM friendships
			WHERE id = $1 AND friend_id = $2 AND status = 'pending'
		`, req.FriendshipID, userID).Scan(&senderID)
		if err != nil {
			writeError(w, http.StatusNotFound, "istek bulunamadı")
			return
		}

		_, err = h.friendsDB.Exec(r.Context(), `
			UPDATE friendships SET status = 'accepted' WHERE id = $1
		`, req.FriendshipID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "istek kabul edilemedi")
			return
		}

		// Notify sender via WS
		accepterResp, _ := h.clients.AuthService.GetUser(r.Context(), &authpb.GetUserRequest{UserId: userID})
		accepterName := ""
		if accepterResp != nil && accepterResp.User != nil {
			accepterName = accepterResp.User.Username
		}
		h.hub.SendToUser(senderID, websocket.OutgoingMessage{
			Type: "friend_accepted",
			Payload: map[string]interface{}{
				"friendship_id": req.FriendshipID,
				"user_id":       userID,
				"username":      accepterName,
			},
		})

		writeJSON(w, http.StatusOK, map[string]interface{}{"status": "accepted"})

	case sub == "reject" && r.Method == http.MethodPost:
		var req struct {
			FriendshipID string `json:"friendship_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.FriendshipID == "" {
			writeError(w, http.StatusBadRequest, "friendship_id zorunlu")
			return
		}
		_, err := h.friendsDB.Exec(r.Context(), `
			UPDATE friendships SET status = 'rejected'
			WHERE id = $1 AND friend_id = $2 AND status = 'pending'
		`, req.FriendshipID, userID)
		if err != nil {
			writeError(w, http.StatusNotFound, "istek bulunamadı")
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"status": "rejected"})

	case sub == "pending" && r.Method == http.MethodGet:
		rows, err := h.friendsDB.Query(r.Context(), `
			SELECT f.id, f.user_id, f.created_at
			FROM friendships f
			WHERE f.friend_id = $1 AND f.status = 'pending'
			ORDER BY f.created_at DESC
		`, userID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "bekleyen istekler listelenemedi")
			return
		}
		defer rows.Close()

		var result []map[string]interface{}
		for rows.Next() {
			var id, fromUID string
			var createdAt time.Time
			if err := rows.Scan(&id, &fromUID, &createdAt); err != nil {
				continue
			}
			uResp, _ := h.clients.AuthService.GetUser(r.Context(), &authpb.GetUserRequest{UserId: fromUID})
			username := ""
			if uResp != nil && uResp.User != nil {
				username = uResp.User.Username
			}
			result = append(result, map[string]interface{}{
				"id":            id,
				"from_user_id":  fromUID,
				"from_username": username,
				"created_at":    createdAt,
			})
		}
		if result == nil {
			result = []map[string]interface{}{}
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"pending": result})

	case r.Method == http.MethodDelete:
		// Remove a friendship
		friendshipID := sub
		_, err := h.friendsDB.Exec(r.Context(), `
			DELETE FROM friendships
			WHERE id = $1 AND (user_id = $2 OR friend_id = $2)
		`, friendshipID, userID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "arkadaşlık silinemedi")
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"success": true})

	default:
		writeError(w, http.StatusMethodNotAllowed, "desteklenmiyor")
	}
}

// AreFriends DB'de iki kullanıcının arkadaş olup olmadığını kontrol eder.
func (h *Handler) AreFriends(ctx context.Context, userA, userB string) bool {
	if h.friendsDB == nil {
		return true // DB yoksa kısıtlama yok
	}
	var count int
	h.friendsDB.QueryRow(ctx, `
		SELECT COUNT(*) FROM friendships
		WHERE ((user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1))
		  AND status = 'accepted'
	`, userA, userB).Scan(&count)
	return count > 0
}

// ── Invite System ────────────────────────────────────────

func generateInviteCode() string {
	b := make([]byte, 5)
	rand.Read(b)
	return strings.ToUpper(hex.EncodeToString(b))[:8]
}

// invites handles GET/POST /api/v1/invites
func (h *Handler) invites(w http.ResponseWriter, r *http.Request) {
	if h.friendsDB == nil {
		writeError(w, http.StatusServiceUnavailable, "davet sistemi devre dışı")
		return
	}
	userID := userIDFromCtx(r.Context())

	switch r.Method {
	case http.MethodGet:
		// List my invites
		rows, err := h.friendsDB.Query(r.Context(), `
			SELECT id, code, uses, max_uses, created_at, expires_at
			FROM invites WHERE creator_id = $1
			ORDER BY created_at DESC
		`, userID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "davetler listelenemedi")
			return
		}
		defer rows.Close()

		var result []map[string]interface{}
		for rows.Next() {
			var id, code string
			var uses, maxUses int
			var createdAt time.Time
			var expiresAt *time.Time
			if err := rows.Scan(&id, &code, &uses, &maxUses, &createdAt, &expiresAt); err != nil {
				continue
			}
			result = append(result, map[string]interface{}{
				"id":         id,
				"code":       code,
				"uses":       uses,
				"max_uses":   maxUses,
				"created_at": createdAt,
				"expires_at": expiresAt,
			})
		}
		if result == nil {
			result = []map[string]interface{}{}
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"invites": result})

	case http.MethodPost:
		code := generateInviteCode()
		var id string
		err := h.friendsDB.QueryRow(r.Context(), `
			INSERT INTO invites (code, creator_id, max_uses)
			VALUES ($1, $2, 50)
			RETURNING id
		`, code, userID).Scan(&id)
		if err != nil {
			log.Printf("invite insert hatası: %v", err)
			writeError(w, http.StatusInternalServerError, "davet oluşturulamadı")
			return
		}
		writeJSON(w, http.StatusCreated, map[string]interface{}{
			"id":   id,
			"code": code,
		})

	default:
		writeError(w, http.StatusMethodNotAllowed, "desteklenmiyor")
	}
}

// inviteDetail handles /api/v1/invites/{code} and /api/v1/invites/{code}/use
func (h *Handler) inviteDetail(w http.ResponseWriter, r *http.Request) {
	if h.friendsDB == nil {
		writeError(w, http.StatusServiceUnavailable, "davet sistemi devre dışı")
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/v1/invites/")
	parts := strings.SplitN(path, "/", 2)
	code := parts[0]
	sub := ""
	if len(parts) == 2 {
		sub = parts[1]
	}

	if code == "" {
		writeError(w, http.StatusBadRequest, "kod zorunlu")
		return
	}

	switch {
	case sub == "" && r.Method == http.MethodGet:
		// Get invite info (public - no auth required for reading)
		var creatorID string
		var uses, maxUses int
		var createdAt time.Time
		var expiresAt *time.Time
		err := h.friendsDB.QueryRow(r.Context(), `
			SELECT creator_id, uses, max_uses, created_at, expires_at
			FROM invites WHERE code = $1
		`, code).Scan(&creatorID, &uses, &maxUses, &createdAt, &expiresAt)
		if err != nil {
			writeError(w, http.StatusNotFound, "geçersiz davet kodu")
			return
		}
		if uses >= maxUses {
			writeError(w, http.StatusGone, "davet limiti doldu")
			return
		}
		if expiresAt != nil && time.Now().After(*expiresAt) {
			writeError(w, http.StatusGone, "davet süresi doldu")
			return
		}
		uResp, _ := h.clients.AuthService.GetUser(r.Context(), &authpb.GetUserRequest{UserId: creatorID})
		creatorName := ""
		if uResp != nil && uResp.User != nil {
			creatorName = uResp.User.Username
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"code":         code,
			"creator_id":   creatorID,
			"creator_name": creatorName,
			"uses":         uses,
			"max_uses":     maxUses,
			"created_at":   createdAt,
		})

	case sub == "use" && r.Method == http.MethodPost:
		// Use invite (called after registration). Requires auth.
		userID := userIDFromCtx(r.Context())
		if userID == "" {
			writeError(w, http.StatusUnauthorized, "giriş yapın")
			return
		}

		var inviteID, creatorID string
		var uses, maxUses int
		var expiresAt *time.Time
		err := h.friendsDB.QueryRow(r.Context(), `
			SELECT id, creator_id, uses, max_uses, expires_at
			FROM invites WHERE code = $1
		`, code).Scan(&inviteID, &creatorID, &uses, &maxUses, &expiresAt)
		if err != nil {
			writeError(w, http.StatusNotFound, "geçersiz davet kodu")
			return
		}
		if uses >= maxUses {
			writeError(w, http.StatusGone, "davet limiti doldu")
			return
		}
		if expiresAt != nil && time.Now().After(*expiresAt) {
			writeError(w, http.StatusGone, "davet süresi doldu")
			return
		}
		if creatorID == userID {
			writeError(w, http.StatusBadRequest, "kendi davetinizi kullanamazsınız")
			return
		}

		// Create mutual friendship
		tx, err := h.friendsDB.Begin(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "işlem başlatılamadı")
			return
		}
		defer tx.Rollback(context.Background())

		// Insert friendship (creator→user)
		_, err = tx.Exec(r.Context(), `
			INSERT INTO friendships (user_id, friend_id, status)
			VALUES ($1, $2, 'accepted')
			ON CONFLICT (user_id, friend_id) DO UPDATE SET status = 'accepted'
		`, creatorID, userID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "arkadaşlık oluşturulamadı")
			return
		}

		// Increment invite uses
		_, err = tx.Exec(r.Context(), `
			UPDATE invites SET uses = uses + 1 WHERE id = $1
		`, inviteID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "davet güncellenemedi")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			writeError(w, http.StatusInternalServerError, "işlem tamamlanamadı")
			return
		}

		// Notify creator via WS
		newUserResp, _ := h.clients.AuthService.GetUser(r.Context(), &authpb.GetUserRequest{UserId: userID})
		newUserName := ""
		if newUserResp != nil && newUserResp.User != nil {
			newUserName = newUserResp.User.Username
		}
		h.hub.SendToUser(creatorID, websocket.OutgoingMessage{
			Type: "friend_accepted",
			Payload: map[string]interface{}{
				"user_id":  userID,
				"username": newUserName,
				"via":      "invite",
			},
		})

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":     "accepted",
			"creator_id": creatorID,
		})

	default:
		writeError(w, http.StatusMethodNotAllowed, "desteklenmiyor")
	}
}

// InitFriendsDB creates and verifies the pgxpool connection.
func InitFriendsDB(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("DB bağlantısı kurulamadı: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("DB ping başarısız: %w", err)
	}
	return pool, nil
}
