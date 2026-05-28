package db

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Pool uygulama boyunca tek bir connection pool kullanılır.
// Her istek için yeni bağlantı açmak çok pahalı — pool bunu yönetir.
type Pool struct {
	*pgxpool.Pool
}

// Config bağlantı ayarları.
type Config struct {
	Host     string
	Port     string
	User     string
	Password string
	DBName   string
}

// New PostgreSQL bağlantı havuzu oluşturur.
func New(ctx context.Context, cfg Config) (*Pool, error) {
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.DBName,
	)

	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("bağlantı config'i parse edilemedi: %w", err)
	}

	// Bağlantı havuzu ayarları
	config.MaxConns = 20                      // maksimum 20 eşzamanlı bağlantı
	config.MinConns = 2                       // her zaman 2 bağlantı açık kalsın
	config.MaxConnLifetime = 1 * time.Hour    // bağlantı max 1 saat yaşar
	config.MaxConnIdleTime = 30 * time.Minute // 30 dakika boşta kalırsa kapat

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("bağlantı havuzu oluşturulamadı: %w", err)
	}

	// Bağlantıyı test et
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("PostgreSQL'e ulaşılamadı: %w", err)
	}

	return &Pool{pool}, nil
}
