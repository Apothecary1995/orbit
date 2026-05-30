package usecase

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/Apothecary1995/cengsta-paradise/services/chat-svc/internal/domain/entity"
	"github.com/Apothecary1995/cengsta-paradise/services/chat-svc/internal/domain/repository"
	domainUsecase "github.com/Apothecary1995/cengsta-paradise/services/chat-svc/internal/domain/usecase"
)

type chatUsecase struct {
	msgRepo      repository.MessageRepository
	convRepo     repository.ConversationRepository
	reactionRepo repository.ReactionRepository
	publisher    Publisher // Redis pub/sub publisher interface
}

// Publisher mesajları Redis'e publish eder.
// Interface — implementasyon infrastructure/redis klasöründe.
type Publisher interface {
	Publish(ctx context.Context, channel string, message interface{}) error
}

// New chatUsecase oluşturur.
func New(
	msgRepo repository.MessageRepository,
	convRepo repository.ConversationRepository,
	reactionRepo repository.ReactionRepository,
	publisher Publisher,
) domainUsecase.ChatUsecase {
	return &chatUsecase{
		msgRepo:      msgRepo,
		convRepo:     convRepo,
		reactionRepo: reactionRepo,
		publisher:    publisher,
	}
}

func (c *chatUsecase) SendMessage(ctx context.Context, input domainUsecase.SendMessageInput) (*entity.Message, error) {
	// Sohbet var mı?
	conv, err := c.convRepo.GetByID(ctx, input.ConversationID)
	if err != nil || conv == nil {
		return nil, errors.New("sohbet bulunamadı")
	}

	msg := &entity.Message{
		ID:             generateID(),
		ConversationID: input.ConversationID,
		SenderID:       input.SenderID,
		Type:           input.Type,
		Content:        input.Content,
		EncryptedKey:   input.EncryptedKey,
		ReplyToID:      input.ReplyToID,
		Status:         entity.MessageStatusSent,
		CreatedAt:      time.Now(),
	}

	if err := c.msgRepo.Create(ctx, msg); err != nil {
		return nil, fmt.Errorf("mesaj kaydedilemedi: %w", err)
	}

	// Redis'e publish et — tüm gateway pod'ları dinler
	// channel: "conv:{conversationID}"
	channel := fmt.Sprintf("conv:%s", input.ConversationID)
	_ = c.publisher.Publish(ctx, channel, msg)

	return msg, nil
}

func (c *chatUsecase) GetHistory(ctx context.Context, conversationID string, limit, offset int) ([]*entity.Message, error) {
	if limit <= 0 || limit > 100 {
		limit = 50 // default
	}
	return c.msgRepo.ListByConversation(ctx, conversationID, limit, offset)
}

func (c *chatUsecase) MarkAsRead(ctx context.Context, messageID, userID string) error {
	return c.msgRepo.UpdateStatus(ctx, messageID, entity.MessageStatusRead)
}

func (c *chatUsecase) EditMessage(ctx context.Context, messageID, userID, newContent string) error {
	msg, err := c.msgRepo.GetByID(ctx, messageID)
	if err != nil || msg == nil {
		return errors.New("mesaj bulunamadı")
	}

	// Sadece gönderen düzenleyebilir
	if msg.SenderID != userID {
		return errors.New("bu mesajı düzenleme yetkiniz yok")
	}

	return c.msgRepo.UpdateContent(ctx, messageID, newContent)
}

func (c *chatUsecase) DeleteMessage(ctx context.Context, messageID, userID string) error {
	msg, err := c.msgRepo.GetByID(ctx, messageID)
	if err != nil || msg == nil {
		return errors.New("mesaj bulunamadı")
	}

	if msg.SenderID != userID {
		return errors.New("bu mesajı silme yetkiniz yok")
	}

	return c.msgRepo.SoftDelete(ctx, messageID)
}

func (c *chatUsecase) AddReaction(ctx context.Context, messageID, userID, emoji string) error {
	reaction := &entity.MessageReaction{
		MessageID: messageID,
		UserID:    userID,
		Emoji:     emoji,
		CreatedAt: time.Now(),
	}
	return c.reactionRepo.Add(ctx, reaction)
}

func (c *chatUsecase) RemoveReaction(ctx context.Context, messageID, userID, emoji string) error {
	return c.reactionRepo.Remove(ctx, messageID, userID, emoji)
}

func (c *chatUsecase) CreateConversation(ctx context.Context, input domainUsecase.CreateConversationInput) (*entity.Conversation, error) {
	conv := &entity.Conversation{
		ID:        generateID(),
		Type:      input.Type,
		Name:      input.Name,
		CreatedBy: input.CreatedBy,
		CreatedAt: time.Now(),
	}

	if err := c.convRepo.Create(ctx, conv); err != nil {
		return nil, fmt.Errorf("sohbet oluşturulamadı: %w", err)
	}

	// Üyeleri ekle
	for _, memberID := range input.MemberIDs {
		member := &entity.ConversationMember{
			ConversationID: conv.ID,
			UserID:         memberID,
			JoinedAt:       time.Now(),
		}
		if err := c.convRepo.AddMember(ctx, member); err != nil {
			return nil, fmt.Errorf("üye eklenemedi: %w", err)
		}
	}

	return conv, nil
}

func (c *chatUsecase) GetConversations(ctx context.Context, userID string) ([]*entity.Conversation, error) {
	return c.convRepo.ListByUserID(ctx, userID)
}

func (c *chatUsecase) GetOrCreateDirect(ctx context.Context, userID1, userID2 string) (*entity.Conversation, error) {
	// Zaten var mı?
	existing, err := c.convRepo.GetDirectConversation(ctx, userID1, userID2)
	if err == nil && existing != nil {
		return existing, nil
	}

	// Yoksa oluştur
	return c.CreateConversation(ctx, domainUsecase.CreateConversationInput{
		Type:      "direct",
		CreatedBy: userID1,
		MemberIDs: []string{userID1, userID2},
	})
}

func generateID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
func (c *chatUsecase) GetConversationMembers(ctx context.Context, convID string) ([]string, error) {
	members, err := c.convRepo.GetMembers(ctx, convID)
	if err != nil {
		return nil, err
	}
	var ids []string
	for _, m := range members {
		ids = append(ids, m.UserID)
	}
	return ids, nil
}
