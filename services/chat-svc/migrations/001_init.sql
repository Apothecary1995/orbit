-- chat-svc tabloları

-- ── Sohbetler ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
    id              TEXT PRIMARY KEY,
    type            TEXT NOT NULL DEFAULT 'direct', -- 'direct' veya 'group'
    name            TEXT NOT NULL DEFAULT '',
    avatar_url      TEXT NOT NULL DEFAULT '',
    last_message_id TEXT NOT NULL DEFAULT '',
    created_by      TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Sohbet üyeleri ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id TEXT NOT NULL,
    user_id         TEXT NOT NULL,
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conv_members_user ON conversation_members(user_id);

-- ── Mesajlar ─────────────────────────────────────────────
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

-- ── Tepkiler ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_reactions (
    message_id TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    emoji      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (message_id, user_id, emoji)
);