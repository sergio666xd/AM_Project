"""Plantillas de WhatsApp Cloud API (Meta) para cada aviso de la aplicación.

Fuera de la ventana de 24 horas que abre un mensaje del usuario, Meta solo
permite enviar plantillas aprobadas. Cada aviso de la aplicación (clave de
`plantillas_mensaje`) tiene aquí su plantilla de Meta: el nombre con el que se
registra, el texto exacto que se somete a aprobación y de qué dato sale cada
variable `{{n}}`.

Este catálogo es la única fuente: `scripts/plantillas_whatsapp_meta.py` lo usa
para crear las plantillas en Meta y `app.whatsapp` para llenarlas al enviar.
Si se cambia un texto aquí, hay que volver a aprobarlo en Meta.

Reglas de Meta que el catálogo respeta: el cuerpo no empieza ni termina con
una variable, dos variables nunca van seguidas, y los valores que se envían no
llevan saltos de línea ni tabulaciones (por eso las listas se unen en una línea).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable

CATEGORIA_UTILIDAD = "UTILITY"
CATEGORIA_AUTENTICACION = "AUTHENTICATION"

PIE = "Alejandra Muñoz | Abogada y Asociados"
CIERRE = "Si tiene dudas, escríbanos por el chat del portal."
CIERRE_RESPONDER = "Responda desde el portal para que su mensaje quede en el expediente."
PORTAL_POR_DEFECTO = "https://panel.alejandramunozabogada.com"

# Meta acepta hasta 1024 caracteres en el cuerpo completo; cada valor se recorta
# para que el mensaje siga siendo corto y legible en el teléfono.
LARGO_MAXIMO = 180
LARGO_TEXTO_LARGO = 320


def _texto(valores: dict[str, Any], clave: str) -> str:
    valor = valores.get(clave)
    return "" if valor is None else str(valor)


def _saludo(valores: dict[str, Any]) -> str:
    nombre = _texto(valores, "primer_nombre").strip() or _texto(valores, "nombre").strip().split(" ")[0]
    return nombre


def _actor_accion(valores: dict[str, Any]) -> str:
    return " ".join(parte for parte in (_texto(valores, "actor").strip(), _texto(valores, "accion").strip()) if parte)


@dataclass(frozen=True)
class Variable:
    """Una variable `{{n}}` del cuerpo: de dónde sale, un ejemplo para Meta y qué poner si viene vacía."""

    origen: str | Callable[[dict[str, Any]], str]
    ejemplo: str
    defecto: str = "-"
    largo: int = LARGO_MAXIMO

    def valor(self, valores: dict[str, Any]) -> str:
        crudo = self.origen(valores) if callable(self.origen) else _texto(valores, self.origen)
        return limpiar_parametro(crudo, self.largo) or self.defecto


@dataclass(frozen=True)
class PlantillaMeta:
    nombre: str
    cuerpo: str
    variables: tuple[Variable, ...] = ()
    categoria: str = CATEGORIA_UTILIDAD
    pie: str | None = PIE
    # Las de autenticación llevan el botón "Copiar código", que también recibe el código.
    boton_codigo: bool = False
    claves: tuple[str, ...] = field(default=())


SALUDO = Variable(_saludo, "Ana", defecto="cordial saludo")
ENLACE = Variable("enlace", f"{PORTAL_POR_DEFECTO}/procesos/12", defecto=PORTAL_POR_DEFECTO, largo=600)


def _cuerpo(*lineas: str, cierre: str = CIERRE) -> str:
    texto = "\n".join(lineas)
    return f"{texto}\n\n{cierre}" if cierre else texto


_CATALOGO: tuple[PlantillaMeta, ...] = (
    PlantillaMeta(
        nombre="am_actuacion_notificada",
        claves=("ACTUACION_NOTIFICADA",),
        cuerpo=_cuerpo(
            "👋 Hola, {{1}}.",
            "Hay una novedad del juzgado en su proceso *{{2}}*.",
            "📝 Actuación: {{3}}",
            "📅 Fecha: {{4}}",
            "Si esta novedad requiere algo de usted, se lo indicaremos.",
            "🔗 Ver la actuación: {{5}}",
        ),
        variables=(
            SALUDO,
            Variable("proceso", "Sucesión familia Pérez"),
            Variable("actuacion", "Auto admite demanda"),
            Variable("fecha", "lunes 9 de noviembre de 2026", defecto="no informada"),
            ENLACE,
        ),
    ),
    PlantillaMeta(
        nombre="am_novedades_juzgado",
        claves=("ACTUACIONES_DIGEST",),
        cuerpo=_cuerpo(
            "👋 Hola, {{1}}.",
            "Hay novedades del juzgado en sus procesos: {{2}}",
            "🔗 Véalas en el portal: {{3}}",
        ),
        variables=(
            SALUDO,
            Variable("novedades", "Sucesión familia Pérez (Auto admite demanda); Ejecutivo Banco XYZ (Fija fecha de audiencia)",
                     largo=LARGO_TEXTO_LARGO),
            ENLACE,
        ),
    ),
    PlantillaMeta(
        # Meta rechaza en automático las plantillas que mencionan usuario o contraseña:
        # el aviso solo dice que revise el correo, donde van los datos de ingreso.
        nombre="am_bienvenida_cliente",
        claves=("CLIENTE_CREDENCIALES",),
        cuerpo=_cuerpo(
            "👋 Hola, {{1}}.",
            "{{2}} le dio acceso al portal del despacho, donde puede ver cómo va su proceso.",
            "Le enviamos un correo a *{{3}}* con las indicaciones para entrar. "
            "Si no lo encuentra, revise la carpeta de correo no deseado.",
            "🔗 Ir al portal: {{4}}",
        ),
        variables=(
            SALUDO,
            Variable("actor", "Alejandra Muñoz Abogada y Asociados", defecto="El despacho"),
            Variable("correo", "ana.perez@correo.com"),
            ENLACE,
        ),
    ),
    PlantillaMeta(
        nombre="am_bienvenida_abogado",
        claves=("ABOGADO_CREDENCIALES",),
        cuerpo=_cuerpo(
            "👋 Hola, {{1}}.",
            "Ya tiene acceso como abogado al portal del despacho.",
            "Le enviamos un correo a *{{2}}* con las indicaciones para entrar.",
            "🔗 Ir al portal: {{3}}",
        ),
        variables=(SALUDO, Variable("correo", "carlos.gomez@correo.com"), ENLACE),
    ),
    PlantillaMeta(
        # Meta fija el texto de las plantillas de autenticación; solo se envía el código.
        nombre="am_codigo_seguridad",
        claves=("CODIGO_SEGURIDAD",),
        categoria=CATEGORIA_AUTENTICACION,
        cuerpo="{{1}} es su código de verificación. Por su seguridad, no lo comparta.",
        variables=(Variable("codigo", "483920", defecto=""),),
        pie=None,
        boton_codigo=True,
    ),
    PlantillaMeta(
        nombre="am_cambio_seguridad",
        claves=("CAMBIO_SEGURIDAD_CONFIRMADO",),
        cuerpo=_cuerpo(
            "👋 Hola, {{1}}.",
            "Se actualizó el *{{2}}* de acceso a su cuenta del portal.",
            "Si usted hizo este cambio, no tiene que hacer nada. Si no lo hizo, comuníquese de inmediato con el despacho.",
            cierre="",
        ),
        variables=(SALUDO, Variable("cambio", "correo electrónico", defecto="dato")),
    ),
    PlantillaMeta(
        nombre="am_mensaje_chat",
        claves=("CHAT_MENSAJE",),
        cuerpo=_cuerpo(
            "👋 Hola, {{1}}.",
            "*{{2}}* le está escribiendo por el chat del portal.",
            "🔗 Leer los mensajes: {{3}}",
            cierre=CIERRE_RESPONDER,
        ),
        variables=(SALUDO, Variable("actor", "Alejandra Muñoz", defecto="El despacho"), ENLACE),
    ),
    PlantillaMeta(
        nombre="am_colaborador_agregado",
        claves=("COLABORADOR_AGREGADO",),
        cuerpo=_cuerpo(
            "👋 Hola, {{1}}.",
            "{{2}} le dio acceso al proceso *{{3}}*.",
            "👤 Responsable: {{4}}",
            "🔐 Su participación: {{5}}",
            "🔗 Ver el proceso: {{6}}",
        ),
        variables=(
            SALUDO,
            Variable("actor", "Alejandra Muñoz", defecto="El despacho"),
            Variable("proceso", "Sucesión familia Pérez"),
            Variable("responsable", "Alejandra Muñoz"),
            Variable("permiso", "puede editar"),
            ENLACE,
        ),
    ),
    PlantillaMeta(
        nombre="am_mensaje_proceso",
        claves=("COMUNICACION_ABOGADO_CLIENTE", "COMUNICACION_CLIENTE_ABOGADO"),
        cuerpo=_cuerpo(
            "👋 Hola, {{1}}.",
            "*{{2}}* le escribió sobre el proceso *{{3}}*:",
            "💬 {{4}}",
            "🔗 Leer y responder: {{5}}",
            cierre=CIERRE_RESPONDER,
        ),
        variables=(
            SALUDO,
            Variable("actor", "Alejandra Muñoz", defecto="El despacho"),
            Variable("proceso", "Sucesión familia Pérez"),
            Variable("mensaje", "Buenos días, ya radicamos la demanda. Le cuento cuando el juzgado responda.",
                     defecto="Tiene un mensaje nuevo.", largo=LARGO_TEXTO_LARGO),
            ENLACE,
        ),
    ),
    PlantillaMeta(
        nombre="am_documento_recibido",
        claves=("DOCUMENTO_RECIBIDO",),
        cuerpo=_cuerpo(
            "👋 Hola, {{1}}.",
            "*{{2}}* entregó *{{3}}* para el proceso *{{4}}*.",
            "Revíselo y apruébelo o pida una corrección.",
            "🔗 Revisar el documento: {{5}}",
        ),
        variables=(
            SALUDO,
            Variable("actor", "Ana Pérez", defecto="El cliente"),
            Variable("documento", "Cédula de ciudadanía", defecto="un documento"),
            Variable("proceso", "Sucesión familia Pérez"),
            ENLACE,
        ),
    ),
    PlantillaMeta(
        nombre="am_documento_revisado",
        claves=("DOCUMENTO_REVISION",),
        cuerpo=_cuerpo(
            "👋 Hola, {{1}}.",
            "Revisamos su documento *{{2}}*.",
            "📌 Resultado: *{{3}}*",
            "💬 Comentario: {{4}}",
            "Si necesita corrección, súbalo de nuevo desde el portal.",
            "🔗 Ver mis documentos: {{5}}",
        ),
        variables=(
            SALUDO,
            Variable("documento", "Cédula de ciudadanía", defecto="enviado"),
            Variable("estado", "aprobado"),
            Variable("comentario", "La foto se ve completa y legible.", defecto="sin comentarios"),
            ENLACE,
        ),
    ),
    PlantillaMeta(
        nombre="am_actividad_agenda",
        claves=("EVENTO_AGENDA",),
        cuerpo=_cuerpo(
            "👋 Hola, {{1}}.",
            "Hay un cambio en una actividad de su proceso *{{2}}*: {{3}}.",
            "🗓️ Actividad: *{{4}}*",
            "🗓️ Cuándo: {{5}}",
            "📌 Estado: {{6}}",
            "🔗 Ver la actividad: {{7}}",
        ),
        variables=(
            SALUDO,
            Variable("proceso", "Sucesión familia Pérez"),
            Variable(_actor_accion, "Alejandra Muñoz programó"),
            Variable("actividad", "Audiencia inicial"),
            Variable("inicio", "viernes 20 de noviembre de 2026, 9:00 a. m.", defecto="por definir"),
            Variable("estado", "programada"),
            ENLACE,
        ),
    ),
    PlantillaMeta(
        nombre="am_proceso_actualizado",
        claves=("PROCESO_ACTUALIZACION",),
        cuerpo=_cuerpo(
            "👋 Hola, {{1}}.",
            "Hay una novedad en su proceso *{{2}}*: {{3}}.",
            "No tiene que hacer nada por ahora.",
            "🔗 Ver mi proceso: {{4}}",
        ),
        variables=(
            SALUDO,
            Variable("proceso", "Sucesión familia Pérez"),
            Variable(_actor_accion, "Alejandra Muñoz avanzó el proceso a la etapa de pruebas", defecto="hubo cambios"),
            ENLACE,
        ),
    ),
    PlantillaMeta(
        nombre="am_prueba_envio",
        claves=("PRUEBA_INTEGRACION",),
        cuerpo=_cuerpo(
            "👋 Hola, {{1}}.",
            "Este es un mensaje de prueba solicitado desde la administración del portal.",
            "Si lo recibió, el canal de WhatsApp funciona bien. No tiene que hacer nada.",
            cierre="",
        ),
        variables=(SALUDO,),
    ),
    PlantillaMeta(
        nombre="am_reactivacion_mensaje",
        claves=("REACTIVACION_COMUNICACION",),
        cuerpo=_cuerpo(
            "👋 Hola, {{1}}.",
            "Su cuenta está activa de nuevo y tiene un mensaje pendiente sobre *{{2}}*.",
            "💬 Asunto: {{3}}",
            "🔗 Leer el mensaje: {{4}}",
        ),
        variables=(
            SALUDO,
            Variable("proceso", "Sucesión familia Pérez"),
            Variable("asunto", "Documentos pendientes", defecto="mensaje del despacho"),
            ENLACE,
        ),
    ),
    PlantillaMeta(
        nombre="am_reactivacion_actividad",
        claves=("REACTIVACION_EVENTO",),
        cuerpo=_cuerpo(
            "👋 Hola, {{1}}.",
            "Su cuenta está activa de nuevo. Le recordamos *{{2}}* de su proceso *{{3}}*.",
            "🗓️ Cuándo: {{4}}",
            "🔗 Ver la actividad: {{5}}",
        ),
        variables=(
            SALUDO,
            Variable("actividad", "Audiencia inicial"),
            Variable("proceso", "Sucesión familia Pérez"),
            Variable("fecha", "viernes 20 de noviembre de 2026, 9:00 a. m.", defecto="por definir"),
            ENLACE,
        ),
    ),
    PlantillaMeta(
        nombre="am_reactivacion_tarea",
        claves=("REACTIVACION_TAREA",),
        cuerpo=_cuerpo(
            "👋 Hola, {{1}}.",
            "Su cuenta está activa de nuevo y tiene una tarea pendiente: *{{2}}*.",
            "⏰ Fecha límite: {{3}}",
            "🔗 Ver la tarea: {{4}}",
        ),
        variables=(
            SALUDO,
            Variable("tarea", "Firmar el poder"),
            Variable("fecha_limite", "viernes 20 de noviembre de 2026", defecto="sin fecha límite"),
            ENLACE,
        ),
    ),
    PlantillaMeta(
        nombre="am_recordatorio_documentos",
        claves=("RECORDATORIO_DOCUMENTO",),
        cuerpo=_cuerpo(
            "👋 Hola, {{1}}.",
            "Le recordamos que la solicitud *{{2}}* {{3}}.",
            "📄 Faltan estos documentos: {{4}}",
            "📁 Proceso: {{5}}",
            "🔗 Subir los documentos: {{6}}",
        ),
        variables=(
            SALUDO,
            Variable("solicitud", "Documentos para la demanda"),
            Variable("cuando", "vence mañana", defecto="sigue pendiente"),
            Variable("pendientes", "Cédula; Registro civil de nacimiento", largo=LARGO_TEXTO_LARGO),
            Variable("proceso", "Sucesión familia Pérez"),
            ENLACE,
        ),
    ),
    PlantillaMeta(
        nombre="am_recordatorio_tarea",
        claves=("RECORDATORIO_TAREA",),
        cuerpo=_cuerpo(
            "👋 Hola, {{1}}.",
            "Le recordamos la tarea *{{2}}*.",
            "⏰ Fecha límite: {{3}}",
            "📁 Proceso: {{4}}",
            "🔗 Ver la tarea: {{5}}",
        ),
        variables=(
            SALUDO,
            Variable("tarea", "Firmar el poder"),
            Variable("fecha_limite", "viernes 20 de noviembre de 2026, 5:00 p. m.", defecto="sin fecha límite"),
            Variable("proceso", "Sucesión familia Pérez", defecto="tarea general"),
            ENLACE,
        ),
    ),
    PlantillaMeta(
        nombre="am_resumen_mensual",
        claves=("RESUMEN_MENSUAL",),
        cuerpo=_cuerpo(
            "👋 Hola, {{1}}.",
            "Este es el resumen de sus procesos de *{{2}}*: {{3}}",
            "🔗 Véalo completo en el portal: {{4}}",
        ),
        variables=(
            SALUDO,
            Variable("mes", "octubre de 2026"),
            Variable("resumen", "2 procesos activos, 3 novedades del juzgado y 1 tarea pendiente.", largo=LARGO_TEXTO_LARGO),
            ENLACE,
        ),
    ),
    PlantillaMeta(
        nombre="am_solicitud_documentos",
        claves=("SOLICITUD_DOCUMENTO",),
        cuerpo=_cuerpo(
            "👋 Hola, {{1}}.",
            "Necesitamos estos documentos para su proceso *{{2}}*: {{3}}",
            "⏰ Entregar antes del: {{4}}",
            "Súbalos en PDF o como foto legible.",
            "🔗 Subir los documentos: {{5}}",
        ),
        variables=(
            SALUDO,
            Variable("proceso", "Sucesión familia Pérez"),
            Variable("documentos", "Cédula; Registro civil de nacimiento", largo=LARGO_TEXTO_LARGO),
            Variable("fecha_limite", "viernes 20 de noviembre de 2026", defecto="sin fecha límite"),
            ENLACE,
        ),
    ),
    PlantillaMeta(
        nombre="am_tarea_asignada",
        claves=("SUBTAREA_ASIGNADA",),
        cuerpo=_cuerpo(
            "👋 Hola, {{1}}.",
            "{{2}} le asignó una tarea: *{{3}}*.",
            "Ábrala para ver qué debe hacer.",
            "🔗 Ver la tarea: {{4}}",
        ),
        variables=(
            SALUDO,
            Variable("actor", "Alejandra Muñoz", defecto="El despacho"),
            Variable("subtarea", "Enviar foto de la cédula"),
            ENLACE,
        ),
    ),
    PlantillaMeta(
        nombre="am_tarea_actualizada",
        claves=("TAREA_ACCION",),
        cuerpo=_cuerpo(
            "👋 Hola, {{1}}.",
            "Hay un cambio en la tarea *{{2}}*: {{3}}.",
            "📌 Estado: {{4}}",
            "⏰ Fecha límite: {{5}}",
            "🔗 Ver mis tareas: {{6}}",
        ),
        variables=(
            SALUDO,
            Variable("tarea", "Firmar el poder"),
            Variable(_actor_accion, "Alejandra Muñoz actualizó la tarea", defecto="se actualizó"),
            Variable("estado", "en curso"),
            Variable("fecha_limite", "viernes 20 de noviembre de 2026", defecto="sin fecha límite"),
            ENLACE,
        ),
    ),
)

PLANTILLAS_META: dict[str, PlantillaMeta] = {clave: plantilla for plantilla in _CATALOGO for clave in plantilla.claves}
CATALOGO: tuple[PlantillaMeta, ...] = _CATALOGO

_ESPACIOS = re.compile(r"[  ]{2,}")
_ENLACE_LINEA = re.compile(r"^Abrir enlace:\s*(?:.*?\|\s*)?(https?://\S+)\s*$", re.IGNORECASE)


def limpiar_parametro(valor: str, largo: int = LARGO_MAXIMO) -> str:
    """Una sola línea, sin tabulaciones ni espacios repetidos, y recortada: así lo exige Meta."""
    lineas = []
    for linea in str(valor or "").replace("\r", "\n").split("\n"):
        linea = linea.replace("\t", " ").strip().lstrip("-•*").strip()
        enlace = _ENLACE_LINEA.match(linea)
        if enlace:
            # Las listas que traen sus propios enlaces (novedades) no los repiten aquí.
            continue
        if linea:
            lineas.append(linea)
    texto = _ESPACIOS.sub(" ", "; ".join(lineas)).strip()
    if len(texto) > largo:
        texto = texto[: largo - 1].rstrip(" ;,.") + "…"
    return texto


def plantilla_para(clave: str | None) -> PlantillaMeta | None:
    return PLANTILLAS_META.get(clave or "")


def parametros(plantilla: PlantillaMeta, valores: dict[str, Any]) -> list[str]:
    return [variable.valor(valores) for variable in plantilla.variables]


def componentes(plantilla: PlantillaMeta, valores: dict[str, Any]) -> list[dict[str, Any]]:
    """Los `components` del envío de una plantilla por la Cloud API."""
    textos = parametros(plantilla, valores)
    resultado: list[dict[str, Any]] = []
    if textos:
        resultado.append({"type": "body", "parameters": [{"type": "text", "text": texto} for texto in textos]})
    if plantilla.boton_codigo:
        resultado.append({
            "type": "button", "sub_type": "url", "index": "0",
            "parameters": [{"type": "text", "text": textos[0]}],
        })
    return resultado


def definicion_meta(plantilla: PlantillaMeta, idioma: str) -> dict[str, Any]:
    """El cuerpo de `POST /{WABA_ID}/message_templates` para registrar la plantilla en Meta."""
    if plantilla.categoria == CATEGORIA_AUTENTICACION:
        return {
            "name": plantilla.nombre,
            "language": idioma,
            "category": CATEGORIA_AUTENTICACION,
            "components": [
                {"type": "BODY", "add_security_recommendation": True},
                {"type": "FOOTER", "code_expiration_minutes": 3},
                {"type": "BUTTONS", "buttons": [{"type": "OTP", "otp_type": "COPY_CODE", "text": "Copiar código"}]},
            ],
        }
    componentes_meta: list[dict[str, Any]] = [{
        "type": "BODY",
        "text": plantilla.cuerpo,
        **({"example": {"body_text": [[variable.ejemplo for variable in plantilla.variables]]}} if plantilla.variables else {}),
    }]
    if plantilla.pie:
        componentes_meta.append({"type": "FOOTER", "text": plantilla.pie})
    return {"name": plantilla.nombre, "language": idioma, "category": plantilla.categoria, "components": componentes_meta}
