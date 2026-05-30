package repository

import (
	"context"

	"github.com/Apothecary1995/cengsta-paradise/services/auth-svc/internal/domain/entity"
)

// UserRepository DB'ye kullanıcı işlemleri için interface.
// Implementasyon: internal/repository/postgres/user_repository_impl.go
type UserRepository interface {
	Create(ctx context.Context, user *entity.User) error
	GetByID(ctx context.Context, id string) (*entity.User, error)
	GetByPhone(ctx context.Context, phone string) (*entity.User, error)
	GetByUsername(ctx context.Context, username string) (*entity.User, error)
	UpdateLastSeen(ctx context.Context, id string) error
	UpdateTOTP(ctx context.Context, id string, secret string, enabled bool) error
}

// DeviceRepository cihaz kayıtları için interface.
type DeviceRepository interface {
	Create(ctx context.Context, device *entity.Device) error
	GetByID(ctx context.Context, id string) (*entity.Device, error)
	ListByUserID(ctx context.Context, userID string) ([]*entity.Device, error)
	Delete(ctx context.Context, id string) error
}

// SessionRepository oturum yönetimi için interface.
type SessionRepository interface {
	Create(ctx context.Context, session *entity.Session) error
	GetByRefreshToken(ctx context.Context, token string) (*entity.Session, error)
	DeleteByID(ctx context.Context, id string) error
	DeleteAllByUserID(ctx context.Context, userID string) error
}
