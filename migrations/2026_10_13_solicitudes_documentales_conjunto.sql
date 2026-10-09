-- Run once against the production PostgreSQL database before deploying this feature.
ALTER TABLE solicitudes_documento
    ADD COLUMN IF NOT EXISTS documentos_requeridos JSON NOT NULL DEFAULT '[]'::json;

ALTER TABLE documentos_proceso
    ADD COLUMN IF NOT EXISTS solicitud_item_id VARCHAR(36);

CREATE INDEX IF NOT EXISTS ix_documentos_proceso_solicitud_item_id
    ON documentos_proceso (solicitud_item_id);

-- Preserve existing single-file requests as one requested item.
UPDATE solicitudes_documento
SET documentos_requeridos = json_build_array(
    json_build_object('id', 'legacy', 'nombre', titulo)
)
WHERE COALESCE(json_array_length(documentos_requeridos), 0) = 0;

UPDATE documentos_proceso AS d
SET solicitud_item_id = 'legacy'
FROM solicitudes_documento AS s
WHERE d.solicitud_id = s.id
  AND d.solicitud_item_id IS NULL
  AND s.documentos_requeridos -> 0 ->> 'id' = 'legacy';

-- Put the requested document name first in system generated messages.
UPDATE plantillas_mensaje
SET asunto_email = 'Documento recibido: {{documento}}',
    cuerpo_email = 'Hola {{nombre}},\n\n{{actor}} cargó un archivo para la solicitud {{solicitud}} del proceso {{proceso}}.\n\nDocumento solicitado: {{documento}}\nArchivo recibido: {{archivo}}\nTipo: {{tipo}}\nFecha de carga: {{fecha}}',
    cuerpo_whatsapp = 'Hola {{nombre}} 👋\n\n{{actor}} cargó un archivo para *{{solicitud}}*.\n\nDocumento solicitado: *{{documento}}*\nArchivo recibido: {{archivo}}\nProceso: {{proceso}}\nFecha: {{fecha}}',
    variables_ejemplo = '{"nombre":"Abogada Ejemplo","actor":"María Pérez","proceso":"Proceso de ejemplo","solicitud":"Documentos para la demanda","documento":"Copia de la cédula","archivo":"cedula_frente.pdf","tipo":"application/pdf","fecha":"15/10/2026 09:00"}'::json,
    updated_at = NOW()
WHERE clave = 'DOCUMENTO_RECIBIDO';

UPDATE plantillas_mensaje
SET asunto_email = 'Documentos solicitados: {{solicitud}}',
    cuerpo_email = 'Hola {{nombre}},\n\n{{actor}} solicitó documentos para el proceso {{proceso}}.\n\nSolicitud: {{solicitud}}\nDocumentos requeridos:\n{{documentos}}\n\nInstrucciones: {{instrucciones}}\nFecha límite: {{fecha_limite}}\nFecha de solicitud: {{fecha}}',
    cuerpo_whatsapp = 'Hola {{nombre}} 👋\n\n{{actor}} solicitó documentos para el proceso *{{proceso}}*.\n\n*Solicitud: {{solicitud}}*\nDocumentos requeridos:\n{{documentos}}\n\nInstrucciones: {{instrucciones}}\nFecha límite: {{fecha_limite}}',
    variables_ejemplo = '{"nombre":"María Pérez","actor":"Abogada","proceso":"Proceso de ejemplo","solicitud":"Documentos para la demanda","documentos":"- Copia de la cédula\n- Registro civil","instrucciones":"Enviar completos y legibles","fecha_limite":"20/10/2026","fecha":"15/10/2026"}'::json,
    updated_at = NOW()
WHERE clave = 'SOLICITUD_DOCUMENTO';

UPDATE plantillas_mensaje
SET asunto_email = 'Revisión del documento solicitado: {{documento}}',
    cuerpo_email = 'Hola {{nombre}},\n\n{{actor}} revisó el documento solicitado {{documento}} para {{solicitud}} en el proceso {{proceso}}.\n\nArchivo recibido: {{archivo}}\nEstado: {{estado}}\nComentario: {{comentario}}\nFecha: {{fecha}}',
    cuerpo_whatsapp = 'Hola {{nombre}} 👋\n\n{{actor}} revisó el documento solicitado *{{documento}}* de *{{solicitud}}*.\nArchivo: {{archivo}}\nEstado: {{estado}}\nComentario: {{comentario}}',
    variables_ejemplo = '{"nombre":"María Pérez","actor":"Abogada","proceso":"Proceso de ejemplo","solicitud":"Documentos para la demanda","documento":"Copia de la cédula","archivo":"cedula_frente.pdf","estado":"EN REVISION","comentario":"Se debe verificar la legibilidad","fecha":"15/10/2026 09:00"}'::json,
    updated_at = NOW()
WHERE clave = 'DOCUMENTO_REVISION';
