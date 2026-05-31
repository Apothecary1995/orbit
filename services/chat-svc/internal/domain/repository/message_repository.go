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

// StoryRepository hikaye DB işlemleri.
type StoryRepository interface {
	Create(ctx context.Context, story *entity.Story) error
	ListByUserIDs(ctx context.Context, userIDs []string) ([]*entity.Story, error)
}

// ServerRepository server DB işlemleri.
type ServerRepository interface {
	Create(ctx context.Context, server *entity.Server) error
	GetByID(ctx context.Context, id string) (*entity.Server, error)
	GetByInviteCode(ctx context.Context, inviteCode string) (*entity.Server, error)
	ListByUserID(ctx context.Context, userID string) ([]*entity.Server, error)
	AddMember(ctx context.Context, member *entity.ServerMember) error
	IsMember(ctx context.Context, serverID, userID string) (bool, error)
	GetMember(ctx context.Context, serverID, userID string) (*entity.ServerMember, error)
	ListMembers(ctx context.Context, serverID string) ([]*entity.ServerMember, error)
	SetMemberRole(ctx context.Context, serverID, userID string, role entity.ServerRole) error
	RemoveMember(ctx context.Context, serverID, userID string) error
	Delete(ctx context.Context, id string) error
}

// ChannelRepository kanal DB işlemleri.
type ChannelRepository interface {
	Create(ctx context.Context, channel *entity.Channel) error
	GetByID(ctx context.Context, id string) (*entity.Channel, error)
	ListByServerID(ctx context.Context, serverID string) ([]*entity.Channel, error)
	Delete(ctx context.Context, id string) error
}
