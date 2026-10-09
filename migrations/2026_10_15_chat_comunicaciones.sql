-- Run before deploying the chat UI and API.
CREATE TABLE IF NOT EXISTS chat_conversaciones (
    id SERIAL PRIMARY KEY,
    clave VARCHAR(140) NOT NULL UNIQUE,
    tipo VARCHAR(32) NOT NULL,
    proceso_id INTEGER REFERENCES procesos(id) ON DELETE CASCADE,
    cliente_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_chat_conversaciones_id ON chat_conversaciones(id);
CREATE INDEX IF NOT EXISTS ix_chat_conversaciones_tipo ON chat_conversaciones(tipo);
CREATE INDEX IF NOT EXISTS ix_chat_conversaciones_proceso_id ON chat_conversaciones(proceso_id);
CREATE INDEX IF NOT EXISTS ix_chat_conversaciones_cliente_id ON chat_conversaciones(cliente_id);
CREATE INDEX IF NOT EXISTS ix_chat_conversaciones_updated_at ON chat_conversaciones(updated_at);

CREATE TABLE IF NOT EXISTS chat_participantes (
    id SERIAL PRIMARY KEY,
    conversacion_id INTEGER NOT NULL REFERENCES chat_conversaciones(id) ON DELETE CASCADE,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    ultimo_leido_en TIMESTAMP,
    CONSTRAINT uq_chat_participante UNIQUE (conversacion_id, usuario_id)
);
CREATE INDEX IF NOT EXISTS ix_chat_participantes_conversacion_id ON chat_participantes(conversacion_id);
CREATE INDEX IF NOT EXISTS ix_chat_participantes_usuario_id ON chat_participantes(usuario_id);

CREATE TABLE IF NOT EXISTS chat_mensajes (
    id SERIAL PRIMARY KEY,
    conversacion_id INTEGER NOT NULL REFERENCES chat_conversaciones(id) ON DELETE CASCADE,
    remitente_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    contenido TEXT NOT NULL,
    referencia_tipo VARCHAR(24),
    referencia_id INTEGER,
    referencia_titulo VARCHAR(255),
    referencia_url VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_chat_mensajes_conversacion_id ON chat_mensajes(conversacion_id);
CREATE INDEX IF NOT EXISTS ix_chat_mensajes_remitente_id ON chat_mensajes(remitente_id);
CREATE INDEX IF NOT EXISTS ix_chat_mensajes_id ON chat_mensajes(id);
CREATE INDEX IF NOT EXISTS ix_chat_mensajes_created_at ON chat_mensajes(created_at);
