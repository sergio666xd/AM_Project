from datetime import datetime

from sqlalchemy import ColumnElement, and_, func, or_, select
from sqlalchemy.orm import Session

from app import models
from app.modulos.identidad.modelos import EstadoUsuario, RolUsuario, Usuario

ROLES_EQUIPO = (RolUsuario.ABOGADO_ADMIN, RolUsuario.ABOGADO)
ESTADOS_TAREA_ABIERTA = (models.EstadoTarea.PENDIENTE, models.EstadoTarea.EN_CURSO)
SIN_REVISAR = ("RECIBIDO", "EN_REVISION")
# Acciones que no cuentan como actividad en el resumen: se repiten mucho y no cambian nada.
ACCIONES_SILENCIOSAS = ("documento.descargar", "contrato.firmado.descargar", "admin.alerta.descartar", "admin.alerta.restaurar")


class RepositorioAdministracion:
    def __init__(self, db: Session):
        self._db = db

    # ---- Alertas ------------------------------------------------------------

    def consultas_fallidas(self) -> list[tuple[models.ConsultaRadicado, str, str | None]]:
        """La consulta más reciente de cada radicado de un proceso activo, si falló."""
        C, R, P, PR = models.ConsultaRadicado, models.Radicado, models.Proceso, models.ProcesoRadicado
        ultimas = select(func.max(C.id)).group_by(C.radicado_id)
        proceso = (
            select(P.nombre).join(PR, PR.proceso_id == P.id)
            .where(PR.radicado_id == R.id, P.archivado_en.is_(None)).order_by(P.id).limit(1).scalar_subquery()
        )
        filas = self._db.execute(
            select(C, R.numero, proceso).join(R, R.id == C.radicado_id)
            .where(C.id.in_(ultimas), C.estado == "ERROR").order_by(C.id.desc())
        ).all()
        return [(consulta, numero, nombre) for consulta, numero, nombre in filas if nombre]

    def entregas_fallidas(self, desde: datetime) -> list[tuple[str, int, int, str | None, datetime]]:
        """Por canal: cuántas no se entregaron tras los reintentos, la última y su error."""
        E = models.EntregaNotificacion
        condicion = and_(E.estado == "ERROR", E.intentos >= 3, E.created_at >= desde)
        resultado = []
        for canal, total, ultima_id in self._db.execute(
            select(E.canal, func.count(), func.max(E.id)).where(condicion).group_by(E.canal)
        ).all():
            ultima = self._db.get(E, ultima_id)
            resultado.append((canal, total, ultima_id, ultima.error if ultima else None, ultima.created_at if ultima else desde))
        return resultado

    def solicitudes_perfil(self) -> list[tuple[models.SolicitudEdicionPerfilCliente, str]]:
        S = models.SolicitudEdicionPerfilCliente
        return [
            (solicitud, nombre)
            for solicitud, nombre in self._db.execute(
                select(S, Usuario.nombre_completo).join(Usuario, Usuario.id == S.cliente_id)
                .where(S.estado == "PENDIENTE").order_by(S.solicitada_en.desc())
            ).all()
        ]

    def sin_ingreso(self, creados_antes_de: datetime) -> list[Usuario]:
        return list(self._db.scalars(
            select(Usuario).where(
                Usuario.rol != RolUsuario.ADMIN, Usuario.estado == EstadoUsuario.ACTIVO,
                Usuario.debe_cambiar_password.is_(True), Usuario.created_at < creados_antes_de,
            ).order_by(Usuario.id)
        ))

    def disposiciones(self) -> dict[str, str]:
        """La última decisión sobre cada alerta: descartada, atendida (API v1) o vuelta a mostrar."""
        A = models.EventoAuditoria
        filas = self._db.execute(
            select(A.recurso_id, A.accion).where(A.tipo_recurso == "alerta", A.recurso_id.is_not(None)).order_by(A.id.desc())
        ).all()
        decisiones: dict[str, str] = {}
        for recurso_id, accion in filas:
            decisiones.setdefault(recurso_id, accion)
        return decisiones

    # ---- Cifras de la firma -------------------------------------------------

    def procesos_activos(self) -> int:
        return self._db.scalar(select(func.count()).select_from(models.Proceso).where(models.Proceso.archivado_en.is_(None))) or 0

    def tareas_vencidas(self, ahora: datetime) -> int:
        T, P = models.Tarea, models.Proceso
        return self._db.scalar(
            select(func.count()).select_from(T).outerjoin(P, P.id == T.proceso_id).where(
                T.estado.in_(ESTADOS_TAREA_ABIERTA), T.fecha_limite.is_not(None), T.fecha_limite < ahora,
                or_(T.proceso_id.is_(None), P.archivado_en.is_(None)),
            )
        ) or 0

    def documentos_por_revisar(self) -> int:
        D, P = models.DocumentoProceso, models.Proceso
        return self._db.scalar(
            select(func.count()).select_from(D).join(P, P.id == D.proceso_id).where(
                D.solicitud_id.is_not(None), D.estado_revision.in_(SIN_REVISAR), P.archivado_en.is_(None),
            )
        ) or 0

    # ---- Actividad ----------------------------------------------------------

    def actividad(self, *, actor_id: int | None = None, limite: int = 12) -> list[tuple[models.EventoAuditoria, str | None]]:
        A = models.EventoAuditoria
        consulta = select(A, Usuario.nombre_completo).outerjoin(Usuario, Usuario.id == A.actor_id)
        if actor_id is None:
            consulta = consulta.where(A.accion.not_in(ACCIONES_SILENCIOSAS))
        else:
            consulta = consulta.where(A.actor_id == actor_id)
        return [(evento, nombre) for evento, nombre in self._db.execute(consulta.order_by(A.created_at.desc(), A.id.desc()).limit(limite)).all()]

    # ---- Usuarios -----------------------------------------------------------

    def usuario(self, usuario_id: int, *, bloquear: bool = False) -> Usuario | None:
        consulta = select(Usuario).where(Usuario.id == usuario_id)
        if bloquear:
            consulta = consulta.with_for_update()
        return self._db.scalars(consulta).first()

    def correo_en_uso(self, email: str) -> bool:
        return self._db.scalar(select(Usuario.id).where(func.lower(Usuario.email) == email.lower())) is not None

    def contar_usuarios(self, condicion: ColumnElement[bool]) -> int:
        return self._db.scalar(select(func.count()).select_from(Usuario).where(condicion)) or 0

    def usuarios(self, condicion: ColumnElement[bool], *, despues: tuple[str, int] | None, limite: int) -> list[Usuario]:
        orden = func.lower(Usuario.nombre_completo)
        consulta = select(Usuario).where(condicion)
        if despues:
            nombre, ultimo_id = despues
            consulta = consulta.where(or_(orden > nombre, and_(orden == nombre, Usuario.id > ultimo_id)))
        return list(self._db.scalars(consulta.order_by(orden, Usuario.id).limit(limite)))

    def nombres(self, ids: set[int]) -> dict[int, str]:
        if not ids:
            return {}
        return dict(self._db.execute(select(Usuario.id, Usuario.nombre_completo).where(Usuario.id.in_(ids))).all())

    def procesos_activos_por_usuario(self, ids: list[int]) -> dict[int, int]:
        """Procesos activos de cada usuario, como responsable, colaborador o cliente."""
        if not ids:
            return {}
        P, PC, PCl = models.Proceso, models.ProcesoColaborador, models.ProcesoCliente
        vinculos = (
            select(P.abogado_id.label("usuario_id"), P.id.label("proceso_id")).where(P.abogado_id.in_(ids), P.archivado_en.is_(None))
            .union(
                select(PC.abogado_id, PC.proceso_id).join(P, P.id == PC.proceso_id).where(PC.abogado_id.in_(ids), P.archivado_en.is_(None)),
                select(PCl.cliente_id, PCl.proceso_id).join(P, P.id == PCl.proceso_id).where(PCl.cliente_id.in_(ids), P.archivado_en.is_(None)),
            )
            .subquery()
        )
        return dict(self._db.execute(select(vinculos.c.usuario_id, func.count()).group_by(vinculos.c.usuario_id)).all())

    def procesos_del_usuario(self, usuario_id: int, limite: int = 50) -> list[tuple[models.Proceso, str, str | None]]:
        P, PC, PCl = models.Proceso, models.ProcesoColaborador, models.ProcesoCliente
        responsable = select(Usuario.nombre_completo).where(Usuario.id == P.abogado_id).scalar_subquery()
        filas: list[tuple[models.Proceso, str, str | None]] = []
        vistos: set[int] = set()
        consultas = (
            ("responsable", select(P, responsable).where(P.abogado_id == usuario_id)),
            ("colaborador", select(P, responsable).join(PC, PC.proceso_id == P.id).where(PC.abogado_id == usuario_id)),
            ("cliente", select(P, responsable).join(PCl, PCl.proceso_id == P.id).where(PCl.cliente_id == usuario_id)),
        )
        for papel, consulta in consultas:
            for proceso, nombre in self._db.execute(consulta.order_by(P.archivado_en.is_not(None), P.id.desc()).limit(limite)).all():
                if proceso.id not in vistos:
                    vistos.add(proceso.id)
                    filas.append((proceso, papel, nombre))
        return filas[:limite]

    def tareas_abiertas(self, usuario_id: int) -> int:
        T = models.Tarea
        return self._db.scalar(
            select(func.count()).select_from(T).where(or_(T.usuario_id == usuario_id, T.cliente_id == usuario_id), T.estado.in_(ESTADOS_TAREA_ABIERTA))
        ) or 0

    def documentos(self, usuario_id: int) -> int:
        D, P = models.DocumentoProceso, models.Proceso
        propios = select(P.id).where(P.abogado_id == usuario_id)
        return self._db.scalar(
            select(func.count()).select_from(D).where(or_(D.cliente_id == usuario_id, D.proceso_id.in_(propios)))
        ) or 0

    def cuentas_cobro(self, usuario_id: int) -> int:
        C = models.CuentaCobro
        return self._db.scalar(select(func.count()).select_from(C).where(or_(C.cliente_id == usuario_id, C.abogado_id == usuario_id))) or 0

    def tiene_informacion(self, usuario_id: int) -> bool:
        """Si la cuenta ya tiene algo de la firma asociado (procesos, tareas, documentos, cobros, contratos...)."""
        m = models
        sondas = (
            select(m.Proceso.id).where(m.Proceso.abogado_id == usuario_id),
            select(m.ProcesoColaborador.proceso_id).where(m.ProcesoColaborador.abogado_id == usuario_id),
            select(m.ProcesoCliente.proceso_id).where(m.ProcesoCliente.cliente_id == usuario_id),
            select(m.Tarea.id).where(or_(m.Tarea.usuario_id == usuario_id, m.Tarea.cliente_id == usuario_id)),
            select(m.DocumentoProceso.id).where(m.DocumentoProceso.cliente_id == usuario_id),
            select(m.SolicitudDocumento.id).where(m.SolicitudDocumento.cliente_id == usuario_id),
            select(m.CuentaCobro.id).where(or_(m.CuentaCobro.cliente_id == usuario_id, m.CuentaCobro.abogado_id == usuario_id)),
            select(m.PagoFinanciero.id).where(or_(m.PagoFinanciero.cliente_id == usuario_id, m.PagoFinanciero.abogado_id == usuario_id)),
            select(m.ContratoServicio.id).where(or_(m.ContratoServicio.cliente_id == usuario_id, m.ContratoServicio.abogado_id == usuario_id)),
            select(m.ChatMensaje.id).where(m.ChatMensaje.remitente_id == usuario_id),
            select(m.Radicado.id).where(m.Radicado.creado_por_id == usuario_id),
            select(Usuario.id).where(Usuario.creado_por_abogado_id == usuario_id),
        )
        return any(self._db.scalar(sonda.limit(1)) is not None for sonda in sondas)
