package config

import "os"

type Config struct {
	HTTP           HTTPConfig
	AuthSvc        GRPCServiceConfig
	ChatSvc        GRPCServiceConfig
	Redis          RedisConfig
	JWT            JWTConfig
	VAPID          VAPIDConfig
	Database       DatabaseConfig
	MinioPublicURL string
	AllowedOrigin  string
}

type DatabaseConfig struct {
	URL string
}

type VAPIDConfig struct {
	PublicKey  string
	PrivateKey string
	Subject    string
}

type HTTPConfig struct {
	Port string
}

type GRPCServiceConfig struct {
	Addr string
}

type RedisConfig struct {
	Addr     string
	Password string
}

type JWTConfig struct {
	Secret string
}

func Load() Config {
	return Config{
		HTTP: HTTPConfig{
			Port: getEnv("GATEWAY_HTTP_PORT", ":8080"),
		},
		AuthSvc: GRPCServiceConfig{
			Addr: getEnv("AUTH_SVC_ADDR", "localhost:50051"),
		},
		ChatSvc: GRPCServiceConfig{
			Addr: getEnv("CHAT_SVC_ADDR", "localhost:50052"),
		},
		Redis: RedisConfig{
			Addr:     getEnv("REDIS_ADDR", "localhost:6379"),
			Password: getEnv("REDIS_PASSWORD", "secret"),
		},
		JWT: JWTConfig{
			Secret: getEnv("JWT_SECRET", "change-me-in-production"),
		},
		VAPID: VAPIDConfig{
			PublicKey:  getEnv("VAPID_PUBLIC_KEY", ""),
			PrivateKey: getEnv("VAPID_PRIVATE_KEY", ""),
			Subject:    getEnv("VAPID_SUBJECT", "mailto:admin@cengsta.local"),
		},
		Database: DatabaseConfig{
			URL: getEnv("DATABASE_URL", "postgres://cengsta:secret@localhost:5432/cengsta_paradise"),
		},
		MinioPublicURL: getEnv("MINIO_PUBLIC_URL", "http://localhost:9000/orbit-files"),
		AllowedOrigin:  getEnv("ALLOWED_ORIGIN", "http://localhost:5173"),
	}
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}
