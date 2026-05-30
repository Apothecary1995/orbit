package websocket

import (
	"bufio"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
)

const wsGUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

// Opcode tanımları
const (
	OpText   = 0x1
	OpBinary = 0x2
	OpClose  = 0x8
	OpPing   = 0x9
	OpPong   = 0xA
)

// Conn tek bir WebSocket bağlantısını temsil eder.
type Conn struct {
	conn   net.Conn
	reader *bufio.Reader
}

// Upgrade HTTP bağlantısını WebSocket'e yükseltir.
func Upgrade(w http.ResponseWriter, r *http.Request) (*Conn, error) {
	key := r.Header.Get("Sec-WebSocket-Key")
	if key == "" {
		return nil, fmt.Errorf("Sec-WebSocket-Key header eksik")
	}

	// Accept key hesapla — SHA1(key + GUID) base64
	h := sha1.New()
	h.Write([]byte(key + wsGUID))
	accept := base64.StdEncoding.EncodeToString(h.Sum(nil))

	// Hijack — HTTP bağlantısını ele geçir
	hj, ok := w.(http.Hijacker)
	if !ok {
		return nil, fmt.Errorf("hijacking desteklenmiyor")
	}

	conn, rw, err := hj.Hijack()
	if err != nil {
		return nil, fmt.Errorf("hijack hatası: %w", err)
	}

	// 101 Switching Protocols yanıtını gönder
	response := strings.Join([]string{
		"HTTP/1.1 101 Switching Protocols",
		"Upgrade: websocket",
		"Connection: Upgrade",
		"Sec-WebSocket-Accept: " + accept,
		"",
		"",
	}, "\r\n")

	if _, err := fmt.Fprint(conn, response); err != nil {
		conn.Close()
		return nil, fmt.Errorf("handshake yanıtı gönderilemedi: %w", err)
	}

	return &Conn{conn: conn, reader: rw.Reader}, nil
}

// ReadMessage client'tan bir mesaj okur.
// Client her zaman maskelenmiş frame gönderir — RFC 6455.
func (c *Conn) ReadMessage() (int, []byte, error) {
	// İlk 2 byte: FIN+opcode ve MASK+payload length
	header := make([]byte, 2)
	if _, err := io.ReadFull(c.reader, header); err != nil {
		return 0, nil, err
	}

	opcode := int(header[0] & 0x0F)
	masked := header[1]&0x80 != 0
	payloadLen := int64(header[1] & 0x7F)

	// Genişletilmiş payload uzunluğu
	switch payloadLen {
	case 126:
		ext := make([]byte, 2)
		if _, err := io.ReadFull(c.reader, ext); err != nil {
			return 0, nil, err
		}
		payloadLen = int64(binary.BigEndian.Uint16(ext))
	case 127:
		ext := make([]byte, 8)
		if _, err := io.ReadFull(c.reader, ext); err != nil {
			return 0, nil, err
		}
		payloadLen = int64(binary.BigEndian.Uint64(ext))
	}

	// Maskeleme anahtarı (client her zaman maskeler)
	var maskKey [4]byte
	if masked {
		if _, err := io.ReadFull(c.reader, maskKey[:]); err != nil {
			return 0, nil, err
		}
	}

	// Payload
	payload := make([]byte, payloadLen)
	if _, err := io.ReadFull(c.reader, payload); err != nil {
		return 0, nil, err
	}

	// Maskeyi çöz
	if masked {
		for i := range payload {
			payload[i] ^= maskKey[i%4]
		}
	}

	// Ping'e pong döndür
	if opcode == OpPing {
		_ = c.WriteMessage(OpPong, payload)
		return c.ReadMessage()
	}

	// Close frame — bağlantıyı kapat
	if opcode == OpClose {
		return 0, nil, io.EOF
	}

	return opcode, payload, nil
}

// WriteMessage client'a mesaj gönderir.
// Server hiç maskesiz gönderir — RFC 6455.
func (c *Conn) WriteMessage(opcode int, payload []byte) error {
	frame := buildFrame(opcode, payload)
	_, err := c.conn.Write(frame)
	return err
}

// Close WebSocket bağlantısını kapatır.
func (c *Conn) Close() {
	_ = c.WriteMessage(OpClose, []byte{})
	c.conn.Close()
}

// buildFrame WebSocket frame oluşturur.
func buildFrame(opcode int, payload []byte) []byte {
	payloadLen := len(payload)
	var frame []byte

	// Byte 0: FIN=1 + opcode
	frame = append(frame, byte(0x80|opcode))

	// Byte 1+: payload uzunluğu (maskelenmemiş)
	switch {
	case payloadLen < 126:
		frame = append(frame, byte(payloadLen))
	case payloadLen < 65536:
		frame = append(frame, 126)
		ext := make([]byte, 2)
		binary.BigEndian.PutUint16(ext, uint16(payloadLen))
		frame = append(frame, ext...)
	default:
		frame = append(frame, 127)
		ext := make([]byte, 8)
		binary.BigEndian.PutUint64(ext, uint64(payloadLen))
		frame = append(frame, ext...)
	}

	frame = append(frame, payload...)
	return frame
}
