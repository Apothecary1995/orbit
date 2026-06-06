package usecase

import (
	"context"
	"errors"
	"testing"

	"github.com/Apothecary1995/cengsta-paradise/services/chat-svc/internal/domain/entity"
	"github.com/Apothecary1995/cengsta-paradise/services/chat-svc/internal/domain/repository"
	domainUsecase "github.com/Apothecary1995/cengsta-paradise/services/chat-svc/internal/domain/usecase"
)

// ── Mock repository'ler ───────────────────────────────────

type mockMsgRepo struct {
	msgs     map[string]*entity.Message
	createFn func(*entity.Message) error
}

func newMockMsgRepo() *mockMsgRepo {
	return &mockMsgRepo{msgs: make(map[string]*entity.Message)}
}
func (m *mockMsgRepo) Create(ctx context.Context, msg *entity.Message) error {
	if m.createFn != nil {
		return m.createFn(msg)
	}
	m.msgs[msg.ID] = msg
	return nil
}
func (m *mockMsgRepo) GetByID(ctx context.Context, id string) (*entity.Message, error) {
	if msg, ok := m.msgs[id]; ok {
		return msg, nil
	}
	return nil, errors.New("mesaj bulunamadı")
}
func (m *mockMsgRepo) ListByConversation(ctx context.Context, convID string, limit, offset int) ([]*entity.Message, error) {
	var result []*entity.Message
	for _, msg := range m.msgs {
		if msg.ConversationID == convID {
			result = append(result, msg)
		}
	}
	return result, nil
}
func (m *mockMsgRepo) UpdateStatus(ctx context.Context, id string, status entity.MessageStatus) error {
	if msg, ok := m.msgs[id]; ok {
		msg.Status = status
	}
	return nil
}
func (m *mockMsgRepo) UpdateContent(ctx context.Context, id, content string) error {
	if msg, ok := m.msgs[id]; ok {
		msg.Content = content
	}
	return nil
}
func (m *mockMsgRepo) SoftDelete(ctx context.Context, id string) error {
	delete(m.msgs, id)
	return nil
}

type mockConvRepo struct {
	convs map[string]*entity.Conversation
}

func newMockConvRepo() *mockConvRepo {
	return &mockConvRepo{convs: make(map[string]*entity.Conversation)}
}
func (m *mockConvRepo) Create(ctx context.Context, conv *entity.Conversation) error {
	m.convs[conv.ID] = conv
	return nil
}
func (m *mockConvRepo) GetByID(ctx context.Context, id string) (*entity.Conversation, error) {
	if c, ok := m.convs[id]; ok {
		return c, nil
	}
	return nil, errors.New("sohbet bulunamadı")
}
func (m *mockConvRepo) GetDirectConversation(ctx context.Context, u1, u2 string) (*entity.Conversation, error) {
	return nil, nil
}
func (m *mockConvRepo) ListByUserID(ctx context.Context, userID string) ([]*entity.Conversation, error) {
	return nil, nil
}
func (m *mockConvRepo) AddMember(ctx context.Context, mem *entity.ConversationMember) error {
	return nil
}
func (m *mockConvRepo) GetMembers(ctx context.Context, convID string) ([]*entity.ConversationMember, error) {
	return nil, nil
}

type mockReactionRepo struct {
	reactions []*entity.MessageReaction
}

func (m *mockReactionRepo) Add(ctx context.Context, r *entity.MessageReaction) error {
	m.reactions = append(m.reactions, r)
	return nil
}
func (m *mockReactionRepo) Remove(ctx context.Context, msgID, userID, emoji string) error {
	filtered := m.reactions[:0]
	for _, r := range m.reactions {
		if !(r.MessageID == msgID && r.UserID == userID && r.Emoji == emoji) {
			filtered = append(filtered, r)
		}
	}
	m.reactions = filtered
	return nil
}
func (m *mockReactionRepo) ListByMessage(ctx context.Context, msgID string) ([]*entity.MessageReaction, error) {
	var result []*entity.MessageReaction
	for _, r := range m.reactions {
		if r.MessageID == msgID {
			result = append(result, r)
		}
	}
	return result, nil
}

type mockPublisher struct {
	published []string
}

func (m *mockPublisher) Publish(ctx context.Context, channel string, _ interface{}) error {
	m.published = append(m.published, channel)
	return nil
}

// Kullanılmayan repo stub'ları

type noopStoryRepo struct{}

var _ repository.StoryRepository = (*noopStoryRepo)(nil)

func (n *noopStoryRepo) Create(ctx context.Context, s *entity.Story) error { return nil }
func (n *noopStoryRepo) ListByUserIDs(ctx context.Context, ids []string) ([]*entity.Story, error) {
	return nil, nil
}

type noopServerRepo struct{}

var _ repository.ServerRepository = (*noopServerRepo)(nil)

func (n *noopServerRepo) Create(ctx context.Context, s *entity.Server) error           { return nil }
func (n *noopServerRepo) GetByID(ctx context.Context, id string) (*entity.Server, error) {
	return nil, errors.New("sunucu bulunamadı")
}
func (n *noopServerRepo) GetByInviteCode(ctx context.Context, code string) (*entity.Server, error) {
	return nil, nil
}
func (n *noopServerRepo) ListByUserID(ctx context.Context, uid string) ([]*entity.Server, error) {
	return nil, nil
}
func (n *noopServerRepo) AddMember(ctx context.Context, m *entity.ServerMember) error { return nil }
func (n *noopServerRepo) IsMember(ctx context.Context, sID, uID string) (bool, error) {
	return false, nil
}
func (n *noopServerRepo) GetMember(ctx context.Context, sID, uID string) (*entity.ServerMember, error) {
	return nil, nil
}
func (n *noopServerRepo) ListMembers(ctx context.Context, sID string) ([]*entity.ServerMember, error) {
	return nil, nil
}
func (n *noopServerRepo) SetMemberRole(ctx context.Context, sID, uID string, role entity.ServerRole) error {
	return nil
}
func (n *noopServerRepo) RemoveMember(ctx context.Context, sID, uID string) error { return nil }
func (n *noopServerRepo) Delete(ctx context.Context, id string) error              { return nil }

type noopChannelRepo struct{}

var _ repository.ChannelRepository = (*noopChannelRepo)(nil)

func (n *noopChannelRepo) Create(ctx context.Context, c *entity.Channel) error { return nil }
func (n *noopChannelRepo) GetByID(ctx context.Context, id string) (*entity.Channel, error) {
	return nil, nil
}
func (n *noopChannelRepo) ListByServerID(ctx context.Context, sID string) ([]*entity.Channel, error) {
	return nil, nil
}
func (n *noopChannelRepo) Delete(ctx context.Context, id string) error { return nil }

// ── Yardımcı ─────────────────────────────────────────────

func newChatUC() (domainUsecase.ChatUsecase, *mockMsgRepo, *mockConvRepo, *mockReactionRepo, *mockPublisher) {
	msgRepo := newMockMsgRepo()
	convRepo := newMockConvRepo()
	reactionRepo := &mockReactionRepo{}
	pub := &mockPublisher{}
	uc := New(msgRepo, convRepo, reactionRepo, &noopStoryRepo{}, &noopServerRepo{}, &noopChannelRepo{}, pub)
	return uc, msgRepo, convRepo, reactionRepo, pub
}

// ── Testler ───────────────────────────────────────────────

func TestSendMessage_Success(t *testing.T) {
	uc, _, convRepo, _, pub := newChatUC()

	conv := &entity.Conversation{ID: "conv-1", Type: "direct"}
	_ = convRepo.Create(context.Background(), conv)

	msg, err := uc.SendMessage(context.Background(), domainUsecase.SendMessageInput{
		ConversationID: "conv-1",
		SenderID:       "user-1",
		Content:        "Merhaba!",
		Type:           "text",
	})
	if err != nil {
		t.Fatalf("beklenen başarı, hata: %v", err)
	}
	if msg.Content != "Merhaba!" {
		t.Errorf("beklenen 'Merhaba!', gelen %q", msg.Content)
	}
	if len(pub.published) == 0 {
		t.Error("Redis'e publish edilmeli")
	}
}

func TestSendMessage_MissingConversation(t *testing.T) {
	uc, _, _, _, _ := newChatUC()
	_, err := uc.SendMessage(context.Background(), domainUsecase.SendMessageInput{
		ConversationID: "yok",
		SenderID:       "user-1",
		Content:        "test",
		Type:           "text",
	})
	if err == nil {
		t.Fatal("mevcut olmayan sohbet için hata bekleniyor")
	}
}

func TestAddReaction_Success(t *testing.T) {
	uc, msgRepo, convRepo, reactionRepo, _ := newChatUC()

	conv := &entity.Conversation{ID: "conv-1", Type: "direct"}
	_ = convRepo.Create(context.Background(), conv)

	msg, _ := uc.SendMessage(context.Background(), domainUsecase.SendMessageInput{
		ConversationID: "conv-1", SenderID: "u1", Content: "hi", Type: "text",
	})

	if err := uc.AddReaction(context.Background(), msg.ID, "u2", "👍"); err != nil {
		t.Fatalf("tepki eklenemedi: %v", err)
	}
	_ = msgRepo
	reactions := reactionRepo.reactions
	if len(reactions) == 0 {
		t.Fatal("tepki kaydedilmedi")
	}
	if reactions[0].Emoji != "👍" {
		t.Errorf("beklenen 👍, gelen %q", reactions[0].Emoji)
	}
}

func TestGetReactions_AfterAdd(t *testing.T) {
	uc, _, convRepo, _, _ := newChatUC()

	conv := &entity.Conversation{ID: "conv-1", Type: "direct"}
	_ = convRepo.Create(context.Background(), conv)
	msg, _ := uc.SendMessage(context.Background(), domainUsecase.SendMessageInput{
		ConversationID: "conv-1", SenderID: "u1", Content: "hi", Type: "text",
	})

	_ = uc.AddReaction(context.Background(), msg.ID, "u2", "❤️")
	_ = uc.AddReaction(context.Background(), msg.ID, "u3", "❤️")

	reactions, err := uc.GetReactions(context.Background(), msg.ID)
	if err != nil {
		t.Fatalf("tepkiler alınamadı: %v", err)
	}
	if len(reactions) != 2 {
		t.Errorf("beklenen 2 tepki, gelen %d", len(reactions))
	}
}

func TestCreateConversation_Direct(t *testing.T) {
	uc, _, _, _, _ := newChatUC()
	conv, err := uc.CreateConversation(context.Background(), domainUsecase.CreateConversationInput{
		Type:      "direct",
		MemberIDs: []string{"u1", "u2"},
		CreatedBy: "u1",
	})
	if err != nil {
		t.Fatalf("sohbet oluşturulamadı: %v", err)
	}
	if conv.ID == "" {
		t.Error("konuşma ID'si boş")
	}
}

func TestEditMessage_Success(t *testing.T) {
	uc, _, convRepo, _, _ := newChatUC()
	_ = convRepo.Create(context.Background(), &entity.Conversation{ID: "c1", Type: "direct"})
	msg, _ := uc.SendMessage(context.Background(), domainUsecase.SendMessageInput{
		ConversationID: "c1", SenderID: "u1", Content: "eski", Type: "text",
	})

	if err := uc.EditMessage(context.Background(), msg.ID, "u1", "yeni"); err != nil {
		t.Fatalf("düzenleme hatası: %v", err)
	}
}

func TestDeleteMessage_Success(t *testing.T) {
	uc, _, convRepo, _, _ := newChatUC()
	_ = convRepo.Create(context.Background(), &entity.Conversation{ID: "c1", Type: "direct"})
	msg, _ := uc.SendMessage(context.Background(), domainUsecase.SendMessageInput{
		ConversationID: "c1", SenderID: "u1", Content: "silinecek", Type: "text",
	})

	if err := uc.DeleteMessage(context.Background(), msg.ID, "u1"); err != nil {
		t.Fatalf("silme hatası: %v", err)
	}
}
