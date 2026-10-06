import enum
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Index, Integer, JSON, String, Table, Text, UniqueConstraint, event, select
from sqlalchemy.orm import relationship, synonym
from app.database import Base


radicados_usuarios = Table(
    "radicados_usuarios",
    Base.metadata,
    Column("usuario_id", Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True),
    Column("radicado_id", Integer, ForeignKey("radicados.id", ondelete="CASCADE"), primary_key=True),
)


TIPOS_NOTIFICACION = (
    "ACCESO",
    "ACTUACIONES",
    "TAREAS",
    "SUBTAREAS",
    "RECORDATORIOS",
    "DOCUMENTOS",
    "RESUMENES",
)


def preferencias_notificacion_por_defecto() -> dict:
    return {
        tipo: {"email": True, "whatsapp": False}
        for tipo in TIPOS_NOTIFICACION
    }


class EstadoUsuario(str, enum.Enum):
    PENDIENTE_APROBACION = "PENDIENTE_APROBACION"
    ACTIVO = "ACTIVO"
    SUSPENDIDO = "SUSPENDIDO"
    RECHAZADO = "RECHAZADO"


class RolUsuario(str, enum.Enum):
    ABOGADO = "ABOGADO"
    ABOGADO_ADMIN = "ABOGADO_ADMIN"
    CLIENTE = "CLIENTE"
    ADMIN = "ADMIN"


class Plan(Base):
    __tablename__ = "planes"

    id = Column(Integer, primary_key=True)
    nombre = Column(String, nullable=False)
    limite_radicados = Column(Integer, nullable=False)
    precio_mensual = Column(Integer, nullable=False)
    activo = Column(Boolean, nullable=False, default=True)
    # NULL significa que el plan puede consultar y conservar todo el historial.
    limite_ultimas_actuaciones = Column(Integer, nullable=True, default=5)
    notificaciones_whatsapp_procesos = Column(Boolean, nullable=False, default=False)
    notificaciones_whatsapp_tareas = Column(Boolean, nullable=False, default=False)

    users = relationship("Usuario", back_populates="plan")


class ConfiguracionSaas(Base):
    """Configuración global de la comercialización del SaaS (registro único)."""
    __tablename__ = "configuracion_saas"

    id = Column(Integer, primary_key=True, default=1)
    mostrar_planes = Column(Boolean, nullable=False, default=False)


class ConfiguracionIntegraciones(Base):
    """Credenciales globales SMTP y WhatsApp cifradas en la base de datos."""
    __tablename__ = "configuracion_integraciones"

    id = Column(Integer, primary_key=True, default=1)
    smtp_host = Column(String(255), nullable=True)
    smtp_port = Column(Integer, nullable=True)
    smtp_from = Column(String(320), nullable=True)
    smtp_starttls = Column(Boolean, nullable=True)
    smtp_user = Column(String(320), nullable=True)
    smtp_password_encrypted = Column(Text, nullable=True)
    whatsapp_api_url_encrypted = Column(Text, nullable=True)
    whatsapp_token_encrypted = Column(Text, nullable=True)
    actualizado_por_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ConfiguracionConsultas(Base):
    __tablename__ = "configuracion_consultas"

    id = Column(Integer, primary_key=True, default=1)
    activa = Column(Boolean, nullable=False, default=False)
    dias_habilitados = Column(JSON, nullable=False, default=lambda: [0, 1, 2, 3, 4])
    actualizado_por_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    ejecucion_activa_id = Column(String(36), nullable=True)
    lease_hasta = Column(DateTime, nullable=True)


class EjecucionBarrido(Base):
    __tablename__ = "ejecuciones_barrido"
    __table_args__ = (
        UniqueConstraint("clave_idempotencia", name="uq_ejecuciones_barrido_clave"),
        Index("ix_ejecuciones_barrido_estado_inicio", "estado", "inicio"),
    )

    id = Column(String(36), primary_key=True)
    clave_idempotencia = Column(String(80), nullable=False)
    token_lanzamiento = Column(String(80), nullable=False)
    tipo = Column(String(20), nullable=False)
    estado = Column(String(24), nullable=False, default="EN_PROCESO")
    solicitada_por_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    inicio = Column(DateTime, nullable=False, default=datetime.utcnow)
    finalizacion = Column(DateTime, nullable=True)
    lease_hasta = Column(DateTime, nullable=True)
    total_radicados = Column(Integer, nullable=False, default=0)
    procesados = Column(Integer, nullable=False, default=0)
    errores = Column(Integer, nullable=False, default=0)
    actuaciones_nuevas = Column(Integer, nullable=False, default=0)


class EjecucionRadicado(Base):
    __tablename__ = "ejecuciones_radicados"
    __table_args__ = (
        UniqueConstraint("ejecucion_id", "radicado_id", name="uq_ejecucion_radicado"),
        Index("ix_ejecuciones_radicados_estado", "estado"),
    )

    id = Column(Integer, primary_key=True, index=True)
    ejecucion_id = Column(String(36), ForeignKey("ejecuciones_barrido.id", ondelete="CASCADE"), nullable=False)
    radicado_id = Column(Integer, ForeignKey("radicados.id", ondelete="CASCADE"), nullable=False)
    consulta_id = Column(Integer, ForeignKey("consultas_radicados.id", ondelete="SET NULL"), nullable=True)
    estado = Column(String(24), nullable=False, default="EN_PROCESO")
    inicio = Column(DateTime, nullable=False, default=datetime.utcnow)
    finalizacion = Column(DateTime, nullable=True)
    lease_hasta = Column(DateTime, nullable=True)
    actuaciones_nuevas = Column(Integer, nullable=False, default=0)
    error = Column(Text, nullable=True)


class ContenidoPagina(Base):
    """Structured public-page content edited by platform administrators."""
    __tablename__ = "contenido_paginas"

    slug = Column(String(80), primary_key=True)
    contenido = Column(JSON, nullable=False)
    actualizado_por_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(120), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    nombre_completo = Column(String(150), nullable=False)
    whatsapp_numero = Column(String(20), nullable=False)
    rol = Column(Enum(RolUsuario), default=RolUsuario.ABOGADO, nullable=False)
    estado = Column(Enum(EstadoUsuario), default=EstadoUsuario.PENDIENTE_APROBACION, nullable=False)
    
    plan_id = Column(Integer, ForeignKey("planes.id"), nullable=True)
    creado_por_abogado_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True, index=True)
    debe_cambiar_password = Column(Boolean, nullable=False, default=False)
    notificaciones_email = Column(Boolean, nullable=False, default=True)
    notificaciones_whatsapp = Column(Boolean, nullable=False, default=False)
    preferencias_notificacion = Column(
        JSON,
        nullable=False,
        default=preferencias_notificacion_por_defecto,
    )
    canal_notificacion_cliente = Column(String(16), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    ultimo_acceso = Column(DateTime, nullable=True)

    tareas = relationship(
        "Tarea",
        back_populates="usuario",
        foreign_keys="Tarea.usuario_id",
        cascade="all, delete-orphan",
    )
    plan = relationship("Plan", back_populates="users")
    solicitud_registro = relationship("SolicitudRegistro", back_populates="usuario", uselist=False)
    radicados = relationship(
        "Radicado",
        secondary=radicados_usuarios,
        back_populates="usuarios_vinculados",
    )
    radicados_creados = relationship(
        "Radicado",
        back_populates="creador",
        foreign_keys="Radicado.creado_por_id",
    )
    creado_por_abogado = relationship("Usuario", remote_side=[id], foreign_keys=[creado_por_abogado_id])
    procesos = relationship("Proceso", back_populates="abogado", cascade="all, delete-orphan")


class SolicitudRegistro(Base):
    __tablename__ = "solicitudes_registro"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), unique=True, nullable=False)
    ruta_tarjeta_profesional = Column(String(255), nullable=False)
    notas_admin = Column(Text, nullable=True)
    fecha_solicitud = Column(DateTime, default=datetime.utcnow)

    usuario = relationship("Usuario", back_populates="solicitud_registro")


class SolicitudEdicionPerfilCliente(Base):
    __tablename__ = "solicitudes_edicion_perfil_cliente"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    email_solicitado = Column(String(120), nullable=False)
    nombre_completo_solicitado = Column(String(150), nullable=False)
    whatsapp_numero_solicitado = Column(String(20), nullable=False, default="")
    estado = Column(String(20), nullable=False, default="PENDIENTE", index=True)
    solicitada_en = Column(DateTime, nullable=False, default=datetime.utcnow)
    revisada_por_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    revisada_en = Column(DateTime, nullable=True)
    comentario_revision = Column(Text, nullable=True)

    cliente = relationship("Usuario", foreign_keys=[cliente_id])
    revisada_por = relationship("Usuario", foreign_keys=[revisada_por_id])


class InteresSaas(Base):
    """Contacto que solicita novedades sobre la plataforma SaaS."""
    __tablename__ = "intereses_saas"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(120), unique=True, index=True, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class Radicado(Base):
    __tablename__ = "radicados"
    __table_args__ = (
        Index(
            "uq_radicados_fuente_ambito_numero",
            "fuente",
            "ambito_key",
            "numero_normalizado",
            unique=True,
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    numero = Column(String(23), index=True, nullable=False)
    creado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    usuario_id = synonym("creado_por_id")
    fuente = Column(String(50), nullable=False, default="RAMA_JUDICIAL_COLOMBIA")
    ambito_key = Column(String(64), nullable=False, index=True)
    numero_normalizado = Column(String(23), nullable=False)
    id_proceso_rama = Column(String(64), nullable=True)
    
    estado_consulta = Column(String(50), default="sin consultar")
    despacho_departamento = Column(String(255), default="")
    demandante = Column(String(255), default="")
    demandado = Column(String(255), default="")
    consultado_en = Column(String(50), default="")
    
    alerta_enviada = Column(Boolean, default=True)
    detalle_pendiente = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    tareas = relationship(
    "Tarea",
    back_populates="radicado",
    cascade="all, delete-orphan",
)

    creador = relationship("Usuario", back_populates="radicados_creados", foreign_keys=[creado_por_id])
    usuario = synonym("creador")
    usuarios_vinculados = relationship(
        "Usuario",
        secondary=radicados_usuarios,
        back_populates="radicados",
    )
    actuaciones = relationship(
        "Actuacion",
        back_populates="radicado_rel",
        cascade="all, delete-orphan"
    )
    consultas = relationship(
        "ConsultaRadicado",
        back_populates="radicado",
        cascade="all, delete-orphan"
    )
    procesos = relationship("ProcesoRadicado", back_populates="radicado", cascade="all, delete-orphan")


@event.listens_for(Radicado, "before_insert")
def establecer_identidad_radicado(mapper, connection, radicado: Radicado) -> None:
    radicado.numero_normalizado = "".join(caracter for caracter in radicado.numero if caracter.isdigit())
    role = connection.execute(
        select(Usuario.rol).where(Usuario.id == radicado.creado_por_id)
    ).scalar_one()
    role_name = role.value if hasattr(role, "value") else str(role)
    if role_name == RolUsuario.ABOGADO.value:
        radicado.ambito_key = f"SAAS:{radicado.creado_por_id}"
    elif role_name in (RolUsuario.ABOGADO_ADMIN.value, RolUsuario.ADMIN.value):
        radicado.ambito_key = "FIRMA"
    else:
        raise ValueError("Solo abogados y administradores pueden crear radicados.")


@event.listens_for(Radicado, "after_insert")
def vincular_creador_radicado(mapper, connection, radicado: Radicado) -> None:
    connection.execute(
        radicados_usuarios.insert().values(
            usuario_id=radicado.creado_por_id,
            radicado_id=radicado.id,
        )
    )


class Proceso(Base):
    __tablename__ = "procesos"

    id = Column(Integer, primary_key=True, index=True)
    abogado_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    nombre = Column(String(255), nullable=False)
    descripcion = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    archivado_en = Column(DateTime(timezone=True), nullable=True, index=True)
    abogado = relationship("Usuario", back_populates="procesos", foreign_keys=[abogado_id])
    colaboradores = relationship(
        "ProcesoColaborador",
        back_populates="proceso",
        cascade="all, delete-orphan",
    )
    radicados = relationship("ProcesoRadicado", back_populates="proceso", cascade="all, delete-orphan")
    clientes = relationship("ProcesoCliente", back_populates="proceso", cascade="all, delete-orphan")
    tareas = relationship("Tarea", back_populates="proceso")
    solicitudes_documento = relationship("SolicitudDocumento", back_populates="proceso", cascade="all, delete-orphan")
    documentos = relationship("DocumentoProceso", back_populates="proceso", cascade="all, delete-orphan")


class ProcesoColaborador(Base):
    __tablename__ = "procesos_colaboradores"

    proceso_id = Column(Integer, ForeignKey("procesos.id", ondelete="CASCADE"), primary_key=True)
    abogado_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True)
    asignado_por_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    proceso = relationship("Proceso", back_populates="colaboradores")
    abogado = relationship("Usuario", foreign_keys=[abogado_id])
    asignado_por = relationship("Usuario", foreign_keys=[asignado_por_id])


class ProcesoRadicado(Base):
    __tablename__ = "procesos_radicados"
    proceso_id = Column(Integer, ForeignKey("procesos.id"), primary_key=True)
    radicado_id = Column(Integer, ForeignKey("radicados.id"), primary_key=True)
    proceso = relationship("Proceso", back_populates="radicados")
    radicado = relationship("Radicado", back_populates="procesos")


class ProcesoCliente(Base):
    __tablename__ = "procesos_clientes"
    proceso_id = Column(Integer, ForeignKey("procesos.id"), primary_key=True)
    cliente_id = Column(Integer, ForeignKey("usuarios.id"), primary_key=True)
    proceso = relationship("Proceso", back_populates="clientes")
    cliente = relationship("Usuario", foreign_keys=[cliente_id])


class SolicitudDocumento(Base):
    __tablename__ = "solicitudes_documento"
    id = Column(Integer, primary_key=True, index=True)
    proceso_id = Column(Integer, ForeignKey("procesos.id"), nullable=False, index=True)
    cliente_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    titulo = Column(String(255), nullable=False)
    instrucciones = Column(Text, nullable=True)
    atendida_en = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    proceso = relationship("Proceso", back_populates="solicitudes_documento")
    cliente = relationship("Usuario", foreign_keys=[cliente_id])
    documentos = relationship("DocumentoProceso", back_populates="solicitud")


class DocumentoProceso(Base):
    __tablename__ = "documentos_proceso"
    id = Column(Integer, primary_key=True, index=True)
    proceso_id = Column(Integer, ForeignKey("procesos.id"), nullable=False, index=True)
    cliente_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    solicitud_id = Column(Integer, ForeignKey("solicitudes_documento.id"), nullable=False, index=True)
    nombre_archivo = Column(String(255), nullable=False)
    ruta_archivo = Column(String(500), nullable=False)
    mime_type = Column(String(100), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    proceso = relationship("Proceso", back_populates="documentos")
    cliente = relationship("Usuario", foreign_keys=[cliente_id])
    solicitud = relationship("SolicitudDocumento", back_populates="documentos")


class NotificacionProceso(Base):
    """Registro auditable de avisos de actuaciones enviados por el despacho."""
    __tablename__ = "notificaciones_proceso"

    id = Column(Integer, primary_key=True, index=True)
    abogado_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    proceso_id = Column(Integer, ForeignKey("procesos.id"), nullable=False, index=True)
    cliente_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    actuacion_id = Column(Integer, ForeignKey("actuaciones.id"), nullable=False, index=True)
    comentarios = Column(Text, nullable=True)
    asunto = Column(String(255), nullable=False)
    cuerpo = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class EntregaNotificacion(Base):
    __tablename__ = "entregas_notificacion"
    __table_args__ = (
        UniqueConstraint("clave_idempotencia", name="uq_entrega_notificacion_clave"),
        Index("ix_entrega_notificacion_estado", "estado", "created_at"),
        Index("ix_entrega_notificacion_destinatario", "usuario_id", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    clave_idempotencia = Column(String(200), nullable=False)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False)
    tipo = Column(String(32), nullable=False)
    canal = Column(String(16), nullable=False)
    recordatorio_id = Column(
        Integer,
        ForeignKey("recordatorios_tareas.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    recordatorio_version = Column(Integer, nullable=True)
    asunto = Column(String(255), nullable=False)
    cuerpo = Column(Text, nullable=False)
    estado = Column(String(20), nullable=False, default="PENDIENTE")
    intentos = Column(Integer, nullable=False, default=0)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    enviado_en = Column(DateTime, nullable=True)
    lease_hasta = Column(DateTime, nullable=True)

    actuaciones = relationship(
        "EntregaNotificacionActuacion",
        back_populates="entrega",
        cascade="all, delete-orphan",
    )


class EntregaNotificacionActuacion(Base):
    __tablename__ = "entregas_notificacion_actuaciones"
    __table_args__ = (
        UniqueConstraint(
            "actuacion_id",
            "usuario_id",
            "canal",
            name="uq_entrega_actuacion_usuario_canal",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    entrega_id = Column(
        Integer,
        ForeignKey("entregas_notificacion.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    actuacion_id = Column(
        Integer,
        ForeignKey("actuaciones.id", ondelete="CASCADE"),
        nullable=False,
    )
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False)
    canal = Column(String(16), nullable=False)

    entrega = relationship("EntregaNotificacion", back_populates="actuaciones")


class EventoAuditoria(Base):
    __tablename__ = "eventos_auditoria"

    id = Column(Integer, primary_key=True, index=True)
    actor_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True, index=True)
    accion = Column(String(100), nullable=False, index=True)
    tipo_recurso = Column(String(80), nullable=False)
    recurso_id = Column(String(64), nullable=True)
    endpoint = Column(String(500), nullable=True)
    metodo = Column(String(16), nullable=True)
    metadata_json = Column(Text, nullable=True)
    error_tecnico = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)

class Actuacion(Base):
    __tablename__ = "actuaciones"

    id = Column(Integer, primary_key=True, index=True)
    radicado_id = Column(Integer, ForeignKey("radicados.id"), nullable=False)
    orden = Column(Integer, nullable=False)
    
    fecha_actuacion = Column(String(20), default="")
    actuacion = Column(Text, default="")
    anotacion = Column(Text, default="")
    fecha_inicia_termino = Column(String(20), default="")
    fecha_finaliza_termino = Column(String(20), default="")
    fecha_registro = Column(String(20), default="")
    es_fijacion = Column(Boolean, default=False)

    tareas = relationship(
    "Tarea",
    back_populates="actuacion_rel",
    cascade="all, delete-orphan",
)

    radicado_rel = relationship("Radicado", back_populates="actuaciones")

class ConsultaRadicado(Base):
    __tablename__ = "consultas_radicados"

    id = Column(Integer, primary_key=True, index=True)

    radicado_id = Column(
        Integer,
        ForeignKey("radicados.id"),
        nullable=False,
        index=True
    )

    # MANUAL / AUTOMATICA / AUTOMATICA_NUEVO
    tipo = Column(String(20), nullable=False, default="AUTOMATICA")

    # ENCOLADA / EN_PROCESO / COMPLETADA / ERROR
    estado = Column(
        String(30),
        nullable=False,
        default="ENCOLADA"
    )

    task_id = Column(String(255), nullable=True, index=True)

    inicio = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow
    )

    finalizacion = Column(
        DateTime,
        nullable=True
    )

    # Número de actuaciones nuevas encontradas
    actuaciones_nuevas = Column(
        Integer,
        nullable=False,
        default=0
    )

    # Información adicional del resultado
    detalle = Column(
        Text,
        nullable=True
    )

    # Error técnico, si ocurrió
    error = Column(
        Text,
        nullable=True
    )

    radicado = relationship(
        "Radicado",
        back_populates="consultas"
    )

class EstadoTarea(str, enum.Enum):
    PENDIENTE = "PENDIENTE"
    EN_CURSO = "EN_CURSO"
    COMPLETADA = "COMPLETADA"
    CANCELADA = "CANCELADA"


class PrioridadTarea(str, enum.Enum):
    BAJA = "BAJA"
    MEDIA = "MEDIA"
    ALTA = "ALTA"
    URGENTE = "URGENTE"


class CanalRecordatorio(str, enum.Enum):
    WHATSAPP = "WHATSAPP"


class Tarea(Base):
    __tablename__ = "tareas"

    id = Column(Integer, primary_key=True, index=True)

    usuario_id = Column(
        Integer,
        ForeignKey("usuarios.id"),
        nullable=False,
        index=True,
    )

    # NULL = tarea general
    radicado_id = Column(
        Integer,
        ForeignKey("radicados.id"),
        nullable=True,
        index=True,
    )

    # NULL = tarea general del proceso o tarea general
    actuacion_id = Column(
        Integer,
        ForeignKey("actuaciones.id"),
        nullable=True,
        index=True,
    )
    proceso_id = Column(Integer, ForeignKey("procesos.id"), nullable=True, index=True)
    cliente_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True, index=True)

    titulo = Column(String(255), nullable=False)
    descripcion = Column(Text, nullable=True)

    estado = Column(
        Enum(EstadoTarea),
        nullable=False,
        default=EstadoTarea.PENDIENTE,
        index=True,
    )

    prioridad = Column(
        Enum(PrioridadTarea),
        nullable=False,
        default=PrioridadTarea.MEDIA,
    )

    fecha_limite = Column(
        DateTime,
        nullable=True,
        index=True,
    )

    completada_en = Column(
        DateTime,
        nullable=True,
    )

    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
    )

    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    usuario = relationship(
        "Usuario",
        back_populates="tareas",
        foreign_keys=[usuario_id],
    )

    radicado = relationship(
        "Radicado",
        back_populates="tareas",
    )

    actuacion_rel = relationship(
        "Actuacion",
        back_populates="tareas",
    )
    proceso = relationship("Proceso", back_populates="tareas")
    cliente_asignado = relationship("Usuario", foreign_keys=[cliente_id])

    subtareas = relationship(
        "Subtarea",
        back_populates="tarea",
        cascade="all, delete-orphan",
        order_by="Subtarea.orden",
    )

    recordatorios = relationship(
        "RecordatorioTarea",
        back_populates="tarea",
        cascade="all, delete-orphan",
        order_by="RecordatorioTarea.fecha_hora",
    )


class Subtarea(Base):
    __tablename__ = "subtareas"

    id = Column(Integer, primary_key=True, index=True)

    tarea_id = Column(
        Integer,
        ForeignKey("tareas.id"),
        nullable=False,
        index=True,
    )

    titulo = Column(String(255), nullable=False)

    completada = Column(
        Boolean,
        nullable=False,
        default=False,
    )

    orden = Column(
        Integer,
        nullable=False,
        default=0,
    )

    completada_en = Column(
        DateTime,
        nullable=True,
    )
    proceso_id = Column(Integer, ForeignKey("procesos.id"), nullable=True, index=True)
    radicado_id = Column(Integer, ForeignKey("radicados.id"), nullable=True, index=True)
    actuacion_id = Column(Integer, ForeignKey("actuaciones.id"), nullable=True, index=True)
    cliente_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True, index=True)
    asignada_cliente = Column(Boolean, nullable=False, default=False)
    notificar_email = Column(Boolean, nullable=False, default=True)
    notificar_whatsapp = Column(Boolean, nullable=False, default=True)

    tarea = relationship(
        "Tarea",
        back_populates="subtareas",
    )


class RecordatorioTarea(Base):
    __tablename__ = "recordatorios_tareas"

    id = Column(Integer, primary_key=True, index=True)

    tarea_id = Column(
        Integer,
        ForeignKey("tareas.id"),
        nullable=False,
        index=True,
    )

    canal = Column(
        Enum(CanalRecordatorio),
        nullable=False,
        default=CanalRecordatorio.WHATSAPP,
    )

    notificar_email = Column(Boolean, nullable=False, default=False)
    notificar_whatsapp = Column(Boolean, nullable=False, default=True)

    activo = Column(
        Boolean,
        nullable=False,
        default=True,
    )

    version = Column(Integer, nullable=False, default=1, server_default="1")
    workflow_version_lanzada = Column(Integer, nullable=False, default=0, server_default="0")

    # Momento exacto del recordatorio
    fecha_hora = Column(
        DateTime,
        nullable=True,
    )

    # Minutos antes del vencimiento.
    # Ejemplo: 1440 = 24 horas antes.
    anticipacion_minutos = Column(
        Integer,
        nullable=True,
    )

    enviado_en = Column(
        DateTime,
        nullable=True,
    )

    tarea = relationship(
        "Tarea",
        back_populates="recordatorios",
    )

    @property
    def workflow_pendiente_lanzamiento(self) -> bool:
        return (
            self.activo
            and self.enviado_en is None
            and self.workflow_version_lanzada != self.version
        )
