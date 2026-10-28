from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.nucleo.paginacion import Pagina
from app.nucleo.zona_horaria import FechaHora

TipoFolio = Literal[
    "actuacion", "documento", "solicitud", "contrato", "mensaje", "comunicacion", "aviso", "tarea", "evento", "etapa",
]
GrupoFolios = Literal["actuaciones", "documentos", "mensajes", "tareas"]


class ArchivoFolio(BaseModel):
    nombre: str
    url: str = Field(description="Ruta de descarga del archivo, con la sesión del usuario.")


class Folio(BaseModel):
    numero: int = Field(description="Número de folio dentro del expediente; no cambia nunca.")
    tipo: TipoFolio
    etiqueta: str = Field(description="Nombre del tipo para mostrar: «Actuación», «Mensaje»...")
    titulo: str
    detalle: str | None = None
    fecha: FechaHora
    con_hora: bool = Field(description="Falso cuando el origen solo trae el día (las actuaciones).")
    autor: str | None = Field(None, description="Quién lo incorporó: «Rama Judicial», el cliente, la abogada.")
    estado: str | None = Field(None, description="Estado corto cuando aplica, como «en curso» en una tarea.")
    archivo: ArchivoFolio | None = None
    nuevo: bool = Field(description="Llegó después de la última revisión y nadie lo ha marcado revisado.")
    retirado: bool = Field(False, description="El registro de origen se borró; el número se conserva.")


class PaginaFolios(Pagina[Folio]):
    ultimo: int = Field(description="Número del último folio del expediente (sin filtros).")
    nuevos: int = Field(description="Folios del expediente sin revisar.")


class ProcesoDelFolio(BaseModel):
    id: int
    nombre: str


class FolioNuevo(Folio):
    proceso: ProcesoDelFolio


class FoliosNuevos(BaseModel):
    items: list[FolioNuevo]
    total: int = Field(description="Folios sin revisar en todos los procesos visibles, no solo en `items`.")


class RevisarFolios(BaseModel):
    numeros: list[int] | None = Field(
        None, max_length=500, description="Folios a marcar revisados; si se omite, todos los nuevos del proceso.",
    )


class FoliosRevisados(BaseModel):
    revisados: int


class AvisarCliente(BaseModel):
    comentarios: str = Field(min_length=1, max_length=2000, description="Lo que la firma le explica al cliente.")
    cliente_ids: list[int] | None = Field(
        None, description="Clientes del proceso a los que se avisa. Vacío: a todos los vinculados."
    )


class ClientesAvisados(BaseModel):
    clientes: list[ProcesoDelFolio] = Field(description="Clientes a los que se envió el aviso (id y nombre).")


Prioridad = Literal["BAJA", "MEDIA", "ALTA", "URGENTE"]


class TareaDesdeFolio(BaseModel):
    titulo: str = Field(min_length=1, max_length=255)
    descripcion: str | None = Field(None, max_length=2000)
    fecha_limite: date | None = Field(None, description="Día de vencimiento (fin del día en Colombia).")
    prioridad: Prioridad = "MEDIA"


class TareaCreada(BaseModel):
    id: int
    titulo: str
    fecha_limite: FechaHora | None
