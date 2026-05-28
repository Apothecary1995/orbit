package entity

import "time"

// User uygulamadaki her hesabı temsil eder.
type User struct {
	ID           string    `json:"id"`
	Username     string    `json:"username"`
	Phone        string    `json:"phone"`
	PasswordHash string    `json:"-"`
	AvatarURL    string    `json:"avatar_url"`
	TOTPSecret   string    `json:"-"` // 2FA secret, dışarı sızmaz
	TOTPEnabled  bool      `json:"totp_enabled"`
	LastSeen     time.Time `json:"last_seen"`
	CreatedAt    time.Time `json:"created_at"`
}

// Device kullanıcının giriş yaptığı her cihazı temsil eder.
// Yeni cihaz girişinde diğer cihazlara bildirim gider.
type Device struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Name      string    `json:"name"`
	PublicKey string    `json:"public_key"`
	LastSeen  time.Time `json:"last_seen"`
	CreatedAt time.Time `json:"created_at"`
}

type Session struct {
	ID           string    `json:"id"`
	UserID       string    `json:"user_id"`
	DeviceID     string    `json:"device_id"`
	RefreshToken string    `json:"-"`
	ExpiresAt    time.Time `json:"expires_at"`
	CreatedAt    time.Time `json:"created_at"`
}
