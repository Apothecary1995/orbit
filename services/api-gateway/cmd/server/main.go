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

	pushMgr := push.NewManager(cfg.VAPID.PublicKey, cfg.VAPID.PrivateKey, cfg.VAPID.Subject)
	hub := websocket.NewHub(clients.AuthService, pushMgr)
	mux := http.NewServeMux()

	handler := httphandler.NewHandler(clients, hub)
	handler.RegisterRoutes(mux)
	mux.HandleFunc("/ws", hub.ServeWS)

	srv := &http.Server{
		Addr:    cfg.HTTP.Port,
		Handler: corsMiddleware(mux),
	}

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("api-gateway başlatıldı → %s", cfg.HTTP.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP sunucu hatası: %v", err)
		}
	}()

	<-quit
	srv.Close()
	log.Println("api-gateway kapatıldı")
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
