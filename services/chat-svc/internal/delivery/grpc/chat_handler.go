package grpchandler

import (
	domainUsecase "github.com/Apothecary1995/cengsta-paradise/services/chat-svc/internal/domain/usecase"
)

type ChatHandler struct {
	chatUC domainUsecase.ChatUsecase
}

func NewChatHandler(chatUC domainUsecase.ChatUsecase) *ChatHandler {
	return &ChatHandler{chatUC: chatUC}
}
