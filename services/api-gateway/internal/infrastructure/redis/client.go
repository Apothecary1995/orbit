package redis

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
)

// Client is a minimal Redis client for SET/GET/DEL/KEYS operations.
type Client struct {
	addr     string
	password string
}

func NewClient(addr, password string) *Client {
	return &Client{addr: addr, password: password}
}

func (c *Client) dial() (net.Conn, *bufio.Reader, error) {
	conn, err := net.Dial("tcp", c.addr)
	if err != nil {
		return nil, nil, err
	}
	r := bufio.NewReader(conn)
	if c.password != "" {
		fmt.Fprintf(conn, "*2\r\n$4\r\nAUTH\r\n$%d\r\n%s\r\n", len(c.password), c.password)
		r.ReadString('\n')
		r.ReadString('\n')
	}
	return conn, r, nil
}

// Set stores key=value with optional TTL in seconds (0 = no expiry).
func (c *Client) Set(key, value string, expireSecs int) error {
	conn, r, err := c.dial()
	if err != nil {
		return err
	}
	defer conn.Close()

	if expireSecs > 0 {
		exp := strconv.Itoa(expireSecs)
		fmt.Fprintf(conn,
			"*5\r\n$3\r\nSET\r\n$%d\r\n%s\r\n$%d\r\n%s\r\n$2\r\nEX\r\n$%d\r\n%s\r\n",
			len(key), key, len(value), value, len(exp), exp)
	} else {
		fmt.Fprintf(conn,
			"*3\r\n$3\r\nSET\r\n$%d\r\n%s\r\n$%d\r\n%s\r\n",
			len(key), key, len(value), value)
	}
	line, err := r.ReadString('\n')
	if err != nil {
		return err
	}
	if !strings.HasPrefix(line, "+") {
		return fmt.Errorf("SET hatası: %s", strings.TrimSpace(line))
	}
	return nil
}

// Get returns the value for key. ok=false if key does not exist.
func (c *Client) Get(key string) (value string, ok bool, err error) {
	conn, r, connErr := c.dial()
	if connErr != nil {
		return "", false, connErr
	}
	defer conn.Close()

	fmt.Fprintf(conn, "*2\r\n$3\r\nGET\r\n$%d\r\n%s\r\n", len(key), key)
	line, err := r.ReadString('\n')
	if err != nil {
		return "", false, err
	}
	if strings.HasPrefix(line, "$-1") {
		return "", false, nil
	}
	if !strings.HasPrefix(line, "$") {
		return "", false, fmt.Errorf("GET beklenmedik yanıt: %s", strings.TrimSpace(line))
	}
	var n int
	fmt.Sscanf(line, "$%d", &n)
	if n < 0 {
		return "", false, nil
	}
	data := make([]byte, n+2) // +2 for \r\n
	if _, err := io.ReadFull(r, data); err != nil {
		return "", false, err
	}
	return string(data[:n]), true, nil
}

// Del deletes a key. Errors are silently ignored.
func (c *Client) Del(key string) {
	conn, r, err := c.dial()
	if err != nil {
		return
	}
	defer conn.Close()
	fmt.Fprintf(conn, "*2\r\n$3\r\nDEL\r\n$%d\r\n%s\r\n", len(key), key)
	r.ReadString('\n')
}

// Keys returns all keys matching the glob pattern (e.g. "guest:*").
func (c *Client) Keys(pattern string) ([]string, error) {
	conn, r, err := c.dial()
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	fmt.Fprintf(conn, "*2\r\n$4\r\nKEYS\r\n$%d\r\n%s\r\n", len(pattern), pattern)

	line, err := r.ReadString('\n')
	if err != nil {
		return nil, err
	}
	if !strings.HasPrefix(line, "*") {
		return nil, fmt.Errorf("KEYS beklenmedik yanıt: %s", strings.TrimSpace(line))
	}
	var count int
	fmt.Sscanf(line, "*%d", &count)
	if count <= 0 {
		return nil, nil
	}

	keys := make([]string, 0, count)
	for i := 0; i < count; i++ {
		// $N\r\n
		sizeLine, err := r.ReadString('\n')
		if err != nil {
			break
		}
		var n int
		fmt.Sscanf(sizeLine, "$%d", &n)
		if n < 0 {
			continue
		}
		data := make([]byte, n+2)
		if _, err := io.ReadFull(r, data); err != nil {
			break
		}
		keys = append(keys, string(data[:n]))
	}
	return keys, nil
}
