-- Correct persisted example links after the portal subdomains and process pages.
-- Runtime links are built from the recipient's role; these are admin preview samples.
UPDATE plantillas_mensaje
SET enlace_ejemplo = CASE clave
    WHEN 'EVENTO_AGENDA' THEN 'https://panel.alejandramunozabogada.com/procesos/1#evento-1'
    WHEN 'PROCESO_ACTUALIZACION' THEN 'https://panel.alejandramunozabogada.com/procesos/1'
    WHEN 'ABOGADO_CREDENCIALES' THEN 'https://panel.alejandramunozabogada.com/'
    WHEN 'CLIENTE_CREDENCIALES' THEN 'https://panel.alejandramunozabogada.com/'
    WHEN 'DOCUMENTO_REVISION' THEN 'https://panel.alejandramunozabogada.com/procesos/1#documentos'
    WHEN 'COMUNICACION_CLIENTE_ABOGADO' THEN 'https://panel.alejandramunozabogada.com/chat/1/2'
    WHEN 'COMUNICACION_ABOGADO_CLIENTE' THEN 'https://panel.alejandramunozabogada.com/chat/1/2'
    WHEN 'COLABORADOR_AGREGADO' THEN 'https://panel.alejandramunozabogada.com/procesos/1/resumen'
    WHEN 'ACTUACION_NOTIFICADA' THEN 'https://panel.alejandramunozabogada.com/procesos/1#actuacion-1'
    WHEN 'SOLICITUD_DOCUMENTO' THEN 'https://panel.alejandramunozabogada.com/procesos/1#documentos'
    WHEN 'DOCUMENTO_RECIBIDO' THEN 'https://panel.alejandramunozabogada.com/procesos/1/documentos'
    WHEN 'TAREA_ACCION' THEN 'https://panel.alejandramunozabogada.com/tareas?tarea=1#tarea-1'
    WHEN 'SUBTAREA_ASIGNADA' THEN 'https://panel.alejandramunozabogada.com/tareas?tarea=1#tarea-1'
    WHEN 'RECORDATORIO_TAREA' THEN 'https://panel.alejandramunozabogada.com/tareas?tarea=1#tarea-1'
    WHEN 'REACTIVACION_TAREA' THEN 'https://panel.alejandramunozabogada.com/tareas?tarea=1#tarea-1'
    WHEN 'REACTIVACION_EVENTO' THEN 'https://panel.alejandramunozabogada.com/procesos/1#evento-1'
    WHEN 'REACTIVACION_COMUNICACION' THEN 'https://panel.alejandramunozabogada.com/chat/1/2'
    WHEN 'ACTUACIONES_DIGEST' THEN NULL
    WHEN 'RECUPERAR_PASSWORD' THEN 'https://panel.alejandramunozabogada.com/restablecer-password?token=ejemplo'
    WHEN 'CONTRATO_FIRMADO' THEN 'https://panel.alejandramunozabogada.com/procesos/1#documentos'
    WHEN 'CHAT_MENSAJE' THEN 'https://panel.alejandramunozabogada.com/chat/1/2'
    ELSE enlace_ejemplo
END,
updated_at = NOW()
WHERE clave IN (
    'EVENTO_AGENDA', 'PROCESO_ACTUALIZACION', 'ABOGADO_CREDENCIALES',
    'CLIENTE_CREDENCIALES', 'DOCUMENTO_REVISION', 'COMUNICACION_CLIENTE_ABOGADO',
    'COMUNICACION_ABOGADO_CLIENTE', 'COLABORADOR_AGREGADO', 'ACTUACION_NOTIFICADA',
    'SOLICITUD_DOCUMENTO', 'DOCUMENTO_RECIBIDO', 'TAREA_ACCION', 'SUBTAREA_ASIGNADA',
    'RECORDATORIO_TAREA', 'REACTIVACION_TAREA', 'REACTIVACION_EVENTO',
    'REACTIVACION_COMUNICACION', 'ACTUACIONES_DIGEST', 'RECUPERAR_PASSWORD',
    'CONTRATO_FIRMADO', 'CHAT_MENSAJE'
);
