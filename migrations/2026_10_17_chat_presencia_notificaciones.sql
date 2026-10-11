-- Presence uses short database leases; no per-user Vercel polling workflow is needed.
CREATE TABLE IF NOT EXISTS chat_presencias_panel (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    session_id VARCHAR(80) NOT NULL,
    last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_chat_presencia_usuario_sesion UNIQUE (usuario_id, session_id)
);

CREATE INDEX IF NOT EXISTS ix_chat_presencias_panel_usuario_id
    ON chat_presencias_panel(usuario_id);
CREATE INDEX IF NOT EXISTS ix_chat_presencia_last_seen
    ON chat_presencias_panel(last_seen_at);

-- One external reminder per sender-recipient pair, regardless of the number of chats.
CREATE TABLE IF NOT EXISTS chat_avisos_destinatario (
    id SERIAL PRIMARY KEY,
    remitente_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    destinatario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    ultima_notificacion_en TIMESTAMP NOT NULL,
    CONSTRAINT uq_chat_aviso_remitente_destinatario UNIQUE (remitente_id, destinatario_id)
);

CREATE INDEX IF NOT EXISTS ix_chat_aviso_ultima_notificacion
    ON chat_avisos_destinatario(ultima_notificacion_en);

INSERT INTO plantillas_mensaje (
    clave, nombre, asunto_email, cuerpo_email, cuerpo_whatsapp,
    variables_ejemplo, enlace_ejemplo, activo, updated_at
) VALUES (
    'CHAT_MENSAJE',
    'Aviso de nuevos mensajes de chat',
    'Tienes nuevos mensajes de {{actor}}',
    'Hola {{nombre}},\n\n{{actor}} te está enviando mensajes por el chat del panel.\n\nIngresa al panel para leer la conversación.',
    'Hola {{nombre}} 👋\n\n{{actor}} te está enviando mensajes por el chat del panel. Ingresa para leer la conversación.',
    '{"nombre":"María Pérez","actor":"Alejandra Muñoz"}'::json,
    'https://panel.alejandramunozabogada.com/chat/1/2',
    TRUE,
    NOW()
)
ON CONFLICT (clave) DO NOTHING;
