package http

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

const testSecret = "supersecretkey-at-least-32-chars-ok"

func makeToken(sub, secret string, ttl time.Duration, guest bool) string {
	hdr, _ := json.Marshal(map[string]string{"alg": "HS256", "typ": "JWT"})
	now := time.Now()
	cls, _ := json.Marshal(map[string]interface{}{
		"sub":   sub,
		"guest": guest,
		"iat":   now.Unix(),
		"exp":   now.Add(ttl).Unix(),
	})
	h := base64.RawURLEncoding.EncodeToString(hdr)
	c := base64.RawURLEncoding.EncodeToString(cls)
	input := h + "." + c
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(input))
	return input + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func TestParseJWT_Valid(t *testing.T) {
	token := makeToken("user-123", testSecret, time.Hour, false)
	id, err := parseJWT(token, testSecret)
	if err != nil {
		t.Fatalf("beklenen başarı, hata: %v", err)
	}
	if id != "user-123" {
		t.Errorf("beklenen user-123, gelen %q", id)
	}
}

func TestParseJWT_WrongSecret(t *testing.T) {
	token := makeToken("user-123", testSecret, time.Hour, false)
	_, err := parseJWT(token, "wrong-secret")
	if err == nil {
		t.Fatal("yanlış secret'la hata bekleniyor")
	}
}

func TestParseJWT_Expired(t *testing.T) {
	token := makeToken("user-123", testSecret, -time.Minute, false)
	_, err := parseJWT(token, testSecret)
	if err == nil {
		t.Fatal("süresi dolmuş token için hata bekleniyor")
	}
}

func TestParseJWT_MalformedToken(t *testing.T) {
	for _, bad := range []string{"", "a.b", "a.b.c.d", "notavalidtoken"} {
		_, err := parseJWT(bad, testSecret)
		if err == nil {
			t.Errorf("geçersiz token %q için hata bekleniyor", bad)
		}
	}
}

func TestParseJWTClaims_GuestFlag(t *testing.T) {
	token := makeToken("Misafir_1234", testSecret, time.Hour, true)
	claims, err := parseJWTClaims(token, testSecret)
	if err != nil {
		t.Fatalf("hata: %v", err)
	}
	if !claims.Guest {
		t.Error("guest flag bekleniyor")
	}
	if claims.Sub != "Misafir_1234" {
		t.Errorf("beklenen Misafir_1234, gelen %q", claims.Sub)
	}
}

func TestParseToken_Exported(t *testing.T) {
	token := makeToken("abc", testSecret, time.Hour, false)
	id, err := ParseToken(token, testSecret)
	if err != nil || id != "abc" {
		t.Errorf("ParseToken başarısız: id=%q err=%v", id, err)
	}
}

func TestRequireAuth_MissingHeader(t *testing.T) {
	handler := requireAuth(testSecret, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	handler(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("beklenen 401, gelen %d", rec.Code)
	}
}

func TestRequireAuth_ValidToken(t *testing.T) {
	token := makeToken("u1", testSecret, time.Hour, false)
	handler := requireAuth(testSecret, func(w http.ResponseWriter, r *http.Request) {
		id := userIDFromCtx(r.Context())
		if id != "u1" {
			t.Errorf("context'te beklenen u1, gelen %q", id)
		}
		w.WriteHeader(http.StatusOK)
	})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("beklenen 200, gelen %d", rec.Code)
	}
}

func TestRequireAuth_GuestContextFlag(t *testing.T) {
	token := makeToken("Misafir_99", testSecret, time.Hour, true)
	handler := requireAuth(testSecret, func(w http.ResponseWriter, r *http.Request) {
		if !isGuestFromCtx(r.Context()) {
			t.Error("misafir flag bekleniyor")
		}
		w.WriteHeader(http.StatusOK)
	})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler(rec, req)
}
