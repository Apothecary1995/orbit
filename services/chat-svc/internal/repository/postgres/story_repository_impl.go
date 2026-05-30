package postgres

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/Apothecary1995/cengsta-paradise/services/chat-svc/internal/domain/entity"
	"github.com/Apothecary1995/cengsta-paradise/services/chat-svc/internal/domain/repository"
	"github.com/jackc/pgx/v5/pgxpool"
)

type storyRepository struct {
	db *pgxpool.Pool
}

func NewStoryRepository(db *pgxpool.Pool) repository.StoryRepository {
	return &storyRepository{db: db}
}

func (r *storyRepository) Create(ctx context.Context, s *entity.Story) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO stories (id, user_id, type, content, caption, views, expires_at, created_at)
		 VALUES ($1, $2, $3, $4, $5, 0, $6, $7)`,
		s.ID, s.UserID, s.Type, s.Content, s.Caption, s.ExpiresAt, s.CreatedAt,
	)
	return err
}

func (r *storyRepository) ListByUserIDs(ctx context.Context, userIDs []string) ([]*entity.Story, error) {
	if len(userIDs) == 0 {
		return nil, nil
	}
	placeholders := make([]string, len(userIDs))
	args := make([]interface{}, len(userIDs)+1)
	args[0] = time.Now()
	for i, id := range userIDs {
		placeholders[i] = fmt.Sprintf("$%d", i+2)
		args[i+1] = id
	}
	query := fmt.Sprintf(
		`SELECT id, user_id, type, content, caption, views, expires_at, created_at
		 FROM stories WHERE expires_at > $1 AND user_id IN (%s)
		 ORDER BY created_at DESC`,
		strings.Join(placeholders, ","),
	)
	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stories []*entity.Story
	for rows.Next() {
		s := &entity.Story{}
		if err := rows.Scan(&s.ID, &s.UserID, &s.Type, &s.Content, &s.Caption, &s.Views, &s.ExpiresAt, &s.CreatedAt); err != nil {
			return nil, err
		}
		stories = append(stories, s)
	}
	return stories, nil
}
