from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.modulos.administracion.esquemas import EstadoIntegracion, PersonaBreve
from app.nucleo.paginacion import Pagina
from app.nucleo.zona_horaria import FechaHora

# ---- Consultas judiciales ------------------------------------------------------

EstadoEjecucion = Literal["en_cola", "en_proceso", "completada", "con_errores", "fallida"]
EstadoResultado = Literal["consultado", "con_error", "pendiente"]


class ConfiguracionConsultas(BaseModel):
    activa: bool = Field(description="Si las consultas automáticas están encendidas.")
    dias: list[int] = Field(description="Días de la semana: 0 es lunes, 6 es domingo.")
    horas: list[str] = Field(description="Horas fijas de Colombia, por ejemplo «12:00».")
    proxima: FechaHora | None = Field(description="Próxima consulta automática, si está encendida.")


class CambioConsultas(BaseModel):
    activa: bool
    dias: list[int] = Field(max_length=7)

    @field_validator("dias")
    @classmethod
    def _dias_validos(cls, dias: list[int]) -> list[int]:
        if any(d < 0 or d > 6 for d in dias):
            raise ValueError("Los días van de 0 (lunes) a 6 (domingo).")
        return sorted(set(dias))


class RadicadoConError(BaseModel):
    radicado_id: int
    numero: str = Field(description="Agrupado en sus siete segmentos.")
    proceso: str
    proceso_id: int
    error: str | None
    fecha: FechaHora | None


class PanelConsultas(BaseModel):
    configuracion: ConfiguracionConsultas
    con_error: list[RadicadoConError] = Field(description="Radicados de procesos activos cuya última consulta falló.")


class Ejecucion(BaseModel):
    id: str
    manual: bool
    estado: EstadoEjecucion
    inicio: FechaHora
    fin: FechaHora | None
    total: int
    procesados: int
    errores: int
    actuaciones_nuevas: int


class PaginaEjecuciones(Pagina[Ejecucion]):
    pass


class ResultadoRadicado(BaseModel):
    radicado_id: int
    numero: str
    estado: EstadoResultado
    actuaciones_nuevas: int
    error: str | None


class DetalleEjecucion(Ejecucion):
    radicados: list[ResultadoRadicado]


class RadicadoConsultable(BaseModel):
    id: int
    numero: str
    proceso: str | None


# ---- Envíos de avisos -----------------------------------------------------------

CanalEnvio = Literal["EMAIL", "WHATSAPP", "PUSH"]
EstadoEnvio = Literal["pendiente", "enviando", "enviado", "fallido", "agotado", "omitido"]
FiltroEnvios = Literal["fallidos", "pendientes", "enviados", "todos"]


class Envio(BaseModel):
    id: int
    tipo: str = Field(description="De qué trata, en palabras: «Actuación judicial», «Tarea».")
    canal: CanalEnvio | None = Field(description="None cuando no salió por ningún canal (omitido).")
    estado: EstadoEnvio = Field(description="`agotado`: falló los tres intentos y ya no se reintenta solo.")
    asunto: str
    destinatario: PersonaBreve
    contacto: str | None = Field(description="Correo o WhatsApp al que iba.")
    intentos: int
    error: str | None
    creado_en: FechaHora
    enviado_en: FechaHora | None
    confirmacion: Literal["entregado", "leido"] | None = Field(
        None, description="Solo WhatsApp: lo que Meta confirmó por el webhook (entregado al teléfono o leído).",
    )
    confirmado_en: FechaHora | None = Field(None, description="Cuándo llegó esa confirmación.")


class DetalleEnvio(Envio):
    cuerpo: str = Field(description="El texto que se envió o se intentó enviar, sin marcas.")


class ConteoEnvios(BaseModel):
    fallidos: int = Field(description="Agotados en los últimos 30 días.")
    pendientes: int


class PaginaEnvios(Pagina[Envio]):
    conteo: ConteoEnvios


class Reintento(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=200)


class Reintentados(BaseModel):
    reintentados: int


# ---- Integraciones -------------------------------------------------------------

ClavePrueba = Literal["rama_judicial", "correo", "whatsapp", "tareas_programadas"]


class ConfiguracionCorreo(BaseModel):
    servidor: str
    puerto: int | None
    remitente: str
    starttls: bool
    usuario: str
    tiene_clave: bool
    configurado: bool


class ConexionMeta(BaseModel):
    numero_id: str = Field(description="Identificador del número en Meta (WHATSAPP_PHONE_NUMBER_ID).")
    cuenta_id: str | None = Field(description="Cuenta de WhatsApp Business (WHATSAPP_WABA_ID).")
    falta_para_webhook: list[str] = Field(description="Variables que faltan para recibir el webhook; vacía si está listo.")


class ConfiguracionWhatsapp(BaseModel):
    proveedor: Literal["meta", "anterior", "ninguno"] = Field(
        description="Por dónde salen hoy los WhatsApp: la API de Meta (variables de entorno) o el proveedor anterior (dirección y token de aquí).",
    )
    meta: ConexionMeta | None = None
    url: str
    tiene_token: bool
    configurado: bool


class PanelIntegraciones(BaseModel):
    estados: list[EstadoIntegracion]
    correo: ConfiguracionCorreo
    whatsapp: ConfiguracionWhatsapp


class CambioCorreo(BaseModel):
    servidor: str = Field(max_length=255)
    puerto: int = Field(ge=1, le=65535)
    remitente: str = Field(max_length=320)
    starttls: bool = True
    usuario: str = Field("", max_length=320)
    clave: str | None = Field(None, max_length=500, description="Solo si cambia. Vacío deja la actual.")
    borrar_clave: bool = False


class CambioWhatsapp(BaseModel):
    url: str = Field(max_length=1000)
    token: str | None = Field(None, max_length=2000, description="Solo si cambia. Vacío deja el actual.")
    borrar_token: bool = False

    @field_validator("url")
    @classmethod
    def _url(cls, url: str) -> str:
        url = url.strip()
        if url and not url.startswith(("https://", "http://")):
            raise ValueError("La dirección debe empezar por https://.")
        return url


class ResultadoPrueba(BaseModel):
    estado: Literal["ok", "falla", "sin_configurar"]
    mensaje: str


class EnvioPrueba(BaseModel):
    canal: Literal["EMAIL", "WHATSAPP"]
    destinatario: str = Field(min_length=3, max_length=320)


class PruebaEnviada(BaseModel):
    destino: str


# ---- Plantillas ----------------------------------------------------------------


EstadoPlantillaMeta = Literal["aprobada", "en_revision", "rechazada", "en_riesgo", "pausada", "deshabilitada", "sin_dato"]


class WhatsappMeta(BaseModel):
    plantilla: str = Field(description="Nombre de la plantilla aprobada en Meta con que sale este aviso por WhatsApp.")
    estado: EstadoPlantillaMeta = Field(description="Lo último que Meta informó; `sin_dato` si aún no ha avisado nada.")
    motivo: str | None = Field(None, description="Por qué Meta la rechazó o pausó, si lo dijo.")
    actualizado_en: FechaHora | None = None


class PlantillaAvisoFila(BaseModel):
    clave: str
    nombre: str
    tiene_push: bool
    actualizada_en: FechaHora | None
    whatsapp_meta: WhatsappMeta | None = Field(None, description="Sin valor si el aviso no sale por WhatsApp con plantilla de Meta.")


class TextosPlantillaAviso(BaseModel):
    asunto: str = Field(min_length=1, max_length=1000)
    cuerpo_email: str = Field(min_length=1, max_length=30000)
    cuerpo_whatsapp: str = Field(min_length=1, max_length=10000)
    titulo_push: str | None = Field(None, max_length=500)
    cuerpo_push: str | None = Field(None, max_length=5000)


class VariableMeta(BaseModel):
    numero: int
    dato: str = Field(description="De dónde sale el valor, por ejemplo `proceso` o `saludo`.")
    ejemplo: str


class WhatsappPublicado(BaseModel):
    activo: bool = Field(description="True si WhatsApp sale hoy por Meta; entonces este texto reemplaza a `cuerpo_whatsapp`.")
    plantilla: str
    categoria: Literal["utilidad", "autenticacion"]
    cuerpo: str | None = Field(description="El texto registrado en Meta con {{1}}, {{2}}…; sin valor en las de autenticación, cuyo texto pone Meta.")
    vista_previa: str = Field(description="El mensaje con los valores de ejemplo, como le llega a la persona.")
    pie: str | None
    boton: str | None
    variables: list[VariableMeta]


class PlantillaAviso(PlantillaAvisoFila):
    whatsapp_publicado: WhatsappPublicado | None = Field(None, description="La plantilla de Meta con que sale este aviso por WhatsApp.")
    asunto: str
    cuerpo_email: str
    cuerpo_whatsapp: str
    titulo_push: str | None
    cuerpo_push: str | None
    variables: list[str] = Field(description="Las que se pueden usar como {{variable}}.")
    ejemplo: dict[str, str] = Field(description="Valores de ejemplo de cada variable para la vista previa.")


class VistaPrevia(BaseModel):
    asunto: str
    html: str = Field(description="El correo completo, como le llega a la persona.")
    whatsapp: str
    titulo_push: str | None
    cuerpo_push: str | None
