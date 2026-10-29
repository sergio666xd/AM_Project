"""Esquemas de finanzas. Los importes son pesos colombianos enteros."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator
from pydantic.networks import validate_email

from app.modulos.bandeja.esquemas import ProcesoBreve
from app.modulos.tareas.esquemas import PersonaBreve
from app.nucleo.zona_horaria import FechaHora

TOPE = 999_999_999_999

EstadoCobro = Literal["borrador", "pendiente", "parcial", "pagada", "anulada"]
FiltroCobros = Literal["por_cobrar", "vencidas", "pagadas", "borradores", "anuladas", "todas"]
MetodoPago = Literal["transferencia", "consignacion", "efectivo", "otro"]
TipoAjuste = Literal["descuento", "cargo"]
EstadoEntrega = Literal["enviado", "error"]


class Linea(BaseModel):
    descripcion: str
    cantidad: int
    valor_unitario: int
    total: int


class LineaNueva(BaseModel):
    descripcion: str = Field(min_length=1, max_length=500)
    cantidad: int = Field(1, ge=1, le=1000)
    valor_unitario: int = Field(ge=0, le=TOPE)


class CuentaBreve(BaseModel):
    id: int
    numero: str | None = Field(description="Se asigna al emitirla.")
    concepto: str
    estado: EstadoCobro
    vencida: bool = Field(description="Tiene saldo y ya pasó la fecha de vencimiento.")
    cliente: PersonaBreve
    abogado: PersonaBreve
    proceso: ProcesoBreve | None
    total: int
    pagado: int = Field(description="Pagos aplicados que no se han revertido.")
    ajustes: int = Field(description="Cargos menos descuentos.")
    saldo: int
    emitida_en: FechaHora | None
    vence_el: date | None
    creada_en: FechaHora


class ResumenCobros(BaseModel):
    por_cobrar: int = Field(description="Saldo de las cuentas emitidas sin pagar.")
    vencido: int
    cuentas_vencidas: int
    cobrado_mes: int = Field(description="Pagos registrados este mes, sin los revertidos.")
    borradores: int


class ListaCuentas(BaseModel):
    items: list[CuentaBreve]
    resumen: ResumenCobros


class AplicacionVista(BaseModel):
    id: int
    pago_id: int
    numero_recibo: str | None
    importe: int
    pagado_el: date
    metodo: MetodoPago
    revertido: bool


class AjusteVista(BaseModel):
    id: int
    tipo: TipoAjuste
    importe: int
    motivo: str
    creado_en: FechaHora
    por: str | None


class EntregaVista(BaseModel):
    id: int
    destinatario: str
    estado: EstadoEntrega
    error: str | None
    creado_en: FechaHora


class DetalleCuenta(CuentaBreve):
    lineas: list[Linea]
    aplicaciones: list[AplicacionVista]
    ajustes_detalle: list[AjusteVista]
    entregas: list[EntregaVista] = Field(description="Envíos por correo al cliente. Vacío para el cliente.")
    anulada_en: FechaHora | None
    motivo_anulacion: str | None


class CuentaNueva(BaseModel):
    cliente_id: int
    proceso_id: int | None = None
    concepto: str = Field(min_length=1, max_length=255)
    lineas: list[LineaNueva] = Field(min_length=1, max_length=50)
    vence_el: date | None = None
    emitir: bool = Field(False, description="true la emite y se la envía al cliente; false la deja en borrador.")


class CambioCuenta(BaseModel):
    proceso_id: int | None = None
    concepto: str = Field(min_length=1, max_length=255)
    lineas: list[LineaNueva] = Field(min_length=1, max_length=50)
    vence_el: date | None = None


class Motivo(BaseModel):
    motivo: str = Field(min_length=3, max_length=1000)


class AjusteNuevo(BaseModel):
    tipo: TipoAjuste
    importe: int = Field(gt=0, le=TOPE)
    motivo: str = Field(min_length=3, max_length=1000)


class AplicacionNueva(BaseModel):
    cuenta_id: int
    importe: int = Field(gt=0, le=TOPE)


class PagoNuevo(BaseModel):
    cliente_id: int
    proceso_id: int | None = None
    importe: int = Field(gt=0, le=TOPE)
    metodo: MetodoPago
    referencia: str | None = Field(None, max_length=120)
    pagado_el: date
    clave: str = Field(min_length=8, max_length=100, description="Única por pago: si se reenvía, no se duplica.")
    aplicaciones: list[AplicacionNueva] = Field(default_factory=list, description="A qué cuentas se abona. Lo que sobre queda a favor del cliente.")


class AplicacionDePago(BaseModel):
    cuenta_id: int
    numero: str | None
    concepto: str
    importe: int


class PagoVista(BaseModel):
    id: int
    numero_recibo: str | None
    cliente: PersonaBreve
    abogado: PersonaBreve
    proceso: ProcesoBreve | None
    importe: int
    aplicado: int
    disponible: int = Field(description="Lo que queda por abonar a alguna cuenta.")
    metodo: MetodoPago
    referencia: str | None
    pagado_el: date
    revertido: bool
    motivo_reversion: str | None
    registrado_en: FechaHora
    aplicaciones: list[AplicacionDePago]


class ListaPagos(BaseModel):
    items: list[PagoVista]


class TotalesEstado(BaseModel):
    cobrado: int = Field(description="Total de las cuentas emitidas, con sus ajustes.")
    pagado: int
    saldo: int
    vencido: int
    a_favor: int = Field(description="Pagos recibidos que aún no se abonan a ninguna cuenta.")


class EstadoDeCuenta(BaseModel):
    cliente: PersonaBreve
    cuentas: list[CuentaBreve]
    pagos: list[PagoVista]
    totales: TotalesEstado
    datos_pago: str | None = Field(None, description="Cómo pagar (cuentas bancarias), tal como lo configuró la firma.")


class ConfiguracionFinanzas(BaseModel):
    remitente_nombre: str = Field(min_length=2, max_length=180)
    remitente_email: str | None = Field(None, max_length=320, description="Vacío usa el remitente general del correo.")
    reply_to: str | None = Field(None, max_length=320)
    datos_pago: str | None = Field(None, max_length=2000, description="Cuentas bancarias y medios de pago que salen en la cuenta de cobro.")
    nota_documentos: str | None = Field(None, max_length=1000, description="Nota de alcance al pie de los PDF.")

    @field_validator("remitente_email", "reply_to")
    @classmethod
    def _correo(cls, valor: str | None) -> str | None:
        valor = (valor or "").strip()
        if not valor:
            return None
        try:
            return validate_email(valor)[1]
        except Exception as exc:  # noqa: BLE001 - pydantic lanza PydanticCustomError
            raise ValueError("Escriba un correo válido, como cobros@firma.com.") from exc
