package grpcclient

import (
	"fmt"
	"log"

	authpb "github.com/Apothecary1995/cengsta-paradise/gen/auth/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// Clients tüm gRPC client bağlantılarını tutar.
type Clients struct {
	AuthService authpb.AuthServiceClient
	authConn    *grpc.ClientConn
}

// New gRPC client bağlantılarını oluşturur.
func New(authAddr string) (*Clients, error) {
	// Auth servisine bağlan
	authConn, err := grpc.NewClient(
		authAddr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		return nil, fmt.Errorf("auth-svc bağlantısı kurulamadı: %w", err)
	}
	log.Printf("auth-svc bağlantısı kuruldu → %s", authAddr)

	return &Clients{
		AuthService: authpb.NewAuthServiceClient(authConn),
		authConn:    authConn,
	}, nil
}

// Close tüm bağlantıları kapatır.
func (c *Clients) Close() {
	if c.authConn != nil {
		c.authConn.Close()
	}
}
