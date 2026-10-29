from fastapi import APIRouter, Depends, Query, Response, status

from app import models
from app.api.v2.dependencias import servicio_finanzas
from app.modulos.finanzas.esquemas import (
    AjusteNuevo,
    AplicacionNueva,
    CambioCuenta,
    ConfiguracionFinanzas,
    CuentaNueva,
    DetalleCuenta,
    EntregaVista,
    EstadoDeCuenta,
    FiltroCobros,
    ListaCuentas,
    ListaPagos,
    Motivo,
    PagoNuevo,
    PagoVista,
)
from app.modulos.finanzas.servicio import ServicioFinanzas
from app.nucleo.sesion import usuario_actual

router = APIRouter(tags=["Finanzas"])
PDF = {200: {"content": {"application/pdf": {}}, "description": "El PDF."}}


def _pdf(contenido: bytes, nombre: str, descargar: bool) -> Response:
    return Response(contenido, media_type="application/pdf", headers={
        "Content-Disposition": f'{"attachment" if descargar else "inline"}; filename="{nombre}"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
    })


# ── Cuentas de cobro ─────────────────────────────────────────────────────

@router.get("/cuentas-cobro", response_model=ListaCuentas, summary="Cuentas de cobro")
def listar_cuentas_cobro(
    filtro: FiltroCobros = Query("por_cobrar", description="por_cobrar, vencidas, pagadas, borradores, anuladas o todas."),
    cliente_id: int | None = None,
    proceso_id: int | None = None,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioFinanzas = Depends(servicio_finanzas),
):
    """Las cuentas que el usuario ve, con el resumen de lo que hay por cobrar. El cliente ve las suyas emitidas."""
    return servicio.listar(usuario, filtro, cliente_id, proceso_id)


@router.post("/cuentas-cobro", response_model=DetalleCuenta, status_code=status.HTTP_201_CREATED, summary="Crear cuenta de cobro")
def crear_cuenta_cobro(datos: CuentaNueva, usuario: models.Usuario = Depends(usuario_actual),
                       servicio: ServicioFinanzas = Depends(servicio_finanzas)):
    """La deja en borrador o, con `emitir`, la numera y se la envía al cliente con el PDF."""
    return servicio.crear(usuario, datos)


@router.get("/cuentas-cobro/{cuenta_id}", response_model=DetalleCuenta, summary="Detalle de una cuenta de cobro")
def detalle_cuenta_cobro(cuenta_id: int, usuario: models.Usuario = Depends(usuario_actual),
                         servicio: ServicioFinanzas = Depends(servicio_finanzas)):
    return servicio.detalle(usuario, cuenta_id)


@router.put("/cuentas-cobro/{cuenta_id}", response_model=DetalleCuenta, summary="Editar un borrador")
def editar_cuenta_cobro(cuenta_id: int, datos: CambioCuenta, usuario: models.Usuario = Depends(usuario_actual),
                        servicio: ServicioFinanzas = Depends(servicio_finanzas)):
    return servicio.cambiar(usuario, cuenta_id, datos)


@router.delete("/cuentas-cobro/{cuenta_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Descartar un borrador")
def descartar_cuenta_cobro(cuenta_id: int, usuario: models.Usuario = Depends(usuario_actual),
                           servicio: ServicioFinanzas = Depends(servicio_finanzas)):
    servicio.descartar(usuario, cuenta_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/cuentas-cobro/{cuenta_id}/emitir", response_model=DetalleCuenta, summary="Emitir y enviar al cliente")
def emitir_cuenta_cobro(cuenta_id: int, usuario: models.Usuario = Depends(usuario_actual),
                        servicio: ServicioFinanzas = Depends(servicio_finanzas)):
    return servicio.emitir(usuario, cuenta_id)


@router.post("/cuentas-cobro/{cuenta_id}/anular", response_model=DetalleCuenta, summary="Anular una cuenta emitida")
def anular_cuenta_cobro(cuenta_id: int, datos: Motivo, usuario: models.Usuario = Depends(usuario_actual),
                        servicio: ServicioFinanzas = Depends(servicio_finanzas)):
    """Solo si no tiene pagos abonados."""
    return servicio.anular(usuario, cuenta_id, datos.motivo)


@router.post("/cuentas-cobro/{cuenta_id}/ajustes", response_model=DetalleCuenta, summary="Agregar un descuento o un cargo")
def ajustar_cuenta_cobro(cuenta_id: int, datos: AjusteNuevo, usuario: models.Usuario = Depends(usuario_actual),
                         servicio: ServicioFinanzas = Depends(servicio_finanzas)):
    return servicio.ajustar(usuario, cuenta_id, datos)


@router.post("/cuentas-cobro/{cuenta_id}/reenviar", response_model=EntregaVista, summary="Volver a enviar al cliente")
def reenviar_cuenta_cobro(cuenta_id: int, usuario: models.Usuario = Depends(usuario_actual),
                          servicio: ServicioFinanzas = Depends(servicio_finanzas)):
    return servicio.reenviar_cuenta(usuario, cuenta_id)


@router.get("/cuentas-cobro/{cuenta_id}/pdf", response_class=Response, responses=PDF, summary="PDF de la cuenta de cobro")
def pdf_cuenta_cobro(cuenta_id: int, descargar: bool = Query(False, description="true lo descarga; false lo abre en el navegador."),
                     usuario: models.Usuario = Depends(usuario_actual), servicio: ServicioFinanzas = Depends(servicio_finanzas)):
    return _pdf(*servicio.pdf_cuenta(usuario, cuenta_id), descargar)


# ── Pagos ────────────────────────────────────────────────────────────────

@router.get("/pagos", response_model=ListaPagos, summary="Pagos recibidos")
def listar_pagos(cliente_id: int | None = None, usuario: models.Usuario = Depends(usuario_actual),
                 servicio: ServicioFinanzas = Depends(servicio_finanzas)):
    return servicio.pagos(usuario, cliente_id)


@router.post("/pagos", response_model=PagoVista, status_code=status.HTTP_201_CREATED, summary="Registrar un pago")
def registrar_pago(datos: PagoNuevo, usuario: models.Usuario = Depends(usuario_actual),
                   servicio: ServicioFinanzas = Depends(servicio_finanzas)):
    """Registra un pago recibido fuera del portal y lo abona a las cuentas indicadas. El cliente recibe el recibo."""
    return servicio.registrar_pago(usuario, datos)


@router.post("/pagos/{pago_id}/aplicaciones", response_model=PagoVista, summary="Abonar un pago a cuentas")
def abonar_pago(pago_id: int, datos: list[AplicacionNueva], usuario: models.Usuario = Depends(usuario_actual),
                servicio: ServicioFinanzas = Depends(servicio_finanzas)):
    """Abona lo que queda a favor de un pago a una o varias cuentas del mismo cliente."""
    return servicio.abonar(usuario, pago_id, datos)


@router.post("/pagos/{pago_id}/revertir", response_model=PagoVista, summary="Revertir un pago")
def revertir_pago(pago_id: int, datos: Motivo, usuario: models.Usuario = Depends(usuario_actual),
                  servicio: ServicioFinanzas = Depends(servicio_finanzas)):
    """El pago no se borra: queda revertido con su motivo y deja de contar en los saldos."""
    return servicio.revertir(usuario, pago_id, datos.motivo)


@router.post("/pagos/{pago_id}/reenviar", response_model=EntregaVista, summary="Volver a enviar el recibo")
def reenviar_recibo(pago_id: int, usuario: models.Usuario = Depends(usuario_actual),
                    servicio: ServicioFinanzas = Depends(servicio_finanzas)):
    return servicio.reenviar_recibo(usuario, pago_id)


@router.get("/pagos/{pago_id}/recibo", response_class=Response, responses=PDF, summary="PDF del recibo de pago")
def recibo_pago(pago_id: int, descargar: bool = Query(False, description="true lo descarga; false lo abre en el navegador."),
                usuario: models.Usuario = Depends(usuario_actual), servicio: ServicioFinanzas = Depends(servicio_finanzas)):
    return _pdf(*servicio.pdf_recibo(usuario, pago_id), descargar)


# ── Estado de cuenta y configuración ─────────────────────────────────────

@router.get("/estado-cuenta", response_model=EstadoDeCuenta, summary="Estado de cuenta de un cliente")
def estado_de_cuenta(cliente_id: int | None = Query(None, description="Obligatorio para el equipo; el cliente ve el suyo."),
                     usuario: models.Usuario = Depends(usuario_actual), servicio: ServicioFinanzas = Depends(servicio_finanzas)):
    return servicio.estado_de_cuenta(usuario, cliente_id)


@router.get("/estado-cuenta/pdf", response_class=Response, responses=PDF, summary="PDF del estado de cuenta")
def pdf_estado_de_cuenta(cliente_id: int | None = None, descargar: bool = Query(False),
                         usuario: models.Usuario = Depends(usuario_actual), servicio: ServicioFinanzas = Depends(servicio_finanzas)):
    return _pdf(*servicio.pdf_estado(usuario, cliente_id), descargar)


@router.get("/finanzas/configuracion", response_model=ConfiguracionFinanzas, summary="Configuración financiera")
def configuracion_finanzas(usuario: models.Usuario = Depends(usuario_actual), servicio: ServicioFinanzas = Depends(servicio_finanzas)):
    """Remitente de los correos financieros, datos para pagar y nota de los PDF. Solo ADMIN."""
    return servicio.configuracion(usuario)


@router.put("/finanzas/configuracion", response_model=ConfiguracionFinanzas, summary="Guardar la configuración financiera")
def guardar_configuracion_finanzas(datos: ConfiguracionFinanzas, usuario: models.Usuario = Depends(usuario_actual),
                                   servicio: ServicioFinanzas = Depends(servicio_finanzas)):
    return servicio.guardar_configuracion(usuario, datos)
