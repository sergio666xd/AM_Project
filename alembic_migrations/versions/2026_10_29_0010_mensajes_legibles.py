"""Reescritura de las plantillas de correo y WhatsApp.

Todas las plantillas siguen las skills `correos-despacho-am` y
`whatsapp-despacho-am`: trato de usted, qué pasó, qué debe hacer y para cuándo,
y un enlace directo a la pantalla de la acción (`{{enlace}}`). Los correos usan
las marcas de línea que `app/email_service.py` convierte en bloques, y
WhatsApp deja los emojis al formateador de `app/whatsapp.py`.

La contraseña temporal del cliente ya no viaja por WhatsApp.

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-29
"""
from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0010"
down_revision: Union[str, Sequence[str], None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PANEL = "https://panel.alejandramunozabogada.com"
AYUDA_CHAT = "? Si tiene dudas, escríbanos por el chat del portal."

PLANTILLAS = [
    {
        "clave": "ACTUACION_NOTIFICADA",
        "nombre": "Actuación judicial informada",
        "asunto_email": "Novedad del juzgado en su proceso {{proceso}}",
        "cuerpo_email": (
            "# Hay una novedad del juzgado en su proceso\n"
            "Hola, {{primer_nombre}}:\n"
            "{{actor}} le informa una actuación nueva en su proceso {{proceso}}.\n"
            "> {{comentarios}}\n"
            "Si esta novedad requiere algo de usted, se lo indicaremos.\n"
            "Abrir enlace: Ver la actuación | {{enlace}}\n"
            "Proceso: {{proceso}}\n"
            "Radicado: {{radicado}}\n"
            "Actuación: {{actuacion}}\n"
            "Nota del juzgado: {{anotacion}}\n"
            "Fecha: {{fecha}}\n"
            f"{AYUDA_CHAT}"
        ),
        "cuerpo_whatsapp": (
            "Hola, {{primer_nombre}}.\n"
            "Hay una novedad del juzgado en su proceso *{{proceso}}*.\n"
            "{{comentarios}}\n"
            "Actuación: {{actuacion}}\n"
            "Fecha: {{fecha}}\n"
            "Si esta novedad requiere algo de usted, se lo indicaremos.\n"
            "Abrir enlace: Ver la actuación | {{enlace}}"
        ),
        "variables_ejemplo": {
            "nombre": "María Pérez", "actor": "Alejandra Muñoz", "proceso": "Sucesión de Jorge Pérez",
            "radicado": "05001311001220250035600", "fecha": "2026-10-15", "actuacion": "Auto admite demanda",
            "anotacion": "Se admite la demanda y se ordena notificar.",
            "comentarios": "El juzgado aceptó estudiar la demanda. Es un paso normal del proceso.",
        },
        "enlace_ejemplo": f"{PANEL}/procesos/1#actuacion-1",
    },
    {
        "clave": "ACTUACIONES_DIGEST",
        "nombre": "Novedades judiciales",
        "asunto_email": "Novedades del juzgado en sus procesos",
        "cuerpo_email": (
            "# Hay novedades del juzgado\n"
            "Hola, {{primer_nombre}}:\n"
            "La Rama Judicial registró actuaciones nuevas en estos procesos.\n\n"
            "{{novedades}}\n\n"
            f"{AYUDA_CHAT}"
        ),
        "cuerpo_whatsapp": (
            "Hola, {{primer_nombre}}.\n"
            "Hay novedades del juzgado en sus procesos:\n\n"
            "{{novedades}}"
        ),
        "titulo_push": "Novedad del juzgado: {{proceso}}",
        "cuerpo_push": "{{actuacion}}\n{{fecha}}",
        "variables_ejemplo": {
            "nombre": "María Pérez",
            "novedades": (
                "Proceso: Sucesión de Jorge Pérez\nRadicado: 05001 31 10 012 2025 00356 00\n"
                "Actuación: Auto admite demanda\nFecha: miércoles 15 de octubre de 2026\n"
                f"Abrir enlace: Ver las novedades de Sucesión de Jorge Pérez | {PANEL}/procesos/1#radicado-1"
            ),
            "proceso": "Sucesión de Jorge Pérez", "radicado": "05001311001220250035600",
            "fecha": "2026-10-15", "actuacion": "Auto admite demanda", "anotacion": "Se admite la demanda.",
        },
        "enlace_ejemplo": None,
    },
    {
        "clave": "CLIENTE_CREDENCIALES",
        "nombre": "Credenciales de cliente",
        "asunto_email": "Su acceso al portal del despacho",
        "cuerpo_email": (
            "# Ya puede consultar sus procesos en línea\n"
            "Hola, {{primer_nombre}}:\n"
            "{{actor}} creó su acceso al portal del despacho. Allí verá cómo va su proceso, "
            "los documentos que le pedimos y los mensajes de su abogado.\n"
            "Usuario: {{correo}}\n"
            "Contraseña temporal: {{password}}\n"
            "! Entre al portal con estos datos. La primera vez, el portal le pedirá crear una contraseña nueva.\n"
            "Abrir enlace: Entrar al portal | {{enlace}}\n"
            "Le avisaremos de las novedades por {{canal}}.\n"
            "? No comparta su contraseña con nadie. El despacho nunca se la pedirá por teléfono, correo ni WhatsApp."
        ),
        "cuerpo_whatsapp": (
            "Hola, {{primer_nombre}}.\n"
            "{{actor}} creó su acceso al portal del despacho, donde puede ver cómo va su proceso.\n"
            "Le enviamos el usuario y la contraseña temporal a su correo *{{correo}}*.\n"
            "Si no lo encuentra, revise la carpeta de correo no deseado.\n"
            "Abrir enlace: Entrar al portal | {{enlace}}"
        ),
        "variables_ejemplo": {
            "nombre": "María Pérez", "actor": "Alejandra Muñoz", "correo": "cliente@example.com",
            "password": "Temporal123", "canal": "WHATSAPP",
        },
        "enlace_ejemplo": f"{PANEL}/",
    },
    {
        "clave": "ABOGADO_CREDENCIALES",
        "nombre": "Acceso de abogado",
        "asunto_email": "Su acceso al portal del despacho",
        "cuerpo_email": (
            "# Su acceso al portal está listo\n"
            "Hola, {{primer_nombre}}:\n"
            "Se creó su cuenta de abogado en el portal de gestión de procesos.\n"
            "Usuario: {{correo}}\n"
            "! Entre con la contraseña temporal que le entregaron. La primera vez, el portal le pedirá cambiarla.\n"
            "Abrir enlace: Entrar al portal | {{enlace}}\n"
            "? No comparta su contraseña con nadie."
        ),
        "cuerpo_whatsapp": (
            "Hola, {{primer_nombre}}.\n"
            "Se creó su cuenta de abogado en el portal del despacho.\n"
            "Usuario: {{correo}}\n"
            "Entre con la contraseña temporal que le entregaron y cámbiela al ingresar.\n"
            "Abrir enlace: Entrar al portal | {{enlace}}"
        ),
        "variables_ejemplo": {"nombre": "Carolina Ríos", "correo": "abogada@example.com"},
        "enlace_ejemplo": f"{PANEL}/",
    },
    {
        "clave": "CODIGO_SEGURIDAD",
        "nombre": "Código de seguridad OTP",
        "asunto_email": "Su código de seguridad",
        "cuerpo_email": (
            "# Su código de seguridad\n"
            "Hola, {{primer_nombre}}:\n"
            "Use este código para confirmar el cambio en su cuenta.\n"
            "Código: {{codigo}}\n"
            "! Escríbalo en el portal antes de 3 minutos.\n"
            "? No comparta este código con nadie, ni siquiera con el despacho. "
            "Si usted no pidió este cambio, ignore este mensaje y su cuenta seguirá igual."
        ),
        "cuerpo_whatsapp": (
            "Hola, {{primer_nombre}}.\n"
            "Su código de seguridad es *{{codigo}}*.\n"
            "Vence en 3 minutos. No lo comparta con nadie, ni siquiera con el despacho.\n"
            "Si usted no pidió este cambio, ignore este mensaje."
        ),
        "variables_ejemplo": {"nombre": "María Pérez", "codigo": "123456"},
        "enlace_ejemplo": None,
    },
    {
        "clave": "CAMBIO_SEGURIDAD_CONFIRMADO",
        "nombre": "Confirmación de cambio de seguridad",
        "asunto_email": "Se cambió el {{cambio}} de su cuenta",
        "cuerpo_email": (
            "# Se hizo un cambio en su cuenta\n"
            "Hola, {{primer_nombre}}:\n"
            "Se actualizó el {{cambio}} de acceso a su cuenta del portal.\n"
            "Si usted hizo este cambio, no tiene que hacer nada.\n"
            "! Si usted no lo hizo, comuníquese de inmediato con el despacho para proteger su cuenta."
        ),
        "cuerpo_whatsapp": (
            "Hola, {{primer_nombre}}.\n"
            "Se actualizó el *{{cambio}}* de acceso a su cuenta del portal.\n"
            "Si usted hizo este cambio, no tiene que hacer nada.\n"
            "Si no lo hizo, comuníquese de inmediato con el despacho."
        ),
        "variables_ejemplo": {"nombre": "María Pérez", "cambio": "correo de acceso"},
        "enlace_ejemplo": None,
    },
    {
        "clave": "CHAT_MENSAJE",
        "nombre": "Aviso de nuevos mensajes de chat",
        "asunto_email": "{{actor}} le escribió por el chat",
        "cuerpo_email": (
            "# Tiene mensajes nuevos\n"
            "Hola, {{primer_nombre}}:\n"
            "{{actor}} le está escribiendo por el chat del portal.\n"
            "Abrir enlace: Leer los mensajes | {{enlace}}"
        ),
        "cuerpo_whatsapp": (
            "Hola, {{primer_nombre}}.\n"
            "*{{actor}}* le está escribiendo por el chat del portal.\n"
            "Abrir enlace: Leer los mensajes | {{enlace}}"
        ),
        "variables_ejemplo": {"nombre": "María Pérez", "actor": "Alejandra Muñoz"},
        "enlace_ejemplo": f"{PANEL}/chat/1/2",
    },
    {
        "clave": "COLABORADOR_AGREGADO",
        "nombre": "Abogado agregado al proceso",
        "asunto_email": "Ahora participa en el proceso {{proceso}}",
        "cuerpo_email": (
            "# Ahora participa en un proceso\n"
            "Hola, {{primer_nombre}}:\n"
            "{{actor}} le dio acceso al proceso {{proceso}}.\n"
            "Proceso: {{proceso}}\n"
            "Responsable: {{responsable}}\n"
            "Su participación: {{permiso}}\n"
            "Abrir enlace: Ver el proceso | {{enlace}}"
        ),
        "cuerpo_whatsapp": (
            "Hola, {{primer_nombre}}.\n"
            "{{actor}} le dio acceso al proceso *{{proceso}}*.\n"
            "Responsable: {{responsable}}\n"
            "Su participación: {{permiso}}\n"
            "Abrir enlace: Ver el proceso | {{enlace}}"
        ),
        "variables_ejemplo": {
            "nombre": "Carolina Ríos", "actor": "Alejandra Muñoz", "permiso": "colaborador interno",
            "proceso": "Sucesión de Jorge Pérez", "responsable": "Alejandra Muñoz",
        },
        "enlace_ejemplo": f"{PANEL}/procesos/1/resumen",
    },
    {
        "clave": "COMUNICACION_ABOGADO_CLIENTE",
        "nombre": "Comunicación del despacho al cliente",
        "asunto_email": "Mensaje del despacho: {{asunto}}",
        "cuerpo_email": (
            "# Tiene un mensaje del despacho\n"
            "Hola, {{primer_nombre}}:\n"
            "{{actor}} le escribió sobre su proceso {{proceso}}.\n"
            "Asunto: {{asunto}}\n"
            "Fecha: {{fecha}}\n\n"
            "Mensaje:\n"
            "{{mensaje}}\n\n"
            "Abrir enlace: Leer y responder | {{enlace}}"
        ),
        "cuerpo_whatsapp": (
            "Hola, {{primer_nombre}}.\n"
            "*{{actor}}* le escribió sobre su proceso *{{proceso}}*.\n"
            "Asunto: {{asunto}}\n"
            "{{mensaje}}\n"
            "Abrir enlace: Leer y responder | {{enlace}}"
        ),
        "variables_ejemplo": {
            "nombre": "María Pérez", "actor": "Alejandra Muñoz", "proceso": "Sucesión de Jorge Pérez",
            "asunto": "Fecha de la audiencia", "fecha": "15/10/2026 09:00",
            "mensaje": "La audiencia quedó para el martes 3 de noviembre. Le confirmo la hora mañana.",
        },
        "enlace_ejemplo": f"{PANEL}/chat/1/2",
    },
    {
        "clave": "COMUNICACION_CLIENTE_ABOGADO",
        "nombre": "Mensaje de cliente al despacho",
        "asunto_email": "Mensaje de {{actor}}: {{asunto}}",
        "cuerpo_email": (
            "# Un cliente le escribió\n"
            "Hola, {{primer_nombre}}:\n"
            "{{actor}} le escribió sobre el proceso {{proceso}}.\n"
            "Asunto: {{asunto}}\n"
            "Fecha: {{fecha}}\n\n"
            "Mensaje:\n"
            "{{mensaje}}\n\n"
            "Abrir enlace: Leer y responder | {{enlace}}"
        ),
        "cuerpo_whatsapp": (
            "Hola, {{primer_nombre}}.\n"
            "*{{actor}}* le escribió sobre el proceso *{{proceso}}*.\n"
            "Asunto: {{asunto}}\n"
            "{{mensaje}}\n"
            "Abrir enlace: Leer y responder | {{enlace}}"
        ),
        "variables_ejemplo": {
            "nombre": "Alejandra Muñoz", "actor": "María Pérez", "proceso": "Sucesión de Jorge Pérez",
            "asunto": "Consulta", "fecha": "15/10/2026 09:00", "mensaje": "¿Necesitan algo más de mi parte?",
        },
        "enlace_ejemplo": f"{PANEL}/chat/1/2",
    },
    {
        "clave": "CONTRATO_FIRMADO",
        "nombre": "Copia de contrato firmado",
        "asunto_email": "Copia de su contrato firmado",
        "cuerpo_email": (
            "# Le enviamos su contrato firmado\n"
            "Hola, {{primer_nombre}}:\n"
            "Adjuntamos la copia escaneada del contrato de prestación de servicios que firmó "
            "para el proceso {{proceso}}.\n"
            "Guárdela en un lugar seguro. También la puede consultar en cualquier momento en el portal.\n"
            "Abrir enlace: Ver mis documentos | {{enlace}}\n"
            "? Si tiene preguntas sobre el contrato, escríbanos por el chat del portal."
        ),
        "cuerpo_whatsapp": (
            "Hola, {{primer_nombre}}.\n"
            "Le enviamos a su correo la copia del contrato firmado para *{{proceso}}*.\n"
            "También la puede ver en el portal.\n"
            "Abrir enlace: Ver mis documentos | {{enlace}}"
        ),
        "variables_ejemplo": {"nombre": "María Pérez", "proceso": "Sucesión de Jorge Pérez"},
        "enlace_ejemplo": f"{PANEL}/procesos/1#documentos",
    },
    {
        "clave": "DOCUMENTO_RECIBIDO",
        "nombre": "Documento recibido",
        "asunto_email": "{{actor}} entregó un documento: {{documento}}",
        "cuerpo_email": (
            "# Llegó un documento para revisar\n"
            "Hola, {{primer_nombre}}:\n"
            "{{actor}} subió un archivo para la solicitud {{solicitud}} del proceso {{proceso}}.\n"
            "Documento pedido: {{documento}}\n"
            "Archivo recibido: {{archivo}}\n"
            "Fecha: {{fecha}}\n"
            "! Revíselo y apruébelo o pida una corrección.\n"
            "Abrir enlace: Revisar el documento | {{enlace}}"
        ),
        "cuerpo_whatsapp": (
            "Hola, {{primer_nombre}}.\n"
            "*{{actor}}* entregó *{{documento}}* para el proceso *{{proceso}}*.\n"
            "Revíselo y apruébelo o pida una corrección.\n"
            "Abrir enlace: Revisar el documento | {{enlace}}"
        ),
        "variables_ejemplo": {
            "nombre": "Alejandra Muñoz", "actor": "María Pérez", "proceso": "Sucesión de Jorge Pérez",
            "solicitud": "Documentos para la demanda", "documento": "Copia de la cédula",
            "archivo": "cedula_frente.pdf", "tipo": "application/pdf", "fecha": "15/10/2026 09:00",
        },
        "enlace_ejemplo": f"{PANEL}/procesos/1/documentos",
    },
    {
        "clave": "DOCUMENTO_REVISION",
        "nombre": "Revisión de documento",
        "asunto_email": "Revisamos su documento: {{documento}}",
        "cuerpo_email": (
            "# Revisamos su documento\n"
            "Hola, {{primer_nombre}}:\n"
            "{{actor}} revisó el documento que usted entregó para el proceso {{proceso}}.\n"
            "Documento: {{documento}}\n"
            "Resultado: {{estado}}\n"
            "Comentario del abogado: {{comentario}}\n"
            "Archivo: {{archivo}}\n"
            "Fecha: {{fecha}}\n"
            "Si el resultado es «necesita corrección», lea el comentario y suba el documento de nuevo. "
            "Si es «aprobado», no tiene que hacer nada más.\n"
            "Abrir enlace: Ver mis documentos | {{enlace}}"
        ),
        "cuerpo_whatsapp": (
            "Hola, {{primer_nombre}}.\n"
            "Revisamos su documento *{{documento}}*.\n"
            "Resultado: *{{estado}}*\n"
            "Comentario: {{comentario}}\n"
            "Si necesita corrección, súbalo de nuevo desde el portal.\n"
            "Abrir enlace: Ver mis documentos | {{enlace}}"
        ),
        "variables_ejemplo": {
            "nombre": "María Pérez", "actor": "Alejandra Muñoz", "proceso": "Sucesión de Jorge Pérez",
            "solicitud": "Documentos para la demanda", "documento": "Copia de la cédula",
            "archivo": "cedula_frente.pdf", "estado": "REQUIERE_CORRECCION",
            "comentario": "La foto quedó borrosa. Tómela de nuevo con buena luz.", "fecha": "15/10/2026 09:00",
        },
        "enlace_ejemplo": f"{PANEL}/procesos/1#documentos",
    },
    {
        "clave": "EVENTO_AGENDA",
        "nombre": "Actividad de agenda",
        "asunto_email": "Actividad de su proceso: {{actividad}}",
        "cuerpo_email": (
            "# {{actividad}}\n"
            "Hola, {{primer_nombre}}:\n"
            "{{actor}} {{accion}} una actividad de su proceso {{proceso}}.\n"
            "Cuándo: {{inicio}}\n"
            "Hasta: {{fin}}\n"
            "Qué es: {{tipo}}\n"
            "Estado: {{estado}}\n"
            "Responsable: {{responsable}}\n"
            "Detalle: {{detalle}}\n"
            "Abrir enlace: Ver la actividad | {{enlace}}\n"
            "? Si no puede asistir o tiene dudas, escríbanos por el chat del portal."
        ),
        "cuerpo_whatsapp": (
            "Hola, {{primer_nombre}}.\n"
            "{{actor}} {{accion}} una actividad de su proceso *{{proceso}}*:\n"
            "*{{actividad}}*\n"
            "Cuándo: {{inicio}}\n"
            "Estado: {{estado}}\n"
            "Detalle: {{detalle}}\n"
            "Abrir enlace: Ver la actividad | {{enlace}}"
        ),
        "variables_ejemplo": {
            "nombre": "María Pérez", "actor": "Alejandra Muñoz", "accion": "programó",
            "proceso": "Sucesión de Jorge Pérez", "actividad": "Audiencia inicial", "tipo": "AUDIENCIA",
            "estado": "PROGRAMADO", "inicio": "03/11/2026 09:00", "fin": "No indicada",
            "responsable": "Alejandra Muñoz", "detalle": "Audiencia virtual. Le enviaremos el enlace un día antes.",
        },
        "enlace_ejemplo": f"{PANEL}/procesos/1#evento-1",
    },
    {
        "clave": "PROCESO_ACTUALIZACION",
        "nombre": "Actualización de proceso",
        "asunto_email": "Actualización de su proceso {{proceso}}",
        "cuerpo_email": (
            "# Hay una actualización en su proceso\n"
            "Hola, {{primer_nombre}}:\n"
            "{{actor}} {{accion}}.\n"
            "Proceso: {{proceso}}\n"
            "Fecha: {{fecha}}\n\n"
            "{{detalle}}\n\n"
            "No tiene que hacer nada por ahora.\n"
            "Abrir enlace: Ver mi proceso | {{enlace}}"
        ),
        "cuerpo_whatsapp": (
            "Hola, {{primer_nombre}}.\n"
            "{{actor}} {{accion}}.\n"
            "Proceso: {{proceso}}\n"
            "No tiene que hacer nada por ahora.\n"
            "Abrir enlace: Ver mi proceso | {{enlace}}"
        ),
        "variables_ejemplo": {
            "nombre": "María Pérez", "actor": "Alejandra Muñoz", "accion": "asoció un radicado judicial al proceso",
            "proceso": "Sucesión de Jorge Pérez", "fecha": "15/10/2026 09:00",
            "detalle": "Radicado: 05001 31 10 012 2025 00356 00",
        },
        "enlace_ejemplo": f"{PANEL}/procesos/1",
    },
    {
        "clave": "PRUEBA_INTEGRACION",
        "nombre": "Prueba de integración",
        "asunto_email": "Prueba de envío del portal",
        "cuerpo_email": (
            "# Prueba de envío\n"
            "Este es un mensaje de prueba solicitado desde administración.\n"
            "Si lo recibió, este canal funciona bien. No tiene que hacer nada."
        ),
        "cuerpo_whatsapp": (
            "Hola.\n"
            "Este es un mensaje de prueba solicitado desde administración.\n"
            "Si lo recibió, este canal funciona bien."
        ),
        "variables_ejemplo": {},
        "enlace_ejemplo": None,
    },
    {
        "clave": "REACTIVACION_COMUNICACION",
        "nombre": "Comunicación pendiente al reactivar usuario",
        "asunto_email": "Tiene un mensaje pendiente: {{asunto}}",
        "cuerpo_email": (
            "# Tiene un mensaje pendiente\n"
            "Hola, {{primer_nombre}}:\n"
            "Su cuenta está activa de nuevo. Mientras estuvo inactiva le escribieron sobre el proceso {{proceso}}.\n"
            "Asunto: {{asunto}}\n"
            "Fecha: {{fecha}}\n\n"
            "Mensaje:\n"
            "{{mensaje}}\n\n"
            "Abrir enlace: Leer el mensaje | {{enlace}}"
        ),
        "cuerpo_whatsapp": (
            "Hola, {{primer_nombre}}.\n"
            "Su cuenta está activa de nuevo y tiene un mensaje pendiente sobre *{{proceso}}*.\n"
            "Asunto: {{asunto}}\n"
            "Abrir enlace: Leer el mensaje | {{enlace}}"
        ),
        "variables_ejemplo": {
            "nombre": "María Pérez", "proceso": "Sucesión de Jorge Pérez", "asunto": "Documentos pendientes",
            "fecha": "15/10/2026 09:00", "mensaje": "Le recordamos enviar el registro civil.",
        },
        "enlace_ejemplo": f"{PANEL}/chat/1/2",
    },
    {
        "clave": "REACTIVACION_EVENTO",
        "nombre": "Actividad próxima al reactivar usuario",
        "asunto_email": "Tiene una actividad próxima: {{actividad}}",
        "cuerpo_email": (
            "# Tiene una actividad próxima\n"
            "Hola, {{primer_nombre}}:\n"
            "Su cuenta está activa de nuevo. Le recordamos esta actividad de su proceso {{proceso}}.\n"
            "Actividad: {{actividad}}\n"
            "Cuándo: {{fecha}}\n"
            "Qué es: {{tipo}}\n"
            "Detalle: {{descripcion}}\n"
            "Abrir enlace: Ver la actividad | {{enlace}}"
        ),
        "cuerpo_whatsapp": (
            "Hola, {{primer_nombre}}.\n"
            "Su cuenta está activa de nuevo. Le recordamos *{{actividad}}* de su proceso *{{proceso}}*.\n"
            "Cuándo: {{fecha}}\n"
            "Abrir enlace: Ver la actividad | {{enlace}}"
        ),
        "variables_ejemplo": {
            "nombre": "María Pérez", "actividad": "Audiencia inicial", "proceso": "Sucesión de Jorge Pérez",
            "tipo": "AUDIENCIA", "fecha": "03/11/2026 09:00", "descripcion": "Sin detalles adicionales",
        },
        "enlace_ejemplo": f"{PANEL}/procesos/1#evento-1",
    },
    {
        "clave": "REACTIVACION_TAREA",
        "nombre": "Tarea pendiente al reactivar usuario",
        "asunto_email": "Tiene una tarea pendiente: {{tarea}}",
        "cuerpo_email": (
            "# Tiene una tarea pendiente\n"
            "Hola, {{primer_nombre}}:\n"
            "Su cuenta está activa de nuevo y tiene esta tarea por hacer.\n"
            "Tarea: {{tarea}}\n"
            "Fecha límite: {{fecha_limite}}\n"
            "Proceso: {{proceso}}\n"
            "Estado: {{estado}}\n"
            "! Revise la tarea y márquela como completada cuando termine.\n"
            "Abrir enlace: Ver la tarea | {{enlace}}"
        ),
        "cuerpo_whatsapp": (
            "Hola, {{primer_nombre}}.\n"
            "Su cuenta está activa de nuevo y tiene una tarea pendiente: *{{tarea}}*.\n"
            "Fecha límite: {{fecha_limite}}\n"
            "Abrir enlace: Ver la tarea | {{enlace}}"
        ),
        "variables_ejemplo": {
            "nombre": "María Pérez", "tarea": "Firmar el poder", "proceso": "Sucesión de Jorge Pérez",
            "estado": "PENDIENTE", "fecha_limite": "20/11/2026 23:59",
        },
        "enlace_ejemplo": f"{PANEL}/tareas?tarea=1#tarea-1",
    },
    {
        "clave": "RECORDATORIO_DOCUMENTO",
        "nombre": "Recordatorio de documentos pendientes",
        "asunto_email": "Recordatorio: todavía nos faltan documentos",
        "cuerpo_email": (
            "# Todavía nos faltan documentos\n"
            "Hola, {{primer_nombre}}:\n"
            "Le recordamos que la solicitud {{solicitud}} de su proceso {{proceso}} {{cuando}}.\n"
            "Documentos que faltan:\n"
            "{{pendientes}}\n"
            "! Súbalos desde el portal en PDF o como foto legible.\n"
            "Abrir enlace: Subir los documentos | {{enlace}}\n"
            "? Si no sabe cómo conseguir alguno, escríbanos por el chat del portal y le ayudamos."
        ),
        "cuerpo_whatsapp": (
            "Hola, {{primer_nombre}}.\n"
            "Le recordamos que la solicitud *{{solicitud}}* {{cuando}}.\n"
            "Faltan estos documentos:\n"
            "{{pendientes}}\n"
            "Proceso: {{proceso}}\n"
            "Abrir enlace: Subir los documentos | {{enlace}}"
        ),
        "titulo_push": "Recordatorio: faltan documentos",
        "cuerpo_push": "La solicitud {{solicitud}} {{cuando}}. Falta:\n{{pendientes}}",
        "variables_ejemplo": {
            "nombre": "María Pérez", "proceso": "Sucesión de Jorge Pérez", "solicitud": "Documentos para la demanda",
            "cuando": "vence mañana, 30 de octubre", "pendientes": "- Copia de la cédula\n- Registro civil",
            "fecha_limite": "30/10/2026",
        },
        "enlace_ejemplo": f"{PANEL}/procesos/1#documentos",
    },
    {
        "clave": "RECORDATORIO_TAREA",
        "nombre": "Recordatorio de tarea",
        "asunto_email": "Recordatorio: {{tarea}}",
        "cuerpo_email": (
            "# Recordatorio de una tarea\n"
            "Hola, {{primer_nombre}}:\n"
            "Le recordamos esta tarea.\n"
            "Tarea: {{tarea}}\n"
            "Fecha límite: {{fecha_limite}}\n"
            "Prioridad: {{prioridad}}\n"
            "Proceso: {{proceso}}\n"
            "Radicado: {{radicado}}\n"
            "Actuación: {{actuacion}}\n"
            "Detalle: {{detalle}}\n"
            "! Revise la tarea y márquela como completada cuando termine.\n"
            "Abrir enlace: Ver la tarea | {{enlace}}"
        ),
        "cuerpo_whatsapp": (
            "Hola, {{primer_nombre}}.\n"
            "Le recordamos la tarea *{{tarea}}*.\n"
            "Fecha límite: {{fecha_limite}}\n"
            "Proceso: {{proceso}}\n"
            "Detalle: {{detalle}}\n"
            "Abrir enlace: Ver la tarea | {{enlace}}"
        ),
        "variables_ejemplo": {
            "nombre": "María Pérez", "tarea": "Preparar documentos", "estado": "PENDIENTE", "prioridad": "ALTA",
            "proceso": "Sucesión de Jorge Pérez", "radicado": "No asociado", "actuacion": "No asociada",
            "detalle": "Revisar los soportes de pago", "fecha_limite": "20/11/2026 17:00",
            "anticipacion": "24 horas antes",
        },
        "enlace_ejemplo": f"{PANEL}/tareas?tarea=1#tarea-1",
    },
    {
        "clave": "RECUPERAR_PASSWORD",
        "nombre": "Recuperación de contraseña",
        "asunto_email": "Cree una contraseña nueva",
        "cuerpo_email": (
            "# Cree una contraseña nueva\n"
            "Hola:\n"
            "Recibimos una solicitud para cambiar la contraseña de su cuenta en el portal.\n"
            "! Use el botón para crear una contraseña nueva. El enlace sirve por 20 minutos y una sola vez.\n"
            "Abrir enlace: Crear contraseña nueva | {{enlace}}\n"
            "? Si usted no pidió este cambio, ignore este correo. Su contraseña actual sigue funcionando."
        ),
        "cuerpo_whatsapp": (
            "Hola.\n"
            "Recibimos una solicitud para cambiar su contraseña. El enlace sirve por 20 minutos.\n"
            "Si usted no la pidió, ignore este mensaje.\n"
            "Abrir enlace: Crear contraseña nueva | {{enlace}}"
        ),
        "variables_ejemplo": {},
        "enlace_ejemplo": f"{PANEL}/restablecer-password?token=ejemplo",
    },
    {
        "clave": "RESUMEN_MENSUAL",
        "nombre": "Resumen mensual de procesos",
        "asunto_email": "Resumen de sus procesos de {{mes}}",
        "cuerpo_email": (
            "# Resumen de sus procesos de {{mes}}\n"
            "Hola, {{primer_nombre}}:\n"
            "Este es el estado de sus procesos activos.\n\n"
            "{{resumen}}\n\n"
            f"{AYUDA_CHAT}"
        ),
        "cuerpo_whatsapp": (
            "Hola, {{primer_nombre}}.\n"
            "Este es el resumen de sus procesos de *{{mes}}*:\n\n"
            "{{resumen}}"
        ),
        "variables_ejemplo": {
            "nombre": "Alejandra Muñoz", "mes": "octubre de 2026",
            "resumen": "Radicado: 05001 31 10 012 2025 00356 00\nJuzgado: Juzgado 12 de Familia de Medellín\n"
                       "Última actuación: Auto admite demanda\nFecha: miércoles 15 de octubre de 2026",
        },
        "enlace_ejemplo": None,
    },
    {
        "clave": "SOLICITUD_DOCUMENTO",
        "nombre": "Solicitud de documento",
        "asunto_email": "Necesitamos documentos para su proceso",
        "cuerpo_email": (
            "# Necesitamos documentos suyos\n"
            "Hola, {{primer_nombre}}:\n"
            "{{actor}} necesita estos documentos para continuar con su proceso {{proceso}}:\n"
            "{{documentos}}\n"
            "Entregar antes del: {{fecha_limite}}\n"
            "Indicaciones: {{instrucciones}}\n"
            "! Súbalos desde el portal en PDF o como foto legible.\n"
            "Abrir enlace: Subir los documentos | {{enlace}}\n"
            "? Si no sabe cómo conseguir alguno, escríbanos por el chat del portal y le ayudamos."
        ),
        "cuerpo_whatsapp": (
            "Hola, {{primer_nombre}}.\n"
            "Necesitamos estos documentos para su proceso *{{proceso}}*:\n"
            "{{documentos}}\n"
            "Entregar antes del: {{fecha_limite}}\n"
            "Indicaciones: {{instrucciones}}\n"
            "Súbalos en PDF o como foto legible.\n"
            "Abrir enlace: Subir los documentos | {{enlace}}"
        ),
        "variables_ejemplo": {
            "nombre": "María Pérez", "actor": "Alejandra Muñoz", "proceso": "Sucesión de Jorge Pérez",
            "solicitud": "Documentos para la demanda", "documentos": "- Copia de la cédula\n- Registro civil",
            "instrucciones": "Ambas caras de la cédula, en una sola hoja.", "fecha_limite": "20/11/2026",
            "fecha": "15/11/2026 09:00",
        },
        "enlace_ejemplo": f"{PANEL}/procesos/1#documentos",
    },
    {
        "clave": "SUBTAREA_ASIGNADA",
        "nombre": "Subtarea asignada",
        "asunto_email": "Tiene una tarea nueva: {{subtarea}}",
        "cuerpo_email": (
            "# Tiene una tarea nueva\n"
            "Hola, {{primer_nombre}}:\n"
            "{{actor}} le asignó una tarea en el portal.\n"
            "Tarea: {{subtarea}}\n"
            "Hace parte de: {{tarea}}\n"
            "! Ábrala para ver qué debe hacer y márquela como completada cuando termine.\n"
            "Abrir enlace: Ver la tarea | {{enlace}}"
        ),
        "cuerpo_whatsapp": (
            "Hola, {{primer_nombre}}.\n"
            "{{actor}} le asignó una tarea: *{{subtarea}}*.\n"
            "Ábrala para ver qué debe hacer.\n"
            "Abrir enlace: Ver la tarea | {{enlace}}"
        ),
        "variables_ejemplo": {
            "nombre": "María Pérez", "actor": "Alejandra Muñoz", "subtarea": "Firmar el poder",
            "tarea": "Preparar la demanda",
        },
        "enlace_ejemplo": f"{PANEL}/tareas?tarea=1#tarea-1",
    },
    {
        "clave": "TAREA_ACCION",
        "nombre": "Cambios de tareas",
        "asunto_email": "{{actor}} {{accion}}: {{tarea}}",
        "cuerpo_email": (
            "# Cambio en una tarea\n"
            "Hola, {{primer_nombre}}:\n"
            "{{actor}} {{accion}}.\n"
            "Tarea: {{tarea}}\n"
            "Qué cambió: {{detalle}}\n"
            "Estado: {{estado}}\n"
            "Fecha límite: {{fecha_limite}}\n"
            "Prioridad: {{prioridad}}\n"
            "Proceso: {{proceso}}\n"
            "Radicado: {{radicado}}\n"
            "Actuación: {{actuacion}}\n"
            "Abrir enlace: Ver mis tareas | {{enlace}}"
        ),
        "cuerpo_whatsapp": (
            "Hola, {{primer_nombre}}.\n"
            "{{actor}} {{accion}}: *{{tarea}}*.\n"
            "Qué cambió: {{detalle}}\n"
            "Estado: {{estado}}\n"
            "Fecha límite: {{fecha_limite}}\n"
            "Abrir enlace: Ver mis tareas | {{enlace}}"
        ),
        "variables_ejemplo": {
            "nombre": "María Pérez", "actor": "Alejandra Muñoz", "accion": "cambió la fecha límite",
            "tarea": "Firmar el poder", "detalle": "La nueva fecha es el viernes 20 de noviembre.",
            "estado": "PENDIENTE", "prioridad": "ALTA", "fecha_limite": "20/11/2026 17:00",
            "proceso": "Sucesión de Jorge Pérez", "radicado": "05001311001220250035600", "actuacion": "No asociada",
        },
        "enlace_ejemplo": f"{PANEL}/tareas?tarea=1#tarea-1",
    },
]

_COLUMNAS = ("nombre", "asunto_email", "cuerpo_email", "cuerpo_whatsapp", "enlace_ejemplo")


def upgrade() -> None:
    conexion = op.get_bind()
    if not sa.inspect(conexion).has_table("plantillas_mensaje"):
        return
    tabla = sa.table(
        "plantillas_mensaje",
        *(sa.column(nombre) for nombre in ("clave", *_COLUMNAS, "titulo_push", "cuerpo_push", "activo", "updated_at")),
        sa.column("variables_ejemplo", sa.JSON()),
    )
    ahora = datetime.now(timezone.utc).replace(tzinfo=None)
    for plantilla in PLANTILLAS:
        valores = {columna: plantilla[columna] for columna in _COLUMNAS}
        valores["variables_ejemplo"] = plantilla["variables_ejemplo"]
        valores["updated_at"] = ahora
        if "titulo_push" in plantilla:
            valores["titulo_push"] = plantilla["titulo_push"]
            valores["cuerpo_push"] = plantilla["cuerpo_push"]
        existe = conexion.execute(
            sa.text("SELECT 1 FROM plantillas_mensaje WHERE clave = :clave"), {"clave": plantilla["clave"]}
        ).first()
        if existe:
            conexion.execute(tabla.update().where(tabla.c.clave == plantilla["clave"]).values(**valores))
        else:
            conexion.execute(tabla.insert().values(clave=plantilla["clave"], activo=True, **valores))


def downgrade() -> None:
    # Los textos anteriores no se restauran: se pueden editar desde Administración > Mensajes.
    pass
