package config

import (
	"os"
	"time"
)

// Config tüm servis ayarlarını tutar.
type Config struct {
	GRPC  GRPCConfig
	DB    DBConfig
	Redis RedisConfig
	JWT   JWTConfig
}

type GRPCConfig struct {
	Port string // ":50051"
}

type DBConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	Name     string
}

type RedisConfig struct {
	Addr     string
	Password string
}

type JWTConfig struct {
	Secret string
	TTL    time.Duration
}

// Load environment değişkenlerinden config okur.
// Değer yoksa default kullanır.
func Load() Config {
	return Config{
		GRPC: GRPCConfig{
			Port: getEnv("AUTH_GRPC_PORT", ":50051"),
		},
		DB: DBConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     getEnv("DB_PORT", "5432"),
			User:     getEnv("DB_USER", "cengsta"),
			Password: getEnv("DB_PASSWORD", "secret"),
			Name:     getEnv("DB_NAME", "cengsta_db"),
		},
		Redis: RedisConfig{
			Addr:     getEnv("REDIS_ADDR", "localhost:6379"),
			Password: getEnv("REDIS_PASSWORD", "secret"),
		},
		JWT: JWTConfig{
			Secret: getEnv("JWT_SECRET", "change-me-in-production"),
			TTL:    15 * time.Minute, // access token 15 dakika geçerli
		},
	}
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}
