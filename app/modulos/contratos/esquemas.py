from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.modulos.contratos.motor import PREFIJOS_RESERVADOS

from app.modulos.bandeja.esquemas import ProcesoBreve
from app.modulos.tareas.esquemas import PersonaBreve
from app.nucleo.zona_horaria import FechaHora

EstadoContrato = Literal["BORRADOR", "LISTO_PARA_FIRMA", "EN_FIRMA", "FIRMADO", "TERMINADO", "ANULADO"]
GrupoContratos = Literal["en_curso", "firmados", "cerrados", "todos"]


class DocumentoFirmado(BaseModel):
    id: int
    nombre_archivo: str
    subido_en: FechaHora


class Contrato(BaseModel):
    id: int
    estado: EstadoContrato
    version: int
    proceso: ProcesoBreve
    expediente_archivado: bool
    cliente: PersonaBreve | None = Field(description="Si el cliente ya no existe, el nombre con el que se firmó.")
    creado_en: FechaHora
    emitido_en: FechaHora | None = Field(description="Cuando quedó listo para firmar.")
    firmado_en: FechaHora | None
    cerrado_en: FechaHora | None = Field(description="Cuando se terminó o se anuló.")
    motivo_cierre: str | None
    documento_firmado: DocumentoFirmado | None
    personas: list[str] = Field(description="Nombres de las personas del contrato, en orden; vacío en los contratos CPS de campos fijos.")


class ResumenContratos(BaseModel):
    en_preparacion: int = Field(description="Borradores.")
    por_firmar: int = Field(description="Listos para firmar o con la firma agendada.")
    firmados: int
    sin_contrato: int = Field(description="Procesos activos con cliente y sin contrato vigente.")


class ListaContratos(BaseModel):
    items: list[Contrato]
    resumen: ResumenContratos


class ProcesoSinContrato(BaseModel):
    id: int
    nombre: str
    clientes: list[PersonaBreve]
    responsable: str
    creado_en: FechaHora
    ultimo_contrato: EstadoContrato | None = Field(description="TERMINADO o ANULADO si tuvo uno; vacío si nunca.")


class ListaSinContrato(BaseModel):
    items: list[ProcesoSinContrato]


# ---- Redacción, firma y entrega (el contrato dentro del expediente) ----------

class VersionContrato(BaseModel):
    version: int
    estado: EstadoContrato
    creado_en: FechaHora


class FirmaAgendada(BaseModel):
    evento_id: int
    inicio: FechaHora
    fin: FechaHora | None = None
    estado: str = Field(description="PROGRAMADO, COMPLETADO o CANCELADO.")


class EntregaCopia(BaseModel):
    estado: Literal["ENVIADO", "ERROR"]
    destinatario: str
    enviado_en: FechaHora
    error: str | None = None


class ContratoDetalle(Contrato):
    campos: dict[str, str] = Field(description="Los datos que llenan la plantilla CPS (contratos de campos fijos).")
    plantilla: "CopiaPlantillaContrato | None" = Field(None, description="La copia de la plantilla con la que se redactó; vacía en los contratos CPS de campos fijos.")
    datos: "DatosGuardados | None" = Field(None, description="Personas, notificaciones, campos propios y datos fijos de un contrato con plantilla.")
    versiones: list[VersionContrato]
    firma: FirmaAgendada | None = Field(description="La cita de firma vigente, si ya se agendó.")
    ultima_entrega: EntregaCopia | None = Field(description="El último envío de la copia firmada al cliente.")
    puede_editar: bool = Field(description="Es el responsable o la administración y el expediente no está archivado.")


class ContratosDelProceso(BaseModel):
    items: list[ContratoDetalle] = Field(description="Del más reciente al más antiguo.")
    clientes: list[PersonaBreve] = Field(description="Clientes del proceso a los que se les puede hacer contrato.")
    puede_crear: bool


class PlantillaContrato(BaseModel):
    campos: dict[str, str] = Field(description="Datos iniciales: el abogado responsable y lo que se sabe del cliente.")


def _campos(valor: dict[str, str]) -> dict[str, str]:
    if len(valor) > 40 or any(len(k) > 40 or not isinstance(v, str) or len(v) > 5000 for k, v in valor.items()):
        raise ValueError("Los datos del contrato no tienen el formato esperado.")
    return valor


class NuevoContrato(BaseModel):
    cliente_id: int
    campos: dict[str, str]

    @field_validator("campos")
    @classmethod
    def _formato(cls, valor: dict[str, str]) -> dict[str, str]:
        return _campos(valor)


class CambiosContrato(BaseModel):
    campos: dict[str, str]

    @field_validator("campos")
    @classmethod
    def _formato(cls, valor: dict[str, str]) -> dict[str, str]:
        return _campos(valor)


class MotivoContrato(BaseModel):
    motivo: str = Field(min_length=3, max_length=500, description="Queda en el historial del contrato.")

    @field_validator("motivo")
    @classmethod
    def _motivo(cls, valor: str) -> str:
        valor = " ".join(valor.split())
        if len(valor) < 3:
            raise ValueError("Escriba el motivo.")
        return valor


class ReaperturaFirma(BaseModel):
    fecha: date | None = Field(None, description="Fecha nueva del contrato y de la cita; vacía, conserva la que tiene.")


class CitaDeFirma(BaseModel):
    inicio: datetime = Field(description="Con zona horaria.")
    fin: datetime | None = None
    lugar: str | None = Field(None, max_length=500, description="Dónde se firma; va en la descripción de la cita.")

    @model_validator(mode="after")
    def _fechas(self):
        if self.inicio.tzinfo is None or (self.fin is not None and self.fin.tzinfo is None):
            raise ValueError("Las fechas deben traer zona horaria.")
        if self.fin is not None and self.fin <= self.inicio:
            raise ValueError("La hora final va después del inicio.")
        self.lugar = (self.lugar or "").strip() or None
        return self


class ContratoCargado(BaseModel):
    contrato: ContratoDetalle
    entrega: EntregaCopia
    mensaje: str


# ---- Plantillas de contrato -------------------------------------------------------

TipoCampo = Literal["texto", "parrafo", "numero", "pesos", "porcentaje", "fecha", "opciones", "lista"]


def _limpio(valor: str | None) -> str:
    return " ".join((valor or "").split())


class CampoPlantilla(BaseModel):
    clave: str = Field(pattern=r"^[a-z][a-z0-9_]{0,39}$", description="El código con el que se usa en el texto.")
    etiqueta: str = Field(min_length=1, max_length=120)
    tipo: TipoCampo
    obligatorio: bool = True
    ayuda: str | None = Field(None, max_length=300)
    inicial: str | None = Field(None, max_length=5000, description="Texto con el que empieza el campo en el formulario.")
    opciones: list[str] = Field(default_factory=list, max_length=30)
    singular: str | None = Field(None, max_length=60, description="Listas: cómo se llama cada persona en el formulario.")
    rotulo: str | None = Field(None, max_length=80, description="Listas: el rótulo fijo en el contrato, como EL CONTRATANTE.")
    firma: bool = Field(True, description="Listas: cada persona firma al final, con huella.")

    @model_validator(mode="after")
    def _coherente(self):
        if self.clave in PREFIJOS_RESERVADOS:
            raise ValueError(f"«{self.clave}» es un dato fijo; elija otro código.")
        self.etiqueta = _limpio(self.etiqueta)
        if not self.etiqueta:
            raise ValueError("Escriba el nombre del campo.")
        self.ayuda = _limpio(self.ayuda) or None
        self.opciones = [o for o in (_limpio(x)[:120] for x in self.opciones) if o]
        if self.tipo == "opciones" and len(self.opciones) < 2:
            raise ValueError(f"«{self.etiqueta}» necesita al menos dos opciones.")
        if self.tipo == "lista":
            self.rotulo = _limpio(self.rotulo).upper()
            if not self.rotulo:
                raise ValueError(f"Escriba el rótulo de «{self.etiqueta}» en el contrato, como EL CONTRATANTE.")
            self.singular = _limpio(self.singular).upper() or self.rotulo.removeprefix("EL ").removeprefix("LA ").strip()
            self.inicial = None
        else:
            self.singular = self.rotulo = None
            self.firma = False
        return self


class FirmasPlantilla(BaseModel):
    abogado: str = Field("EL ABOGADO", min_length=1, max_length=80, description="El rótulo de la firma del abogado.")

    @field_validator("abogado")
    @classmethod
    def _rotulo(cls, valor: str) -> str:
        valor = _limpio(valor).upper()
        if not valor:
            raise ValueError("Escriba el rótulo del abogado.")
        return valor


class PlantillaContratoEntrada(BaseModel):
    nombre: str = Field(min_length=1, max_length=160)
    descripcion: str | None = Field(None, max_length=500)
    cuerpo: str = Field(min_length=1, max_length=60000, description="Markdown con códigos {{…}}.")
    campos: list[CampoPlantilla] = Field(default_factory=list, max_length=40)
    firmas: FirmasPlantilla = Field(default_factory=FirmasPlantilla)

    @model_validator(mode="after")
    def _coherente(self):
        self.nombre = _limpio(self.nombre)
        if not self.nombre:
            raise ValueError("Escriba el nombre de la plantilla.")
        self.descripcion = _limpio(self.descripcion) or None
        if not self.cuerpo.strip():
            raise ValueError("Escriba el texto de la plantilla.")
        claves = [c.clave for c in self.campos]
        if len(set(claves)) != len(claves):
            raise ValueError("Hay dos campos con el mismo código.")
        return self


class CopiaPlantillaContrato(PlantillaContratoEntrada):
    id: int | None = Field(None, description="La plantilla de origen, si todavía existe.")


class PlantillaDeContrato(PlantillaContratoEntrada):
    id: int
    actualizada_en: FechaHora
    usos: int = Field(description="Contratos hechos con esta plantilla.")


class PlantillasDeContrato(BaseModel):
    items: list[PlantillaDeContrato]


# ---- Contratos con plantilla --------------------------------------------------------


class PersonaContrato(BaseModel):
    ref: str = Field(min_length=1, max_length=40, description="Identifica a la persona dentro del contrato (notificaciones).")
    cliente_id: int | None = Field(None, description="Si es un cliente registrado del proceso.")
    nombre: str = Field("", max_length=200)
    cedula: str = Field("", max_length=40)
    ciudad: str = Field("", max_length=120)
    direccion: str = Field("", max_length=300)
    correo: str = Field("", max_length=320)
    telefono: str = Field("", max_length=40)
    genero: Literal["m", "f", ""] = Field("", description="Para la concordancia: m o f.")

    @model_validator(mode="after")
    def _limpiar(self):
        for clave in ("nombre", "cedula", "ciudad", "direccion", "correo", "telefono"):
            setattr(self, clave, _limpio(getattr(self, clave)))
        return self


class OtraNotificacion(BaseModel):
    ref: str = Field(min_length=1, max_length=40)
    nombre: str = Field("", max_length=200)
    direccion: str = Field("", max_length=300)
    correo: str = Field("", max_length=320)
    telefono: str = Field("", max_length=40)

    @model_validator(mode="after")
    def _limpiar(self):
        for clave in ("nombre", "direccion", "correo", "telefono"):
            setattr(self, clave, _limpio(getattr(self, clave)))
        return self


class Notificaciones(BaseModel):
    personas: list[str] = Field(default_factory=list, max_length=60, description="ref de las personas del contrato que se usan.")
    otras: list[OtraNotificacion] = Field(default_factory=list, max_length=10, description="Direcciones escritas a mano.")


class DatosContrato(BaseModel):
    valores: dict[str, str] = Field(default_factory=dict, description="Los campos propios de la plantilla, por código.")
    listas: dict[str, list[PersonaContrato]] = Field(default_factory=dict, description="Las personas de cada lista, por código.")
    notificaciones: Notificaciones = Field(default_factory=Notificaciones)

    @model_validator(mode="after")
    def _limites(self):
        if len(self.valores) > 60 or any(len(k) > 40 or len(v) > 5000 for k, v in self.valores.items()):
            raise ValueError("Los datos del contrato no tienen el formato esperado.")
        if len(self.listas) > 10 or any(len(personas) > 20 for personas in self.listas.values()):
            raise ValueError("Máximo 20 personas por lista.")
        refs = [p.ref for personas in self.listas.values() for p in personas] + [o.ref for o in self.notificaciones.otras]
        if len(set(refs)) != len(refs):
            raise ValueError("Hay dos personas con la misma referencia.")
        return self


class DatosGuardados(DatosContrato):
    fijos: dict[str, str] = Field(default_factory=dict, description="Proceso, abogado y fecha tal como quedaron en el contrato.")


class NuevoContratoPlantilla(BaseModel):
    plantilla_id: int
    datos: DatosContrato


class CambiosDatosContrato(BaseModel):
    datos: DatosContrato


class ContextoContrato(BaseModel):
    fijos: dict[str, str] = Field(description="Proceso, abogado responsable y fecha de hoy, por código.")
    clientes: list[PersonaContrato] = Field(description="Los clientes del proceso con los datos de su perfil.")


ContratoDetalle.model_rebuild()
