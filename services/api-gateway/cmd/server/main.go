package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/Apothecary1995/cengsta-paradise/services/api-gateway/config"
	httphandler "github.com/Apothecary1995/cengsta-paradise/services/api-gateway/internal/delivery/http"
	"github.com/Apothecary1995/cengsta-paradise/services/api-gateway/internal/delivery/websocket"
	"github.com/Apothecary1995/cengsta-paradise/services/api-gateway/internal/grpcclient"
	redisclient "github.com/Apothecary1995/cengsta-paradise/services/api-gateway/internal/infrastructure/redis"
	"github.com/Apothecary1995/cengsta-paradise/services/api-gateway/internal/push"
)

func main() {
	cfg := config.Load()

	// ── Güvenlik doğrulamaları (başlangıçta başarısız ol) ──
	validateSecrets(cfg)

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

	// Friends DB bağlantısı — başarısız olursa uyarı ver, servis çalışmaya devam eder
	dsn := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		cfg.DB.Host, cfg.DB.Port, cfg.DB.User, cfg.DB.Password, cfg.DB.Name)
	friendsDB, dbErr := httphandler.InitFriendsDB(context.Background(), dsn)
	if dbErr != nil {
		log.Printf("uyarı: friends DB bağlanamadı (%v) — arkadaşlık sistemi devre dışı", dbErr)
		friendsDB = nil
	} else {
		log.Println("friends DB bağlantısı kuruldu")
	}

	rc := redisclient.NewClient(cfg.Redis.Addr, cfg.Redis.Password)

	handler := httphandler.NewHandler(clients, hub, &cfg, friendsDB, rc)
	handler.RegisterRoutes(mux)
	mux.HandleFunc("/ws", hub.ServeWS)

	chain := securityHeaders(corsMiddleware(cfg.AllowedOrigin, mux))

	srv := &http.Server{
		Addr:    cfg.HTTP.Port,
		Handler: chain,
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

// validateSecrets üretimde zayıf sır kullanımını engeller.
func validateSecrets(cfg config.Config) {
	isProd := os.Getenv("GO_ENV") == "production"

	if cfg.JWT.Secret == "change-me-in-production" {
		if isProd {
			log.Fatal("HATA: Üretimde varsayılan JWT_SECRET kullanılamaz. Güçlü bir secret ayarla.")
		}
		log.Println("UYARI: JWT_SECRET varsayılan değerde — üretimde mutlaka değiştir!")
	}
	if len(cfg.JWT.Secret) < 32 {
		if isProd {
			log.Fatal("HATA: JWT_SECRET en az 32 karakter olmalı.")
		}
		log.Printf("UYARI: JWT_SECRET çok kısa (%d karakter), üretimde güvensiz.", len(cfg.JWT.Secret))
	}
	if isProd && cfg.AllowedOrigin == "*" {
		log.Fatal("HATA: Üretimde ALLOWED_ORIGIN=* kullanılamaz. Domain belirt.")
	}
}

// corsMiddleware — sadece izin verilen origin'e yanıt ver.
// Localhost bypass yok — geliştirmede ALLOWED_ORIGIN=http://localhost:5173 kullan.
func corsMiddleware(allowedOrigin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			// Sadece tam eşleşme — wildcard veya prefix yok
			if origin == allowedOrigin {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
			}
			// Eşleşmiyorsa header set etme — tarayıcı reddeder
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// securityHeaders — her yanıta güvenlik başlıkları ekler.
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		// HSTS — sadece HTTPS üzerinden servis ediliyorsa etkinleştir
		if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		// CSP — script ve style kısıtlaması
		if !strings.HasPrefix(r.URL.Path, "/api/") && r.URL.Path != "/ws" {
			w.Header().Set("Content-Security-Policy",
				"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: http://localhost:9000; connect-src 'self' ws: wss: http://localhost:8080")
		}
		next.ServeHTTP(w, r)
	})
}
