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
const guestKey contextKey = "isGuest"

type jwtClaims struct {
	Sub      string `json:"sub"`
	DeviceID string `json:"device_id"`
	Guest    bool   `json:"guest"`
	Iat      int64  `json:"iat"`
	Exp      int64  `json:"exp"`
}

func parseJWTClaims(token, secret string) (*jwtClaims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("geçersiz token formatı")
	}

	payload := parts[0] + "." + parts[1]
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	expected := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(expected), []byte(parts[2])) {
		return nil, fmt.Errorf("geçersiz imza")
	}

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

func parseJWT(token, secret string) (string, error) {
	claims, err := parseJWTClaims(token, secret)
	if err != nil {
		return "", err
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
		claims, err := parseJWTClaims(token, secret)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "geçersiz veya süresi dolmuş token")
			return
		}

		ctx := context.WithValue(r.Context(), userIDKey, claims.Sub)
		ctx = context.WithValue(ctx, guestKey, claims.Guest)
		next(w, r.WithContext(ctx))
	}
}

func userIDFromCtx(ctx context.Context) string {
	v, _ := ctx.Value(userIDKey).(string)
	return v
}

func isGuestFromCtx(ctx context.Context) bool {
	v, _ := ctx.Value(guestKey).(bool)
	return v
}

// ParseToken is exported so main.go can pass it to the WebSocket hub.
func ParseToken(token, secret string) (string, error) {
	return parseJWT(token, secret)
}
