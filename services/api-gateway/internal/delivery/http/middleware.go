package http

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type contextKey string

const userIDKey contextKey = "userID"

type jwtClaims struct {
	Sub      string `json:"sub"`
	DeviceID string `json:"device_id"`
	Iat      int64  `json:"iat"`
	Exp      int64  `json:"exp"`
}

func parseJWT(token, secret string) (string, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return "", fmt.Errorf("geçersiz token formatı")
	}

	payload := parts[0] + "." + parts[1]
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	expected := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(expected), []byte(parts[2])) {
		return "", fmt.Errorf("geçersiz imza")
	}

	claimsJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", fmt.Errorf("claims çözülemedi")
	}

	var claims jwtClaims
	if err := json.Unmarshal(claimsJSON, &claims); err != nil {
		return "", fmt.Errorf("claims parse edilemedi")
	}

	if time.Now().Unix() > claims.Exp {
		return "", fmt.Errorf("token süresi dolmuş")
	}

	return claims.Sub, nil
}

func requireAuth(secret string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			writeError(w, http.StatusUnauthorized, "kimlik doğrulama gerekli")
			return
		}

		token := strings.TrimPrefix(authHeader, "Bearer ")
		userID, err := parseJWT(token, secret)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "geçersiz veya süresi dolmuş token")
			return
		}

		ctx := context.WithValue(r.Context(), userIDKey, userID)
		next(w, r.WithContext(ctx))
	}
}

func userIDFromCtx(ctx context.Context) string {
	v, _ := ctx.Value(userIDKey).(string)
	return v
}

// ParseToken is exported so main.go can pass it to the WebSocket hub.
func ParseToken(token, secret string) (string, error) {
	return parseJWT(token, secret)
}
