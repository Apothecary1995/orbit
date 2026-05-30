package main

import (
	"context"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"

	pb "github.com/Apothecary1995/cengsta-paradise/gen/chat/v1"
	"github.com/Apothecary1995/cengsta-paradise/services/chat-svc/config"
	grpchandler "github.com/Apothecary1995/cengsta-paradise/services/chat-svc/internal/delivery/grpc"
	infraDB "github.com/Apothecary1995/cengsta-paradise/services/chat-svc/internal/infrastructure/db"
	"github.com/Apothecary1995/cengsta-paradise/services/chat-svc/internal/infrastructure/redis"
	repoPostgres "github.com/Apothecary1995/cengsta-paradise/services/chat-svc/internal/repository/postgres"
	"github.com/Apothecary1995/cengsta-paradise/services/chat-svc/internal/usecase"

	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

func main() {
	cfg := config.Load()
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

	publisher := redis.NewRedisPublisher(cfg.Redis.Addr, cfg.Redis.Password)
	msgRepo := repoPostgres.NewMessageRepository(pool)
	convRepo := repoPostgres.NewConversationRepository(pool)
	reactionRepo := repoPostgres.NewReactionRepository(pool)
	storyRepo := repoPostgres.NewStoryRepository(pool)
	chatUC := usecase.New(msgRepo, convRepo, reactionRepo, storyRepo, publisher)

	lis, err := net.Listen("tcp", cfg.GRPC.Port)
	if err != nil {
		log.Fatalf("Port dinlenemiyor: %v", err)
	}

	grpcServer := grpc.NewServer()
	pb.RegisterChatServiceServer(grpcServer, grpchandler.NewChatHandler(chatUC))
	reflection.Register(grpcServer)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("chat-svc gRPC sunucusu başlatıldı → %s", cfg.GRPC.Port)
		if err := grpcServer.Serve(lis); err != nil {
			log.Fatalf("gRPC sunucu hatası: %v", err)
		}
	}()

	<-quit
	grpcServer.GracefulStop()
	log.Println("chat-svc kapatıldı")
}
