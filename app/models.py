import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Enum, Text
from sqlalchemy.orm import relationship
from app.database import Base


class EstadoUsuario(str, enum.Enum):
    PENDIENTE_APROBACION = "PENDIENTE_APROBACION"
    ACTIVO = "ACTIVO"
    RECHAZADO = "RECHAZADO"


class RolUsuario(str, enum.Enum):
    ABOGADO = "ABOGADO"
    ADMIN = "ADMIN"


class Plan(Base):
    __tablename__ = "planes"

    id = Column(Integer, primary_key=True)
    nombre = Column(String, nullable=False)
    limite_radicados = Column(Integer, nullable=False)
    precio_mensual = Column(Integer, nullable=False)
    activo = Column(Boolean, nullable=False, default=True)

    users = relationship("Usuario", back_populates="plan")


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
    created_at = Column(DateTime, default=datetime.utcnow)

    tareas = relationship(
    "Tarea",
    back_populates="usuario",
    cascade="all, delete-orphan",
)
    plan = relationship("Plan", back_populates="users")
    solicitud_registro = relationship("SolicitudRegistro", back_populates="usuario", uselist=False)
    radicados = relationship("Radicado", back_populates="usuario", cascade="all, delete-orphan")


class SolicitudRegistro(Base):
    __tablename__ = "solicitudes_registro"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), unique=True, nullable=False)
    ruta_tarjeta_profesional = Column(String(255), nullable=False)
    notas_admin = Column(Text, nullable=True)
    fecha_solicitud = Column(DateTime, default=datetime.utcnow)

    usuario = relationship("Usuario", back_populates="solicitud_registro")


class Radicado(Base):
    __tablename__ = "radicados"

    id = Column(Integer, primary_key=True, index=True)
    numero = Column(String(23), index=True, nullable=False)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    
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

    usuario = relationship("Usuario", back_populates="radicados")
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

    # MANUAL / AUTOMATICA
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
    )

    radicado = relationship(
        "Radicado",
        back_populates="tareas",
    )

    actuacion_rel = relationship(
        "Actuacion",
        back_populates="tareas",
    )

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

    activo = Column(
        Boolean,
        nullable=False,
        default=True,
    )

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