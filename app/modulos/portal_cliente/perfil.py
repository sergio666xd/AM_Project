"""Datos y avisos del cliente.

Los datos del cliente salen en su contrato, así que no los cambia él mismo: los
pide y la firma los aprueba (la misma solicitud de la API v1). Los avisos se
eligen por grupo y canal; cada grupo agrupa tipos de notificación del sistema.
Los avisos de acceso a la cuenta siempre llegan al correo.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.audit import registrar_evento_auditoria
from app.modulos.expedientes import politicas
from app.modulos.identidad.modelos import Usuario
from app.modulos.portal_cliente.esquemas import (
    CambioAvisos,
    DatosCambio,
    GrupoAvisos,
    PerfilCliente,
    SolicitudCambio,
)
from app.notification_policy import preferencia_de_cliente
from app.nucleo.errores import Conflicto, DatosInvalidos, SinPermiso

GRUPOS = {
    "proceso": ("Novedades de su proceso", "Lo que publica el juzgado y los cambios de etapa.", ("ACTUACIONES",)),
    "pedidos": ("Lo que le pedimos", "Documentos y tareas, con sus recordatorios antes de la fecha límite.",
                ("DOCUMENTOS", "TAREAS", "SUBTAREAS", "RECORDATORIOS")),
    "mensajes": ("Mensajes y citas", "Mensajes de la firma, citas en la agenda y comunicados.", ("RESUMENES",)),
}
ESTADOS = {"PENDIENTE": "pendiente", "APROBADA": "aprobada", "RECHAZADA": "rechazada"}


def _texto(valor: str | None) -> str | None:
    return " ".join((valor or "").split()) or None


class ServicioPerfilCliente:
    def __init__(self, db: Session):
        self._db = db

    def perfil(self, usuario: Usuario) -> PerfilCliente:
        self._exigir_cliente(usuario)
        return PerfilCliente(
            nombre=usuario.nombre_completo,
            documento=usuario.numero_documento or None,
            genero=usuario.genero if usuario.genero in ("MASCULINO", "FEMENINO") else None,
            domicilio=usuario.domicilio or None,
            direccion=usuario.direccion or None,
            correo=usuario.email,
            whatsapp=(usuario.whatsapp_numero or "").strip() or None,
            solicitud=self._ultima_solicitud(usuario),
            avisos=self._avisos(usuario),
        )

    def cambiar_avisos(self, usuario: Usuario, cambios: list[CambioAvisos]) -> list[GrupoAvisos]:
        self._exigir_cliente(usuario)
        if any(c.whatsapp for c in cambios) and not (usuario.whatsapp_numero or "").strip():
            raise DatosInvalidos("Registre un número de WhatsApp antes de recibir avisos por ahí.", codigo="sin_whatsapp")
        preferencias = self._preferencias(usuario)
        for cambio in cambios:
            for tipo in GRUPOS[cambio.clave][2]:
                preferencias[tipo] = {"email": cambio.correo, "whatsapp": cambio.whatsapp}
        # El acceso a la cuenta (códigos, invitaciones) siempre llega al correo.
        preferencias["ACCESO"] = {"email": True, "whatsapp": preferencias.get("ACCESO", {}).get("whatsapp", False)}
        usuario.preferencias_notificacion = preferencias
        usuario.avisos_por_tipo = True
        usuario.notificaciones_email = any(c["email"] for c in preferencias.values())
        usuario.notificaciones_whatsapp = any(c["whatsapp"] for c in preferencias.values())
        correo = any(preferencias[t]["email"] for t in models.TIPOS_NOTIFICACION if t != "ACCESO")
        usuario.canal_notificacion_cliente = (
            "EMAIL" if correo and not usuario.notificaciones_whatsapp
            else "WHATSAPP" if usuario.notificaciones_whatsapp and not correo else None
        )
        registrar_evento_auditoria(self._db, usuario, "auth.notificaciones.actualizar", "usuario", usuario.id)
        self._db.commit()
        return self._avisos(usuario)

    def pedir_cambio(self, usuario: Usuario, datos: DatosCambio) -> SolicitudCambio:
        self._exigir_cliente(usuario)
        nombre = _texto(datos.nombre)
        documento = (_texto(datos.documento) or "").upper().replace(".", "") or None
        domicilio = (_texto(datos.domicilio) or "").upper() or None
        direccion = (_texto(datos.direccion) or "").upper() or None
        if not nombre or len(nombre) < 3:
            raise DatosInvalidos("Escriba su nombre completo.", campos={"nombre": "Escriba su nombre completo."})
        actuales = (usuario.nombre_completo, usuario.numero_documento or None, usuario.genero or None,
                    usuario.domicilio or None, usuario.direccion or None)
        if (nombre, documento, datos.genero, domicilio, direccion) == actuales:
            raise DatosInvalidos("No cambió ningún dato.", codigo="sin_cambios")
        S = models.SolicitudEdicionPerfilCliente
        if self._db.scalar(select(S.id).where(S.cliente_id == usuario.id, S.estado == "PENDIENTE")):
            raise Conflicto("Ya tiene un cambio en revisión. Le avisaremos cuando la firma lo responda.", codigo="solicitud_pendiente")
        solicitud = S(
            cliente_id=usuario.id, email_solicitado=usuario.email, nombre_completo_solicitado=nombre,
            whatsapp_numero_solicitado=usuario.whatsapp_numero or "", genero_solicitado=datos.genero,
            numero_documento_solicitado=documento, domicilio_solicitado=domicilio, direccion_solicitada=direccion,
        )
        self._db.add(solicitud)
        self._db.flush()
        registrar_evento_auditoria(self._db, usuario, "cliente.solicitud_perfil.crear", "solicitud_edicion_perfil", solicitud.id)
        self._db.commit()
        return self._vista_solicitud(solicitud)

    # ---- Apoyo ----------------------------------------------------------

    @staticmethod
    def _exigir_cliente(usuario: Usuario) -> None:
        if not politicas.es_cliente(usuario):
            raise SinPermiso("Esta configuración es del portal del cliente.")

    @staticmethod
    def _preferencias(usuario: Usuario) -> dict[str, dict[str, bool]]:
        """Lo que recibe hoy por cada tipo, con las mismas reglas con que se envían los avisos."""
        return {
            tipo: dict(zip(("email", "whatsapp"), preferencia_de_cliente(usuario, tipo), strict=True))
            for tipo in models.TIPOS_NOTIFICACION
        }

    def _avisos(self, usuario: Usuario) -> list[GrupoAvisos]:
        preferencias = self._preferencias(usuario)
        hay_whatsapp = bool((usuario.whatsapp_numero or "").strip())
        return [
            GrupoAvisos(
                clave=clave, titulo=titulo, descripcion=descripcion,
                correo=any(preferencias[t]["email"] for t in tipos),
                whatsapp=hay_whatsapp and any(preferencias[t]["whatsapp"] for t in tipos),
            )
            for clave, (titulo, descripcion, tipos) in GRUPOS.items()
        ]

    def _ultima_solicitud(self, usuario: Usuario) -> SolicitudCambio | None:
        S = models.SolicitudEdicionPerfilCliente
        solicitud = self._db.scalar(
            select(S).where(S.cliente_id == usuario.id).order_by(S.solicitada_en.desc(), S.id.desc()).limit(1)
        )
        return self._vista_solicitud(solicitud) if solicitud else None

    @staticmethod
    def _vista_solicitud(solicitud: models.SolicitudEdicionPerfilCliente) -> SolicitudCambio:
        return SolicitudCambio(
            id=solicitud.id, estado=ESTADOS.get(solicitud.estado, "pendiente"), solicitada_en=solicitud.solicitada_en,
            revisada_en=solicitud.revisada_en, comentario=(solicitud.comentario_revision or "").strip() or None,
        )
