package grpchandler

import (
	"context"

	pb "github.com/Apothecary1995/cengsta-paradise/gen/auth/v1"
	domainUsecase "github.com/Apothecary1995/cengsta-paradise/services/auth-svc/internal/domain/usecase"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// AuthHandler gRPC isteklerini karşılar.
// Sadece iki şey yapar: proto → usecase input, usecase output → proto
type AuthHandler struct {
	pb.UnimplementedAuthServiceServer // proto'dan üretilen base struct
	authUC                            domainUsecase.AuthUsecase
}

// NewAuthHandler AuthHandler oluşturur.
func NewAuthHandler(authUC domainUsecase.AuthUsecase) *AuthHandler {
	return &AuthHandler{authUC: authUC}
}

// Register yeni kullanıcı kaydeder.
func (h *AuthHandler) Register(ctx context.Context, req *pb.RegisterRequest) (*pb.AuthResponse, error) {
	if req.Username == "" || req.Phone == "" || req.Password == "" {
		return nil, status.Error(codes.InvalidArgument, "username, phone ve password zorunlu")
	}

	out, err := h.authUC.Register(ctx, domainUsecase.RegisterInput{
		Username: req.Username,
		Phone:    req.Phone,
		Password: req.Password,
		Device: domainUsecase.DeviceInput{
			Name:      req.Device.GetName(),
			PublicKey: req.Device.GetPublicKey(),
		},
	})
	if err != nil {
		return nil, status.Error(codes.AlreadyExists, err.Error())
	}

	return toAuthResponse(out), nil
}

// Login mevcut kullanıcıyı doğrular.
func (h *AuthHandler) Login(ctx context.Context, req *pb.LoginRequest) (*pb.AuthResponse, error) {
	if req.Phone == "" || req.Password == "" {
		return nil, status.Error(codes.InvalidArgument, "phone ve password zorunlu")
	}

	out, err := h.authUC.Login(ctx, domainUsecase.LoginInput{
		Phone:    req.Phone,
		Password: req.Password,
		Device: domainUsecase.DeviceInput{
			Name:      req.Device.GetName(),
			PublicKey: req.Device.GetPublicKey(),
		},
	})
	if err != nil {
		return nil, status.Error(codes.Unauthenticated, err.Error())
	}

	return toAuthResponse(out), nil
}

// RefreshToken access token yeniler.
func (h *AuthHandler) RefreshToken(ctx context.Context, req *pb.RefreshRequest) (*pb.AuthResponse, error) {
	if req.RefreshToken == "" {
		return nil, status.Error(codes.InvalidArgument, "refresh_token zorunlu")
	}

	out, err := h.authUC.RefreshToken(ctx, req.RefreshToken)
	if err != nil {
		return nil, status.Error(codes.Unauthenticated, err.Error())
	}

	return toAuthResponse(out), nil
}

// Logout oturumu sonlandırır.
func (h *AuthHandler) Logout(ctx context.Context, req *pb.LogoutRequest) (*pb.LogoutResponse, error) {
	if err := h.authUC.Logout(ctx, req.SessionId); err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &pb.LogoutResponse{Success: true}, nil
}

// EnableTOTP 2FA için QR kod üretir.
func (h *AuthHandler) EnableTOTP(ctx context.Context, req *pb.TOTPRequest) (*pb.TOTPResponse, error) {
	secret, qrURL, err := h.authUC.EnableTOTP(ctx, req.UserId)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &pb.TOTPResponse{Secret: secret, QrUrl: qrURL}, nil
}

// VerifyTOTP 2FA kodunu doğrular.
func (h *AuthHandler) VerifyTOTP(ctx context.Context, req *pb.VerifyTOTPRequest) (*pb.VerifyTOTPResponse, error) {
	if err := h.authUC.VerifyTOTP(ctx, req.UserId, req.Code); err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}
	return &pb.VerifyTOTPResponse{Success: true}, nil
}

// ── Yardımcı ─────────────────────────────────────────────

// toAuthResponse usecase çıktısını proto yanıtına çevirir.
func toAuthResponse(out *domainUsecase.AuthOutput) *pb.AuthResponse {
	return &pb.AuthResponse{
		AccessToken:  out.AccessToken,
		RefreshToken: out.RefreshToken,
		User: &pb.UserInfo{
			Id:          out.User.ID,
			Username:    out.User.Username,
			Phone:       out.User.Phone,
			AvatarUrl:   out.User.AvatarURL,
			TotpEnabled: out.User.TOTPEnabled,
			LastSeen:    out.User.LastSeen.String(),
			CreatedAt:   out.User.CreatedAt.String(),
		},
	}
}
