package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Apothecary1995/cengsta-paradise/services/auth-svc/internal/domain/entity"
	"github.com/Apothecary1995/cengsta-paradise/services/auth-svc/internal/domain/repository"
	"github.com/Apothecary1995/cengsta-paradise/services/auth-svc/internal/infrastructure/db"
	"github.com/jackc/pgx/v5"
)

// ── User Repository ──────────────────────────────────────

type userRepository struct {
	db *db.Pool
}

// NewUserRepository UserRepository interface'ini döndürür.
func NewUserRepository(db *db.Pool) repository.UserRepository {
	return &userRepository{db: db}
}

func (r *userRepository) Create(ctx context.Context, u *entity.User) error {
	query := `
		INSERT INTO users (id, username, phone, password_hash, avatar_url, totp_secret, totp_enabled, last_seen, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`
	_, err := r.db.Exec(ctx, query,
		u.ID, u.Username, u.Phone, u.PasswordHash,
		u.AvatarURL, u.TOTPSecret, u.TOTPEnabled,
		u.LastSeen, u.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("kullanıcı oluşturulamadı: %w", err)
	}
	return nil
}

func (r *userRepository) GetByID(ctx context.Context, id string) (*entity.User, error) {
	query := `
		SELECT id, username, phone, password_hash, avatar_url, totp_secret, totp_enabled, last_seen, created_at
		FROM users WHERE id = $1
	`
	return r.scanUser(r.db.QueryRow(ctx, query, id))
}

func (r *userRepository) GetByPhone(ctx context.Context, phone string) (*entity.User, error) {
	query := `
		SELECT id, username, phone, password_hash, avatar_url, totp_secret, totp_enabled, last_seen, created_at
		FROM users WHERE phone = $1
	`
	return r.scanUser(r.db.QueryRow(ctx, query, phone))
}

func (r *userRepository) GetByUsername(ctx context.Context, username string) (*entity.User, error) {
	query := `
		SELECT id, username, phone, password_hash, avatar_url, totp_secret, totp_enabled, last_seen, created_at
		FROM users WHERE username = $1
	`
	return r.scanUser(r.db.QueryRow(ctx, query, username))
}

func (r *userRepository) UpdateLastSeen(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE users SET last_seen = $1 WHERE id = $2`,
		time.Now(), id,
	)
	return err
}

func (r *userRepository) UpdateTOTP(ctx context.Context, id, secret string, enabled bool) error {
	_, err := r.db.Exec(ctx,
		`UPDATE users SET totp_secret = $1, totp_enabled = $2 WHERE id = $3`,
		secret, enabled, id,
	)
	return err
}

// scanUser pgx Row'u entity.User'a çevirir.
func (r *userRepository) scanUser(row pgx.Row) (*entity.User, error) {
	u := &entity.User{}
	err := row.Scan(
		&u.ID, &u.Username, &u.Phone, &u.PasswordHash,
		&u.AvatarURL, &u.TOTPSecret, &u.TOTPEnabled,
		&u.LastSeen, &u.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil // bulunamadı — hata değil
	}
	if err != nil {
		return nil, fmt.Errorf("kullanıcı okunamadı: %w", err)
	}
	return u, nil
}
func (r *userRepository) Search(ctx context.Context, query string) ([]*entity.User, error) {
	q := "%" + query + "%"
	sql := `
		SELECT id, username, phone, password_hash, avatar_url, totp_secret, totp_enabled, last_seen, created_at
		FROM users
		WHERE username ILIKE $1 OR phone ILIKE $1
		LIMIT 20
	`
	rows, err := r.db.Query(ctx, sql, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*entity.User
	for rows.Next() {
		u := &entity.User{}
		if err := rows.Scan(
			&u.ID, &u.Username, &u.Phone, &u.PasswordHash,
			&u.AvatarURL, &u.TOTPSecret, &u.TOTPEnabled,
			&u.LastSeen, &u.CreatedAt,
		); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, nil
}

// ── Device Repository ────────────────────────────────────

type deviceRepository struct {
	db *db.Pool
}

func NewDeviceRepository(db *db.Pool) repository.DeviceRepository {
	return &deviceRepository{db: db}
}

func (r *deviceRepository) Create(ctx context.Context, d *entity.Device) error {
	query := `
		INSERT INTO devices (id, user_id, name, public_key, last_seen, created_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`
	_, err := r.db.Exec(ctx, query,
		d.ID, d.UserID, d.Name, d.PublicKey, d.LastSeen, d.CreatedAt,
	)
	return err
}

func (r *deviceRepository) GetByID(ctx context.Context, id string) (*entity.Device, error) {
	query := `
		SELECT id, user_id, name, public_key, last_seen, created_at
		FROM devices WHERE id = $1
	`
	d := &entity.Device{}
	err := r.db.QueryRow(ctx, query, id).Scan(
		&d.ID, &d.UserID, &d.Name, &d.PublicKey, &d.LastSeen, &d.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return d, nil
}

func (r *deviceRepository) ListByUserID(ctx context.Context, userID string) ([]*entity.Device, error) {
	query := `
		SELECT id, user_id, name, public_key, last_seen, created_at
		FROM devices WHERE user_id = $1 ORDER BY created_at DESC
	`
	rows, err := r.db.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var devices []*entity.Device
	for rows.Next() {
		d := &entity.Device{}
		if err := rows.Scan(&d.ID, &d.UserID, &d.Name, &d.PublicKey, &d.LastSeen, &d.CreatedAt); err != nil {
			return nil, err
		}
		devices = append(devices, d)
	}
	return devices, nil
}

func (r *deviceRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM devices WHERE id = $1`, id)
	return err
}

// ── Session Repository ───────────────────────────────────

type sessionRepository struct {
	db *db.Pool
}

func NewSessionRepository(db *db.Pool) repository.SessionRepository {
	return &sessionRepository{db: db}
}

func (r *sessionRepository) Create(ctx context.Context, s *entity.Session) error {
	query := `
		INSERT INTO sessions (id, user_id, device_id, refresh_token, expires_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`
	_, err := r.db.Exec(ctx, query,
		s.ID, s.UserID, s.DeviceID, s.RefreshToken, s.ExpiresAt, s.CreatedAt,
	)
	return err
}

func (r *sessionRepository) GetByRefreshToken(ctx context.Context, token string) (*entity.Session, error) {
	query := `
		SELECT id, user_id, device_id, refresh_token, expires_at, created_at
		FROM sessions WHERE refresh_token = $1
	`
	s := &entity.Session{}
	err := r.db.QueryRow(ctx, query, token).Scan(
		&s.ID, &s.UserID, &s.DeviceID, &s.RefreshToken, &s.ExpiresAt, &s.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return s, nil
}

func (r *sessionRepository) DeleteByID(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM sessions WHERE id = $1`, id)
	return err
}

func (r *sessionRepository) DeleteAllByUserID(ctx context.Context, userID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM sessions WHERE user_id = $1`, userID)
	return err
}
