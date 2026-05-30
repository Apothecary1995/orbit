package redis

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
)

// RedisPublisher Redis'e mesaj publish eder.
// Üçüncü parti Redis client yok — net.Conn ile RESP protokolü kullanıyoruz.
type RedisPublisher struct {
	addr     string
	password string
}

// NewRedisPublisher RedisPublisher oluşturur.
func NewRedisPublisher(addr, password string) *RedisPublisher {
	return &RedisPublisher{addr: addr, password: password}
}

// Publish mesajı Redis kanalına gönderir.
// channel: "conv:{conversationID}"
func (r *RedisPublisher) Publish(ctx context.Context, channel string, message interface{}) error {
	// JSON'a çevir
	data, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("mesaj JSON'a çevrilemedi: %w", err)
	}

	// Redis bağlantısı aç
	conn, err := net.Dial("tcp", r.addr)
	if err != nil {
		return fmt.Errorf("Redis bağlantısı kurulamadı: %w", err)
	}
	defer conn.Close()

	// AUTH komutu
	if r.password != "" {
		if _, err := fmt.Fprintf(conn, "*2\r\n$4\r\nAUTH\r\n$%d\r\n%s\r\n", len(r.password), r.password); err != nil {
			return err
		}
		buf := make([]byte, 128)
		if _, err := conn.Read(buf); err != nil {
			return err
		}
	}

	// PUBLISH komutu — RESP protokolü
	cmd := fmt.Sprintf("*3\r\n$7\r\nPUBLISH\r\n$%d\r\n%s\r\n$%d\r\n%s\r\n",
		len(channel), channel, len(data), data)

	if _, err := fmt.Fprint(conn, cmd); err != nil {
		return fmt.Errorf("PUBLISH komutu gönderilemedi: %w", err)
	}

	return nil
}
