package entity

import "time"

// MessageType mesaj türünü belirtir.
type MessageType string

const (
	MessageTypeText  MessageType = "text"
	MessageTypeImage MessageType = "image"
	MessageTypeVideo MessageType = "video"
	MessageTypeFile  MessageType = "file"
	MessageTypeAudio MessageType = "audio"
)

// MessageStatus mesajın durumunu belirtir.
type MessageStatus string

const (
	MessageStatusSent      MessageStatus = "sent"      // gönderildi
	MessageStatusDelivered MessageStatus = "delivered" // iletildi
	MessageStatusRead      MessageStatus = "read"      // okundu
)

// Message tek bir mesajı temsil eder.
type Message struct {
	ID             string        `json:"id"`
	ConversationID string        `json:"conversation_id"`
	SenderID       string        `json:"sender_id"`
	Type           MessageType   `json:"type"`
	Content        string        `json:"content"`       // text ise düz metin, diğerleri için URL
	EncryptedKey   string        `json:"encrypted_key"` // E2EE için şifreli anahtar
	Status         MessageStatus `json:"status"`
	ReplyToID      string        `json:"reply_to_id"` // yanıtlanan mesaj ID'si
	EditedAt       *time.Time    `json:"edited_at"`   // düzenlendiyse zaman
	DeletedAt      *time.Time    `json:"deleted_at"`  // silindiyse zaman
	CreatedAt      time.Time     `json:"created_at"`
}

// Conversation iki veya daha fazla kullanıcı arasındaki sohbeti temsil eder.
type Conversation struct {
	ID            string    `json:"id"`
	Type          string    `json:"type"` // "direct" veya "group"
	Name          string    `json:"name"` // grup adı (direct için boş)
	AvatarURL     string    `json:"avatar_url"`
	LastMessageID string    `json:"last_message_id"`
	CreatedBy     string    `json:"created_by"`
	CreatedAt     time.Time `json:"created_at"`
}

// ConversationMember sohbet üyesini temsil eder.
type ConversationMember struct {
	ConversationID string    `json:"conversation_id"`
	UserID         string    `json:"user_id"`
	JoinedAt       time.Time `json:"joined_at"`
}

// MessageReaction mesaja verilen tepkiyi temsil eder.
type MessageReaction struct {
	MessageID string    `json:"message_id"`
	UserID    string    `json:"user_id"`
	Emoji     string    `json:"emoji"`
	CreatedAt time.Time `json:"created_at"`
}
