package usecase

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/base32"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// ── ID üretimi ───────────────────────────────────────────

// generateID rastgele 16 byte hex ID üretir.
func generateID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// ── Şifre ────────────────────────────────────────────────

// hashPassword bcrypt ile hash'ler — kendi içinde salt ekler.
func hashPassword(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(b), err
}

// checkPassword hash ile düz şifreyi karşılaştırır.
func checkPassword(password, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// ── JWT (stdlib, üçüncü parti yok) ──────────────────────

type jwtHeader struct {
	Alg string `json:"alg"`
	Typ string `json:"typ"`
}

type jwtClaims struct {
	Sub      string `json:"sub"` // user ID
	DeviceID string `json:"device_id"`
	Iat      int64  `json:"iat"` // üretilme zamanı
	Exp      int64  `json:"exp"` // son kullanma zamanı
}

// generateJWT HS256 algoritması ile JWT üretir.
// header.claims.imza formatı — RFC 7519
func generateJWT(userID, deviceID, secret string, ttl time.Duration) (string, error) {
	headerJSON, _ := json.Marshal(jwtHeader{Alg: "HS256", Typ: "JWT"})
	headerB64 := base64.RawURLEncoding.EncodeToString(headerJSON)

	now := time.Now()
	claimsJSON, _ := json.Marshal(jwtClaims{
		Sub:      userID,
		DeviceID: deviceID,
		Iat:      now.Unix(),
		Exp:      now.Add(ttl).Unix(),
	})
	claimsB64 := base64.RawURLEncoding.EncodeToString(claimsJSON)

	// HMAC-SHA256 imza
	payload := headerB64 + "." + claimsB64
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	return payload + "." + sig, nil
}

// ParseJWT token'ı doğrular, claim'leri döndürür.
func ParseJWT(token, secret string) (*jwtClaims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("geçersiz token")
	}

	// İmzayı doğrula
	payload := parts[0] + "." + parts[1]
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	expected := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(expected), []byte(parts[2])) {
		return nil, fmt.Errorf("geçersiz imza")
	}

	// Claims'i çöz
	claimsJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("claims çözülemedi")
	}

	var claims jwtClaims
	if err := json.Unmarshal(claimsJSON, &claims); err != nil {
		return nil, fmt.Errorf("claims parse edilemedi")
	}

	if time.Now().Unix() > claims.Exp {
		return nil, fmt.Errorf("token süresi dolmuş")
	}

	return &claims, nil
}

// ── Refresh token ────────────────────────────────────────

// generateRefreshToken güvenli rastgele 32 byte token üretir.
func generateRefreshToken() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return base64.URLEncoding.EncodeToString(b)
}

// ── TOTP (RFC 6238, stdlib ile) ──────────────────────────

// generateTOTPSecret 20 byte rastgele secret üretir.
func generateTOTPSecret() (string, error) {
	b := make([]byte, 20)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base32.StdEncoding.EncodeToString(b), nil
}

// verifyTOTP Google Authenticator uyumlu 6 haneli kodu doğrular.
// ±1 periyot tolerans var — saat farkı olan cihazlar için.
func verifyTOTP(secret, code string) bool {
	now := time.Now().Unix() / 30
	for _, t := range []int64{now - 1, now, now + 1} {
		if totpCode(secret, t) == code {
			return true
		}
	}
	return false
}

// totpCode verilen zaman periyodu için 6 haneli kod üretir — RFC 6238.
func totpCode(secret string, counter int64) string {
	// Base32 decode (padding ekle)
	s := strings.ToUpper(secret)
	if n := len(s) % 8; n != 0 {
		s += strings.Repeat("=", 8-n)
	}
	key, err := base32.StdEncoding.DecodeString(s)
	if err != nil {
		return ""
	}

	// Counter → big-endian 8 byte
	buf := make([]byte, 8)
	binary.BigEndian.PutUint64(buf, uint64(counter))

	// HMAC-SHA512
	mac := hmac.New(sha512.New, key)
	mac.Write(buf)
	h := mac.Sum(nil)

	// Dynamic truncation
	offset := h[len(h)-1] & 0x0f
	code := binary.BigEndian.Uint32(h[offset:offset+4]) & 0x7fffffff

	return fmt.Sprintf("%06d", code%uint32(math.Pow10(6)))
}
