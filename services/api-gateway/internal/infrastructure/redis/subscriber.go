package redis

import (
	"bufio"
	"fmt"
	"net"
	"strings"
)

type MessageHandler func(channel string, message []byte)

type Subscriber struct {
	addr     string
	password string
}

func NewSubscriber(addr, password string) *Subscriber {
	return &Subscriber{addr: addr, password: password}
}

func (s *Subscriber) Subscribe(handler MessageHandler, patterns ...string) error {
	conn, err := net.Dial("tcp", s.addr)
	if err != nil {
		return fmt.Errorf("Redis bağlantısı kurulamadı: %w", err)
	}
	defer conn.Close()

	reader := bufio.NewReader(conn)

	if s.password != "" {
		fmt.Fprintf(conn, "*2\r\n$4\r\nAUTH\r\n$%d\r\n%s\r\n", len(s.password), s.password)
		reader.ReadString('\n')
		reader.ReadString('\n')
	}

	// PSUBSCRIBE — pattern ile abone ol
	cmd := fmt.Sprintf("*%d\r\n$10\r\nPSUBSCRIBE\r\n", len(patterns)+1)
	for _, p := range patterns {
		cmd += fmt.Sprintf("$%d\r\n%s\r\n", len(p), p)
	}
	fmt.Fprint(conn, cmd)

	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return fmt.Errorf("Redis okuma hatası: %w", err)
		}

		if !strings.HasPrefix(line, "*") {
			continue
		}

		// pmessage = *4 (pattern, type, channel, data)
		// psubscribe confirmation = *3
		msgType := readBulkString(reader)

		if msgType != "pmessage" {
			// confirmation — atla
			readBulkString(reader)
			readBulkString(reader)
			continue
		}

		// pattern (conv:*) — atla
		readBulkString(reader)

		// gerçek kanal adı (conv:abc123)
		channel := readBulkString(reader)

		// mesaj verisi
		payload := readBulkBytes(reader)

		if handler != nil && len(payload) > 0 {
			handler(channel, payload)
		}
	}
}

func readBulkString(r *bufio.Reader) string {
	return string(readBulkBytes(r))
}

func readBulkBytes(r *bufio.Reader) []byte {
	line, err := r.ReadString('\n')
	if err != nil || !strings.HasPrefix(line, "$") {
		return nil
	}
	var n int
	fmt.Sscanf(line, "$%d", &n)
	if n < 0 {
		return nil
	}
	data := make([]byte, n+2)
	total := 0
	for total < len(data) {
		read, err := r.Read(data[total:])
		total += read
		if err != nil {
			break
		}
	}
	return data[:n]
}
