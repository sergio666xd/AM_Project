"""Consultas de los folios y de los registros que se folian.

Foliar necesita poco de cada registro (proceso, tipo, id, fecha y si llega
sin revisar), así que esas consultas traen solo columnas. El contenido que se
muestra (título, autor, archivo) se carga después, solo para los folios de la
página pedida.
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, time, timezone

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app import models
from app.nucleo.zona_horaria import a_colombia
from app.timezone import COLOMBIA

# Orden de desempate cuando varios registros tienen la misma fecha.
ORDEN_TIPOS = ("actuacion", "solicitud", "documento", "contrato", "evento", "tarea", "aviso", "comunicacion", "mensaje")

GRUPOS = {
    "actuaciones": ("actuacion",),
    "documentos": ("documento", "solicitud", "contrato"),
    "mensajes": ("mensaje", "comunicacion", "aviso"),
    "tareas": ("tarea", "evento"),
}


@dataclass(frozen=True)
class Registro:
    proceso_id: int
    tipo: str
    origen_id: int
    fecha: datetime
    # Lo que llega de fuera (Rama Judicial, el cliente) entra sin revisar.
    externo: bool


@dataclass
class Contenido:
    titulo: str
    detalle: str | None = None
    autor: str | None = None
    estado: str | None = None
    archivo: tuple[str, str] | None = None
    con_hora: bool = True


def fecha_actuacion(*valores: str | None) -> datetime | None:
    """Las actuaciones traen el día como texto; se guarda como medianoche de Bogotá en UTC."""
    for valor in valores:
        if not valor:
            continue
        try:
            dia = datetime.fromisoformat(valor.strip()[:10]).date()
        except ValueError:
            continue
        return datetime.combine(dia, time(), COLOMBIA).astimezone(timezone.utc).replace(tzinfo=None)
    return None


def _ingenua(valor: datetime) -> datetime:
    if valor.tzinfo is not None:
        return valor.astimezone(timezone.utc).replace(tzinfo=None)
    return valor


class RepositorioFolios:
    def __init__(self, db: Session):
        self._db = db

    # --- Registros de origen -------------------------------------------------

    def registros(self, proceso_ids: list[int]) -> list[Registro]:
        if not proceso_ids:
            return []
        db = self._db
        salida: list[Registro] = []

        filas = db.execute(
            select(models.ProcesoRadicado.proceso_id, models.Actuacion.id, models.Actuacion.fecha_actuacion,
                   models.Actuacion.fecha_registro)
            .join(models.Actuacion, models.Actuacion.radicado_id == models.ProcesoRadicado.radicado_id)
            .where(models.ProcesoRadicado.proceso_id.in_(proceso_ids))
        ).all()
        for proceso_id, origen_id, fecha_act, fecha_reg in filas:
            fecha = fecha_actuacion(fecha_act, fecha_reg) or datetime(1900, 1, 1)
            salida.append(Registro(proceso_id, "actuacion", origen_id, fecha, True))

        D = models.DocumentoProceso
        for proceso_id, origen_id, fecha, solicitud_id in db.execute(
            select(D.proceso_id, D.id, D.created_at, D.solicitud_id).where(D.proceso_id.in_(proceso_ids))
        ):
            # Lo que responde a una solicitud lo subió el cliente.
            salida.append(Registro(proceso_id, "documento", origen_id, fecha, solicitud_id is not None))

        S = models.SolicitudDocumento
        for proceso_id, origen_id, fecha in db.execute(
            select(S.proceso_id, S.id, S.created_at).where(S.proceso_id.in_(proceso_ids))
        ):
            salida.append(Registro(proceso_id, "solicitud", origen_id, fecha, False))

        C = models.ContratoServicio
        for proceso_id, origen_id, fecha in db.execute(
            select(C.proceso_id, C.id, C.created_at).where(C.proceso_id.in_(proceso_ids))
        ):
            salida.append(Registro(proceso_id, "contrato", origen_id, fecha, False))

        T = models.Tarea
        for proceso_id, origen_id, fecha in db.execute(
            select(T.proceso_id, T.id, T.created_at).where(T.proceso_id.in_(proceso_ids))
        ):
            salida.append(Registro(proceso_id, "tarea", origen_id, fecha, False))

        E = models.EventoAgenda
        for proceso_id, origen_id, fecha in db.execute(
            select(E.proceso_id, E.id, E.created_at).where(E.proceso_id.in_(proceso_ids))
        ):
            salida.append(Registro(proceso_id, "evento", origen_id, fecha, False))

        N = models.NotificacionProceso
        for proceso_id, origen_id, fecha in db.execute(
            select(N.proceso_id, N.id, N.created_at).where(N.proceso_id.in_(proceso_ids))
        ):
            salida.append(Registro(proceso_id, "aviso", origen_id, fecha, False))

        K = models.ComunicacionProceso
        for proceso_id, origen_id, fecha in db.execute(
            select(K.proceso_id, K.id, K.created_at).where(K.proceso_id.in_(proceso_ids))
        ):
            salida.append(Registro(proceso_id, "comunicacion", origen_id, fecha, False))

        M, V, U = models.ChatMensaje, models.ChatConversacion, models.Usuario
        for proceso_id, origen_id, fecha, rol in db.execute(
            select(V.proceso_id, M.id, M.created_at, U.rol)
            .join(V, V.id == M.conversacion_id)
            .outerjoin(U, U.id == M.remitente_id)
            .where(V.proceso_id.in_(proceso_ids))
        ):
            externo = getattr(rol, "value", rol) == models.RolUsuario.CLIENTE.value
            salida.append(Registro(proceso_id, "mensaje", origen_id, fecha, externo))

        return [r if r.fecha.tzinfo is None else Registro(r.proceso_id, r.tipo, r.origen_id, _ingenua(r.fecha), r.externo)
                for r in salida]

    # --- Folios --------------------------------------------------------------

    def estado_foliacion(self, proceso_ids: list[int]) -> dict[int, tuple[int, set[tuple[str, int]]]]:
        """Por proceso: el último número asignado y las claves (tipo, origen) ya foliadas."""
        estado: dict[int, tuple[int, set[tuple[str, int]]]] = {}
        claves: dict[int, set[tuple[str, int]]] = defaultdict(set)
        ultimos: dict[int, int] = defaultdict(int)
        F = models.FolioExpediente
        for proceso_id, numero, tipo, origen_id in self._db.execute(
            select(F.proceso_id, F.numero, F.tipo, F.origen_id).where(F.proceso_id.in_(proceso_ids))
        ):
            claves[proceso_id].add((tipo, origen_id))
            ultimos[proceso_id] = max(ultimos[proceso_id], numero)
        for proceso_id in proceso_ids:
            estado[proceso_id] = (ultimos[proceso_id], claves[proceso_id])
        return estado

    def sin_foliar(self, proceso_ids: list[int]) -> set[int]:
        P = models.Proceso
        return set(self._db.scalars(select(P.id).where(P.id.in_(proceso_ids), P.foliado_en.is_(None))))

    def marcar_foliados(self, proceso_ids: set[int], ahora: datetime) -> None:
        if proceso_ids:
            P = models.Proceso
            self._db.execute(
                update(P).where(P.id.in_(proceso_ids), P.foliado_en.is_(None))
                .values(foliado_en=ahora).execution_options(synchronize_session=False)
            )

    def agregar(self, folios: list[models.FolioExpediente]) -> None:
        self._db.add_all(folios)

    def listar(self, proceso_id: int, tipos: tuple[str, ...] | None, *, descendente: bool,
               desde: int | None, limite: int) -> list[models.FolioExpediente]:
        F = models.FolioExpediente
        consulta = select(F).where(F.proceso_id == proceso_id)
        if tipos:
            consulta = consulta.where(F.tipo.in_(tipos))
        if desde is not None:
            consulta = consulta.where(F.numero <= desde if descendente else F.numero >= desde)
        consulta = consulta.order_by(F.numero.desc() if descendente else F.numero.asc()).limit(limite)
        return list(self._db.scalars(consulta))

    def contar(self, proceso_id: int, tipos: tuple[str, ...] | None = None, *, solo_nuevos: bool = False) -> int:
        F = models.FolioExpediente
        consulta = select(func.count()).select_from(F).where(F.proceso_id == proceso_id)
        if tipos:
            consulta = consulta.where(F.tipo.in_(tipos))
        if solo_nuevos:
            consulta = consulta.where(F.revisado_en.is_(None))
        return self._db.scalar(consulta) or 0

    def ultimo(self, proceso_id: int) -> int:
        F = models.FolioExpediente
        return self._db.scalar(select(func.max(F.numero)).where(F.proceso_id == proceso_id)) or 0

    def nuevos(self, proceso_ids: list[int], limite: int) -> tuple[list[models.FolioExpediente], int]:
        F = models.FolioExpediente
        condicion = (F.proceso_id.in_(proceso_ids)) & (F.revisado_en.is_(None))
        total = self._db.scalar(select(func.count()).select_from(F).where(condicion)) or 0
        filas = self._db.scalars(select(F).where(condicion).order_by(F.fecha.desc(), F.id.desc()).limit(limite))
        return list(filas), total

    def marcar_revisados(self, proceso_id: int, numeros: list[int] | None, usuario_id: int, ahora: datetime) -> int:
        F = models.FolioExpediente
        consulta = update(F).where(F.proceso_id == proceso_id, F.revisado_en.is_(None))
        if numeros is not None:
            consulta = consulta.where(F.numero.in_(numeros))
        resultado = self._db.execute(
            consulta.values(revisado_en=ahora, revisado_por_id=usuario_id).execution_options(synchronize_session=False)
        )
        return resultado.rowcount or 0

    # --- Contenido para mostrar ----------------------------------------------

    def contenidos(self, folios: list[models.FolioExpediente]) -> dict[tuple[str, int], Contenido]:
        por_tipo: dict[str, list[int]] = defaultdict(list)
        for folio in folios:
            por_tipo[folio.tipo].append(folio.origen_id)
        salida: dict[tuple[str, int], Contenido] = {}
        for tipo, ids in por_tipo.items():
            constructor = getattr(self, f"_contenido_{tipo}", None)
            if constructor:
                for origen_id, contenido in constructor(ids).items():
                    salida[(tipo, origen_id)] = contenido
        return salida

    def _nombres(self, ids: set[int | None]) -> dict[int, str]:
        ids = {i for i in ids if i}
        if not ids:
            return {}
        U = models.Usuario
        return dict(self._db.execute(select(U.id, U.nombre_completo).where(U.id.in_(ids))).all())

    def _contenido_actuacion(self, ids: list[int]) -> dict[int, Contenido]:
        A = models.Actuacion
        salida = {}
        for actuacion in self._db.scalars(select(A).where(A.id.in_(ids))):
            salida[actuacion.id] = Contenido(
                titulo=(actuacion.actuacion or "Actuación judicial").strip(),
                detalle=(actuacion.anotacion or "").strip() or None,
                autor="Rama Judicial",
                con_hora=False,
            )
        return salida

    def _contenido_documento(self, ids: list[int]) -> dict[int, Contenido]:
        D = models.DocumentoProceso
        documentos = list(self._db.scalars(select(D).where(D.id.in_(ids))))
        nombres = self._nombres({d.cliente_id for d in documentos if d.solicitud_id} | {d.revisado_por_id for d in documentos})
        estados = {"EN_REVISION": "en revisión", "APROBADO": "aprobado", "REQUIERE_CORRECCION": "requiere corrección", "RECHAZADO": "rechazado"}
        salida = {}
        for documento in documentos:
            entregado = documento.solicitud_id is not None
            salida[documento.id] = Contenido(
                titulo=documento.nombre_archivo,
                detalle="Entregado por el cliente desde el portal." if entregado else "Incorporado al expediente por la firma.",
                autor=nombres.get(documento.cliente_id) if entregado else None,
                estado=estados.get(documento.estado_revision),
                archivo=(documento.nombre_archivo, f"/api/expedientes/documentos/{documento.id}/archivo"),
            )
        return salida

    def _contenido_solicitud(self, ids: list[int]) -> dict[int, Contenido]:
        S = models.SolicitudDocumento
        solicitudes = list(self._db.scalars(select(S).where(S.id.in_(ids))))
        nombres = self._nombres({s.cliente_id for s in solicitudes})
        salida = {}
        for solicitud in solicitudes:
            pedidos = [str(item.get("nombre") or "").strip() for item in (solicitud.documentos_requeridos or []) if isinstance(item, dict)]
            pedidos = [nombre for nombre in pedidos if nombre]
            detalle = f"Se pidió a {nombres.get(solicitud.cliente_id, 'el cliente')}: {', '.join(pedidos)}." if pedidos else solicitud.instrucciones
            salida[solicitud.id] = Contenido(
                titulo=f"Solicitud de documentos: {solicitud.titulo}",
                detalle=detalle,
                estado="atendida" if solicitud.atendida_en else "pendiente",
            )
        return salida

    def _contenido_contrato(self, ids: list[int]) -> dict[int, Contenido]:
        C = models.ContratoServicio
        estados = {"BORRADOR": "borrador", "LISTO_PARA_FIRMA": "listo para firma", "EN_FIRMA": "en firma",
                   "FIRMADO": "firmado", "TERMINADO": "terminado", "ANULADO": "anulado"}
        salida = {}
        for contrato in self._db.scalars(select(C).where(C.id.in_(ids))):
            salida[contrato.id] = Contenido(
                titulo="Contrato de prestación de servicios",
                detalle=f"Versión {contrato.version_actual}.",
                estado=estados.get(contrato.estado, contrato.estado.lower()),
            )
        return salida

    def _contenido_tarea(self, ids: list[int]) -> dict[int, Contenido]:
        T = models.Tarea
        tareas = list(self._db.scalars(select(T).where(T.id.in_(ids))))
        nombres = self._nombres({t.usuario_id for t in tareas} | {t.cliente_id for t in tareas})
        estados = {"PENDIENTE": "pendiente", "EN_CURSO": "en curso", "COMPLETADA": "completada", "CANCELADA": "cancelada"}
        salida = {}
        for tarea in tareas:
            partes = []
            if tarea.cliente_id:
                partes.append(f"Asignada a {nombres.get(tarea.cliente_id, 'el cliente')}.")
            if tarea.fecha_limite:
                partes.append(f"Vence el {a_colombia(tarea.fecha_limite).strftime('%d/%m/%Y')}.")
            salida[tarea.id] = Contenido(
                titulo=tarea.titulo,
                detalle=" ".join(partes) or (tarea.descripcion or None),
                autor=nombres.get(tarea.usuario_id),
                estado=estados.get(getattr(tarea.estado, "value", tarea.estado)),
            )
        return salida

    def _contenido_evento(self, ids: list[int]) -> dict[int, Contenido]:
        E = models.EventoAgenda
        eventos = list(self._db.scalars(select(E).where(E.id.in_(ids))))
        nombres = self._nombres({e.creado_por_id for e in eventos})
        tipos = {"AUDIENCIA": "Audiencia", "REUNION": "Reunión", "FIRMA_CONTRATO": "Firma de contrato", "EVENTO": "Evento"}
        salida = {}
        for evento in eventos:
            cuando = a_colombia(evento.fecha_inicio)
            salida[evento.id] = Contenido(
                titulo=evento.titulo,
                detalle=f"{tipos.get(evento.tipo, 'Evento')} el {cuando.strftime('%d/%m/%Y')} a las {cuando.strftime('%H:%M')}.",
                autor=nombres.get(evento.creado_por_id),
                estado="cancelado" if evento.estado == "CANCELADO" else None,
            )
        return salida

    def _contenido_aviso(self, ids: list[int]) -> dict[int, Contenido]:
        N = models.NotificacionProceso
        avisos = list(self._db.scalars(select(N).where(N.id.in_(ids))))
        nombres = self._nombres({a.abogado_id for a in avisos})
        return {
            aviso.id: Contenido(titulo=aviso.asunto, detalle=aviso.comentarios or aviso.cuerpo, autor=nombres.get(aviso.abogado_id))
            for aviso in avisos
        }

    def _contenido_comunicacion(self, ids: list[int]) -> dict[int, Contenido]:
        K = models.ComunicacionProceso
        comunicaciones = list(self._db.scalars(select(K).where(K.id.in_(ids))))
        nombres = self._nombres({c.actor_id for c in comunicaciones})
        return {
            c.id: Contenido(
                titulo=c.asunto,
                detalle=c.contenido,
                autor=nombres.get(c.actor_id),
                estado="nota interna" if c.visibilidad == "INTERNA" else None,
            )
            for c in comunicaciones
        }

    def _contenido_mensaje(self, ids: list[int]) -> dict[int, Contenido]:
        M = models.ChatMensaje
        mensajes = list(self._db.scalars(select(M).where(M.id.in_(ids))))
        nombres = self._nombres({m.remitente_id for m in mensajes})
        salida = {}
        for mensaje in mensajes:
            autor = nombres.get(mensaje.remitente_id)
            salida[mensaje.id] = Contenido(
                titulo=f"Mensaje de {autor}" if autor else "Mensaje",
                detalle=f"«{mensaje.contenido.strip()}»" if mensaje.contenido else None,
                autor=autor,
            )
        return salida
