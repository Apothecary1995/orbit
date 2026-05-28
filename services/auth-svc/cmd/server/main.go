package main

import (
	"context"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/Apothecary1995/cengsta-paradise/services/auth-svc/config"
	infraDB "github.com/Apothecary1995/cengsta-paradise/services/auth-svc/internal/infrastructure/db"
	repoPostgres "github.com/Apothecary1995/cengsta-paradise/services/auth-svc/internal/repository/postgres"
	"github.com/Apothecary1995/cengsta-paradise/services/auth-svc/internal/usecase"

	"google.golang.org/grpc"
)

func main() {
	// 1. Config yükle
	cfg := config.Load()

	// 2. PostgreSQL bağlantısı
	ctx := context.Background()
	pool, err := infraDB.New(ctx, infraDB.Config{
		Host:     cfg.DB.Host,
		Port:     cfg.DB.Port,
		User:     cfg.DB.User,
		Password: cfg.DB.Password,
		Name:     cfg.DB.Name,
	})
	if err != nil {
		log.Fatalf("PostgreSQL bağlantısı kurulamadı: %v", err)
	}
	defer pool.Close()
	log.Println("PostgreSQL bağlantısı kuruldu")

	// 3. Repository'leri oluştur
	userRepo := repoPostgres.NewUserRepository(pool)
	deviceRepo := repoPostgres.NewDeviceRepository(pool)
	sessionRepo := repoPostgres.NewSessionRepository(pool)

	// 4. Usecase oluştur — dependency injection
	authUC := usecase.New(
		userRepo,
		deviceRepo,
		sessionRepo,
		cfg.JWT.Secret,
		cfg.JWT.TTL,
	)
	_ = authUC // gRPC handler eklenince kullanılacak

	// 5. gRPC sunucusu
	lis, err := net.Listen("tcp", cfg.GRPC.Port)
	if err != nil {
		log.Fatalf("Port dinlenemiyor %s: %v", cfg.GRPC.Port, err)
	}

	grpcServer := grpc.NewServer()

	// proto handler buraya eklenecek:
	// authpb.RegisterAuthServiceServer(grpcServer, grpcHandler.NewAuthHandler(authUC))

	// 6. Graceful shutdown — Ctrl+C veya kill sinyalinde temiz kapat
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("auth-svc gRPC sunucusu başlatıldı → %s", cfg.GRPC.Port)
		if err := grpcServer.Serve(lis); err != nil {
			log.Fatalf("gRPC sunucu hatası: %v", err)
		}
	}()

	// Sinyal bekle
	<-quit
	log.Println("Kapatma sinyali alındı, temizleniyor...")
	grpcServer.GracefulStop()
	log.Println("auth-svc kapatıldı")
}
