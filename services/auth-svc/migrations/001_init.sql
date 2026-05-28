-- 001_init.sql
-- auth-svc için tüm tablolar

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid() için

-- ── Kullanıcılar ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    phone         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    avatar_url    TEXT NOT NULL DEFAULT '',
    totp_secret   TEXT NOT NULL DEFAULT '',
    totp_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
    last_seen     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_phone    ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- ── Cihazlar ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS devices (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    public_key TEXT NOT NULL DEFAULT '',
    last_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);

-- ── Oturumlar ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id     TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    refresh_token TEXT NOT NULL UNIQUE,
    expires_at    TIMESTAMPTZ NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_refresh_token ON sessions(refresh_token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id       ON sessions(user_id);