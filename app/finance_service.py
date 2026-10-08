"""Domain operations for manually managed charges and payments."""

from datetime import datetime
from decimal import Decimal, InvalidOperation
from enum import StrEnum
from typing import Protocol

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models


class PaymentOrigin(StrEnum):
    MANUAL = "MANUAL"
    EPAYCO = "EPAYCO"


class PaymentProvider(Protocol):
    """Boundary for a future provider; Phase 2 makes no external calls."""

    def create_payment(self, *, amount: Decimal, currency: str, reference: str) -> dict: ...

    def verify_payment(self, *, provider_reference: str) -> dict: ...


class DisabledPaymentProvider:
    def create_payment(self, *, amount: Decimal, currency: str, reference: str) -> dict:
        raise RuntimeError("No hay un proveedor de pagos habilitado.")

    def verify_payment(self, *, provider_reference: str) -> dict:
        raise RuntimeError("No hay un proveedor de pagos habilitado.")


def _money(value: object) -> Decimal:
    try:
        raw = Decimal(str(value))
        amount = raw.quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail="El importe no es válido.") from exc
    if not amount.is_finite():
        raise HTTPException(status_code=400, detail="El importe no es válido.")
    if raw != amount:
        raise HTTPException(status_code=400, detail="El importe admite máximo dos decimales.")
    if abs(amount) >= Decimal("1000000000000"):
        raise HTTPException(status_code=400, detail="El importe supera el límite de 12 dígitos enteros.")
    return amount


def _validate_lawyer_client(
    db: Session, *, cliente: models.Usuario, abogado: models.Usuario,
    proceso: models.Proceso | None,
) -> None:
    if abogado.rol not in {models.RolUsuario.ABOGADO_ADMIN, models.RolUsuario.ADMIN}:
        raise HTTPException(status_code=400, detail="El acreedor debe ser un abogado administrador o ADMIN.")
    if proceso is not None:
        if proceso.abogado_id != abogado.id:
            raise HTTPException(status_code=400, detail="El abogado acreedor no es responsable del expediente.")
        if not db.query(models.ProcesoCliente).filter_by(
            proceso_id=proceso.id, cliente_id=cliente.id
        ).first():
            raise HTTPException(status_code=400, detail="El cliente no pertenece al expediente seleccionado.")
        return
    if abogado.rol != models.RolUsuario.ADMIN and cliente.creado_por_abogado_id != abogado.id:
        linked_process = db.query(models.ProcesoCliente.proceso_id).join(
            models.Proceso, models.Proceso.id == models.ProcesoCliente.proceso_id,
        ).filter(
            models.Proceso.abogado_id == abogado.id,
            models.ProcesoCliente.cliente_id == cliente.id,
        ).first()
        if not linked_process:
            raise HTTPException(status_code=400, detail="El cliente no está relacionado con el abogado acreedor.")


def crear_cuenta_borrador(
    db: Session,
    *,
    proceso: models.Proceso | None,
    cliente: models.Usuario,
    abogado: models.Usuario,
    actor: models.Usuario,
    concepto: str,
    lineas: list[dict],
    fecha_vencimiento: datetime | None = None,
) -> models.CuentaCobro:
    if cliente.rol != models.RolUsuario.CLIENTE:
        raise HTTPException(status_code=400, detail="La cuenta debe corresponder a un cliente.")
    _validate_lawyer_client(db, cliente=cliente, abogado=abogado, proceso=proceso)
    if not concepto.strip() or len(concepto.strip()) > 255 or not lineas:
        raise HTTPException(status_code=400, detail="Indica un concepto y al menos un concepto facturable.")

    cuenta = models.CuentaCobro(
        abogado_id=abogado.id,
        cliente_id=cliente.id,
        proceso_id=proceso.id if proceso else None,
        cliente_snapshot={"id": cliente.id, "nombre": cliente.nombre_completo, "email": cliente.email},
        abogado_snapshot={"id": abogado.id, "nombre": abogado.nombre_completo, "email": abogado.email},
        concepto=concepto.strip(),
        moneda="COP",
        total=Decimal("0.00"),
        estado="BORRADOR",
        fecha_vencimiento=fecha_vencimiento,
        creado_por_id=actor.id,
    )
    suma = Decimal("0.00")
    for raw_line in lineas:
        descripcion = str(raw_line.get("descripcion", "")).strip()
        cantidad = _money(raw_line.get("cantidad", 1))
        unitario = _money(raw_line.get("valor_unitario", 0))
        if not descripcion or cantidad <= 0 or unitario < 0:
            raise HTTPException(status_code=400, detail="Revisa la descripción, cantidad y valor de cada línea.")
        total_linea = (cantidad * unitario).quantize(Decimal("0.01"))
        suma += total_linea
        cuenta.lineas.append(models.CuentaCobroLinea(
            descripcion=descripcion[:500], cantidad=cantidad,
            valor_unitario=unitario, total=total_linea,
        ))
    cuenta.total = suma
    db.add(cuenta)
    db.flush()
    return cuenta


def emitir_cuenta(db: Session, cuenta: models.CuentaCobro) -> models.CuentaCobro:
    if cuenta.estado != "BORRADOR":
        raise HTTPException(status_code=409, detail="Solo se puede emitir una cuenta en borrador.")
    if not cuenta.lineas or cuenta.total <= 0:
        raise HTTPException(status_code=400, detail="La cuenta debe tener líneas con valor antes de emitir.")
    now = datetime.utcnow()
    cuenta.numero = f"CC-{now:%Y}-{cuenta.id:08d}"
    cuenta.fecha_emision = now
    cuenta.estado = "EMITIDA"
    db.flush()
    return cuenta


def anular_cuenta(
    db: Session,
    *,
    cuenta: models.CuentaCobro,
    actor: models.Usuario,
    motivo: str,
) -> models.CuentaCobro:
    if cuenta.estado != "EMITIDA" or not motivo.strip():
        raise HTTPException(status_code=409, detail="Solo se puede anular una cuenta emitida e indicando el motivo.")
    active_allocations = db.query(models.AplicacionPago.id).join(
        models.PagoFinanciero, models.PagoFinanciero.id == models.AplicacionPago.pago_id,
    ).outerjoin(
        models.ReversionPago, models.ReversionPago.pago_id == models.PagoFinanciero.id,
    ).filter(
        models.AplicacionPago.cuenta_id == cuenta.id,
        models.ReversionPago.id.is_(None),
    ).first()
    if active_allocations:
        raise HTTPException(status_code=409, detail="Revierte o reasigna primero los pagos aplicados a esta cuenta.")
    cuenta.estado = "ANULADA"
    cuenta.anulada_en = datetime.utcnow()
    cuenta.motivo_anulacion = motivo.strip()
    db.flush()
    return cuenta


def calcular_saldo(db: Session, cuenta: models.CuentaCobro) -> Decimal:
    if cuenta.estado in {"BORRADOR", "ANULADA"}:
        return Decimal("0.00")
    ajustes = db.query(
        func.coalesce(func.sum(models.AjusteCuentaCobro.importe), 0)
    ).filter(models.AjusteCuentaCobro.cuenta_id == cuenta.id).scalar()
    creditos = db.query(
        func.coalesce(func.sum(models.AjusteCuentaCobro.importe), 0)
    ).filter(
        models.AjusteCuentaCobro.cuenta_id == cuenta.id,
        models.AjusteCuentaCobro.tipo == "CREDITO",
    ).scalar()
    debitos = _money(ajustes) - _money(creditos)
    aplicados = db.query(
        func.coalesce(func.sum(models.AplicacionPago.importe), 0)
    ).join(
        models.PagoFinanciero, models.PagoFinanciero.id == models.AplicacionPago.pago_id,
    ).outerjoin(
        models.ReversionPago, models.ReversionPago.pago_id == models.PagoFinanciero.id,
    ).filter(
        models.AplicacionPago.cuenta_id == cuenta.id,
        models.PagoFinanciero.estado == "REGISTRADO",
        models.ReversionPago.id.is_(None),
    ).scalar()
    return max(Decimal("0.00"), _money(cuenta.total) + debitos - _money(aplicados))


def estado_cuenta(db: Session, cuenta: models.CuentaCobro, ahora: datetime | None = None) -> str:
    if cuenta.estado in {"BORRADOR", "ANULADA"}:
        return cuenta.estado
    saldo = calcular_saldo(db, cuenta)
    if saldo == 0:
        return "PAGADA"
    if saldo < _money(cuenta.total):
        return "PARCIAL"
    if cuenta.fecha_vencimiento and cuenta.fecha_vencimiento < (ahora or datetime.utcnow()):
        return "VENCIDA"
    return "PENDIENTE"


def agregar_ajuste(
    db: Session,
    *,
    cuenta: models.CuentaCobro,
    actor: models.Usuario,
    tipo: str,
    importe: object,
    motivo: str,
) -> models.AjusteCuentaCobro:
    amount = _money(importe)
    if cuenta.estado != "EMITIDA" or amount <= 0 or tipo not in {"CREDITO", "DEBITO"} or not motivo.strip():
        raise HTTPException(status_code=400, detail="El ajuste requiere una cuenta emitida, importe positivo y motivo.")
    if tipo == "CREDITO" and amount > calcular_saldo(db, cuenta):
        raise HTTPException(status_code=400, detail="El crédito no puede superar el saldo pendiente.")
    adjustment = models.AjusteCuentaCobro(
        cuenta_id=cuenta.id, tipo=tipo, importe=amount,
        motivo=motivo.strip(), creado_por_id=actor.id,
    )
    db.add(adjustment)
    db.flush()
    return adjustment


def registrar_pago_manual(
    db: Session,
    *,
    cliente: models.Usuario,
    abogado: models.Usuario,
    actor: models.Usuario,
    importe: object,
    metodo: str,
    clave_idempotencia: str,
    referencia: str | None = None,
    proceso_id: int | None = None,
    fecha_pago: datetime | None = None,
) -> models.PagoFinanciero:
    amount = _money(importe)
    method = metodo.upper().strip()
    key = clave_idempotencia.strip()
    if cliente.rol != models.RolUsuario.CLIENTE or amount <= 0 or method not in {
        "TRANSFERENCIA", "CONSIGNACION", "EFECTIVO", "OTRO",
    } or not key or len(key) > 100:
        raise HTTPException(status_code=400, detail="Los datos del pago manual no son válidos.")
    process = db.query(models.Proceso).filter_by(id=proceso_id).first() if proceso_id is not None else None
    if proceso_id is not None and process is None:
        raise HTTPException(status_code=400, detail="El expediente no existe.")
    _validate_lawyer_client(db, cliente=cliente, abogado=abogado, proceso=process)
    existing = db.query(models.PagoFinanciero).filter_by(clave_idempotencia=key).first()
    if existing:
        if (
            existing.cliente_id != cliente.id
            or existing.abogado_id != abogado.id
            or existing.proceso_id != proceso_id
            or _money(existing.importe) != amount
            or existing.metodo != method
            or existing.referencia != ((referencia or "").strip()[:120] or None)
        ):
            raise HTTPException(status_code=409, detail="La clave de idempotencia ya se usó con otros datos.")
        return existing
    payment = models.PagoFinanciero(
        clave_idempotencia=key,
        abogado_id=abogado.id,
        cliente_id=cliente.id,
        proceso_id=proceso_id,
        abogado_snapshot={"id": abogado.id, "nombre": abogado.nombre_completo, "email": abogado.email},
        cliente_snapshot={"id": cliente.id, "nombre": cliente.nombre_completo, "email": cliente.email},
        importe=amount,
        moneda="COP",
        origen="MANUAL",
        metodo=method,
        referencia=(referencia or "").strip()[:120] or None,
        estado="REGISTRADO",
        fecha_pago=fecha_pago or datetime.utcnow(),
        registrado_por_id=actor.id,
    )
    try:
        with db.begin_nested():
            db.add(payment)
            db.flush()
    except IntegrityError as exc:
        existing = db.query(models.PagoFinanciero).filter_by(clave_idempotencia=key).first()
        if existing and (
            existing.cliente_id == cliente.id and existing.abogado_id == abogado.id
            and existing.proceso_id == proceso_id and _money(existing.importe) == amount
            and existing.metodo == method
            and existing.referencia == ((referencia or "").strip()[:120] or None)
        ):
            return existing
        raise HTTPException(status_code=409, detail="La clave de idempotencia ya fue utilizada.") from exc
    payment.numero_recibo = f"RP-{payment.fecha_pago:%Y}-{payment.id:08d}"
    db.flush()
    return payment


def aplicar_pago(
    db: Session,
    *,
    pago: models.PagoFinanciero,
    cuenta: models.CuentaCobro,
    actor: models.Usuario,
    importe: object,
) -> models.AplicacionPago:
    amount = _money(importe)
    pago = db.query(models.PagoFinanciero).filter_by(id=pago.id).with_for_update().first()
    cuenta = db.query(models.CuentaCobro).filter_by(id=cuenta.id).with_for_update().first()
    if pago is None or cuenta is None:
        raise HTTPException(status_code=404, detail="No se encontró el pago o la cuenta de cobro.")
    if pago.estado != "REGISTRADO" or db.query(models.ReversionPago).filter_by(pago_id=pago.id).first():
        raise HTTPException(status_code=409, detail="El pago está revertido o no se puede aplicar.")
    if cuenta.estado != "EMITIDA" or cuenta.cliente_id != pago.cliente_id or cuenta.abogado_id != pago.abogado_id:
        raise HTTPException(status_code=400, detail="El pago y la cuenta no pertenecen al mismo cliente y abogado.")
    allocated = _money(db.query(
        func.coalesce(func.sum(models.AplicacionPago.importe), 0)
    ).filter(models.AplicacionPago.pago_id == pago.id).scalar())
    available = _money(pago.importe) - allocated
    balance = calcular_saldo(db, cuenta)
    if amount <= 0 or amount > available or amount > balance:
        raise HTTPException(status_code=400, detail="El importe supera el saldo disponible del pago o de la cuenta.")
    allocation = models.AplicacionPago(
        pago_id=pago.id, cuenta_id=cuenta.id, importe=amount, creado_por_id=actor.id,
    )
    db.add(allocation)
    db.flush()
    return allocation


def revertir_pago(
    db: Session,
    *,
    pago: models.PagoFinanciero,
    actor: models.Usuario,
    motivo: str,
) -> models.ReversionPago:
    pago = db.query(models.PagoFinanciero).filter_by(id=pago.id).with_for_update().first()
    if pago is None:
        raise HTTPException(status_code=404, detail="No se encontró el pago.")
    if not motivo.strip():
        raise HTTPException(status_code=400, detail="Indica el motivo de la reversión.")
    if pago.estado != "REGISTRADO" or db.query(models.ReversionPago).filter_by(pago_id=pago.id).first():
        raise HTTPException(status_code=409, detail="El pago ya fue revertido o no está activo.")
    reversal = models.ReversionPago(
        pago_id=pago.id, motivo=motivo.strip(), revertido_por_id=actor.id,
    )
    db.add(reversal)
    pago.estado = "REVERTIDO"
    db.flush()
    return reversal
