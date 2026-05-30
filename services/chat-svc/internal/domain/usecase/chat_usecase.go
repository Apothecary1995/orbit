package usecase

import (
	"context"

	"github.com/Apothecary1995/cengsta-paradise/services/chat-svc/internal/domain/entity"
)

// SendMessageInput mesaj gönderme girdisi.
type SendMessageInput struct {
	ConversationID string
	SenderID       string
	Type           entity.MessageType
	Content        string
	EncryptedKey   string
	ReplyToID      string
}

// CreateConversationInput sohbet oluşturma girdisi.
type CreateConversationInput struct {
	Type      string // "direct" veya "group"
	Name      string
	CreatedBy string
	MemberIDs []string
}

// ChatUsecase chat servisinin iş mantığını tanımlar.
type ChatUsecase interface {
	// Mesaj işlemleri
	SendMessage(ctx context.Context, input SendMessageInput) (*entity.Message, error)
	GetHistory(ctx context.Context, conversationID string, limit, offset int) ([]*entity.Message, error)
	MarkAsRead(ctx context.Context, messageID, userID string) error
	EditMessage(ctx context.Context, messageID, userID, newContent string) error
	DeleteMessage(ctx context.Context, messageID, userID string) error
	AddReaction(ctx context.Context, messageID, userID, emoji string) error
	RemoveReaction(ctx context.Context, messageID, userID, emoji string) error

	// Sohbet işlemleri
	CreateConversation(ctx context.Context, input CreateConversationInput) (*entity.Conversation, error)
	GetConversations(ctx context.Context, userID string) ([]*entity.Conversation, error)
	GetOrCreateDirect(ctx context.Context, userID1, userID2 string) (*entity.Conversation, error)
	GetConversationMembers(ctx context.Context, convID string) ([]string, error)
}
