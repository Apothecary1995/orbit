package usecase

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Apothecary1995/cengsta-paradise/services/auth-svc/internal/domain/entity"
	"github.com/Apothecary1995/cengsta-paradise/services/auth-svc/internal/domain/repository"
	domainUsecase "github.com/Apothecary1995/cengsta-paradise/services/auth-svc/internal/domain/usecase"
)

// authUsecase AuthUsecase interface'ini implemente eder.
// lowercase — dışarıdan erişilemez, sadece New() ile oluşturulur.
type authUsecase struct {
	userRepo    repository.UserRepository
	deviceRepo  repository.DeviceRepository
	sessionRepo repository.SessionRepository
	jwtSecret   string
	jwtTTL      time.Duration
}

// New bağımlılıkları dışarıdan alır ve authUsecase döndürür.
// Buna "dependency injection" denir — test yazmak çok kolaylaşır.
func New(
	userRepo repository.UserRepository,
	deviceRepo repository.DeviceRepository,
	sessionRepo repository.SessionRepository,
	jwtSecret string,
	jwtTTL time.Duration,
) domainUsecase.AuthUsecase {
	return &authUsecase{
		userRepo:    userRepo,
		deviceRepo:  deviceRepo,
		sessionRepo: sessionRepo,
		jwtSecret:   jwtSecret,
		jwtTTL:      jwtTTL,
	}
}

func (a *authUsecase) Register(ctx context.Context, input domainUsecase.RegisterInput) (*domainUsecase.AuthOutput, error) {
	// Telefon numarası kayıtlı mı?
	existing, _ := a.userRepo.GetByPhone(ctx, input.Phone)
	if existing != nil {
		return nil, errors.New("bu telefon numarası zaten kayıtlı")
	}

	// Kullanıcı adı alınmış mı?
	existingUser, _ := a.userRepo.GetByUsername(ctx, input.Username)
	if existingUser != nil {
		return nil, errors.New("bu kullanıcı adı zaten alınmış")
	}

	// Şifreyi hash'le — DB'ye düz şifre asla yazılmaz
	hash, err := hashPassword(input.Password)
	if err != nil {
		return nil, fmt.Errorf("şifre hash'lenemedi: %w", err)
	}

	user := &entity.User{
		ID:           generateID(),
		Username:     input.Username,
		Phone:        input.Phone,
		PasswordHash: hash,
		CreatedAt:    time.Now(),
		LastSeen:     time.Now(),
	}

	if err := a.userRepo.Create(ctx, user); err != nil {
		return nil, fmt.Errorf("kullanıcı oluşturulamadı: %w", err)
	}

	device := &entity.Device{
		ID:        generateID(),
		UserID:    user.ID,
		Name:      input.Device.Name,
		PublicKey: input.Device.PublicKey,
		CreatedAt: time.Now(),
		LastSeen:  time.Now(),
	}

	if err := a.deviceRepo.Create(ctx, device); err != nil {
		return nil, fmt.Errorf("cihaz kaydedilemedi: %w", err)
	}

	return a.createSession(ctx, user, device)
}

func (a *authUsecase) Login(ctx context.Context, input domainUsecase.LoginInput) (*domainUsecase.AuthOutput, error) {
	user, err := a.userRepo.GetByPhone(ctx, input.Phone)
	if err != nil || user == nil {
		return nil, errors.New("telefon veya şifre hatalı")
	}

	// Şifreyi doğrula
	if !checkPassword(input.Password, user.PasswordHash) {
		return nil, errors.New("telefon veya şifre hatalı")
	}

	device := &entity.Device{
		ID:        generateID(),
		UserID:    user.ID,
		Name:      input.Device.Name,
		PublicKey: input.Device.PublicKey,
		CreatedAt: time.Now(),
		LastSeen:  time.Now(),
	}

	if err := a.deviceRepo.Create(ctx, device); err != nil {
		return nil, fmt.Errorf("cihaz kaydedilemedi: %w", err)
	}

	_ = a.userRepo.UpdateLastSeen(ctx, user.ID)

	return a.createSession(ctx, user, device)
}

func (a *authUsecase) RefreshToken(ctx context.Context, refreshToken string) (*domainUsecase.AuthOutput, error) {
	session, err := a.sessionRepo.GetByRefreshToken(ctx, refreshToken)
	if err != nil || session == nil {
		return nil, errors.New("geçersiz refresh token")
	}

	if time.Now().After(session.ExpiresAt) {
		return nil, errors.New("oturum süresi dolmuş, tekrar giriş yapın")
	}

	user, err := a.userRepo.GetByID(ctx, session.UserID)
	if err != nil {
		return nil, errors.New("kullanıcı bulunamadı")
	}

	device, err := a.deviceRepo.GetByID(ctx, session.DeviceID)
	if err != nil {
		return nil, errors.New("cihaz bulunamadı")
	}

	_ = a.sessionRepo.DeleteByID(ctx, session.ID)
	return a.createSession(ctx, user, device)
}

func (a *authUsecase) Logout(ctx context.Context, sessionID string) error {
	return a.sessionRepo.DeleteByID(ctx, sessionID)
}

func (a *authUsecase) EnableTOTP(ctx context.Context, userID string) (string, string, error) {
	secret, err := generateTOTPSecret()
	if err != nil {
		return "", "", fmt.Errorf("secret üretilemedi: %w", err)
	}

	user, err := a.userRepo.GetByID(ctx, userID)
	if err != nil {
		return "", "", errors.New("kullanıcı bulunamadı")
	}

	if err := a.userRepo.UpdateTOTP(ctx, userID, secret, false); err != nil {
		return "", "", fmt.Errorf("TOTP kaydedilemedi: %w", err)
	}

	// Google Authenticator'ın okuduğu QR URL formatı
	qrURL := fmt.Sprintf(
		"otpauth://totp/CengstaParadise:%s?secret=%s&issuer=CengstaParadise",
		user.Username, secret,
	)

	return secret, qrURL, nil
}

func (a *authUsecase) VerifyTOTP(ctx context.Context, userID string, code string) error {
	user, err := a.userRepo.GetByID(ctx, userID)
	if err != nil {
		return errors.New("kullanıcı bulunamadı")
	}

	if !verifyTOTP(user.TOTPSecret, code) {
		return errors.New("geçersiz 2FA kodu")
	}

	return a.userRepo.UpdateTOTP(ctx, userID, user.TOTPSecret, true)
}

// createSession JWT + refresh token üretir, session kaydeder.
func (a *authUsecase) createSession(ctx context.Context, user *entity.User, device *entity.Device) (*domainUsecase.AuthOutput, error) {
	accessToken, err := generateJWT(user.ID, device.ID, a.jwtSecret, a.jwtTTL)
	if err != nil {
		return nil, fmt.Errorf("access token üretilemedi: %w", err)
	}

	refreshToken := generateRefreshToken()

	session := &entity.Session{
		ID:           generateID(),
		UserID:       user.ID,
		DeviceID:     device.ID,
		RefreshToken: refreshToken,
		ExpiresAt:    time.Now().Add(30 * 24 * time.Hour),
		CreatedAt:    time.Now(),
	}

	if err := a.sessionRepo.Create(ctx, session); err != nil {
		return nil, fmt.Errorf("oturum kaydedilemedi: %w", err)
	}

	return &domainUsecase.AuthOutput{
		User:         user,
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
	}, nil
}
