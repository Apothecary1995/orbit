package redis

import (
	"os"
	"testing"
)

// redisAddr returns test Redis address. Set REDIS_TEST_ADDR to override.
func redisAddr() string {
	if v := os.Getenv("REDIS_TEST_ADDR"); v != "" {
		return v
	}
	return "localhost:6379"
}

func redisPassword() string {
	if v := os.Getenv("REDIS_TEST_PASSWORD"); v != "" {
		return v
	}
	return "secret"
}

func newTestClient(t *testing.T) *Client {
	t.Helper()
	c := NewClient(redisAddr(), redisPassword())
	// bağlantıyı kontrol et — Redis yoksa atla
	if err := c.Set("__ping__", "1", 1); err != nil {
		t.Skipf("Redis bağlanamadı (%v) — test atlandı", err)
	}
	return c
}

func TestSetAndGet(t *testing.T) {
	c := newTestClient(t)
	defer c.Del("test:setget")

	if err := c.Set("test:setget", "merhaba", 10); err != nil {
		t.Fatalf("Set hatası: %v", err)
	}
	val, ok, err := c.Get("test:setget")
	if err != nil {
		t.Fatalf("Get hatası: %v", err)
	}
	if !ok {
		t.Fatal("anahtar bulunamadı")
	}
	if val != "merhaba" {
		t.Errorf("beklenen 'merhaba', gelen %q", val)
	}
}

func TestGet_MissingKey(t *testing.T) {
	c := newTestClient(t)
	_, ok, err := c.Get("test:nonexistent-key-xyz-12345")
	if err != nil {
		t.Fatalf("Get hatası: %v", err)
	}
	if ok {
		t.Error("mevcut olmayan anahtar için ok=false bekleniyor")
	}
}

func TestDel(t *testing.T) {
	c := newTestClient(t)
	_ = c.Set("test:del", "silinecek", 60)
	c.Del("test:del")
	_, ok, _ := c.Get("test:del")
	if ok {
		t.Error("silinen anahtar hâlâ mevcut")
	}
}

func TestKeys_Pattern(t *testing.T) {
	c := newTestClient(t)
	defer func() {
		c.Del("test:keys:a")
		c.Del("test:keys:b")
	}()

	_ = c.Set("test:keys:a", "1", 60)
	_ = c.Set("test:keys:b", "2", 60)

	keys, err := c.Keys("test:keys:*")
	if err != nil {
		t.Fatalf("Keys hatası: %v", err)
	}
	found := map[string]bool{}
	for _, k := range keys {
		found[k] = true
	}
	if !found["test:keys:a"] || !found["test:keys:b"] {
		t.Errorf("beklenen anahtarlar bulunamadı, gelen: %v", keys)
	}
}

func TestSet_Overwrite(t *testing.T) {
	c := newTestClient(t)
	defer c.Del("test:overwrite")

	_ = c.Set("test:overwrite", "v1", 60)
	_ = c.Set("test:overwrite", "v2", 60)
	val, ok, err := c.Get("test:overwrite")
	if err != nil || !ok {
		t.Fatalf("Get hatası: ok=%v err=%v", ok, err)
	}
	if val != "v2" {
		t.Errorf("beklenen v2, gelen %q", val)
	}
}
