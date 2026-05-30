package repository

import (
	"context"

	"github.com/Apothecary1995/cengsta-paradise/services/chat-svc/internal/domain/entity"
)

// MessageRepository mesaj DB işlemleri.
type MessageRepository interface {
	Create(ctx context.Context, msg *entity.Message) error
	GetByID(ctx context.Context, id string) (*entity.Message, error)
	ListByConversation(ctx context.Context, conversationID string, limit, offset int) ([]*entity.Message, error)
	UpdateStatus(ctx context.Context, id string, status entity.MessageStatus) error
	UpdateContent(ctx context.Context, id string, content string) error
	SoftDelete(ctx context.Context, id string) error
}

// ConversationRepository sohbet DB işlemleri.
type ConversationRepository interface {
	Create(ctx context.Context, conv *entity.Conversation) error
	GetByID(ctx context.Context, id string) (*entity.Conversation, error)
	GetDirectConversation(ctx context.Context, userID1, userID2 string) (*entity.Conversation, error)
	ListByUserID(ctx context.Context, userID string) ([]*entity.Conversation, error)
	AddMember(ctx context.Context, member *entity.ConversationMember) error
	GetMembers(ctx context.Context, conversationID string) ([]*entity.ConversationMember, error)
}

// ReactionRepository mesaj tepkileri DB işlemleri.
type ReactionRepository interface {
	Add(ctx context.Context, reaction *entity.MessageReaction) error
	Remove(ctx context.Context, messageID, userID, emoji string) error
	ListByMessage(ctx context.Context, messageID string) ([]*entity.MessageReaction, error)
}
