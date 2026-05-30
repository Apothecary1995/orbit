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
)

func main() {
	cfg := config.Load()

	// gRPC client bağlantıları
	clients, err := grpcclient.New(cfg.AuthSvc.Addr)
	if err != nil {
		log.Fatalf("gRPC client oluşturulamadı: %v", err)
	}
	defer clients.Close()

	// WebSocket hub
	hub := websocket.NewHub()

	// HTTP router
	mux := http.NewServeMux()

	// REST handler'ları kaydet
	handler := httphandler.NewHandler(clients)
	handler.RegisterRoutes(mux)

	// WebSocket endpoint
	mux.HandleFunc("/ws", hub.ServeWS)

	// CORS middleware
	corsHandler := corsMiddleware(mux)

	// HTTP sunucusu
	srv := &http.Server{
		Addr:    cfg.HTTP.Port,
		Handler: corsHandler,
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
	log.Println("api-gateway kapatılıyor...")
	srv.Close()
	log.Println("api-gateway kapatıldı")
}

// corsMiddleware tüm origin'lere izin verir — geliştirme için.
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
