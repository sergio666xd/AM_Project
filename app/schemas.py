from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from app.models import EstadoUsuario, RolUsuario
from typing import Optional
from datetime import datetime
from app.models import (
    EstadoUsuario,
    RolUsuario,
    EstadoTarea,
    PrioridadTarea,
    CanalRecordatorio,
)


class PlanOut(BaseModel):
    id: int
    nombre: str
    limite_radicados: int
    precio_mensual: int
    activo: bool

    class Config:
        from_attributes = True

class PlanCreate(BaseModel):
    nombre: str
    limite_radicados: int
    precio_mensual: int


class PlanUpdate(BaseModel):
    nombre: str | None = None
    limite_radicados: int | None = None
    precio_mensual: int | None = None
    activo: bool | None = None

class UsuarioOut(BaseModel):
    id: int
    email: EmailStr
    nombre_completo: str
    whatsapp_numero: str
    rol: RolUsuario
    estado: EstadoUsuario
    plan: Optional[PlanOut] = None

    class Config:
        from_attributes = True


class SolicitudRegistroOut(BaseModel):
    id: int
    usuario_id: int
    ruta_tarjeta_profesional: str
    fecha_solicitud: datetime
    usuario: UsuarioOut

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class RadicadoCreate(BaseModel):
    numero: str  # Los 23 dígitos del radicado judicial


class ActuacionOut(BaseModel):
    id: int
    orden: int
    fecha_actuacion: str
    actuacion: str
    anotacion: str
    fecha_inicia_termino: str
    fecha_finaliza_termino: str
    fecha_registro: str
    es_fijacion: bool

    class Config:
        from_attributes = True


class RadicadoOut(BaseModel):
    id: int
    numero: str
    estado_consulta: str
    despacho_departamento: str
    demandante: str
    demandado: str
    consultado_en: str
    alerta_enviada: bool
    detalle_pendiente: str
    actuaciones: list[ActuacionOut] = []

    class Config:
        from_attributes = True

class SubtareaCreate(BaseModel):
    titulo: str
    orden: int = 0


class SubtareaUpdate(BaseModel):
    titulo: Optional[str] = None
    completada: Optional[bool] = None
    orden: Optional[int] = None


class SubtareaOut(BaseModel):
    id: int
    tarea_id: int
    titulo: str
    completada: bool
    orden: int
    completada_en: Optional[datetime] = None

    class Config:
        from_attributes = True


class RecordatorioTareaCreate(BaseModel):
    canal: CanalRecordatorio = CanalRecordatorio.WHATSAPP
    fecha_hora: Optional[datetime] = None
    anticipacion_minutos: Optional[int] = None
    activo: bool = True


class RecordatorioTareaUpdate(BaseModel):
    activo: Optional[bool] = None
    fecha_hora: Optional[datetime] = None
    anticipacion_minutos: Optional[int] = None


class RecordatorioTareaOut(BaseModel):
    id: int
    tarea_id: int
    canal: CanalRecordatorio
    activo: bool
    fecha_hora: Optional[datetime] = None
    anticipacion_minutos: Optional[int] = None
    enviado_en: Optional[datetime] = None

    class Config:
        from_attributes = True


class TareaCreate(BaseModel):
    titulo: str
    descripcion: Optional[str] = None

    estado: EstadoTarea = EstadoTarea.PENDIENTE
    prioridad: PrioridadTarea = PrioridadTarea.MEDIA

    fecha_limite: Optional[datetime] = None

    # Ambos NULL = tarea general
    radicado_id: Optional[int] = None
    actuacion_id: Optional[int] = None


class TareaUpdate(BaseModel):
    titulo: Optional[str] = None
    descripcion: Optional[str] = None

    estado: Optional[EstadoTarea] = None
    prioridad: Optional[PrioridadTarea] = None

    fecha_limite: Optional[datetime] = None

    radicado_id: Optional[int] = None
    actuacion_id: Optional[int] = None


class TareaOut(BaseModel):
    id: int
    usuario_id: int

    radicado_id: Optional[int] = None
    actuacion_id: Optional[int] = None

    titulo: str
    descripcion: Optional[str] = None

    estado: EstadoTarea
    prioridad: PrioridadTarea

    fecha_limite: Optional[datetime] = None
    completada_en: Optional[datetime] = None

    created_at: datetime
    updated_at: datetime

    subtareas: list[SubtareaOut] = []
    recordatorios: list[RecordatorioTareaOut] = []

    class Config:
        from_attributes = True