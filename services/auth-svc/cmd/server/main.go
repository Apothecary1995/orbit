package main

import (
	"context"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"

	authpb "github.com/Apothecary1995/cengsta-paradise/gen/auth/v1"
	"github.com/Apothecary1995/cengsta-paradise/services/auth-svc/config"
	grpchandler "github.com/Apothecary1995/cengsta-paradise/services/auth-svc/internal/delivery/grpc"
	infraDB "github.com/Apothecary1995/cengsta-paradise/services/auth-svc/internal/infrastructure/db"
	repoPostgres "github.com/Apothecary1995/cengsta-paradise/services/auth-svc/internal/repository/postgres"
	"github.com/Apothecary1995/cengsta-paradise/services/auth-svc/internal/usecase"

	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

func main() {
	cfg := config.Load()

	// JWT secret güç kontrolü
	isProd := os.Getenv("GO_ENV") == "production"
	if cfg.JWT.Secret == "change-me-in-production" || len(cfg.JWT.Secret) < 32 {
		if isProd {
			log.Fatal("HATA: JWT_SECRET zayıf veya varsayılan. Üretimde en az 32 karakterli güçlü bir secret kullan.")
		}
		log.Println("UYARI: JWT_SECRET zayıf — üretimde mutlaka değiştir!")
	}

	ctx := context.Background()
	pool, err := infraDB.New(ctx, infraDB.Config{
		Host:     cfg.DB.Host,
		Port:     cfg.DB.Port,
		User:     cfg.DB.User,
		Password: cfg.DB.Password,
		DBName:   cfg.DB.Name,
	})
	if err != nil {
		log.Fatalf("PostgreSQL bağlantısı kurulamadı: %v", err)
	}
	defer pool.Close()
	log.Println("PostgreSQL bağlantısı kuruldu")

	userRepo := repoPostgres.NewUserRepository(pool)
	deviceRepo := repoPostgres.NewDeviceRepository(pool)
	sessionRepo := repoPostgres.NewSessionRepository(pool)

	authUC := usecase.New(
		userRepo,
		deviceRepo,
		sessionRepo,
		cfg.JWT.Secret,
		cfg.JWT.TTL,
	)

	lis, err := net.Listen("tcp", cfg.GRPC.Port)
	if err != nil {
		log.Fatalf("Port dinlenemiyor %s: %v", cfg.GRPC.Port, err)
	}

	grpcServer := grpc.NewServer()

	// Handler kaydet
	authpb.RegisterAuthServiceServer(grpcServer, grpchandler.NewAuthHandler(authUC))

	// Reflection — grpcurl test için
	reflection.Register(grpcServer)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("auth-svc gRPC sunucusu başlatıldı → %s", cfg.GRPC.Port)
		if err := grpcServer.Serve(lis); err != nil {
			log.Fatalf("gRPC sunucu hatası: %v", err)
		}
	}()

	<-quit
	log.Println("Kapatma sinyali alındı, temizleniyor...")
	grpcServer.GracefulStop()
	log.Println("auth-svc kapatıldı")
}
