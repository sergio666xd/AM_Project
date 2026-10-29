from datetime import datetime

from sqlalchemy import ColumnElement, and_, case, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app import models
from app.modulos.identidad.modelos import RolUsuario, Usuario

ABIERTAS = (models.EstadoTarea.PENDIENTE, models.EstadoTarea.EN_CURSO)


class RepositorioSistema:
    def __init__(self, db: Session):
        self._db = db

    # ---- Actividad y auditoría -------------------------------------------------

    def registros(self, condicion: ColumnElement[bool], *, despues: tuple[datetime, int] | None, limite: int):
        A = models.EventoAuditoria
        consulta = select(A, Usuario.nombre_completo).outerjoin(Usuario, Usuario.id == A.actor_id).where(condicion)
        if despues:
            consulta = consulta.where(or_(A.created_at < despues[0], and_(A.created_at == despues[0], A.id < despues[1])))
        return self._db.execute(consulta.order_by(A.created_at.desc(), A.id.desc()).limit(limite)).all()

    def contar_registros(self, condicion: ColumnElement[bool]) -> int:
        A = models.EventoAuditoria
        return self._db.scalar(
            select(func.count()).select_from(A).outerjoin(Usuario, Usuario.id == A.actor_id).where(condicion)
        ) or 0

    def registro(self, registro_id: int):
        A = models.EventoAuditoria
        return self._db.execute(
            select(A, Usuario.nombre_completo).outerjoin(Usuario, Usuario.id == A.actor_id).where(A.id == registro_id)
        ).first()

    # ---- Carga de trabajo --------------------------------------------------------

    def procesos_por_responsable(self) -> dict[int, int]:
        P = models.Proceso
        filas = self._db.execute(select(P.abogado_id, func.count()).where(P.archivado_en.is_(None)).group_by(P.abogado_id))
        return {responsable: cantidad for responsable, cantidad in filas}

    def tareas_por_responsable(self, ahora: datetime, en_7_dias: datetime) -> dict[int, tuple[int, int, int]]:
        """(abiertas, vencidas, próximas 7 días) por persona asignada."""
        T = models.Tarea
        vencida = and_(T.fecha_limite.is_not(None), T.fecha_limite < ahora)
        proxima = and_(T.fecha_limite >= ahora, T.fecha_limite <= en_7_dias)
        filas = self._db.execute(
            select(
                T.usuario_id, func.count(),
                func.sum(case((vencida, 1), else_=0)), func.sum(case((proxima, 1), else_=0)),
            ).where(T.estado.in_(ABIERTAS)).group_by(T.usuario_id)
        )
        return {persona: (abiertas, int(vencidas or 0), int(proximas or 0)) for persona, abiertas, vencidas, proximas in filas}

    def personas_de_carga(self, ids: set[int]) -> list[Usuario]:
        """El equipo activo, más cualquiera que tenga trabajo a su nombre."""
        equipo = Usuario.rol.in_((RolUsuario.ABOGADO, RolUsuario.ABOGADO_ADMIN))
        activa = Usuario.estado == models.EstadoUsuario.ACTIVO
        condicion = or_(and_(equipo, activa), Usuario.id.in_(ids)) if ids else and_(equipo, activa)
        return list(self._db.scalars(select(Usuario).where(condicion, Usuario.rol != RolUsuario.CLIENTE)))

    # ---- Datos de la firma ---------------------------------------------------------

    def configuracion_firma(self, *, bloquear: bool = False) -> models.ConfiguracionFirma:
        consulta = select(models.ConfiguracionFirma).where(models.ConfiguracionFirma.id == 1)
        if bloquear:
            consulta = consulta.with_for_update()
        configuracion = self._db.scalars(consulta).first()
        if configuracion is None:
            configuracion = models.ConfiguracionFirma(id=1)
            self._db.add(configuracion)
            self._db.flush()
        return configuracion

    def nombre(self, usuario_id: int | None) -> str | None:
        if usuario_id is None:
            return None
        return self._db.scalar(select(Usuario.nombre_completo).where(Usuario.id == usuario_id))

    # ---- Almacenamiento --------------------------------------------------------------

    def documentos_por_ruta(self, claves: list[str]) -> list[models.DocumentoProceso]:
        if not claves:
            return []
        D = models.DocumentoProceso
        return list(self._db.scalars(
            select(D).where(D.ruta_archivo.in_(claves)).options(selectinload(D.proceso))
        ))

    def rutas_vinculadas(self, claves: list[str]) -> set[str]:
        vinculadas: set[str] = set()
        D = models.DocumentoProceso
        for inicio in range(0, len(claves), 500):
            lote = claves[inicio:inicio + 500]
            vinculadas.update(self._db.scalars(select(D.ruta_archivo).where(D.ruta_archivo.in_(lote))))
        return vinculadas

    # ---- Limpieza de chats -------------------------------------------------------------

    def chats(self, *, despues: tuple[datetime, int] | None, limite: int):
        """Conversaciones con cantidad de mensajes y último mensaje, sin leer ningún contenido."""
        C, M = models.ChatConversacion, models.ChatMensaje
        estadisticas = (
            select(M.conversacion_id.label("id"), func.count(M.id).label("mensajes"), func.max(M.created_at).label("ultimo"))
            .group_by(M.conversacion_id).subquery()
        )
        orden = func.coalesce(estadisticas.c.ultimo, C.updated_at)
        consulta = (
            select(C, func.coalesce(estadisticas.c.mensajes, 0), estadisticas.c.ultimo, orden.label("orden"))
            .outerjoin(estadisticas, estadisticas.c.id == C.id)
            .options(selectinload(C.proceso), selectinload(C.participantes).selectinload(models.ChatParticipante.usuario))
        )
        if despues:
            consulta = consulta.where(or_(orden < despues[0], and_(orden == despues[0], C.id < despues[1])))
        return self._db.execute(consulta.order_by(orden.desc(), C.id.desc()).limit(limite)).all()

    def contar_chats(self) -> int:
        return self._db.scalar(select(func.count()).select_from(models.ChatConversacion)) or 0

    def chat(self, chat_id: int, *, bloquear: bool = False) -> models.ChatConversacion | None:
        consulta = select(models.ChatConversacion).where(models.ChatConversacion.id == chat_id)
        if bloquear:
            consulta = consulta.with_for_update()
        return self._db.scalars(consulta).first()
