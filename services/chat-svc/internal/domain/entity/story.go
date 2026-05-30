package entity

import "time"

type Story struct {
	ID        string
	UserID    string
	Type      string // "text" | "image"
	Content   string
	Caption   string
	Views     int
	ExpiresAt time.Time
	CreatedAt time.Time
}
