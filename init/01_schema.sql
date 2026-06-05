-- ═══════════════════════════════════════════════════════
--  Orbit — Tam Veritabanı Şeması
--  PostgreSQL docker-entrypoint-initdb.d/ tarafından
--  container ilk başlatıldığında otomatik uygulanır.
-- ═══════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── USERS ──────────────────────────────────────────────
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

-- ── DEVICES ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS devices (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    public_key TEXT NOT NULL DEFAULT '',
    last_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);

-- ── SESSIONS ───────────────────────────────────────────
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

-- ── CONVERSATIONS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
    id              TEXT PRIMARY KEY,
    type            TEXT NOT NULL DEFAULT 'direct',
    name            TEXT NOT NULL DEFAULT '',
    avatar_url      TEXT NOT NULL DEFAULT '',
    last_message_id TEXT NOT NULL DEFAULT '',
    created_by      TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── CONVERSATION MEMBERS ───────────────────────────────
CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id TEXT NOT NULL,
    user_id         TEXT NOT NULL,
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conv_members_user ON conversation_members(user_id);

-- ── MESSAGES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id       TEXT NOT NULL,
    type            TEXT NOT NULL DEFAULT 'text',
    content         TEXT NOT NULL DEFAULT '',
    encrypted_key   TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'sent',
    reply_to_id     TEXT NOT NULL DEFAULT '',
    edited_at       TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender       ON messages(sender_id);

-- ── MESSAGE REACTIONS ──────────────────────────────────
CREATE TABLE IF NOT EXISTS message_reactions (
    message_id TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    emoji      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (message_id, user_id, emoji)
);

-- ── STORIES ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stories (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    type       TEXT NOT NULL DEFAULT 'text',
    content    TEXT NOT NULL DEFAULT '',
    caption    TEXT NOT NULL DEFAULT '',
    views      INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stories_user    ON stories(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_expires ON stories(expires_at);

-- ── SERVERS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS servers (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    icon_url    TEXT NOT NULL DEFAULT '',
    owner_id    TEXT NOT NULL,
    invite_code TEXT UNIQUE NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_servers_invite ON servers(invite_code);

-- ── SERVER MEMBERS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS server_members (
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    user_id   TEXT NOT NULL,
    role      TEXT NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (server_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_server_members_user ON server_members(user_id);
CREATE INDEX IF NOT EXISTS idx_server_members_role ON server_members(server_id, role);

-- ── CHANNELS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channels (
    id              TEXT PRIMARY KEY,
    server_id       TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    topic           TEXT NOT NULL DEFAULT '',
    type            TEXT NOT NULL DEFAULT 'text',
    position        INT  NOT NULL DEFAULT 0,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channels_server ON channels(server_id, position);
