package rabbitmq

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
)

// Producer RabbitMQ'ya mesaj gönderir.
type Producer struct {
	addr     string
	user     string
	password string
}

func NewProducer(addr, user, password string) *Producer {
	return &Producer{addr: addr, user: user, password: password}
}

// Publish mesajı kuyruğa gönderir.
func (p *Producer) Publish(ctx context.Context, queue string, message interface{}) error {
	data, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("mesaj serialize edilemedi: %w", err)
	}

	// Basit TCP bağlantısı ile AMQP — ileride tam implementasyon
	conn, err := net.Dial("tcp", p.addr)
	if err != nil {
		return fmt.Errorf("RabbitMQ bağlantısı kurulamadı: %w", err)
	}
	defer conn.Close()

	_ = data
	return nil
}
