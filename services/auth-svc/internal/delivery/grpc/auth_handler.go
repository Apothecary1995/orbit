package grpchandler

import (
	"context"

	pb "github.com/Apothecary1995/cengsta-paradise/gen/auth/v1"
	domainUsecase "github.com/Apothecary1995/cengsta-paradise/services/auth-svc/internal/domain/usecase"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type AuthHandler struct {
	pb.UnimplementedAuthServiceServer
	authUC domainUsecase.AuthUsecase
}

func NewAuthHandler(authUC domainUsecase.AuthUsecase) *AuthHandler {
	return &AuthHandler{authUC: authUC}
}

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

func (h *AuthHandler) Logout(ctx context.Context, req *pb.LogoutRequest) (*pb.LogoutResponse, error) {
	if err := h.authUC.Logout(ctx, req.SessionId); err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &pb.LogoutResponse{Success: true}, nil
}

func (h *AuthHandler) EnableTOTP(ctx context.Context, req *pb.TOTPRequest) (*pb.TOTPResponse, error) {
	secret, qrURL, err := h.authUC.EnableTOTP(ctx, req.UserId)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &pb.TOTPResponse{Secret: secret, QrUrl: qrURL}, nil
}

func (h *AuthHandler) VerifyTOTP(ctx context.Context, req *pb.VerifyTOTPRequest) (*pb.VerifyTOTPResponse, error) {
	if err := h.authUC.VerifyTOTP(ctx, req.UserId, req.Code); err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}
	return &pb.VerifyTOTPResponse{Success: true}, nil
}

func (h *AuthHandler) SearchUser(ctx context.Context, req *pb.SearchUserRequest) (*pb.SearchUserResponse, error) {
	if req.Query == "" {
		return nil, status.Error(codes.InvalidArgument, "query zorunlu")
	}
	users, err := h.authUC.SearchUser(ctx, req.Query)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	var pbUsers []*pb.UserInfo
	for _, u := range users {
		pbUsers = append(pbUsers, &pb.UserInfo{
			Id:          u.ID,
			Username:    u.Username,
			Phone:       u.Phone,
			AvatarUrl:   u.AvatarURL,
			TotpEnabled: u.TOTPEnabled,
			LastSeen:    u.LastSeen.String(),
			CreatedAt:   u.CreatedAt.String(),
		})
	}
	return &pb.SearchUserResponse{Users: pbUsers}, nil
}

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
