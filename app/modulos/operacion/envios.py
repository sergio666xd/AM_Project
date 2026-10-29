"""Avisos por correo, WhatsApp y navegador: qué salió, qué falló y reintentarlo.

Cada aviso se intenta hasta tres veces. Si los tres fallan queda `agotado` y ya
no se reintenta solo; desde aquí se puede volver a intentar cuando el problema
(por ejemplo, la clave del servidor de correo) esté resuelto.
"""

from datetime import datetime, timedelta

from sqlalchemy import and_, func, or_, true
from sqlalchemy.orm import Session

from app import models
from app.audit import registrar_evento_auditoria
from app.email_service import texto_plano
from app.modulos.administracion.esquemas import PersonaBreve
from app.modulos.administracion.politicas import exigir_admin
from app.modulos.identidad.modelos import Usuario
from app.modulos.operacion.esquemas import (
    ConteoEnvios,
    DetalleEnvio,
    Envio,
    FiltroEnvios,
    PaginaEnvios,
    Reintentados,
)
from app.modulos.operacion.repositorio import MAX_INTENTOS, RepositorioOperacion
from app.nucleo.errores import Conflicto, DatosInvalidos, NoEncontrado
from app.nucleo.paginacion import ParametrosPagina, codificar_cursor
from app.timezone import utc_ahora

E = models.EntregaNotificacion
VENTANA_FALLIDOS = timedelta(days=30)
CANALES = ("EMAIL", "WHATSAPP", "PUSH")
FILTROS = {
    "fallidos": E.estado == "ERROR",
    "pendientes": E.estado.in_(("PENDIENTE", "ENVIANDO")),
    "enviados": E.estado == "ENVIADA",
}
TIPOS = (
    ("ACTUACION", "Actuación judicial"), ("RESUMEN", "Resumen de pendientes"), ("SUBTAREA", "Tarea"),
    ("RECORDATORIO", "Recordatorio de tarea"), ("TAREA", "Tarea"), ("EVENTO", "Agenda"), ("COMUNICACION", "Mensaje"),
    ("CHAT", "Mensaje"), ("DOCUMENTO", "Documento"), ("SOLICITUD_DOCUMENTO", "Documento"), ("CONTRATO", "Contrato"),
    ("CREDENCIALES", "Acceso al portal"), ("COLABORADOR", "Proceso"), ("PROCESO", "Proceso"),
)


def lanzar_envios(ids: list[int]) -> None:
    """Pide al servicio de Workflows que envíe ya estos avisos (las pruebas lo sustituyen)."""
    from app.notification_service import _iniciar_workflow

    _iniciar_workflow(ids)


def tipo_legible(tipo: str) -> str:
    for prefijo, texto in TIPOS:
        if tipo.startswith(prefijo) or tipo.startswith(f"REACTIVACION_{prefijo}"):
            return texto
    return tipo.replace("_", " ").capitalize()


def estado_de(entrega: models.EntregaNotificacion) -> str:
    if entrega.estado == "ERROR":
        return "agotado" if entrega.intentos >= MAX_INTENTOS else "fallido"
    return {"PENDIENTE": "pendiente", "ENVIANDO": "enviando", "ENVIADA": "enviado"}.get(entrega.estado, "omitido")


def envio(entrega: models.EntregaNotificacion, usuario: Usuario, *, con_cuerpo: bool = False) -> Envio:
    canal = entrega.canal if entrega.canal in CANALES else None
    datos = dict(
        id=entrega.id, tipo=tipo_legible(entrega.tipo), canal=canal, estado=estado_de(entrega), asunto=entrega.asunto,
        destinatario=PersonaBreve(id=usuario.id, nombre=usuario.nombre_completo),
        contacto=usuario.email if canal == "EMAIL" else (usuario.whatsapp_numero or None) if canal == "WHATSAPP" else None,
        intentos=entrega.intentos, error=(entrega.error or "").strip()[:500] or None,
        creado_en=entrega.created_at, enviado_en=entrega.enviado_en,
    )
    if con_cuerpo:
        return DetalleEnvio(**datos, cuerpo=texto_plano(entrega.cuerpo or ""))
    return Envio(**datos)


class ServicioEnvios:
    def __init__(self, db: Session, repositorio: RepositorioOperacion):
        self._db = db
        self._repo = repositorio

    def listar(self, admin: Usuario, *, filtro: FiltroEnvios, canal: str | None, q: str | None,
               pagina: ParametrosPagina) -> PaginaEnvios:
        exigir_admin(admin)
        condiciones = []
        if filtro in FILTROS:
            condiciones.append(FILTROS[filtro])
        if canal:
            condiciones.append(E.canal == canal)
        texto = " ".join((q or "").split()).lower()
        if texto:
            condiciones.append(or_(func.lower(Usuario.nombre_completo).like(f"%{texto}%"), func.lower(E.asunto).like(f"%{texto}%")))
        condicion = and_(true(), *condiciones)
        despues = None
        if pagina.cursor:
            try:
                despues = (datetime.fromisoformat(str(pagina.cursor["c"])), int(pagina.cursor["id"]))
            except (KeyError, TypeError, ValueError) as exc:
                raise DatosInvalidos("El cursor de la página no es válido.", campos={"cursor": "No es válido."}) from exc
        filas = self._repo.envios(condicion, despues=despues, limite=pagina.limite + 1)
        hay_mas = len(filas) > pagina.limite
        filas = filas[: pagina.limite]
        ultimo = filas[-1][0] if filas else None
        return PaginaEnvios(
            items=[envio(entrega, usuario) for entrega, usuario in filas],
            total=self._repo.contar_envios(condicion),
            siguiente=codificar_cursor({"c": ultimo.created_at.isoformat(), "id": ultimo.id}) if hay_mas and ultimo else None,
            conteo=ConteoEnvios(
                fallidos=self._repo.contar_envios(and_(
                    E.estado == "ERROR", E.intentos >= MAX_INTENTOS, E.created_at >= utc_ahora() - VENTANA_FALLIDOS,
                )),
                pendientes=self._repo.contar_envios(FILTROS["pendientes"]),
            ),
        )

    def detalle(self, admin: Usuario, envio_id: int) -> DetalleEnvio:
        exigir_admin(admin)
        fila = self._repo.envio(envio_id)
        if fila is None:
            raise NoEncontrado("No encontramos ese aviso.")
        return envio(*fila, con_cuerpo=True)

    def reintentar(self, admin: Usuario, ids: list[int]) -> Reintentados:
        exigir_admin(admin)
        entregas = [
            e for e in self._repo.envios_por_id(sorted(set(ids)))
            if e.estado == "ERROR" and e.canal in ("EMAIL", "WHATSAPP")
        ]
        if not entregas:
            raise Conflicto("Ninguno de esos avisos se puede reintentar.", codigo="nada_que_reintentar")
        for entrega in entregas:
            entrega.estado = "PENDIENTE"
            entrega.intentos = 0
            entrega.error = None
            entrega.lease_hasta = None
            registrar_evento_auditoria(self._db, admin, "admin.envio.reintentar", "entrega_notificacion", entrega.id)
        self._db.commit()
        lanzar_envios([e.id for e in entregas])
        return Reintentados(reintentados=len(entregas))
