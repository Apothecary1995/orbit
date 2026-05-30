package usecase

import (
	"context"

	"github.com/Apothecary1995/cengsta-paradise/services/auth-svc/internal/domain/entity"
)

type RegisterInput struct {
	Username string
	Phone    string
	Password string
	Device   DeviceInput
}

type LoginInput struct {
	Phone    string
	Password string
	Device   DeviceInput
}

type DeviceInput struct {
	Name      string
	PublicKey string
}

type AuthOutput struct {
	User         *entity.User
	AccessToken  string
	RefreshToken string
}

type AuthUsecase interface {
	Register(ctx context.Context, input RegisterInput) (*AuthOutput, error)
	Login(ctx context.Context, input LoginInput) (*AuthOutput, error)
	RefreshToken(ctx context.Context, refreshToken string) (*AuthOutput, error)
	Logout(ctx context.Context, sessionID string) error
	EnableTOTP(ctx context.Context, userID string) (secret string, qrURL string, err error)
	VerifyTOTP(ctx context.Context, userID string, code string) error
	SearchUser(ctx context.Context, query string) ([]*entity.User, error)
	UpdateLastSeen(ctx context.Context, userID string) error
	GetUser(ctx context.Context, userID string) (*entity.User, error)
}
