package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/Apothecary1995/cengsta-paradise/services/chat-svc/config"
	infraDB "github.com/Apothecary1995/cengsta-paradise/services/chat-svc/internal/infrastructure/db"
	"github.com/Apothecary1995/cengsta-paradise/services/chat-svc/internal/infrastructure/redis"
	repoPostgres "github.com/Apothecary1995/cengsta-paradise/services/chat-svc/internal/repository/postgres"
	"github.com/Apothecary1995/cengsta-paradise/services/chat-svc/internal/usecase"
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

	chatUC := usecase.New(msgRepo, convRepo, reactionRepo, publisher)
	_ = chatUC

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	log.Printf("chat-svc başlatıldı → %s", cfg.GRPC.Port)
	<-quit
	log.Println("chat-svc kapatıldı")
}
