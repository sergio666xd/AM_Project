"""Casos de uso de documentos para el equipo de la firma.

Quién ve qué: los documentos y solicitudes de los procesos activos que el
usuario ve (ver `expedientes.politicas`). Los documentos de contratos viven en
Contratos y no salen aquí. El portal del cliente sigue en la API v1 hasta la
Fase 5.

Versiones: cuando la firma devuelve una entrega para corregir, el cliente sube
otro archivo para el mismo documento pedido. Cada archivo es una versión; la
más reciente es la vigente y es la única que se revisa.

Recordatorios: la firma puede recordarle al cliente lo que le falta (una vez
cada 12 horas), y el Cron diario lo hace solo dos días antes de la fecha
límite y el día después de vencida.
"""

import logging
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Iterator
from uuid import uuid4

from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy.orm import Session

from app import models, storage
from app.audit import registrar_evento_auditoria
from app.modulos.bandeja.esquemas import ProcesoBreve
from app.modulos.documentos.esquemas import (
    Archivo,
    CambioFecha,
    GrupoArchivos,
    GrupoSolicitudes,
    ListaArchivos,
    ListaSolicitudes,
    NuevaSolicitud,
    Pedido,
    RecordatoriosEnviados,
    ResumenDocumentos,
    Revision,
    Solicitud,
    SolicitudBreve,
    Version,
)
from app.modulos.documentos.modelos import DocumentoProceso, SolicitudDocumento
from app.modulos.documentos.repositorio import LIMITE, RepositorioDocumentos
from app.modulos.expedientes import politicas
from app.modulos.identidad.modelos import EstadoUsuario, RolUsuario, Usuario
from app.modulos.tareas.esquemas import PersonaBreve
from app.nucleo.errores import Conflicto, DatosInvalidos, ErrorDominio, NoEncontrado, SinPermiso
from app.nucleo.zona_horaria import a_colombia, fin_del_dia_utc
from app.timezone import format_colombia_datetime, utc_ahora
from app.workflow_service import user_portal_url

logger = logging.getLogger(__name__)

SOLO_FIRMA = "Los documentos de la firma son para el equipo."
SIN_REVISAR = ("RECIBIDO", "EN_REVISION")
DEVUELTOS = ("REQUIERE_CORRECCION", "RECHAZADO")
VISTA_PREVIA = {"application/pdf", "image/jpeg", "image/png"}
ESPERA_RECORDATORIO = timedelta(hours=12)
DIAS_AVISO_PREVIO = 2
MESES = ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre")
ESTADOS_LEGIBLES = {"EN_REVISION": "EN REVISION", "APROBADO": "APROBADO", "REQUIERE_CORRECCION": "REQUIERE CORRECCION"}


def notificar(db: Session, destinatario: Usuario, **datos) -> None:
    """Avisos al cliente con las plantillas de la API v1 (las pruebas lo sustituyen)."""
    from app.routers.expedientes.comun import _notificar

    _notificar(db, destinatario, **datos)


def dia_legible(dia: date) -> str:
    return f"{dia.day} de {MESES[dia.month - 1]}"


@dataclass
class EstadoDeSolicitud:
    pedidos: list[dict[str, str]]
    versiones: dict[str, list[DocumentoProceso]]
    sueltos: list[DocumentoProceso]

    def vigente(self, pedido_id: str) -> DocumentoProceso | None:
        versiones = self.versiones.get(pedido_id)
        return versiones[-1] if versiones else None

    def estado_pedido(self, pedido_id: str) -> str:
        vigente = self.vigente(pedido_id)
        return vigente.estado_revision if vigente else "FALTANTE"

    @property
    def estado(self) -> str:
        estados = [self.estado_pedido(p["id"]) for p in self.pedidos]
        if any(e == "FALTANTE" or e in DEVUELTOS for e in estados):
            return "esperando_cliente"
        if any(e in SIN_REVISAR for e in estados):
            return "por_revisar"
        return "completa"

    @property
    def faltantes(self) -> list[str]:
        return [p["nombre"] for p in self.pedidos if self.estado_pedido(p["id"]) == "FALTANTE" or self.estado_pedido(p["id"]) in DEVUELTOS]

    def atendida(self) -> bool:
        """Todo entregado y nada devuelto: la regla de `atendida_en` de la API v1."""
        return self.estado != "esperando_cliente"


def estado_de(solicitud: SolicitudDocumento) -> EstadoDeSolicitud:
    pedidos = [
        {"id": str(item.get("id") or "legacy"), "nombre": str(item.get("nombre") or solicitud.titulo)}
        for item in (solicitud.documentos_requeridos or []) if isinstance(item, dict)
    ] or [{"id": "legacy", "nombre": solicitud.titulo}]
    ids = {p["id"] for p in pedidos}
    versiones: dict[str, list[DocumentoProceso]] = {}
    sueltos: list[DocumentoProceso] = []
    for documento in sorted(solicitud.documentos, key=lambda d: (d.created_at, d.id)):
        if documento.contrato_id is not None:
            continue
        # Las entregas antiguas sin pedido van al único pedido de la solicitud.
        pedido_id = documento.solicitud_item_id or (pedidos[0]["id"] if len(pedidos) == 1 else None)
        if pedido_id in ids:
            versiones.setdefault(pedido_id, []).append(documento)
        else:
            sueltos.append(documento)
    return EstadoDeSolicitud(pedidos, versiones, sueltos)


def fecha_limite_de(solicitud: SolicitudDocumento) -> date | None:
    return a_colombia(solicitud.fecha_limite).date() if solicitud.fecha_limite else None


class ServicioDocumentos:
    def __init__(self, db: Session, repositorio: RepositorioDocumentos):
        self._db = db
        self._repo = repositorio

    # ---- Alcance --------------------------------------------------------

    def _procesos(self, usuario: Usuario, proceso_id: int | None = None) -> dict[int, str]:
        if politicas.es_cliente(usuario):
            raise SinPermiso(SOLO_FIRMA)
        return self._repo.procesos_activos(politicas.filtro_procesos_visibles(usuario), proceso_id)

    def _documento(self, usuario: Usuario, documento_id: int) -> tuple[DocumentoProceso, dict[int, str]]:
        documento = self._repo.documento(documento_id)
        procesos = self._procesos(usuario, documento.proceso_id) if documento and documento.proceso_id else {}
        if documento is None or documento.proceso_id not in procesos or documento.contrato_id is not None:
            raise NoEncontrado("Documento no encontrado.")
        return documento, procesos

    def _solicitud(self, usuario: Usuario, solicitud_id: int) -> tuple[SolicitudDocumento, dict[int, str]]:
        solicitud = self._repo.solicitud(solicitud_id)
        procesos = self._procesos(usuario, solicitud.proceso_id) if solicitud else {}
        if solicitud is None or solicitud.proceso_id not in procesos:
            raise NoEncontrado("Solicitud no encontrada.")
        return solicitud, procesos

    # ---- Archivos -------------------------------------------------------

    def _versiones(self, documentos: list[DocumentoProceso], nombres: dict[int, str]) -> list[Version]:
        return [
            Version(
                id=d.id, numero=numero, nombre_archivo=d.nombre_archivo, tipo_archivo=d.mime_type,
                vista_previa=d.mime_type in VISTA_PREVIA, estado_revision=d.estado_revision,
                comentario=d.comentario_revision, revisado_por=nombres.get(d.revisado_por_id),
                revisado_en=d.revisado_en, recibido_en=d.created_at,
            )
            for numero, d in reversed(list(enumerate(documentos, start=1)))
        ]

    def _archivo(self, versiones: list[DocumentoProceso], nombre: str | None, procesos: dict[int, str],
                 nombres: dict[int, str]) -> Archivo:
        vigente = versiones[-1]
        return Archivo(
            id=vigente.id,
            nombre=nombre or vigente.nombre_archivo,
            nombre_archivo=vigente.nombre_archivo,
            tipo_archivo=vigente.mime_type,
            vista_previa=vigente.mime_type in VISTA_PREVIA,
            estado_revision=vigente.estado_revision,
            comentario=vigente.comentario_revision,
            entregado_por_cliente=vigente.solicitud_id is not None,
            proceso=ProcesoBreve(id=vigente.proceso_id, nombre=procesos[vigente.proceso_id]),
            cliente=PersonaBreve(id=vigente.cliente.id, nombre=vigente.cliente.nombre_completo) if vigente.cliente else None,
            solicitud=SolicitudBreve(id=vigente.solicitud.id, titulo=vigente.solicitud.titulo) if vigente.solicitud else None,
            versiones=self._versiones(versiones, nombres),
            recibido_en=vigente.created_at,
        )

    def _todos_los_archivos(self, procesos: dict[int, str]) -> list[Archivo]:
        ids = list(procesos)
        documentos = self._repo.documentos(ids)
        nombres = self._repo.nombres({d.revisado_por_id for d in documentos})
        agrupados: list[tuple[list[DocumentoProceso], str | None]] = []
        en_solicitud: set[int] = set()
        for solicitud in self._repo.solicitudes(ids):
            estado = estado_de(solicitud)
            for pedido in estado.pedidos:
                if versiones := estado.versiones.get(pedido["id"]):
                    agrupados.append((versiones, pedido["nombre"]))
                    en_solicitud.update(d.id for d in versiones)
        agrupados.extend(([d], None) for d in documentos if d.id not in en_solicitud)
        archivos = [self._archivo(versiones, nombre, procesos, nombres) for versiones, nombre in agrupados]
        archivos.sort(key=lambda a: (a.recibido_en, a.id), reverse=True)
        return archivos

    def _resumen(self, archivos: list[Archivo], solicitudes: list[Solicitud]) -> ResumenDocumentos:
        return ResumenDocumentos(
            por_revisar=sum(1 for a in archivos if a.entregado_por_cliente and a.estado_revision in SIN_REVISAR),
            por_corregir=sum(1 for a in archivos if a.entregado_por_cliente and a.estado_revision in DEVUELTOS),
            solicitudes_abiertas=sum(1 for s in solicitudes if s.estado != "completa"),
            solicitudes_vencidas=sum(1 for s in solicitudes if s.vencida),
        )

    def listar_archivos(self, usuario: Usuario, grupo: GrupoArchivos, proceso_id: int | None) -> ListaArchivos:
        procesos = self._procesos(usuario, proceso_id)
        archivos = self._todos_los_archivos(procesos)
        resumen = self._resumen(archivos, self._todas_las_solicitudes(procesos))
        if grupo == "por_revisar":
            archivos = [a for a in archivos if a.entregado_por_cliente and a.estado_revision in SIN_REVISAR]
        elif grupo == "por_corregir":
            archivos = [a for a in archivos if a.entregado_por_cliente and a.estado_revision in DEVUELTOS]
        elif grupo == "aprobados":
            archivos = [a for a in archivos if a.estado_revision == "APROBADO"]
        return ListaArchivos(items=archivos[:LIMITE], total=len(archivos), resumen=resumen)

    def archivo(self, usuario: Usuario, documento_id: int) -> Archivo:
        documento, procesos = self._documento(usuario, documento_id)
        return next(a for a in self._todos_los_archivos(procesos) if documento_id in {v.id for v in a.versiones})

    def contenido(self, usuario: Usuario, documento_id: int) -> tuple[Iterator[bytes], DocumentoProceso]:
        """El archivo guardado en R2, para verlo o descargarlo."""
        documento, _ = self._documento(usuario, documento_id)
        try:
            objeto = storage.get_r2_client().get_object(Bucket=storage.get_r2_bucket(), Key=documento.ruta_archivo)
        except (BotoCoreError, ClientError) as exc:
            logger.warning("No se pudo leer el documento %s de R2: %s", documento.id, exc)
            raise ErrorDominio("No se pudo abrir el archivo. Intenta de nuevo.", codigo="almacenamiento_no_disponible") from exc
        registrar_evento_auditoria(self._db, usuario, "documento.descargar", "documento_proceso", documento.id)
        self._db.commit()
        return objeto["Body"], documento

    def revisar(self, usuario: Usuario, documento_id: int, datos: Revision) -> Archivo:
        documento, _ = self._documento(usuario, documento_id)
        solicitud = documento.solicitud
        if solicitud is None:
            raise ErrorDominio("Solo se revisa lo que entrega el cliente.", codigo="documento_de_la_firma")
        estado = estado_de(solicitud)
        pedido = next((p for p in estado.pedidos if estado.vigente(p["id"]) is documento), None)
        if pedido is None and documento not in estado.sueltos:
            raise Conflicto("El cliente ya entregó una versión más reciente; revisa esa.", codigo="version_anterior")
        ahora = utc_ahora()
        documento.estado_revision = datos.estado
        documento.comentario_revision = datos.comentario
        documento.revisado_por_id = usuario.id
        documento.revisado_en = ahora
        solicitud.atendida_en = ahora if estado.atendida() else None
        self._repo.marcar_folio_revisado(documento.proceso_id, documento.id, usuario.id, ahora)
        registrar_evento_auditoria(self._db, usuario, "documento.revisar", "documento_proceso", documento.id)
        self._db.commit()
        self._avisar_revision(usuario, documento, pedido["nombre"] if pedido else solicitud.titulo)
        return self.archivo(usuario, documento.id)

    def _avisar_revision(self, usuario: Usuario, documento: DocumentoProceso, pedido: str) -> None:
        cliente, solicitud = documento.cliente, documento.solicitud
        if not cliente or cliente.estado != EstadoUsuario.ACTIVO:
            return
        enlace = user_portal_url(cliente, f"/gestion-procesos/cliente/procesos/{documento.proceso_id}#documentos")
        estado = ESTADOS_LEGIBLES.get(documento.estado_revision, documento.estado_revision)
        comentario = documento.comentario_revision or "Sin comentarios adicionales"
        try:
            notificar(
                self._db, cliente,
                asunto=f"Documento revisado: {solicitud.titulo}",
                cuerpo=f"{usuario.nombre_completo} revisó {documento.nombre_archivo}. Estado: {estado}. Comentario: {comentario}",
                tipo="DOCUMENTOS", origen=f"REVISION_DOCUMENTO:{documento.id}:{documento.estado_revision}", emisor=usuario,
                plantilla_clave="DOCUMENTO_REVISION",
                variables={"nombre": cliente.nombre_completo, "actor": usuario.nombre_completo, "documento": pedido,
                           "archivo": documento.nombre_archivo, "solicitud": solicitud.titulo,
                           "proceso": documento.proceso.nombre, "estado": estado, "comentario": comentario,
                           "fecha": format_colombia_datetime(documento.revisado_en)},
                enlace_texto="Ver documentos", enlace_url=enlace,
            )
        except Exception:
            self._db.rollback()
            logger.exception("No se pudo avisar al cliente la revisión del documento %s.", documento.id)

    # ---- Solicitudes ----------------------------------------------------

    def _vista_solicitud(self, solicitud: SolicitudDocumento, procesos: dict[int, str], hoy: date) -> Solicitud:
        estado = estado_de(solicitud)
        fecha = fecha_limite_de(solicitud)
        pedidos = [
            Pedido(
                id=p["id"], nombre=p["nombre"], estado=estado.estado_pedido(p["id"]),
                archivo_id=vigente.id if (vigente := estado.vigente(p["id"])) else None,
                versiones=len(estado.versiones.get(p["id"], [])),
            )
            for p in estado.pedidos
        ]
        esperando = estado.estado == "esperando_cliente"
        ultimo = solicitud.ultimo_recordatorio_en
        cliente_activo = bool(solicitud.cliente) and solicitud.cliente.estado == EstadoUsuario.ACTIVO
        return Solicitud(
            id=solicitud.id,
            titulo=solicitud.titulo,
            instrucciones=solicitud.instrucciones,
            proceso=ProcesoBreve(id=solicitud.proceso_id, nombre=procesos[solicitud.proceso_id]),
            cliente=PersonaBreve(id=solicitud.cliente_id, nombre=solicitud.cliente.nombre_completo if solicitud.cliente else "Usuario eliminado"),
            estado=estado.estado,
            pedidos=pedidos,
            entregados=sum(1 for p in pedidos if p.estado != "FALTANTE" and p.estado not in DEVUELTOS),
            fecha_limite=fecha,
            vencida=esperando and fecha is not None and fecha < hoy,
            ultimo_recordatorio_en=ultimo,
            puede_recordar=esperando and cliente_activo and (ultimo is None or utc_ahora() - ultimo >= ESPERA_RECORDATORIO),
            creada_en=solicitud.created_at,
        )

    def _todas_las_solicitudes(self, procesos: dict[int, str]) -> list[Solicitud]:
        hoy = a_colombia(utc_ahora()).date()
        return [self._vista_solicitud(s, procesos, hoy) for s in self._repo.solicitudes(list(procesos))]

    def listar_solicitudes(self, usuario: Usuario, grupo: GrupoSolicitudes, proceso_id: int | None) -> ListaSolicitudes:
        solicitudes = self._todas_las_solicitudes(self._procesos(usuario, proceso_id))
        if grupo == "abiertas":
            solicitudes = [s for s in solicitudes if s.estado != "completa"]
        elif grupo == "vencidas":
            solicitudes = [s for s in solicitudes if s.vencida]
        elif grupo == "completas":
            solicitudes = [s for s in solicitudes if s.estado == "completa"]
        return ListaSolicitudes(items=solicitudes[:LIMITE], total=len(solicitudes))

    def _una(self, solicitud: SolicitudDocumento, procesos: dict[int, str]) -> Solicitud:
        self._db.refresh(solicitud)
        return self._vista_solicitud(solicitud, procesos, a_colombia(utc_ahora()).date())

    @staticmethod
    def _validar_fecha(fecha: date | None) -> None:
        if fecha is not None and fecha < a_colombia(utc_ahora()).date():
            raise DatosInvalidos("La fecha límite no puede estar en el pasado.", codigo="fecha_pasada",
                                 campos={"fecha_limite": "Elige hoy o un día posterior."})

    def crear_solicitud(self, usuario: Usuario, datos: NuevaSolicitud) -> Solicitud:
        procesos = self._procesos(usuario, datos.proceso_id)
        if datos.proceso_id not in procesos:
            raise NoEncontrado("Proceso no encontrado.")
        proceso = self._db.get(models.Proceso, datos.proceso_id)
        vinculo = next((v for v in proceso.clientes if v.cliente_id == datos.cliente_id), None)
        cliente = vinculo.cliente if vinculo else None
        if cliente is None or getattr(cliente.rol, "value", cliente.rol) != RolUsuario.CLIENTE.value:
            raise DatosInvalidos("Elige un cliente vinculado al proceso.", codigo="cliente_no_vinculado",
                                 campos={"cliente_id": "Elige un cliente vinculado al proceso."})
        self._validar_fecha(datos.fecha_limite)
        pedidos = [{"id": str(uuid4()), "nombre": nombre} for nombre in datos.documentos]
        solicitud = SolicitudDocumento(
            proceso_id=proceso.id, cliente_id=cliente.id, titulo=datos.titulo[:255], instrucciones=datos.instrucciones,
            documentos_requeridos=pedidos, fecha_limite=fin_del_dia_utc(datos.fecha_limite) if datos.fecha_limite else None,
        )
        self._db.add(solicitud)
        self._db.flush()
        registrar_evento_auditoria(self._db, usuario, "documento.solicitar", "solicitud_documento", solicitud.id)
        self._db.commit()
        self._avisar_solicitud(usuario, solicitud, proceso, cliente)
        return self._una(solicitud, procesos)

    def _avisar_solicitud(self, usuario: Usuario, solicitud: SolicitudDocumento, proceso: models.Proceso, cliente: Usuario) -> None:
        if cliente.estado != EstadoUsuario.ACTIVO:
            return
        documentos = "\n".join(f"- {p['nombre']}" for p in solicitud.documentos_requeridos)
        fecha = fecha_limite_de(solicitud)
        enlace = user_portal_url(cliente, f"/gestion-procesos/cliente/procesos/{proceso.id}#documentos")
        try:
            notificar(
                self._db, cliente,
                asunto=f"Documentos solicitados: {solicitud.titulo}",
                cuerpo=f"{usuario.nombre_completo} solicitó documentos para el proceso {proceso.nombre}:\n{documentos}",
                tipo="DOCUMENTOS", origen=f"SOLICITUD_DOCUMENTO:{solicitud.id}", emisor=usuario,
                plantilla_clave="SOLICITUD_DOCUMENTO",
                variables={"nombre": cliente.nombre_completo, "actor": usuario.nombre_completo, "proceso": proceso.nombre,
                           "solicitud": solicitud.titulo, "documentos": documentos,
                           "instrucciones": solicitud.instrucciones or "Sin instrucciones adicionales",
                           "fecha_limite": fecha.strftime("%d/%m/%Y") if fecha else "Sin fecha límite",
                           "fecha": format_colombia_datetime(solicitud.created_at)},
                enlace_texto="Ver documentos", enlace_url=enlace,
            )
        except Exception:
            self._db.rollback()
            logger.exception("No se pudo avisar al cliente la solicitud de documentos %s.", solicitud.id)

    def cambiar_fecha(self, usuario: Usuario, solicitud_id: int, datos: CambioFecha) -> Solicitud:
        solicitud, procesos = self._solicitud(usuario, solicitud_id)
        self._validar_fecha(datos.fecha_limite)
        solicitud.fecha_limite = fin_del_dia_utc(datos.fecha_limite) if datos.fecha_limite else None
        registrar_evento_auditoria(self._db, usuario, "documento.solicitud_fecha", "solicitud_documento", solicitud.id,
                                   {"fecha_limite": datos.fecha_limite.isoformat() if datos.fecha_limite else None})
        self._db.commit()
        return self._una(solicitud, procesos)

    def recordar(self, usuario: Usuario, solicitud_id: int) -> Solicitud:
        solicitud, procesos = self._solicitud(usuario, solicitud_id)
        vista = self._vista_solicitud(solicitud, procesos, a_colombia(utc_ahora()).date())
        if vista.estado != "esperando_cliente":
            raise Conflicto("El cliente ya entregó todo lo que se le pidió.", codigo="nada_pendiente")
        if not solicitud.cliente or solicitud.cliente.estado != EstadoUsuario.ACTIVO:
            raise Conflicto("La cuenta del cliente no está activa.", codigo="cliente_inactivo")
        if not vista.puede_recordar:
            raise Conflicto("Ya se le recordó en las últimas 12 horas.", codigo="recordatorio_reciente")
        try:
            self._enviar_recordatorio(solicitud, usuario)
            registrar_evento_auditoria(self._db, usuario, "documento.recordar", "solicitud_documento", solicitud.id)
            self._db.commit()
        except Exception as exc:
            self._db.rollback()
            logger.exception("No se pudo enviar el recordatorio de la solicitud %s.", solicitud.id)
            raise ErrorDominio("No se pudo enviar el recordatorio. Intenta de nuevo.", codigo="aviso_fallido") from exc
        return self._una(solicitud, procesos)

    def _enviar_recordatorio(self, solicitud: SolicitudDocumento, emisor: Usuario | None) -> None:
        """Agrega el aviso y marca la solicitud; quien llama confirma la transacción."""
        cliente, proceso = solicitud.cliente, solicitud.proceso
        hoy = a_colombia(utc_ahora()).date()
        fecha = fecha_limite_de(solicitud)
        if fecha is None:
            cuando = "sigue pendiente"
        elif fecha < hoy:
            cuando = f"venció el {dia_legible(fecha)}"
        elif fecha == hoy:
            cuando = "vence hoy"
        elif fecha == hoy + timedelta(days=1):
            cuando = f"vence mañana, {dia_legible(fecha)}"
        else:
            cuando = f"vence el {dia_legible(fecha)}"
        pendientes = "\n".join(f"- {nombre}" for nombre in estado_de(solicitud).faltantes)
        notificar(
            self._db, cliente,
            asunto=f"Recordatorio: {solicitud.titulo}",
            cuerpo=f"La solicitud {solicitud.titulo} {cuando}. Falta por entregar:\n{pendientes}",
            tipo="DOCUMENTOS", origen=f"RECORDATORIO_DOCUMENTO:{solicitud.id}:{hoy.isoformat()}", emisor=emisor,
            plantilla_clave="RECORDATORIO_DOCUMENTO",
            variables={"nombre": cliente.nombre_completo, "proceso": proceso.nombre, "solicitud": solicitud.titulo,
                       "cuando": cuando, "pendientes": pendientes,
                       "fecha_limite": fecha.strftime("%d/%m/%Y") if fecha else "Sin fecha límite"},
            enlace_texto="Ver documentos",
            enlace_url=user_portal_url(cliente, f"/gestion-procesos/cliente/procesos/{proceso.id}#documentos"),
        )
        solicitud.ultimo_recordatorio_en = utc_ahora()

    def eliminar_solicitud(self, usuario: Usuario, solicitud_id: int) -> None:
        """Los archivos ya entregados se conservan en el proceso, sin solicitud."""
        solicitud, _ = self._solicitud(usuario, solicitud_id)
        for documento in solicitud.documentos:
            documento.solicitud_id = None
            documento.solicitud_item_id = None
        registrar_evento_auditoria(self._db, usuario, "documento.solicitud_eliminar", "solicitud_documento", solicitud.id)
        self._db.delete(solicitud)
        self._db.commit()

    # ---- Cron -----------------------------------------------------------

    def enviar_recordatorios(self, hoy: date | None = None) -> RecordatoriosEnviados:
        """Recordatorio automático: una vez en los dos días antes de la fecha límite y
        otra al día siguiente de vencida. Un recordatorio manual en esa ventana cuenta."""
        hoy = hoy or a_colombia(utc_ahora()).date()
        enviados: list[int] = []
        for solicitud in self._repo.solicitudes_con_fecha_abiertas():
            fecha = fecha_limite_de(solicitud)
            cliente = solicitud.cliente
            if fecha is None or not cliente or cliente.estado != EstadoUsuario.ACTIVO:
                continue
            if estado_de(solicitud).estado != "esperando_cliente":
                continue
            ultimo = a_colombia(solicitud.ultimo_recordatorio_en).date() if solicitud.ultimo_recordatorio_en else None
            dias = (fecha - hoy).days
            previo = 0 <= dias <= DIAS_AVISO_PREVIO and (ultimo is None or ultimo < fecha - timedelta(days=DIAS_AVISO_PREVIO))
            vencida = dias < 0 and (ultimo is None or ultimo <= fecha)
            if not (previo or vencida):
                continue
            try:
                self._enviar_recordatorio(solicitud, solicitud.proceso.abogado)
                self._db.commit()
                enviados.append(solicitud.id)
            except Exception:
                self._db.rollback()
                logger.exception("No se pudo enviar el recordatorio automático de la solicitud %s.", solicitud.id)
        return RecordatoriosEnviados(enviados=len(enviados), solicitudes=enviados)
