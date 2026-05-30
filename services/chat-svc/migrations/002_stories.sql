CREATE TABLE IF NOT EXISTS stories (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'text',  -- 'text' | 'image'
    content     TEXT NOT NULL DEFAULT '',
    caption     TEXT NOT NULL DEFAULT '',
    views       INTEGER NOT NULL DEFAULT 0,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stories_user    ON stories(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_expires ON stories(expires_at);
