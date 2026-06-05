-- 002_friends.sql
-- Arkadaşlık sistemi ve davet kodu tabloları

CREATE TABLE IF NOT EXISTS friendships (
    id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id    TEXT NOT NULL,
    friend_id  TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'pending',   -- pending | accepted | rejected
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_user_id    ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_id  ON friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_friendships_lookup     ON friendships(user_id, friend_id, status);

CREATE TABLE IF NOT EXISTS invites (
    id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    code       TEXT NOT NULL UNIQUE,
    creator_id TEXT NOT NULL,
    uses       INT NOT NULL DEFAULT 0,
    max_uses   INT NOT NULL DEFAULT 50,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_invites_code       ON invites(code);
CREATE INDEX IF NOT EXISTS idx_invites_creator_id ON invites(creator_id);
