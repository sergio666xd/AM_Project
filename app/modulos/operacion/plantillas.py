"""Textos de los avisos por correo, WhatsApp y navegador.

La administración edita el texto con las marcas del correo (`#`, `>`, `!`, `?`,
`Etiqueta: valor`, `Abrir enlace: Texto | {{enlace}}`); la vista previa lo pinta
con el mismo diseño con el que llega, usando los valores de ejemplo.
"""

import re

from sqlalchemy.orm import Session

from app import models

from app.audit import registrar_evento_auditoria
from app.email_service import vista_previa_html
from app.integration_settings import get_firm_settings
from app.message_templates import render_borrador
from app.modulos.administracion.politicas import exigir_admin
from app.modulos.identidad.modelos import Usuario
from app.modulos.operacion.esquemas import EstadoPlantillaMeta, PlantillaAviso, PlantillaAvisoFila, TextosPlantillaAviso, VistaPrevia, WhatsappMeta
from app.modulos.operacion.repositorio import RepositorioOperacion
from app.whatsapp import cloud_config, formatear_mensaje_whatsapp
from app.whatsapp_plantillas import plantilla_para
from app.nucleo.errores import DatosInvalidos, NoEncontrado
from app.timezone import utc_ahora

TOKEN = re.compile(r"{{\s*([a-zA-Z0-9_.-]+)\s*}}")
# Texto del botón cuando la plantilla no pone el suyo con {{enlace}}.
ETIQUETAS_ENLACE = {
    "ABOGADO_CREDENCIALES": "Entrar al portal", "CLIENTE_CREDENCIALES": "Entrar al portal",
    "TAREA_ACCION": "Ver la tarea", "SUBTAREA_ASIGNADA": "Ver la tarea", "RECORDATORIO_TAREA": "Ver la tarea",
    "REACTIVACION_TAREA": "Ver la tarea", "REACTIVACION_EVENTO": "Ver la agenda", "EVENTO_AGENDA": "Ver la agenda",
    "REACTIVACION_COMUNICACION": "Abrir el chat", "COMUNICACION_CLIENTE_ABOGADO": "Abrir el chat",
    "COMUNICACION_ABOGADO_CLIENTE": "Abrir el chat", "CHAT_MENSAJE": "Abrir el chat",
    "DOCUMENTO_RECIBIDO": "Revisar documentos", "DOCUMENTO_REVISION": "Ver documentos", "SOLICITUD_DOCUMENTO": "Ver documentos",
    "CONTRATO_FIRMADO": "Ver documentos", "RECUPERAR_PASSWORD": "Cambiar mi contraseña", "PROCESO_ACTUALIZACION": "Ver el proceso",
    "COLABORADOR_AGREGADO": "Ver el proceso", "ACTUACION_NOTIFICADA": "Ver la actuación",
}
OBLIGAN_PUSH = {"ACTUACIONES_DIGEST"}
# Eventos del webhook `message_template_status_update` de Meta.
ESTADOS_META: dict[str, EstadoPlantillaMeta] = {
    "APPROVED": "aprobada", "REINSTATED": "aprobada", "UNPAUSED": "aprobada",
    "PENDING": "en_revision", "IN_APPEAL": "en_revision",
    "REJECTED": "rechazada", "FLAGGED": "en_riesgo", "PAUSED": "pausada",
    "DISABLED": "deshabilitada", "PENDING_DELETION": "deshabilitada", "DELETED": "deshabilitada",
    "ARCHIVED": "deshabilitada", "LIMIT_EXCEEDED": "deshabilitada",
}


def consultar_plantillas_meta(config: dict) -> list[dict]:
    """Llamada externa a Meta (las pruebas la sustituyen)."""
    from app.whatsapp import plantillas_cloud

    return plantillas_cloud(config)


def _ejemplo(plantilla) -> dict[str, str]:
    return {clave: "" if valor is None else str(valor) for clave, valor in (plantilla.variables_ejemplo or {}).items()}


def _texto(valor: str | None) -> str:
    return (valor or "").replace("\\n", "\n")


def _whatsapp_meta(clave: str, estados: dict) -> WhatsappMeta | None:
    meta = plantilla_para(clave)
    if meta is None:
        return None
    fila = estados.get(meta.nombre)
    if fila is None:
        return WhatsappMeta(plantilla=meta.nombre, estado="sin_dato")
    return WhatsappMeta(
        plantilla=meta.nombre, estado=ESTADOS_META.get(fila.estado, "sin_dato"), motivo=fila.motivo, actualizado_en=fila.actualizado_en,
    )


def _fila(plantilla, estados: dict) -> PlantillaAvisoFila:
    return PlantillaAvisoFila(
        clave=plantilla.clave, nombre=plantilla.nombre, tiene_push=plantilla.titulo_push is not None or plantilla.clave in OBLIGAN_PUSH,
        actualizada_en=plantilla.updated_at, whatsapp_meta=_whatsapp_meta(plantilla.clave, estados),
    )


class ServicioPlantillas:
    def __init__(self, db: Session, repositorio: RepositorioOperacion):
        self._db = db
        self._repo = repositorio

    def _plantilla(self, clave: str):
        plantilla = self._repo.plantilla(clave)
        if plantilla is None:
            raise NoEncontrado("Esa plantilla no existe.")
        return plantilla

    def listar(self, admin: Usuario) -> list[PlantillaAvisoFila]:
        exigir_admin(admin)
        estados = self._repo.estados_whatsapp_meta(cloud_config()["idioma"])
        return [_fila(p, estados) for p in self._repo.plantillas()]

    def sincronizar_whatsapp_meta(self, admin: Usuario) -> list[PlantillaAvisoFila]:
        """Pide a Meta el estado actual de las plantillas (por si el webhook no avisó)."""
        exigir_admin(admin)
        from app.modulos.operacion.integraciones import ProveedorNoDisponible
        from app.whatsapp import ErrorWhatsapp

        config = cloud_config()
        try:
            remotas = consultar_plantillas_meta(config)
        except ErrorWhatsapp as exc:
            raise ProveedorNoDisponible(str(exc)) from exc
        estados = self._repo.estados_whatsapp_meta(config["idioma"])
        ahora = utc_ahora()
        for remota in remotas:
            nombre, idioma, estado = str(remota.get("name") or ""), str(remota.get("language") or ""), str(remota.get("status") or "")
            if idioma != config["idioma"] or not nombre or not estado:
                continue
            motivo = remota.get("rejected_reason")
            motivo = None if not motivo or motivo == "NONE" else str(motivo)
            fila = estados.get(nombre)
            if fila is None:
                fila = models.PlantillaWhatsappMeta(nombre=nombre[:512], idioma=idioma[:16])
                self._db.add(fila)
                estados[nombre] = fila
            fila.estado, fila.motivo, fila.actualizado_en = estado.upper()[:32], motivo, ahora
        registrar_evento_auditoria(self._db, admin, "admin.mensaje.plantilla.whatsapp_meta", "plantilla_mensaje", "whatsapp")
        self._db.commit()
        return [_fila(p, estados) for p in self._repo.plantillas()]

    def _detalle(self, plantilla) -> PlantillaAviso:
        textos = [plantilla.asunto_email, plantilla.cuerpo_email, plantilla.cuerpo_whatsapp, plantilla.titulo_push, plantilla.cuerpo_push]
        ejemplo = _ejemplo(plantilla)
        variables = list(dict.fromkeys([*ejemplo, *(m for t in textos for m in TOKEN.findall(t or ""))]))
        return PlantillaAviso(
            **_fila(plantilla, self._repo.estados_whatsapp_meta(cloud_config()["idioma"])).model_dump(),
            asunto=_texto(plantilla.asunto_email), cuerpo_email=_texto(plantilla.cuerpo_email),
            cuerpo_whatsapp=_texto(plantilla.cuerpo_whatsapp), titulo_push=plantilla.titulo_push, cuerpo_push=plantilla.cuerpo_push,
            variables=[v for v in variables if v != "enlace"], ejemplo=ejemplo,
        )

    def detalle(self, admin: Usuario, clave: str) -> PlantillaAviso:
        exigir_admin(admin)
        return self._detalle(self._plantilla(clave))

    def guardar(self, admin: Usuario, clave: str, datos: TextosPlantillaAviso) -> PlantillaAviso:
        exigir_admin(admin)
        plantilla = self._plantilla(clave)
        if clave in OBLIGAN_PUSH and not ((datos.titulo_push or "").strip() and (datos.cuerpo_push or "").strip()):
            raise DatosInvalidos(
                "Este aviso también sale en el navegador: escriba el título y el texto.",
                campos={"titulo_push": "Escriba el título del aviso en el navegador."},
            )
        plantilla.asunto_email = datos.asunto.strip()
        plantilla.cuerpo_email = datos.cuerpo_email.strip()
        plantilla.cuerpo_whatsapp = datos.cuerpo_whatsapp.strip()
        if datos.titulo_push is not None or plantilla.titulo_push is not None:
            plantilla.titulo_push = (datos.titulo_push or "").strip() or None
            plantilla.cuerpo_push = (datos.cuerpo_push or "").strip() or None
        plantilla.actualizado_por_id = admin.id
        registrar_evento_auditoria(self._db, admin, "admin.mensaje.plantilla.actualizar", "plantilla_mensaje", clave)
        self._db.commit()
        return self._detalle(plantilla)

    def vista_previa(self, admin: Usuario, clave: str, datos: TextosPlantillaAviso) -> VistaPrevia:
        exigir_admin(admin)
        plantilla = self._plantilla(clave)
        valores = _ejemplo(plantilla)
        enlace = plantilla.enlace_ejemplo
        etiqueta = ETIQUETAS_ENLACE.get(clave, "Ver en el portal") if enlace else None
        cuerpo = render_borrador(datos.cuerpo_email, valores, canal="EMAIL", link_label=etiqueta, link_url=enlace)
        return VistaPrevia(
            asunto=render_borrador(datos.asunto, valores, canal="EMAIL"),
            html=vista_previa_html(cuerpo, get_firm_settings(self._db), "#preferencias"),
            whatsapp=formatear_mensaje_whatsapp(
                render_borrador(datos.cuerpo_whatsapp, valores, canal="WHATSAPP", link_label=etiqueta, link_url=enlace)
            ),
            titulo_push=render_borrador(datos.titulo_push, valores, canal="PUSH") or None if datos.titulo_push else None,
            cuerpo_push=render_borrador(datos.cuerpo_push, valores, canal="PUSH") or None if datos.cuerpo_push else None,
        )
