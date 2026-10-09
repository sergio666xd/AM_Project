-- Apply after 2026_10_15_chat_comunicaciones.sql.
-- Tracks the highest message delivered/read by each conversation participant.
ALTER TABLE chat_participantes
    ADD COLUMN IF NOT EXISTS ultimo_entregado_mensaje_id INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ultimo_leido_mensaje_id INTEGER NOT NULL DEFAULT 0;

-- Preserve existing read markers when upgrading an already-used chat.
UPDATE chat_participantes AS participante
SET ultimo_leido_mensaje_id = COALESCE((
    SELECT MAX(mensaje.id)
    FROM chat_mensajes AS mensaje
    WHERE mensaje.conversacion_id = participante.conversacion_id
      AND participante.ultimo_leido_en IS NOT NULL
      AND mensaje.created_at <= participante.ultimo_leido_en
), 0)
WHERE participante.ultimo_leido_en IS NOT NULL
  AND participante.ultimo_leido_mensaje_id = 0;

-- A read marker necessarily means those messages were delivered too.
UPDATE chat_participantes
SET ultimo_entregado_mensaje_id = GREATEST(ultimo_entregado_mensaje_id, ultimo_leido_mensaje_id);
