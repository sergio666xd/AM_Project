"""PDF financieros y su entrega por correo al cliente.

El correo financiero sale siempre al correo registrado del cliente, aunque haya
apagado los avisos ordinarios, y cada intento queda en
`entregas_correo_financiero` (enviado o con el error).
"""

import logging
from datetime import date

from sqlalchemy.orm import Session

from app import models
from app.email_service import enviar_correo
from app.message_templates import render_direct_message
from app.modulos.finanzas import pdf
from app.modulos.finanzas.esquemas import DetalleCuenta, EstadoDeCuenta, PagoVista
from app.modulos.finanzas.formato import ESTADOS, METODOS, dia_largo, pesos
from app.modulos.finanzas.modelos import ConfiguracionCorreoFinanciero, CuentaCobro, EntregaCorreoFinanciero, PagoFinanciero
from app.nucleo.zona_horaria import a_colombia, utc_ahora
from app.workflow_service import user_portal_url

logger = logging.getLogger(__name__)
RUTA_PAGOS = "/gestion-procesos/cliente/pagos"


def _firma(db: Session) -> pdf.Firma:
    config = db.get(models.ConfiguracionFirma, 1)
    if config is None:
        return pdf.Firma(nombre="Alejandra Muñoz | Abogada y Asociados", correo="contacto@alejandramunozabogada.com",
                         whatsapp="350 880 9878", direccion="Sabaneta, Antioquia")
    return pdf.Firma(nombre=config.nombre, correo=config.correo_contacto or "", whatsapp=config.whatsapp or "",
                     direccion=config.direccion or "", sitio=config.sitio_web or "")


def _documento(valor: str | None, prefijo: str = "C.C.") -> str:
    return f"{prefijo} {valor}" if valor else ""


def pdf_cuenta(db: Session, cuenta: CuentaCobro, detalle: DetalleCuenta, config: ConfiguracionCorreoFinanciero | None) -> bytes:
    cliente = cuenta.cliente_snapshot or {}
    abogado = cuenta.abogado_snapshot or {}
    secciones: list = [
        pdf.Bloque("Concepto", detalle.concepto),
        pdf.TablaDetalle(
            columnas=["Descripción", "Cant.", "Valor unitario", "Total"],
            filas=[[l.descripcion, str(l.cantidad), pesos(l.valor_unitario), pesos(l.total)] for l in detalle.lineas],
            anchos=[0.52, 0.1, 0.19, 0.19], derecha={1, 2, 3},
        ),
    ]
    filas = [("Subtotal", pesos(detalle.total))]
    if detalle.ajustes:
        filas.append(("Cargos" if detalle.ajustes > 0 else "Descuentos", pesos(detalle.ajustes)))
    if detalle.pagado:
        filas.append(("Pagado", pesos(-detalle.pagado)))
    secciones.append(pdf.Totales(filas=filas, final=("Saldo a pagar", pesos(detalle.saldo))))
    if config is not None and config.datos_pago and detalle.estado in {"borrador", "pendiente", "parcial"}:
        secciones.append(pdf.Bloque("Cómo pagar", config.datos_pago))
    if detalle.estado == "anulada" and detalle.motivo_anulacion:
        secciones.append(pdf.Bloque("Cuenta anulada", detalle.motivo_anulacion))
    documento = pdf.Documento(
        titulo="Cuenta de cobro",
        numero=detalle.numero or "Borrador",
        firma=_firma(db),
        partes=[
            ("De", [abogado.get("nombre", ""), _documento(abogado.get("documento")),
                    _documento(abogado.get("tarjeta_profesional"), "T.P."), abogado.get("email", "")]),
            ("Para", [cliente.get("nombre", ""), _documento(cliente.get("documento")),
                      ", ".join(v for v in (cliente.get("direccion"), cliente.get("domicilio")) if v), cliente.get("email", "")]),
        ],
        datos=[
            pdf.Fila("Fecha de emisión", pdf.fecha(a_colombia(cuenta.fecha_emision).date()) if cuenta.fecha_emision else ""),
            pdf.Fila("Pagar antes del", pdf.fecha(detalle.vence_el)),
            pdf.Fila("Proceso", detalle.proceso.nombre if detalle.proceso else ""),
            pdf.Fila("Estado", ESTADOS[detalle.estado]),
        ],
        secciones=secciones,
        nota=config.nota_documentos if config else None,
        sello="ANULADA" if detalle.estado == "anulada" else "BORRADOR" if detalle.estado == "borrador" else None,
    )
    return pdf.generar(documento)


def pdf_recibo(db: Session, vista: PagoVista, pago: PagoFinanciero, config: ConfiguracionCorreoFinanciero | None) -> bytes:
    cliente = pago.cliente_snapshot or {}
    abogado = pago.abogado_snapshot or {}
    secciones: list = [
        pdf.Bloque("Recibimos", f"La suma de {pesos(vista.importe)} de {cliente.get('nombre', 'el cliente')}."),
        pdf.TablaDetalle(
            columnas=["Abonado a la cuenta", "Concepto", "Valor"],
            filas=[[a.numero or "", a.concepto, pesos(a.importe)] for a in vista.aplicaciones],
            anchos=[0.25, 0.53, 0.22], derecha={2}, vacio="Aún no se abona a ninguna cuenta.",
        ),
        pdf.Totales(filas=[("Abonado", pesos(vista.aplicado))], final=("A favor del cliente", pesos(vista.disponible))),
    ]
    if vista.revertido and vista.motivo_reversion:
        secciones.append(pdf.Bloque("Pago revertido", vista.motivo_reversion))
    documento = pdf.Documento(
        titulo="Recibo de pago",
        numero=vista.numero_recibo,
        firma=_firma(db),
        partes=[
            ("Recibió", [abogado.get("nombre", ""), _documento(abogado.get("documento"))]),
            ("Pagó", [cliente.get("nombre", ""), _documento(cliente.get("documento"))]),
        ],
        datos=[
            pdf.Fila("Fecha del pago", pdf.fecha(vista.pagado_el)),
            pdf.Fila("Medio", METODOS[vista.metodo.upper()].capitalize()),
            pdf.Fila("Referencia", vista.referencia or ""),
            pdf.Fila("Valor", pesos(vista.importe)),
            pdf.Fila("Proceso", vista.proceso.nombre if vista.proceso else ""),
        ],
        secciones=secciones,
        nota=config.nota_documentos if config else None,
        sello="REVERTIDO" if vista.revertido else None,
    )
    return pdf.generar(documento)


def pdf_estado(db: Session, estado: EstadoDeCuenta, config: ConfiguracionCorreoFinanciero | None) -> bytes:
    hoy = a_colombia(utc_ahora()).date()
    documento = pdf.Documento(
        titulo="Estado de cuenta",
        numero=None,
        firma=_firma(db),
        partes=[("Cliente", [estado.cliente.nombre])],
        datos=[
            pdf.Fila("Con corte al", pdf.fecha(hoy)),
            pdf.Fila("Saldo pendiente", pesos(estado.totales.saldo)),
            pdf.Fila("Vencido", pesos(estado.totales.vencido) if estado.totales.vencido else ""),
            pdf.Fila("A su favor", pesos(estado.totales.a_favor) if estado.totales.a_favor else ""),
        ],
        secciones=[
            pdf.TablaDetalle(
                columnas=["Cuenta", "Concepto", "Vence", "Total", "Pagado", "Saldo", "Estado"],
                filas=[[c.numero or "", c.concepto, pdf.fecha(c.vence_el), pesos(c.total + c.ajustes), pesos(c.pagado),
                        pesos(c.saldo), "Vencida" if c.vencida else ESTADOS[c.estado]] for c in estado.cuentas],
                anchos=[0.15, 0.27, 0.1, 0.13, 0.12, 0.12, 0.11], derecha={3, 4, 5}, vacio="No hay cuentas de cobro.",
            ),
            pdf.Totales(filas=[("Cobrado", pesos(estado.totales.cobrado)), ("Pagado", pesos(estado.totales.pagado))],
                        final=("Saldo pendiente", pesos(estado.totales.saldo))),
            pdf.TablaDetalle(
                columnas=["Recibo", "Fecha", "Medio", "Valor", "Estado"],
                filas=[[p.numero_recibo or "", pdf.fecha(p.pagado_el), METODOS[p.metodo.upper()].capitalize(), pesos(p.importe),
                        "Revertido" if p.revertido else "Recibido"] for p in estado.pagos],
                anchos=[0.22, 0.16, 0.24, 0.2, 0.18], derecha={3}, vacio="No hay pagos registrados.",
            ),
        ],
        nota=config.nota_documentos if config else None,
    )
    return pdf.generar(documento)


def _enviar(db: Session, *, destinatario: str, plantilla: str, valores: dict, enlace: tuple[str, str],
            adjunto: tuple[str, bytes, str], config: ConfiguracionCorreoFinanciero | None, actor: models.Usuario,
            cuenta_id: int | None = None, pago_id: int | None = None) -> EntregaCorreoFinanciero:
    entrega = EntregaCorreoFinanciero(cuenta_id=cuenta_id, pago_id=pago_id, destinatario=destinatario or "",
                                      estado="ERROR", creado_por_id=actor.id)
    try:
        if not destinatario:
            raise ValueError("El cliente no tiene correo registrado.")
        asunto, cuerpo = render_direct_message(db, plantilla, valores, link_label=enlace[0], link_url=enlace[1])
        enviado = enviar_correo(
            destinatario, asunto, cuerpo, adjunto=adjunto,
            remitente_nombre=config.remitente_nombre if config else None,
            remitente_email=config.remitente_email if config else None,
            reply_to=config.reply_to if config else None,
        )
        if not enviado:
            raise RuntimeError("El correo saliente no está configurado.")
        entrega.estado = "ENVIADO"
    except Exception as exc:  # noqa: BLE001 - el cobro ya quedó guardado; el envío se puede repetir.
        entrega.error = str(getattr(exc, "detail", exc))[:1000]
        logger.warning("No se pudo enviar el correo financiero %s: %s", plantilla, entrega.error)
    db.add(entrega)
    db.commit()
    return entrega


def _datos_pago(config: ConfiguracionCorreoFinanciero | None) -> str:
    return f"Puede pagar así:\n{config.datos_pago.strip()}" if config and config.datos_pago else ""


def enviar_cuenta(db: Session, cuenta: CuentaCobro, detalle: DetalleCuenta, config: ConfiguracionCorreoFinanciero | None,
                  actor: models.Usuario) -> EntregaCorreoFinanciero:
    cliente = cuenta.cliente_snapshot or {}
    destinatario = cliente.get("email") or ""
    usuario_cliente = db.get(models.Usuario, cuenta.cliente_id) if cuenta.cliente_id else None
    if usuario_cliente is not None:
        destinatario = usuario_cliente.email
    valor = pesos(detalle.saldo or detalle.total)
    vence = dia_largo(detalle.vence_el) if detalle.vence_el else ""
    valores = {
        "nombre": cliente.get("nombre", ""),
        "numero": detalle.numero,
        "concepto": detalle.concepto,
        "valor": valor,
        "accion": f"Pague {valor} a más tardar el {vence}." if vence else f"Pague {valor}. Esta cuenta no tiene fecha límite.",
        "vence": vence,
        "proceso": detalle.proceso.nombre if detalle.proceso else "",
        "datos_pago": _datos_pago(config),
        "abogado": detalle.abogado.nombre,
    }
    return _enviar(
        db, destinatario=destinatario, plantilla="CUENTA_COBRO_EMITIDA", valores=valores,
        enlace=("Ver la cuenta de cobro", user_portal_url(models.RolUsuario.CLIENTE, f"{RUTA_PAGOS}#cuenta-{cuenta.id}")),
        adjunto=(f"cuenta-de-cobro-{detalle.numero}.pdf", pdf_cuenta(db, cuenta, detalle, config), "application/pdf"),
        config=config, actor=actor, cuenta_id=cuenta.id,
    )


def enviar_recibo(db: Session, pago: PagoFinanciero, vista: PagoVista, config: ConfiguracionCorreoFinanciero | None,
                  actor: models.Usuario, *, saldo: int) -> EntregaCorreoFinanciero:
    cliente = pago.cliente_snapshot or {}
    usuario_cliente = db.get(models.Usuario, pago.cliente_id) if pago.cliente_id else None
    destinatario = usuario_cliente.email if usuario_cliente else cliente.get("email") or ""
    if vista.aplicaciones:
        cuentas = ", ".join(f"{a.numero} ({a.concepto})" for a in vista.aplicaciones)
        abonos = f"Lo abonamos a la cuenta de cobro {cuentas}." if len(vista.aplicaciones) == 1 else f"Lo abonamos a las cuentas de cobro {cuentas}."
    else:
        abonos = ""
    if vista.disponible:
        abonos = f"{abonos} Le quedan {pesos(vista.disponible)} a su favor para próximas cuentas.".strip()
    valores = {
        "nombre": cliente.get("nombre", ""),
        "numero_recibo": vista.numero_recibo,
        "valor": pesos(vista.importe),
        "fecha": dia_largo(vista.pagado_el),
        "metodo": METODOS[vista.metodo.upper()].capitalize(),
        "abonos": abonos,
        "saldo": f"Le queda un saldo pendiente de {pesos(saldo)}." if saldo else "Con este pago queda al día: no tiene saldo pendiente.",
    }
    return _enviar(
        db, destinatario=destinatario, plantilla="RECIBO_PAGO", valores=valores,
        enlace=("Ver mis pagos", user_portal_url(models.RolUsuario.CLIENTE, f"{RUTA_PAGOS}#pago-{pago.id}")),
        adjunto=(f"recibo-{vista.numero_recibo}.pdf", pdf_recibo(db, vista, pago, config), "application/pdf"),
        config=config, actor=actor, pago_id=pago.id,
    )


__all__ = ["date", "enviar_cuenta", "enviar_recibo", "pdf_cuenta", "pdf_estado", "pdf_recibo"]
