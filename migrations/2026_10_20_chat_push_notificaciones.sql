-- Browser push subscriptions are stored per browser/device and user.
CREATE TABLE IF NOT EXISTS chat_push_subscriptions (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh VARCHAR(256) NOT NULL,
    auth VARCHAR(128) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_chat_push_subscriptions_usuario_id
    ON chat_push_subscriptions(usuario_id);
