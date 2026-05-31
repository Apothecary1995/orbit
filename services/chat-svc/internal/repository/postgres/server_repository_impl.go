package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/Apothecary1995/cengsta-paradise/services/chat-svc/internal/domain/entity"
	"github.com/Apothecary1995/cengsta-paradise/services/chat-svc/internal/domain/repository"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ── Server Repository ────────────────────────────────────

type serverRepository struct {
	db *pgxpool.Pool
}

func NewServerRepository(db *pgxpool.Pool) repository.ServerRepository {
	return &serverRepository{db: db}
}

func (r *serverRepository) Create(ctx context.Context, s *entity.Server) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO servers (id, name, icon_url, owner_id, invite_code, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		s.ID, s.Name, s.IconURL, s.OwnerID, s.InviteCode, s.CreatedAt,
	)
	return err
}

func (r *serverRepository) GetMember(ctx context.Context, serverID, userID string) (*entity.ServerMember, error) {
	m := &entity.ServerMember{}
	err := r.db.QueryRow(ctx,
		`SELECT server_id, user_id, role, joined_at FROM server_members WHERE server_id = $1 AND user_id = $2`,
		serverID, userID,
	).Scan(&m.ServerID, &m.UserID, &m.Role, &m.JoinedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return m, err
}

func (r *serverRepository) ListMembers(ctx context.Context, serverID string) ([]*entity.ServerMember, error) {
	rows, err := r.db.Query(ctx,
		`SELECT server_id, user_id, role, joined_at FROM server_members WHERE server_id = $1 ORDER BY
		 CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 ELSE 3 END, joined_at ASC`,
		serverID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var members []*entity.ServerMember
	for rows.Next() {
		m := &entity.ServerMember{}
		if err := rows.Scan(&m.ServerID, &m.UserID, &m.Role, &m.JoinedAt); err != nil {
			return nil, err
		}
		members = append(members, m)
	}
	return members, nil
}

func (r *serverRepository) SetMemberRole(ctx context.Context, serverID, userID string, role entity.ServerRole) error {
	_, err := r.db.Exec(ctx,
		`UPDATE server_members SET role = $1 WHERE server_id = $2 AND user_id = $3`,
		string(role), serverID, userID,
	)
	return err
}

func (r *serverRepository) RemoveMember(ctx context.Context, serverID, userID string) error {
	_, err := r.db.Exec(ctx,
		`DELETE FROM server_members WHERE server_id = $1 AND user_id = $2`,
		serverID, userID,
	)
	return err
}

func (r *serverRepository) GetByID(ctx context.Context, id string) (*entity.Server, error) {
	s := &entity.Server{}
	err := r.db.QueryRow(ctx,
		`SELECT id, name, icon_url, owner_id, invite_code, created_at FROM servers WHERE id = $1`, id,
	).Scan(&s.ID, &s.Name, &s.IconURL, &s.OwnerID, &s.InviteCode, &s.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return s, err
}

func (r *serverRepository) GetByInviteCode(ctx context.Context, inviteCode string) (*entity.Server, error) {
	s := &entity.Server{}
	err := r.db.QueryRow(ctx,
		`SELECT id, name, icon_url, owner_id, invite_code, created_at FROM servers WHERE invite_code = $1`, inviteCode,
	).Scan(&s.ID, &s.Name, &s.IconURL, &s.OwnerID, &s.InviteCode, &s.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return s, err
}

func (r *serverRepository) ListByUserID(ctx context.Context, userID string) ([]*entity.Server, error) {
	rows, err := r.db.Query(ctx,
		`SELECT s.id, s.name, s.icon_url, s.owner_id, s.invite_code, s.created_at
		 FROM servers s
		 JOIN server_members m ON s.id = m.server_id
		 WHERE m.user_id = $1
		 ORDER BY s.created_at ASC`, userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var servers []*entity.Server
	for rows.Next() {
		s := &entity.Server{}
		if err := rows.Scan(&s.ID, &s.Name, &s.IconURL, &s.OwnerID, &s.InviteCode, &s.CreatedAt); err != nil {
			return nil, err
		}
		servers = append(servers, s)
	}
	return servers, nil
}

func (r *serverRepository) AddMember(ctx context.Context, m *entity.ServerMember) error {
	role := m.Role
	if role == "" {
		role = entity.RoleMember
	}
	_, err := r.db.Exec(ctx,
		`INSERT INTO server_members (server_id, user_id, role, joined_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
		m.ServerID, m.UserID, string(role), m.JoinedAt,
	)
	return err
}

func (r *serverRepository) IsMember(ctx context.Context, serverID, userID string) (bool, error) {
	var count int
	err := r.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM server_members WHERE server_id = $1 AND user_id = $2`, serverID, userID,
	).Scan(&count)
	return count > 0, err
}

func (r *serverRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM servers WHERE id = $1`, id)
	return err
}

// ── Channel Repository ───────────────────────────────────

type channelRepository struct {
	db *pgxpool.Pool
}

func NewChannelRepository(db *pgxpool.Pool) repository.ChannelRepository {
	return &channelRepository{db: db}
}

func (r *channelRepository) Create(ctx context.Context, ch *entity.Channel) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO channels (id, server_id, name, topic, type, position, conversation_id, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		ch.ID, ch.ServerID, ch.Name, ch.Topic, ch.Type, ch.Position, ch.ConversationID, ch.CreatedAt,
	)
	return err
}

func (r *channelRepository) GetByID(ctx context.Context, id string) (*entity.Channel, error) {
	ch := &entity.Channel{}
	err := r.db.QueryRow(ctx,
		`SELECT id, server_id, name, topic, type, position, conversation_id, created_at
		 FROM channels WHERE id = $1`, id,
	).Scan(&ch.ID, &ch.ServerID, &ch.Name, &ch.Topic, &ch.Type, &ch.Position, &ch.ConversationID, &ch.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("kanal okunamadı: %w", err)
	}
	return ch, nil
}

func (r *channelRepository) ListByServerID(ctx context.Context, serverID string) ([]*entity.Channel, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, server_id, name, topic, type, position, conversation_id, created_at
		 FROM channels WHERE server_id = $1 ORDER BY position ASC, created_at ASC`, serverID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var channels []*entity.Channel
	for rows.Next() {
		ch := &entity.Channel{}
		if err := rows.Scan(&ch.ID, &ch.ServerID, &ch.Name, &ch.Topic, &ch.Type, &ch.Position, &ch.ConversationID, &ch.CreatedAt); err != nil {
			return nil, err
		}
		channels = append(channels, ch)
	}
	return channels, nil
}

func (r *channelRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM channels WHERE id = $1`, id)
	return err
}
