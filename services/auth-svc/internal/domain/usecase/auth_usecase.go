package usecase

import (
	"context"

	"github.com/Apothecary1995/cengsta-paradise/auth-svc/internal/domain/entity"
)

// RegisterInput kayıt için gereken bilgiler.
type RegisterInput struct {
	Username string
	Phone    string
	Password string
	Device   DeviceInput
}

// LoginInput giriş için gereken bilgiler.
type LoginInput struct {
	Phone    string
	Password string
	Device   DeviceInput
}

// DeviceInput cihaz bilgileri.
type DeviceInput struct {
	Name      string
	PublicKey string
}

// AuthOutput başarılı giriş/kayıt sonucu.
type AuthOutput struct {
	User         *entity.User
	AccessToken  string
	RefreshToken string
}

// AuthUsecase auth servisinin tüm iş mantığını tanımlar.
type AuthUsecase interface {
	Register(ctx context.Context, input RegisterInput) (*AuthOutput, error)
	Login(ctx context.Context, input LoginInput) (*AuthOutput, error)
	RefreshToken(ctx context.Context, refreshToken string) (*AuthOutput, error)
	Logout(ctx context.Context, sessionID string) error
	EnableTOTP(ctx context.Context, userID string) (secret string, qrURL string, err error)
	VerifyTOTP(ctx context.Context, userID string, code string) error
}
