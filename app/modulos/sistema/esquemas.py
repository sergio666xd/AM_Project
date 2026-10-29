from typing import Any, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.modulos.administracion.esquemas import PersonaBreve
from app.nucleo.paginacion import Pagina
from app.nucleo.zona_horaria import FechaHora

# ---- Actividad y auditoría -------------------------------------------------------

AreaActividad = Literal["cuentas", "procesos", "tareas", "documentos", "cobros", "mensajes", "configuracion", "otros"]


class RegistroActividad(BaseModel):
    id: int
    actor: str | None = Field(description="Quién lo hizo; null cuando fue la plataforma sola.")
    actor_id: int | None
    frase: str = Field(description="Lo que hizo, en pasado: «emitió una cuenta de cobro».")
    enlace: str | None = Field(description="Dónde ver lo que cambió, si tiene pantalla propia.")
    fecha: FechaHora
    area: AreaActividad
    accion: str = Field(description="Código de la acción, por ejemplo `cuenta_cobro.emitir`.")
    con_error: bool = Field(description="La operación quedó registrada con un error técnico.")


class PaginaRegistro(Pagina[RegistroActividad]):
    pass


class DetalleRegistro(RegistroActividad):
    recurso: str = Field(description="Tipo de registro afectado, por ejemplo `cuenta_cobro`.")
    recurso_id: str | None
    endpoint: str | None
    metodo: str | None
    datos: Any = Field(None, description="Los datos que la operación guardó con el registro.")
    error: str | None


# ---- Carga de trabajo -------------------------------------------------------------


class CargaPersona(BaseModel):
    persona: PersonaBreve
    activa: bool = Field(description="False si la cuenta está suspendida o cerrada y aún tiene trabajo a su nombre.")
    procesos: int = Field(description="Procesos activos de los que es responsable.")
    tareas_abiertas: int
    vencidas: int
    proximas: int = Field(description="Tareas que vencen en los próximos 7 días.")


class PanelCarga(BaseModel):
    personas: list[CargaPersona] = Field(description="Primero quien tiene más tareas vencidas.")
    procesos: int
    tareas_abiertas: int
    vencidas: int
    proximas: int


# ---- Datos de la firma --------------------------------------------------------------


def _url(valor: str) -> str:
    valor = valor.strip()
    if valor and urlsplit(valor).scheme not in {"https", "http"}:
        raise ValueError("Debe empezar por https://.")
    return valor


class TextosFirma(BaseModel):
    nombre: str = Field(min_length=2, max_length=180)
    correo_contacto: EmailStr | None = None
    correo_pqr: EmailStr | None = None
    telefono: str = Field("", max_length=40)
    whatsapp: str = Field("", max_length=40)
    direccion: str = Field("", max_length=300)
    ciudad: str = Field("", max_length=120)
    pais: str = Field("Colombia", max_length=120)
    sitio_web: str = Field("", max_length=1000)
    logo_url: str = Field("", max_length=1000)
    logo_correo_url: str = Field("", max_length=1000, description="Logo del encabezado de los correos; vacío usa el logo general.")
    mostrar_contacto_publico: bool = True

    @field_validator("correo_contacto", "correo_pqr", mode="before")
    @classmethod
    def _correo_vacio(cls, valor: Any) -> Any:
        return None if isinstance(valor, str) and not valor.strip() else valor

    @field_validator("nombre", "telefono", "whatsapp", "direccion", "ciudad", "pais")
    @classmethod
    def _limpio(cls, valor: str) -> str:
        return " ".join(valor.split())

    _urls = field_validator("sitio_web", "logo_url", "logo_correo_url")(_url)


class DatosFirma(TextosFirma):
    actualizado_en: FechaHora | None
    actualizado_por: str | None


# ---- Almacenamiento -------------------------------------------------------------------


class VinculoArchivo(BaseModel):
    tipo: Literal["documento", "contrato"]
    descripcion: str = Field(description="«Cédula.pdf, del proceso Sucesión de Jorge Pérez».")
    enlace: str | None


class ArchivoGuardado(BaseModel):
    clave: str = Field(description="Ruta completa del archivo en el almacenamiento.")
    nombre: str
    tamano: int = Field(description="En bytes.")
    modificado: FechaHora | None
    vinculo: VinculoArchivo | None = Field(description="null si ningún registro de la plataforma lo usa (huérfano).")


class CarpetaGuardada(BaseModel):
    ruta: str = Field(description="Sin barra final: `procesos/12`.")
    nombre: str


class ContenidoCarpeta(BaseModel):
    ruta: str = Field(description="La carpeta listada; vacío es la raíz.")
    carpetas: list[CarpetaGuardada]
    archivos: list[ArchivoGuardado]
    siguiente: str | None = Field(description="Para pedir más archivos de esta carpeta, o null.")


class EnlaceTemporal(BaseModel):
    url: str
    expira_en: int = Field(description="Segundos que sirve el enlace.")


class ArchivoAEliminar(BaseModel):
    clave: str = Field(min_length=1, max_length=1024)


class CarpetaAEliminar(BaseModel):
    ruta: str = Field(min_length=1, max_length=1024)
    confirmacion: str = Field(description="El nombre de la carpeta, escrito por la persona para confirmar.")


class Eliminados(BaseModel):
    archivos: int


# ---- Limpieza de chats -------------------------------------------------------------------

TipoChat = Literal["cliente", "equipo_proceso", "colaboradores", "equipo"]


class ChatParaLimpiar(BaseModel):
    id: int
    tipo: TipoChat
    proceso: str | None
    participantes: list[str]
    mensajes: int
    ultimo_mensaje: FechaHora | None


class PaginaChats(Pagina[ChatParaLimpiar]):
    pass


class ConfirmacionVaciado(BaseModel):
    confirmacion: Literal["VACIAR"] = Field(description="La palabra VACIAR, escrita por la persona.")


class ChatVaciado(BaseModel):
    mensajes_eliminados: int
