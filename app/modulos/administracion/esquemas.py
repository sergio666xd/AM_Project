from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.nucleo.paginacion import Pagina
from app.nucleo.zona_horaria import FechaHora

# ---- Resumen ---------------------------------------------------------------

TipoAlerta = Literal["consulta_fallida", "entrega_fallida", "solicitud_perfil", "sin_ingreso"]
Gravedad = Literal["alta", "media"]
EstadoSalud = Literal["ok", "aviso", "falla", "sin_configurar"]
ClaveIntegracion = Literal["rama_judicial", "correo", "whatsapp", "push", "almacenamiento"]


class Alerta(BaseModel):
    id: str = Field(description="Estable mientras dure el problema, por ejemplo `consulta:812`.")
    tipo: TipoAlerta
    gravedad: Gravedad
    titulo: str
    detalle: str | None
    enlace: str = Field(description="Ruta del panel donde se resuelve.")
    accion: str = Field(description="Texto del enlace, por ejemplo «Ver la consulta».")
    fecha: FechaHora | None
    descartada: bool


class ListaAlertas(BaseModel):
    items: list[Alerta]
    descartadas: int = Field(description="Alertas vigentes que la administración ocultó.")


class EstadoIntegracion(BaseModel):
    clave: ClaveIntegracion
    nombre: str
    estado: EstadoSalud
    resumen: str = Field(description="Una frase: «Última consulta hoy a las 12:00», «Faltan los datos del servidor».")
    detalle: str | None
    ultima_vez: FechaHora | None
    enlace: str


class CifraFirma(BaseModel):
    clave: Literal["procesos_activos", "tareas_vencidas", "documentos_por_revisar", "cuentas_vencidas"]
    cantidad: int
    texto: str = Field(description="La cifra en una frase: «3 tareas vencidas».")
    enlace: str
    atencion: bool = Field(description="Verdadero cuando la cifra pide revisar algo.")


class EventoActividad(BaseModel):
    id: int
    actor: str | None
    actor_id: int | None
    frase: str = Field(description="Lo que hizo, en pasado: «emitió una cuenta de cobro».")
    enlace: str | None
    fecha: FechaHora


class ResumenAdmin(BaseModel):
    alertas: list[Alerta] = Field(description="Alertas vigentes sin descartar, las graves primero.")
    alertas_descartadas: int
    integraciones: list[EstadoIntegracion]
    firma: list[CifraFirma]
    actividad: list[EventoActividad]


# ---- Usuarios --------------------------------------------------------------

Rol = Literal["ABOGADO_ADMIN", "ABOGADO", "CLIENTE", "ADMIN"]
# Los abogados asociados (ABOGADO) se crean cuando dejen el portal SaaS y usen el panel del abogado.
RolCreable = Literal["ABOGADO_ADMIN", "CLIENTE"]
EstadoCuenta = Literal["activo", "suspendido", "pendiente", "rechazado"]
Acceso = Literal["activo", "sin_ingreso", "suspendido"]
GrupoUsuarios = Literal["equipo", "clientes", "administradores"]


class PersonaBreve(BaseModel):
    id: int
    nombre: str


class UsuarioFila(BaseModel):
    id: int
    nombre: str
    email: str
    whatsapp: str | None
    rol: Rol
    estado: EstadoCuenta
    acceso: Acceso = Field(description="sin_ingreso: aún no entra con su contraseña temporal.")
    ultimo_acceso: FechaHora | None
    creado_en: FechaHora | None
    procesos: int = Field(description="Procesos activos en los que participa.")
    responsable: PersonaBreve | None = Field(description="Abogado de la firma a cargo del cliente.")


class ConteoUsuarios(BaseModel):
    equipo: int
    clientes: int
    administradores: int
    sin_ingreso: int
    suspendidos: int


class PaginaUsuarios(Pagina[UsuarioFila]):
    conteo: ConteoUsuarios


class ProcesoDelUsuario(BaseModel):
    id: int
    nombre: str
    papel: Literal["responsable", "colaborador", "cliente"]
    archivado: bool
    responsable: str | None


class TotalesUsuario(BaseModel):
    procesos: int
    tareas_abiertas: int
    documentos: int
    cuentas_cobro: int


class FichaUsuario(UsuarioFila):
    debe_cambiar_password: bool
    totales: TotalesUsuario
    procesos_detalle: list[ProcesoDelUsuario]
    actividad: list[EventoActividad]
    puede_eliminarse: bool = Field(description="Solo las cuentas sin información asociada se pueden eliminar.")
    puede_cambiar_rol: bool


def _limpio(valor: str | None) -> str | None:
    if valor is None:
        return None
    valor = " ".join(valor.split())
    return valor or None


class NuevoUsuario(BaseModel):
    nombre: str = Field(min_length=2, max_length=150)
    email: EmailStr
    whatsapp: str | None = Field(default=None, max_length=20)
    rol: RolCreable
    responsable_id: int | None = Field(default=None, description="Obligatorio para clientes: abogado de la firma a cargo.")

    @field_validator("nombre", "whatsapp", mode="before")
    @classmethod
    def _normalizar(cls, valor):
        return _limpio(valor) if isinstance(valor, str) else valor


class CambioUsuario(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=150)
    whatsapp: str | None = Field(default=None, max_length=20)
    rol: RolCreable | None = None
    responsable_id: int | None = None

    @field_validator("nombre", "whatsapp", mode="before")
    @classmethod
    def _normalizar(cls, valor):
        return _limpio(valor) if isinstance(valor, str) else valor


class CambioEstado(BaseModel):
    estado: Literal["activo", "suspendido"]


class CambioEstadoVarios(CambioEstado):
    ids: list[int] = Field(min_length=1, max_length=200)


class EstadoActualizado(BaseModel):
    actualizados: int


class AccesoEnviado(BaseModel):
    destino: str = Field(description="Correo al que se envió.")
