from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_serializer, field_validator
from typing import Any, Literal, Optional
from datetime import datetime, timezone
from app.models import EstadoUsuario, RolUsuario
from app.models import (
    EstadoTarea,
    PrioridadTarea,
    CanalRecordatorio,
    TIPOS_NOTIFICACION,
)


class PlanOut(BaseModel):
    id: int
    nombre: str
    limite_radicados: int
    precio_mensual: int
    activo: bool
    limite_ultimas_actuaciones: Optional[int] = None
    notificaciones_whatsapp_procesos: bool = False
    notificaciones_whatsapp_tareas: bool = False

    model_config = ConfigDict(from_attributes=True)

class PlanCreate(BaseModel):
    nombre: str
    limite_radicados: int
    precio_mensual: int
    # null = todas las actuaciones
    limite_ultimas_actuaciones: Optional[int] = 5
    notificaciones_whatsapp_procesos: bool = False
    notificaciones_whatsapp_tareas: bool = False


class PlanUpdate(BaseModel):
    nombre: str | None = None
    limite_radicados: int | None = None
    precio_mensual: int | None = None
    activo: bool | None = None
    limite_ultimas_actuaciones: Optional[int] = None
    notificaciones_whatsapp_procesos: Optional[bool] = None
    notificaciones_whatsapp_tareas: Optional[bool] = None


class ConfiguracionSaasOut(BaseModel):
    mostrar_planes: bool

    model_config = ConfigDict(from_attributes=True)


class ConfiguracionSaasUpdate(BaseModel):
    mostrar_planes: bool


class ConfiguracionFirmaUpdate(BaseModel):
    nombre: str = Field(min_length=2, max_length=180)
    correo_contacto: EmailStr | None = None
    correo_pqr: EmailStr | None = None
    telefono: str = Field(default="", max_length=40)
    whatsapp: str = Field(default="", max_length=40)
    direccion: str = Field(default="", max_length=300)
    ciudad: str = Field(default="", max_length=120)
    pais: str = Field(default="Colombia", max_length=120)
    logo_url: str = Field(default="", max_length=1000)
    sitio_web: str = Field(default="", max_length=1000)
    zona_horaria: str = Field(default="America/Bogota", max_length=80)
    mostrar_contacto_publico: bool = True
    preferencias_notificacion: dict[str, bool] = Field(default_factory=lambda: {"email": True, "whatsapp": True})
    parametros_generales: dict[str, Any] = Field(default_factory=dict)

    @field_validator("correo_contacto", "correo_pqr", mode="before")
    @classmethod
    def normalizar_correo_opcional(cls, value: Any) -> Any:
        # Los inputs type=email del panel envían "" cuando el correo opcional
        # queda vacío; EmailStr espera null en ese caso.
        return None if isinstance(value, str) and not value.strip() else value

    @field_validator("telefono", "whatsapp", "direccion", "ciudad", "pais", "logo_url", "sitio_web", mode="before")
    @classmethod
    def normalizar_texto_opcional(cls, value: Any) -> Any:
        # Estos campos son nullable en la tabla y pueden llegar como null desde
        # registros antiguos; el formulario y el esquema los manejan como texto.
        return "" if value is None else value


class ConfiguracionIntegracionesUpdate(BaseModel):
    smtp_host: str | None = Field(default=None, max_length=255)
    smtp_port: int | None = Field(default=None, ge=1, le=65535)
    smtp_from: str | None = Field(default=None, max_length=320)
    smtp_starttls: bool | None = None
    smtp_user: str | None = Field(default=None, max_length=320)
    smtp_password: str | None = Field(default=None, max_length=4096)
    borrar_smtp_password: bool = False
    whatsapp_api_url: str | None = Field(default=None, max_length=2000)
    whatsapp_token: str | None = Field(default=None, max_length=4096)
    borrar_whatsapp_token: bool = False


class ConfiguracionConsultasOut(BaseModel):
    activa: bool
    dias_habilitados: list[int]
    horas_colombia: list[str] = ["12:00", "17:00"]
    proxima_ejecucion: datetime | None = None
    updated_at: datetime | None = None


class ConfiguracionConsultasUpdate(BaseModel):
    activa: bool
    dias_habilitados: list[int]


class EventoAgendaCreate(BaseModel):
    titulo: str = Field(min_length=1, max_length=255)
    descripcion: str | None = Field(default=None, max_length=4000)
    tipo: Literal["EVENTO", "AUDIENCIA", "REUNION", "FIRMA_CONTRATO"] = "EVENTO"
    estado: Literal["PROGRAMADO", "COMPLETADO", "CANCELADO"] = "PROGRAMADO"
    fecha_inicio: datetime
    fecha_fin: datetime | None = None
    responsable_id: int | None = None
    proceso_id: int | None = None
    cliente_id: int | None = None
    contrato_id: int | None = None


class EventoAgendaUpdate(EventoAgendaCreate):
    pass


class ContratoServicioCreate(BaseModel):
    cliente_id: int
    campos: dict[str, str]


class ContratoServicioUpdate(BaseModel):
    campos: dict[str, str]


class ContratoVistaPrevia(BaseModel):
    cliente_id: int
    campos: dict[str, str]


class ContratoServicioEstadoUpdate(BaseModel):
    estado: Literal["LISTO_PARA_FIRMA", "EN_FIRMA", "TERMINADO", "ANULADO"]
    motivo: str | None = Field(default=None, max_length=4000)


class WorkflowClaimConsulta(BaseModel):
    clave_idempotencia: str
    token_lanzamiento: str
    tipo: Literal["AUTOMATICA", "MANUAL", "AUTOMATICA_NUEVO"]
    fecha_local: str
    hora_local: Literal["12:00", "17:00", "MANUAL", "NUEVO"]
    solicitada_por_id: int | None = None
    radicado_id: int | None = None
    radicado_ids: list[int] | None = None
    consulta_id: int | None = None

class WorkflowConsultaRadicado(BaseModel):
    actor_id: int
    launch_token: str

class WorkflowConsultaManualCreate(BaseModel):
    actor_id: int
    radicado_id: int

class WorkflowActuacionNueva(BaseModel):
    orden: int = 0
    fecha_actuacion: str = ""
    actuacion: str = ""
    anotacion: str = ""
    fecha_inicia_termino: str = ""
    fecha_finaliza_termino: str = ""
    fecha_registro: str = ""
    es_fijacion: bool = False

class WorkflowEventoActuaciones(BaseModel):
    radicado_id: int
    actuaciones_nuevas: list[WorkflowActuacionNueva]

class WorkflowNovedadesPreparar(BaseModel):
    eventos: list[WorkflowEventoActuaciones]

class WorkflowRecordatorioPreparar(BaseModel):
    version: int

class ContenidoPaginaUpdate(BaseModel):
    contenido: dict[str, Any]


class AdminResourceCreate(BaseModel):
    owner_id: int
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    numero: Optional[str] = None
    titulo: Optional[str] = None
    instrucciones: Optional[str] = None
    estado: Optional[EstadoTarea] = None
    prioridad: Optional[PrioridadTarea] = None
    fecha_limite: Optional[datetime] = None
    proceso_id: Optional[int] = None
    radicado_id: Optional[int] = None
    cliente_id: Optional[int] = None


class AdminResourceUpdate(BaseModel):
    owner_id: Optional[int] = None
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    numero: Optional[str] = None
    titulo: Optional[str] = None
    estado: Optional[EstadoTarea] = None
    prioridad: Optional[PrioridadTarea] = None
    fecha_limite: Optional[datetime] = None
    nombre_archivo: Optional[str] = None
    estado_revision: Literal["RECIBIDO", "EN_REVISION", "APROBADO", "REQUIERE_CORRECCION", "RECHAZADO"] | None = None
    comentario_revision: Optional[str] = Field(default=None, max_length=4000)


class DiagnosticoEnvioPrueba(BaseModel):
    canal: Literal["EMAIL", "WHATSAPP"]
    destinatario: str = Field(min_length=5, max_length=254)
    confirmar_envio: bool = False


class DiagnosticoIntegracion(BaseModel):
    integracion: Literal["RAMA", "WORKFLOW", "SMTP", "WHATSAPP"]


class AlertasAccionMasiva(BaseModel):
    alerta_ids: list[str] = Field(min_length=1, max_length=5000)
    estado: Literal["ATENDIDA", "DESCARTADA", "ELIMINADA"]


class NotificacionesLeidasUpdate(BaseModel):
    ids: list[str] = Field(default_factory=list, max_length=500)


class AplicarMigracionRadicados(BaseModel):
    confirmacion: Literal["CONFIRMO_BACKUP_VERIFICADO"]


class AccionMasivaUsuarios(BaseModel):
    usuario_ids: list[int]
    estado: EstadoUsuario


class AccionMasivaPlanes(BaseModel):
    plan_ids: list[int]
    activo: bool


class AccionMasivaSolicitudes(BaseModel):
    solicitud_ids: list[int]
    accion: str
    plan_id: Optional[int] = None


class UsuarioAdminCreate(BaseModel):
    email: EmailStr
    nombre_completo: str
    whatsapp_numero: str = ""
    password_temporal: str
    rol: RolUsuario
    plan_id: Optional[int] = None
    creado_por_abogado_id: Optional[int] = None


class UsuarioAdminUpdate(BaseModel):
    nombre_completo: Optional[str] = None
    whatsapp_numero: Optional[str] = None
    rol: Optional[RolUsuario] = None
    plan_id: Optional[int] = None
    creado_por_abogado_id: Optional[int] = None


class CanalesNotificacionTipo(BaseModel):
    email: bool
    whatsapp: bool


class UsuarioOut(BaseModel):
    id: int
    # Los usuarios históricos pueden usar correos internos de desarrollo
    # (por ejemplo, dominios .local); la validación se mantiene en los esquemas
    # de creación y cambio de correo, no al serializar una cuenta existente.
    email: str
    nombre_completo: str
    whatsapp_numero: str
    rol: RolUsuario
    estado: EstadoUsuario
    plan: Optional[PlanOut] = None
    creado_por_abogado_id: Optional[int] = None
    debe_cambiar_password: bool = False
    preferencias_notificacion: dict[str, CanalesNotificacionTipo] = Field(default_factory=dict)
    canal_notificacion_cliente: Literal["EMAIL", "WHATSAPP"] | None = None
    notificaciones_email: bool = True
    notificaciones_whatsapp: bool = False
    created_at: Optional[datetime] = None
    ultimo_acceso: Optional[datetime] = None

    @field_validator("preferencias_notificacion", mode="before")
    @classmethod
    def normalizar_preferencias_notificacion(cls, value: Any) -> dict[str, dict[str, bool]]:
        """Acepta el formato histórico plano y completa preferencias parciales."""
        if not isinstance(value, dict):
            value = {}

        # Algunas filas anteriores guardaban una sola preferencia global.
        if "email" in value or "whatsapp" in value:
            email = value.get("email", True)
            whatsapp = value.get("whatsapp", False)
            return {
                tipo: {"email": bool(email), "whatsapp": bool(whatsapp)}
                for tipo in TIPOS_NOTIFICACION
            }

        normalized: dict[str, dict[str, bool]] = {}
        for tipo in TIPOS_NOTIFICACION:
            canales = value.get(tipo, {})
            if isinstance(canales, bool):
                canales = {"email": canales, "whatsapp": False}
            if not isinstance(canales, dict):
                canales = {}
            normalized[tipo] = {
                "email": bool(canales.get("email", True)),
                "whatsapp": bool(canales.get("whatsapp", False)),
            }
        return normalized

    model_config = ConfigDict(from_attributes=True)


class SolicitudRegistroOut(BaseModel):
    id: int
    usuario_id: int
    ruta_tarjeta_profesional: Optional[str] = None
    fecha_solicitud: datetime
    usuario: UsuarioOut

    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    debe_cambiar_password: bool = False


class CambiarPasswordIn(BaseModel):
    password_actual: str
    password_nueva: str


class SolicitudRecuperacionPassword(BaseModel):
    email: EmailStr


class ConfirmacionRecuperacionPassword(BaseModel):
    token: str
    password_nueva: str


class PreferenciasNotificacionUpdate(BaseModel):
    preferencias: dict[str, CanalesNotificacionTipo] | None = None
    canal_cliente: Literal["EMAIL", "WHATSAPP"] | None = None
    notificaciones_email: Optional[bool] = None
    notificaciones_whatsapp: Optional[bool] = None
    silenciar_email_si_push: Optional[bool] = None
    silenciar_whatsapp_si_push: Optional[bool] = None


class PerfilUpdate(BaseModel):
    email: Optional[EmailStr] = None
    nombre_completo: Optional[str] = None
    whatsapp_numero: Optional[str] = None
    genero: Optional[str] = Field(default=None, max_length=16)
    numero_documento: Optional[str] = Field(default=None, max_length=40)
    domicilio: Optional[str] = Field(default=None, max_length=120)
    direccion: Optional[str] = Field(default=None, max_length=300)
    tarjeta_profesional: Optional[str] = Field(default=None, max_length=40)


class SolicitarCodigoSeguridad(BaseModel):
    accion: Literal["email", "whatsapp", "password"]
    canal: Literal["EMAIL", "WHATSAPP"]
    valor: str | None = Field(default=None, max_length=320)
    password_actual: str | None = Field(default=None, max_length=128)
    password_nueva: str | None = Field(default=None, min_length=8, max_length=72)


class ReenviarCodigoSeguridad(BaseModel):
    canal: Literal["EMAIL", "WHATSAPP"]


class VerificarCodigoSeguridad(BaseModel):
    codigo: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class AplicarCambioSeguridad(BaseModel):
    valor: str | None = Field(default=None, max_length=320)
    password_actual: str | None = Field(default=None, max_length=128)
    password_nueva: str | None = Field(default=None, min_length=8, max_length=72)


class SolicitudEdicionPerfilClienteCreate(BaseModel):
    email: EmailStr | None = None
    nombre_completo: str
    whatsapp_numero: str = ""
    genero: Optional[str] = Field(default=None, max_length=16)
    numero_documento: Optional[str] = Field(default=None, max_length=40)
    domicilio: Optional[str] = Field(default=None, max_length=120)
    direccion: Optional[str] = Field(default=None, max_length=300)


class SolicitudEdicionPerfilClienteRevision(BaseModel):
    decision: Literal["APROBAR", "RECHAZAR"]
    comentario: Optional[str] = None


class ClienteCreate(BaseModel):
    email: EmailStr
    nombre_completo: str
    whatsapp_numero: str = ""
    password_temporal: str
    canal_envio: Literal["EMAIL", "WHATSAPP"] = "EMAIL"


class ClienteUpdate(BaseModel):
    nombre_completo: str
    whatsapp_numero: str = ""
    genero: Optional[str] = Field(default=None, max_length=16)
    numero_documento: Optional[str] = Field(default=None, max_length=40)
    domicilio: Optional[str] = Field(default=None, max_length=120)
    direccion: Optional[str] = Field(default=None, max_length=300)


class AbogadoAdminCreate(BaseModel):
    email: EmailStr
    nombre_completo: str
    whatsapp_numero: str = ""
    password_temporal: str


class ProcesoCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None


class ProcesoUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None


class ProcesoColaboradorCreate(BaseModel):
    abogado_id: int
    visible_cliente: bool = False


class ProcesoColaboradorUpdate(BaseModel):
    visible_cliente: bool


class SolicitudDocumentoCreate(BaseModel):
    cliente_id: int
    titulo: str
    documentos: list[str] = Field(default_factory=list, max_length=30)
    instrucciones: Optional[str] = None
    fecha_limite: Optional[datetime] = None


class NotificacionActuacionCreate(BaseModel):
    cliente_id: int
    comentarios: str = ""


class InteresSaasCreate(BaseModel):
    email: EmailStr
    autorizacion_datos: bool = True
    # Campo trampa: los usuarios reales nunca lo ven ni lo completan.
    website: str = ""


class InteresSaasOut(BaseModel):
    mensaje: str

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

    model_config = ConfigDict(from_attributes=True)


class RadicadoOut(BaseModel):
    id: int
    numero: str
    mensaje: Optional[str] = None
    consulta_id: Optional[int] = None
    estado_consulta: str
    despacho_departamento: str
    demandante: str
    demandado: str
    consultado_en: str
    alerta_enviada: bool
    detalle_pendiente: str
    actuaciones: list[ActuacionOut] = []

    model_config = ConfigDict(from_attributes=True)

class SubtareaCreate(BaseModel):
    titulo: str
    orden: int = 0
    asignada_cliente: bool = False
    cliente_id: Optional[int] = None
    proceso_id: Optional[int] = None
    radicado_id: Optional[int] = None
    actuacion_id: Optional[int] = None
    notificar_email: bool = True
    notificar_whatsapp: bool = True
    proceso_id: Optional[int] = None
    radicado_id: Optional[int] = None
    actuacion_id: Optional[int] = None
    notificar_email: bool = True
    notificar_whatsapp: bool = True


class SubtareaUpdate(BaseModel):
    titulo: Optional[str] = None
    completada: Optional[bool] = None
    orden: Optional[int] = None
    asignada_cliente: Optional[bool] = None
    cliente_id: Optional[int] = None
    proceso_id: Optional[int] = None
    radicado_id: Optional[int] = None
    actuacion_id: Optional[int] = None
    notificar_email: Optional[bool] = None
    notificar_whatsapp: Optional[bool] = None
    proceso_id: Optional[int] = None
    radicado_id: Optional[int] = None
    actuacion_id: Optional[int] = None
    notificar_email: Optional[bool] = None
    notificar_whatsapp: Optional[bool] = None


class SubtareaOut(BaseModel):
    id: int
    tarea_id: int
    titulo: str
    completada: bool
    orden: int
    completada_en: Optional[datetime] = None
    asignada_cliente: bool = False
    cliente_id: Optional[int] = None
    proceso_id: Optional[int] = None
    radicado_id: Optional[int] = None
    actuacion_id: Optional[int] = None
    notificar_email: bool = True
    notificar_whatsapp: bool = True
    proceso_id: Optional[int] = None
    radicado_id: Optional[int] = None
    actuacion_id: Optional[int] = None
    notificar_email: bool = True
    notificar_whatsapp: bool = True

    model_config = ConfigDict(from_attributes=True)


class RecordatorioTareaCreate(BaseModel):
    canal: CanalRecordatorio = CanalRecordatorio.WHATSAPP
    notificar_email: bool = False
    notificar_whatsapp: bool = True
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
    notificar_email: bool = False
    notificar_whatsapp: bool = True
    activo: bool
    fecha_hora: Optional[datetime] = None
    anticipacion_minutos: Optional[int] = None
    enviado_en: Optional[datetime] = None
    workflow_pendiente_lanzamiento: bool = False

    @field_serializer("fecha_hora", "enviado_en")
    def serialize_utc_datetime(self, value: Optional[datetime]) -> Optional[datetime]:
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value

    model_config = ConfigDict(from_attributes=True)


class TareaCreate(BaseModel):
    titulo: str
    descripcion: Optional[str] = None

    estado: EstadoTarea = EstadoTarea.PENDIENTE
    prioridad: PrioridadTarea = PrioridadTarea.MEDIA

    fecha_limite: Optional[datetime] = None

    # Ambos NULL = tarea general
    radicado_id: Optional[int] = None
    actuacion_id: Optional[int] = None
    proceso_id: Optional[int] = None
    cliente_id: Optional[int] = None


class ComunicacionProcesoCreate(BaseModel):
    asunto: str = Field(min_length=1, max_length=255)
    contenido: str = Field(min_length=1, max_length=12000)
    visibilidad: Literal["INTERNA", "CLIENTE"] = "INTERNA"
    canal: Literal["INTERNO", "EMAIL", "WHATSAPP"] = "INTERNO"
    cliente_id: int | None = None


class ComunicacionClienteCreate(BaseModel):
    asunto: str = Field(min_length=1, max_length=255)
    contenido: str = Field(min_length=1, max_length=12000)


class ChatMensajeCreate(BaseModel):
    contenido: str = Field(min_length=1, max_length=12000)
    referencia_tipo: Literal["ACTUACION", "RADICADO", "TAREA", "SUBTAREA", "EVENTO", "DOCUMENTO"] | None = None
    referencia_id: int | None = Field(default=None, gt=0)


class ChatMensajeLeidoUpdate(BaseModel):
    mensaje_id: int = Field(gt=0)


class ChatPushEntrega(BaseModel):
    usuario_id: int = Field(gt=0)
    mensaje_id: int = Field(gt=0)
    firma: str = Field(min_length=64, max_length=64)


class ChatPresenciaUpdate(BaseModel):
    session_id: str = Field(min_length=16, max_length=80, pattern=r"^[a-zA-Z0-9-]+$")


class ChatPushSubscriptionCreate(BaseModel):
    endpoint: str = Field(min_length=1, max_length=2048)
    keys: dict[str, str]
    user_agent: str = Field(default="", max_length=512)
    device_label: str = Field(default="", max_length=120)

    @field_validator("keys")
    @classmethod
    def validar_claves_push(cls, value: dict[str, str]) -> dict[str, str]:
        if not value.get("p256dh") or not value.get("auth"):
            raise ValueError("La suscripción del navegador no incluye sus claves de cifrado.")
        return value


class ChatPushSubscriptionDelete(BaseModel):
    endpoint: str = Field(min_length=1, max_length=2048)


class ChatPushDiagnosticCreate(BaseModel):
    etapa: Literal["clave_publica", "registrar_service_worker", "esperar_service_worker", "buscar_suscripcion", "eliminar_suscripcion_anterior", "crear_suscripcion", "guardar_suscripcion"]
    nombre_error: str = Field(default="Error", max_length=120)
    mensaje_error: str = Field(default="", max_length=500)


class NotificacionesClienteLeidasUpdate(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=500)


class DocumentoRevisionUpdate(BaseModel):
    estado_revision: Literal["EN_REVISION", "APROBADO", "REQUIERE_CORRECCION", "RECHAZADO"]
    comentario_revision: str = Field(default="", max_length=4000)


class NotificacionesAbogadoLeidasUpdate(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=500)


class TareaUpdate(BaseModel):
    titulo: Optional[str] = None
    descripcion: Optional[str] = None

    estado: Optional[EstadoTarea] = None
    prioridad: Optional[PrioridadTarea] = None

    fecha_limite: Optional[datetime] = None

    radicado_id: Optional[int] = None
    actuacion_id: Optional[int] = None
    proceso_id: Optional[int] = None
    cliente_id: Optional[int] = None


class TareaOut(BaseModel):
    id: int
    usuario_id: int

    radicado_id: Optional[int] = None
    actuacion_id: Optional[int] = None
    proceso_id: Optional[int] = None
    cliente_id: Optional[int] = None

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

    @field_validator("recordatorios", mode="before")
    @classmethod
    def ocultar_recordatorios_internos(cls, value):
        return [item for item in (value or []) if not getattr(item, "interno_sistema", False)]

    model_config = ConfigDict(from_attributes=True)
