package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Apothecary1995/cengsta-paradise/services/chat-svc/internal/domain/entity"
	"github.com/Apothecary1995/cengsta-paradise/services/chat-svc/internal/domain/repository"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ── Message Repository ───────────────────────────────────

type messageRepository struct {
	db *pgxpool.Pool
}

func NewMessageRepository(db *pgxpool.Pool) repository.MessageRepository {
	return &messageRepository{db: db}
}

func (r *messageRepository) Create(ctx context.Context, msg *entity.Message) error {
	query := `
		INSERT INTO messages (id, conversation_id, sender_id, type, content, encrypted_key, status, reply_to_id, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`
	_, err := r.db.Exec(ctx, query,
		msg.ID, msg.ConversationID, msg.SenderID,
		msg.Type, msg.Content, msg.EncryptedKey,
		msg.Status, msg.ReplyToID, msg.CreatedAt,
	)
	return err
}

func (r *messageRepository) GetByID(ctx context.Context, id string) (*entity.Message, error) {
	query := `
		SELECT id, conversation_id, sender_id, type, content, encrypted_key,
		       status, reply_to_id, edited_at, deleted_at, created_at
		FROM messages WHERE id = $1 AND deleted_at IS NULL
	`
	return r.scanMessage(r.db.QueryRow(ctx, query, id))
}

func (r *messageRepository) ListByConversation(ctx context.Context, conversationID string, limit, offset int) ([]*entity.Message, error) {
	query := `
		SELECT id, conversation_id, sender_id, type, content, encrypted_key,
		       status, reply_to_id, edited_at, deleted_at, created_at
		FROM messages
		WHERE conversation_id = $1 AND deleted_at IS NULL
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`
	rows, err := r.db.Query(ctx, query, conversationID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []*entity.Message
	for rows.Next() {
		msg, err := r.scanMessage(rows)
		if err != nil {
			return nil, err
		}
		messages = append(messages, msg)
	}
	return messages, nil
}

func (r *messageRepository) UpdateStatus(ctx context.Context, id string, status entity.MessageStatus) error {
	_, err := r.db.Exec(ctx,
		`UPDATE messages SET status = $1 WHERE id = $2`,
		status, id,
	)
	return err
}

func (r *messageRepository) UpdateContent(ctx context.Context, id string, content string) error {
	now := time.Now()
	_, err := r.db.Exec(ctx,
		`UPDATE messages SET content = $1, edited_at = $2 WHERE id = $3`,
		content, now, id,
	)
	return err
}

func (r *messageRepository) SoftDelete(ctx context.Context, id string) error {
	now := time.Now()
	_, err := r.db.Exec(ctx,
		`UPDATE messages SET deleted_at = $1 WHERE id = $2`,
		now, id,
	)
	return err
}

func (r *messageRepository) scanMessage(row pgx.Row) (*entity.Message, error) {
	msg := &entity.Message{}
	err := row.Scan(
		&msg.ID, &msg.ConversationID, &msg.SenderID,
		&msg.Type, &msg.Content, &msg.EncryptedKey,
		&msg.Status, &msg.ReplyToID,
		&msg.EditedAt, &msg.DeletedAt, &msg.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("mesaj okunamadı: %w", err)
	}
	return msg, nil
}

// ── Conversation Repository ──────────────────────────────

type conversationRepository struct {
	db *pgxpool.Pool
}

func NewConversationRepository(db *pgxpool.Pool) repository.ConversationRepository {
	return &conversationRepository{db: db}
}

func (r *conversationRepository) Create(ctx context.Context, conv *entity.Conversation) error {
	query := `
		INSERT INTO conversations (id, type, name, avatar_url, created_by, created_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`
	_, err := r.db.Exec(ctx, query,
		conv.ID, conv.Type, conv.Name,
		conv.AvatarURL, conv.CreatedBy, conv.CreatedAt,
	)
	return err
}

func (r *conversationRepository) GetByID(ctx context.Context, id string) (*entity.Conversation, error) {
	query := `
		SELECT id, type, name, avatar_url, last_message_id, created_by, created_at
		FROM conversations WHERE id = $1
	`
	conv := &entity.Conversation{}
	err := r.db.QueryRow(ctx, query, id).Scan(
		&conv.ID, &conv.Type, &conv.Name,
		&conv.AvatarURL, &conv.LastMessageID,
		&conv.CreatedBy, &conv.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return conv, err
}

func (r *conversationRepository) GetDirectConversation(ctx context.Context, userID1, userID2 string) (*entity.Conversation, error) {
	// İki kullanıcı arasındaki direkt sohbeti bul
	query := `
		SELECT c.id, c.type, c.name, c.avatar_url, c.last_message_id, c.created_by, c.created_at
		FROM conversations c
		JOIN conversation_members m1 ON c.id = m1.conversation_id AND m1.user_id = $1
		JOIN conversation_members m2 ON c.id = m2.conversation_id AND m2.user_id = $2
		WHERE c.type = 'direct'
		LIMIT 1
	`
	conv := &entity.Conversation{}
	err := r.db.QueryRow(ctx, query, userID1, userID2).Scan(
		&conv.ID, &conv.Type, &conv.Name,
		&conv.AvatarURL, &conv.LastMessageID,
		&conv.CreatedBy, &conv.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return conv, err
}

func (r *conversationRepository) ListByUserID(ctx context.Context, userID string) ([]*entity.Conversation, error) {
	query := `
		SELECT c.id, c.type, c.name, c.avatar_url, c.last_message_id, c.created_by, c.created_at
		FROM conversations c
		JOIN conversation_members m ON c.id = m.conversation_id
		WHERE m.user_id = $1
		ORDER BY c.created_at DESC
	`
	rows, err := r.db.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var convs []*entity.Conversation
	for rows.Next() {
		conv := &entity.Conversation{}
		if err := rows.Scan(
			&conv.ID, &conv.Type, &conv.Name,
			&conv.AvatarURL, &conv.LastMessageID,
			&conv.CreatedBy, &conv.CreatedAt,
		); err != nil {
			return nil, err
		}
		convs = append(convs, conv)
	}
	return convs, nil
}

func (r *conversationRepository) AddMember(ctx context.Context, member *entity.ConversationMember) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
		member.ConversationID, member.UserID, member.JoinedAt,
	)
	return err
}

func (r *conversationRepository) GetMembers(ctx context.Context, conversationID string) ([]*entity.ConversationMember, error) {
	rows, err := r.db.Query(ctx,
		`SELECT conversation_id, user_id, joined_at FROM conversation_members WHERE conversation_id = $1`,
		conversationID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []*entity.ConversationMember
	for rows.Next() {
		m := &entity.ConversationMember{}
		if err := rows.Scan(&m.ConversationID, &m.UserID, &m.JoinedAt); err != nil {
			return nil, err
		}
		members = append(members, m)
	}
	return members, nil
}

// ── Reaction Repository ──────────────────────────────────

type reactionRepository struct {
	db *pgxpool.Pool
}

func NewReactionRepository(db *pgxpool.Pool) repository.ReactionRepository {
	return &reactionRepository{db: db}
}

func (r *reactionRepository) Add(ctx context.Context, reaction *entity.MessageReaction) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO message_reactions (message_id, user_id, emoji, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
		reaction.MessageID, reaction.UserID, reaction.Emoji, reaction.CreatedAt,
	)
	return err
}

func (r *reactionRepository) Remove(ctx context.Context, messageID, userID, emoji string) error {
	_, err := r.db.Exec(ctx,
		`DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
		messageID, userID, emoji,
	)
	return err
}

func (r *reactionRepository) ListByMessage(ctx context.Context, messageID string) ([]*entity.MessageReaction, error) {
	rows, err := r.db.Query(ctx,
		`SELECT message_id, user_id, emoji, created_at FROM message_reactions WHERE message_id = $1`,
		messageID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reactions []*entity.MessageReaction
	for rows.Next() {
		rx := &entity.MessageReaction{}
		if err := rows.Scan(&rx.MessageID, &rx.UserID, &rx.Emoji, &rx.CreatedAt); err != nil {
			return nil, err
		}
		reactions = append(reactions, rx)
	}
	return reactions, nil
}
