package entity

import "time"

type Server struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	IconURL    string    `json:"icon_url"`
	OwnerID    string    `json:"owner_id"`
	InviteCode string    `json:"invite_code"`
	CreatedAt  time.Time `json:"created_at"`
}

// Rol hiyerarşisi: owner > admin > moderator > member
type ServerRole string

const (
	RoleOwner     ServerRole = "owner"
	RoleAdmin     ServerRole = "admin"
	RoleModerator ServerRole = "moderator"
	RoleMember    ServerRole = "member"
)

func (r ServerRole) Level() int {
	switch r {
	case RoleOwner:
		return 3
	case RoleAdmin:
		return 2
	case RoleModerator:
		return 1
	default:
		return 0
	}
}

func (r ServerRole) CanManageChannels() bool { return r.Level() >= RoleAdmin.Level() }
func (r ServerRole) CanKick() bool           { return r.Level() >= RoleModerator.Level() }
func (r ServerRole) CanSetRoles() bool       { return r.Level() >= RoleAdmin.Level() }
func (r ServerRole) CanDeleteMessages() bool { return r.Level() >= RoleModerator.Level() }

type ServerMember struct {
	ServerID string     `json:"server_id"`
	UserID   string     `json:"user_id"`
	Role     ServerRole `json:"role"`
	JoinedAt time.Time  `json:"joined_at"`
}

type Channel struct {
	ID             string    `json:"id"`
	ServerID       string    `json:"server_id"`
	Name           string    `json:"name"`
	Topic          string    `json:"topic"`
	Type           string    `json:"type"`
	Position       int       `json:"position"`
	ConversationID string    `json:"conversation_id"`
	CreatedAt      time.Time `json:"created_at"`
}
