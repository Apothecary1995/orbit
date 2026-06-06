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
	storyRepo    repository.StoryRepository
	serverRepo   repository.ServerRepository
	channelRepo  repository.ChannelRepository
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
	storyRepo repository.StoryRepository,
	serverRepo repository.ServerRepository,
	channelRepo repository.ChannelRepository,
	publisher Publisher,
) domainUsecase.ChatUsecase {
	return &chatUsecase{
		msgRepo:      msgRepo,
		convRepo:     convRepo,
		reactionRepo: reactionRepo,
		storyRepo:    storyRepo,
		serverRepo:   serverRepo,
		channelRepo:  channelRepo,
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

func (c *chatUsecase) GetReactions(ctx context.Context, messageID string) ([]*entity.MessageReaction, error) {
	return c.reactionRepo.ListByMessage(ctx, messageID)
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

func (c *chatUsecase) CreateStory(ctx context.Context, userID, storyType, content, caption string) (*entity.Story, error) {
	id := make([]byte, 16)
	rand.Read(id)
	story := &entity.Story{
		ID:        hex.EncodeToString(id),
		UserID:    userID,
		Type:      storyType,
		Content:   content,
		Caption:   caption,
		ExpiresAt: time.Now().Add(24 * time.Hour),
		CreatedAt: time.Now(),
	}
	if err := c.storyRepo.Create(ctx, story); err != nil {
		return nil, fmt.Errorf("hikaye kaydedilemedi: %w", err)
	}
	return story, nil
}

func (c *chatUsecase) GetStories(ctx context.Context, userIDs []string) ([]*entity.Story, error) {
	return c.storyRepo.ListByUserIDs(ctx, userIDs)
}

// ── Server işlemleri ─────────────────────────────────────

// getMemberRole — yardımcı: üyenin rolünü döner, üye değilse RoleMember döner
func (c *chatUsecase) getMemberRole(ctx context.Context, serverID, userID string) entity.ServerRole {
	m, err := c.serverRepo.GetMember(ctx, serverID, userID)
	if err != nil || m == nil {
		return entity.RoleMember
	}
	return m.Role
}

func (c *chatUsecase) CreateServer(ctx context.Context, name, iconURL, ownerID string) (*entity.Server, error) {
	inviteCode := generateID()[:8]
	server := &entity.Server{
		ID:         generateID(),
		Name:       name,
		IconURL:    iconURL,
		OwnerID:    ownerID,
		InviteCode: inviteCode,
		CreatedAt:  time.Now(),
	}
	if err := c.serverRepo.Create(ctx, server); err != nil {
		return nil, fmt.Errorf("server oluşturulamadı: %w", err)
	}
	// Sahibi 'owner' rolüyle üye yap
	if err := c.serverRepo.AddMember(ctx, &entity.ServerMember{
		ServerID: server.ID, UserID: ownerID, Role: entity.RoleOwner, JoinedAt: time.Now(),
	}); err != nil {
		return nil, fmt.Errorf("sahip üye eklenemedi: %w", err)
	}
	return server, nil
}

func (c *chatUsecase) GetServer(ctx context.Context, serverID, userID string) (*entity.Server, error) {
	server, err := c.serverRepo.GetByID(ctx, serverID)
	if err != nil || server == nil {
		return nil, errors.New("server bulunamadı")
	}
	isMember, _ := c.serverRepo.IsMember(ctx, serverID, userID)
	if !isMember {
		return nil, errors.New("bu server'a erişim yetkiniz yok")
	}
	return server, nil
}

func (c *chatUsecase) ListUserServers(ctx context.Context, userID string) ([]*entity.Server, error) {
	return c.serverRepo.ListByUserID(ctx, userID)
}

func (c *chatUsecase) JoinServer(ctx context.Context, inviteCode, userID string) (*entity.Server, error) {
	server, err := c.serverRepo.GetByInviteCode(ctx, inviteCode)
	if err != nil || server == nil {
		return nil, errors.New("geçersiz davet kodu")
	}
	isMember, _ := c.serverRepo.IsMember(ctx, server.ID, userID)
	if isMember {
		return server, nil
	}
	if err := c.serverRepo.AddMember(ctx, &entity.ServerMember{
		ServerID: server.ID, UserID: userID, JoinedAt: time.Now(),
	}); err != nil {
		return nil, fmt.Errorf("server'a katılınamadı: %w", err)
	}
	// Yeni üyeyi tüm kanallara ekle
	channels, _ := c.channelRepo.ListByServerID(ctx, server.ID)
	for _, ch := range channels {
		_ = c.convRepo.AddMember(ctx, &entity.ConversationMember{
			ConversationID: ch.ConversationID, UserID: userID, JoinedAt: time.Now(),
		})
	}
	return server, nil
}

func (c *chatUsecase) DeleteServer(ctx context.Context, serverID, userID string) error {
	server, err := c.serverRepo.GetByID(ctx, serverID)
	if err != nil || server == nil {
		return errors.New("server bulunamadı")
	}
	if server.OwnerID != userID {
		return errors.New("sadece server sahibi silebilir")
	}
	return c.serverRepo.Delete(ctx, serverID)
}

// ── Kanal işlemleri ──────────────────────────────────────

func (c *chatUsecase) CreateChannel(ctx context.Context, serverID, name, topic, ownerID, channelType string) (*entity.Channel, error) {
	role := c.getMemberRole(ctx, serverID, ownerID)
	if !role.CanManageChannels() {
		return nil, errors.New("kanal oluşturmak için admin veya owner yetkisi gerekiyor")
	}

	if channelType != "voice" {
		channelType = "text"
	}

	// Kanala ait backing conversation oluştur (sesli kanallar da mesaj için conversation'a sahip)
	conv := &entity.Conversation{
		ID:        generateID(),
		Type:      "channel",
		Name:      name,
		CreatedBy: ownerID,
		CreatedAt: time.Now(),
	}
	if err := c.convRepo.Create(ctx, conv); err != nil {
		return nil, fmt.Errorf("kanal conversation'ı oluşturulamadı: %w", err)
	}

	channels, _ := c.channelRepo.ListByServerID(ctx, serverID)
	pos := len(channels)

	ch := &entity.Channel{
		ID:             generateID(),
		ServerID:       serverID,
		Name:           name,
		Topic:          topic,
		Type:           channelType,
		Position:       pos,
		ConversationID: conv.ID,
		CreatedAt:      time.Now(),
	}
	if err := c.channelRepo.Create(ctx, ch); err != nil {
		return nil, fmt.Errorf("kanal oluşturulamadı: %w", err)
	}
	return ch, nil
}

func (c *chatUsecase) ListChannels(ctx context.Context, serverID, userID string) ([]*entity.Channel, error) {
	isMember, _ := c.serverRepo.IsMember(ctx, serverID, userID)
	if !isMember {
		return nil, errors.New("bu server'a erişim yetkiniz yok")
	}
	return c.channelRepo.ListByServerID(ctx, serverID)
}

func (c *chatUsecase) DeleteChannel(ctx context.Context, channelID, userID string) error {
	ch, err := c.channelRepo.GetByID(ctx, channelID)
	if err != nil || ch == nil {
		return errors.New("kanal bulunamadı")
	}
	role := c.getMemberRole(ctx, ch.ServerID, userID)
	if !role.CanManageChannels() {
		return errors.New("kanal silmek için admin veya owner yetkisi gerekiyor")
	}
	return c.channelRepo.Delete(ctx, channelID)
}

func (c *chatUsecase) GetChannelConversation(ctx context.Context, channelID string) (string, error) {
	ch, err := c.channelRepo.GetByID(ctx, channelID)
	if err != nil || ch == nil {
		return "", errors.New("kanal bulunamadı")
	}
	return ch.ConversationID, nil
}

// ── Üye & rol işlemleri ──────────────────────────────────

func (c *chatUsecase) ListServerMembers(ctx context.Context, serverID, requesterID string) ([]*entity.ServerMember, error) {
	isMember, _ := c.serverRepo.IsMember(ctx, serverID, requesterID)
	if !isMember {
		return nil, errors.New("bu server'a erişim yetkiniz yok")
	}
	return c.serverRepo.ListMembers(ctx, serverID)
}

func (c *chatUsecase) SetMemberRole(ctx context.Context, serverID, requesterID, targetUserID, roleStr string) error {
	requesterRole := c.getMemberRole(ctx, serverID, requesterID)
	if !requesterRole.CanSetRoles() {
		return errors.New("rol atamak için admin veya owner yetkisi gerekiyor")
	}

	newRole := entity.ServerRole(roleStr)
	// owner rolü atanamaz (sadece server yaratıcısı owner olabilir)
	if newRole == entity.RoleOwner {
		return errors.New("owner rolü atanamaz")
	}
	// Daha yüksek veya eşit roldeki kişinin rolü değiştirilemez
	targetRole := c.getMemberRole(ctx, serverID, targetUserID)
	if targetRole.Level() >= requesterRole.Level() {
		return errors.New("kendi rolünüzden yüksek veya eşit roldeki üyenin rolünü değiştiremezsiniz")
	}
	// Atanacak rol, kendi rolünden yüksek olamaz
	if newRole.Level() >= requesterRole.Level() {
		return errors.New("kendi rolünüzden yüksek rol atamazsınız")
	}

	return c.serverRepo.SetMemberRole(ctx, serverID, targetUserID, newRole)
}

func (c *chatUsecase) KickMember(ctx context.Context, serverID, requesterID, targetUserID string) error {
	if requesterID == targetUserID {
		return errors.New("kendinizi atamazsınız")
	}
	requesterRole := c.getMemberRole(ctx, serverID, requesterID)
	if !requesterRole.CanKick() {
		return errors.New("üye atmak için moderatör, admin veya owner yetkisi gerekiyor")
	}
	targetRole := c.getMemberRole(ctx, serverID, targetUserID)
	if targetRole.Level() >= requesterRole.Level() {
		return errors.New("kendi rolünüzden yüksek veya eşit roldeki üyeyi atamazsınız")
	}
	return c.serverRepo.RemoveMember(ctx, serverID, targetUserID)
}
