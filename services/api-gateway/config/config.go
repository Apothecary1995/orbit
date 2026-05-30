package config

import "os"

type Config struct {
	HTTP    HTTPConfig
	AuthSvc GRPCServiceConfig
	ChatSvc GRPCServiceConfig
	Redis   RedisConfig
	JWT     JWTConfig
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
	}
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}
