package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/Apothecary1995/cengsta-paradise/services/api-gateway/config"
	httphandler "github.com/Apothecary1995/cengsta-paradise/services/api-gateway/internal/delivery/http"
	"github.com/Apothecary1995/cengsta-paradise/services/api-gateway/internal/delivery/websocket"
	"github.com/Apothecary1995/cengsta-paradise/services/api-gateway/internal/grpcclient"
	"github.com/Apothecary1995/cengsta-paradise/services/api-gateway/internal/push"
)

func main() {
	cfg := config.Load()

	clients, err := grpcclient.New(cfg.AuthSvc.Addr, cfg.ChatSvc.Addr)
	if err != nil {
		log.Fatalf("gRPC client oluşturulamadı: %v", err)
	}
	defer clients.Close()

	var pushMgr *push.Manager
	if cfg.VAPID.PublicKey != "" && cfg.VAPID.PrivateKey != "" {
		pushMgr = push.NewManager(cfg.VAPID.PublicKey, cfg.VAPID.PrivateKey, cfg.VAPID.Subject)
	} else {
		log.Println("uyarı: VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY eksik, push bildirimleri devre dışı")
	}

	hub := websocket.NewHub(clients.AuthService, pushMgr, func(token string) (string, error) {
		return httphandler.ParseToken(token, cfg.JWT.Secret)
	})
	mux := http.NewServeMux()

	handler := httphandler.NewHandler(clients, hub, &cfg)
	handler.RegisterRoutes(mux)
	mux.HandleFunc("/ws", hub.ServeWS)

	srv := &http.Server{
		Addr:    cfg.HTTP.Port,
		Handler: corsMiddleware(cfg.AllowedOrigin, mux),
	}

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("api-gateway başlatıldı → %s (CORS: %s)", cfg.HTTP.Port, cfg.AllowedOrigin)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP sunucu hatası: %v", err)
		}
	}()

	<-quit
	srv.Close()
	log.Println("api-gateway kapatıldı")
}

func corsMiddleware(allowedOrigin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		// Geliştirme ortamında localhost her portuna izin ver, üretimde allowedOrigin
		if origin != "" {
			if allowedOrigin == "*" || origin == allowedOrigin ||
				(os.Getenv("GO_ENV") != "production" && isLocalhost(origin)) {
				w.Header().Set("Access-Control-Allow-Origin", origin)
			} else {
				w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
			}
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func isLocalhost(origin string) bool {
	for _, prefix := range []string{
		"http://localhost:", "https://localhost:",
		"http://127.0.0.1:", "https://127.0.0.1:",
	} {
		if len(origin) > len(prefix) && origin[:len(prefix)] == prefix {
			return true
		}
	}
	return origin == "http://localhost" || origin == "https://localhost"
}
