INSERT INTO plantillas_mensaje (
    clave, nombre, asunto_email, cuerpo_email, cuerpo_whatsapp,
    variables_ejemplo, enlace_ejemplo, activo
) VALUES (
    'CAMBIO_SEGURIDAD_CONFIRMADO',
    'Confirmación de cambio de seguridad',
    'Cambio de seguridad realizado en tu cuenta',
    'Hola {{nombre}},\n\nSe actualizó el {{cambio}} de acceso a tu cuenta.\n\nSi no reconoces este cambio, comunícate inmediatamente con el despacho para proteger tu cuenta.',
    'Hola {{nombre}} 👋\n\nSe actualizó el {{cambio}} de acceso a tu cuenta.\n\nSi no reconoces este cambio, comunícate inmediatamente con el despacho para proteger tu cuenta.',
    '{"nombre":"María Pérez","cambio":"correo de acceso"}',
    NULL,
    TRUE
)
ON CONFLICT (clave) DO NOTHING;
