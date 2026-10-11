-- Push de actuaciones judiciales configurable desde Operación > Mensajes.
-- Aplicar después de 2026_10_10_mensajes_configurables.sql.
ALTER TABLE plantillas_mensaje
    ADD COLUMN IF NOT EXISTS titulo_push TEXT,
    ADD COLUMN IF NOT EXISTS cuerpo_push TEXT;

UPDATE plantillas_mensaje
SET titulo_push = COALESCE(NULLIF(titulo_push, ''), 'Nueva actuación judicial en {{radicado}}'),
    cuerpo_push = COALESCE(NULLIF(cuerpo_push, ''), '{{actuacion}}\n{{anotacion}}'),
    variables_ejemplo = (
        COALESCE(variables_ejemplo::jsonb, '{}'::jsonb)
        || '{"proceso":"Proceso de ejemplo","radicado":"05001311001220250035600","fecha":"11/10/2026","actuacion":"Auto admite demanda","anotacion":"Se admite la demanda."}'::jsonb
    )::json
WHERE clave = 'ACTUACIONES_DIGEST';
