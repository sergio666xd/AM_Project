-- Push notifications: device management and email/whatsapp silencing
-- Adds device identification fields to push subscriptions
-- Adds push-based channel silencing preferences to users

ALTER TABLE chat_push_subscriptions
    ADD COLUMN IF NOT EXISTS user_agent TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS device_label VARCHAR(120) DEFAULT '';

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS silenciar_email_si_push BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS silenciar_whatsapp_si_push BOOLEAN NOT NULL DEFAULT FALSE;

