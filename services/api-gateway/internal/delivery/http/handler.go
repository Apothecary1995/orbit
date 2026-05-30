package http

import (
	"encoding/json"
	"log"
	"net/http"

	authpb "github.com/Apothecary1995/cengsta-paradise/gen/auth/v1"
	"github.com/Apothecary1995/cengsta-paradise/services/api-gateway/internal/grpcclient"
)

// Handler HTTP isteklerini karşılar.
type Handler struct {
	clients *grpcclient.Clients
}

func NewHandler(clients *grpcclient.Clients) *Handler {
	return &Handler{clients: clients}
}

// RegisterRoutes tüm route'ları kaydeder.
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/health", h.health)
	mux.HandleFunc("/api/v1/auth/register", h.register)
	mux.HandleFunc("/api/v1/auth/login", h.login)
	mux.HandleFunc("/api/v1/auth/refresh", h.refresh)
	mux.HandleFunc("/api/v1/auth/logout", h.logout)
}

// ── Handler'lar ──────────────────────────────────────────

func (h *Handler) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) register(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "sadece POST destekleniyor")
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

	// gRPC çağrısı — auth-svc
	resp, err := h.clients.AuthService.Register(r.Context(), &authpb.RegisterRequest{
		Username: req.Username,
		Phone:    req.Phone,
		Password: req.Password,
		Device: &authpb.DeviceInfo{
			Name:      req.DeviceName,
			PublicKey: req.PublicKey,
		},
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
			"id":       resp.User.Id,
			"username": resp.User.Username,
			"phone":    resp.User.Phone,
		},
	})
}

func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "sadece POST destekleniyor")
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
		Device: &authpb.DeviceInfo{
			Name:      req.DeviceName,
			PublicKey: req.PublicKey,
		},
	})
	if err != nil {
		log.Printf("Login hatası: %v", err)
		writeError(w, http.StatusUnauthorized, "telefon veya şifre hatalı")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"access_token":  resp.AccessToken,
		"refresh_token": resp.RefreshToken,
		"user": map[string]interface{}{
			"id":       resp.User.Id,
			"username": resp.User.Username,
			"phone":    resp.User.Phone,
		},
	})
}

func (h *Handler) refresh(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "sadece POST destekleniyor")
		return
	}

	var req struct {
		RefreshToken string `json:"refresh_token"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "geçersiz istek")
		return
	}

	resp, err := h.clients.AuthService.RefreshToken(r.Context(), &authpb.RefreshRequest{
		RefreshToken: req.RefreshToken,
	})
	if err != nil {
		writeError(w, http.StatusUnauthorized, "geçersiz token")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"access_token":  resp.AccessToken,
		"refresh_token": resp.RefreshToken,
	})
}

func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "sadece POST destekleniyor")
		return
	}

	var req struct {
		SessionID string `json:"session_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "geçersiz istek")
		return
	}

	_, err := h.clients.AuthService.Logout(r.Context(), &authpb.LogoutRequest{
		SessionId: req.SessionID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "çıkış yapılamadı")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "çıkış yapıldı"})
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
