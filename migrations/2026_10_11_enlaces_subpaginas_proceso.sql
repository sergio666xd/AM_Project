-- Actualiza las URL de ejemplo de las plantillas con destino al panel del abogado.
-- Las URL de cliente conservan sus anclas, pues el portal del cliente sigue usando
-- secciones dentro de la misma página.
UPDATE plantillas_mensaje
SET enlace_ejemplo = CASE clave
    WHEN 'COMUNICACION_CLIENTE_ABOGADO' THEN 'https://www.alejandramunozabogada.com/gestion-procesos/abogado/procesos/1/comunicaciones'
    WHEN 'DOCUMENTO_RECIBIDO' THEN 'https://www.alejandramunozabogada.com/gestion-procesos/abogado/procesos/1/documentos'
END
WHERE clave IN ('COMUNICACION_CLIENTE_ABOGADO', 'DOCUMENTO_RECIBIDO');
