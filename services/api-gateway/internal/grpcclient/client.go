package grpcclient

import (
	"fmt"
	"log"

	authpb "github.com/Apothecary1995/cengsta-paradise/gen/auth/v1"
	chatpb "github.com/Apothecary1995/cengsta-paradise/gen/chat/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

type Clients struct {
	AuthService authpb.AuthServiceClient
	ChatService chatpb.ChatServiceClient
	authConn    *grpc.ClientConn
	chatConn    *grpc.ClientConn
}

func New(authAddr, chatAddr string) (*Clients, error) {
	authConn, err := grpc.NewClient(authAddr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		return nil, fmt.Errorf("auth-svc bağlantısı kurulamadı: %w", err)
	}
	log.Printf("auth-svc bağlantısı kuruldu → %s", authAddr)

	chatConn, err := grpc.NewClient(chatAddr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		return nil, fmt.Errorf("chat-svc bağlantısı kurulamadı: %w", err)
	}
	log.Printf("chat-svc bağlantısı kuruldu → %s", chatAddr)

	return &Clients{
		AuthService: authpb.NewAuthServiceClient(authConn),
		ChatService: chatpb.NewChatServiceClient(chatConn),
		authConn:    authConn,
		chatConn:    chatConn,
	}, nil
}

func (c *Clients) Close() {
	if c.authConn != nil {
		c.authConn.Close()
	}
	if c.chatConn != nil {
		c.chatConn.Close()
	}
}
