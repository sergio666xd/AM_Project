from decimal import Decimal

from sqlalchemy import ColumnElement, case, func, select
from sqlalchemy.orm import Session, selectinload

from app.modulos.finanzas.modelos import (
    AjusteCuentaCobro,
    AplicacionPago,
    ConfiguracionCorreoFinanciero,
    CuentaCobro,
    EntregaCorreoFinanciero,
    PagoFinanciero,
    ReversionPago,
)


class RepositorioFinanzas:
    def __init__(self, db: Session):
        self._db = db

    def cuentas(self, visibles: ColumnElement[bool], *, cliente_id: int | None = None,
                proceso_id: int | None = None) -> list[CuentaCobro]:
        consulta = select(CuentaCobro).where(visibles).options(
            selectinload(CuentaCobro.lineas)
        ).order_by(CuentaCobro.created_at.desc(), CuentaCobro.id.desc())
        if cliente_id is not None:
            consulta = consulta.where(CuentaCobro.cliente_id == cliente_id)
        if proceso_id is not None:
            consulta = consulta.where(CuentaCobro.proceso_id == proceso_id)
        return list(self._db.scalars(consulta).all())

    def cuenta(self, cuenta_id: int, visibles: ColumnElement[bool], *, bloquear: bool = False) -> CuentaCobro | None:
        consulta = select(CuentaCobro).where(CuentaCobro.id == cuenta_id, visibles)
        if bloquear:
            consulta = consulta.with_for_update()
        return self._db.scalar(consulta)

    def pagado_por_cuenta(self, cuenta_ids: list[int]) -> dict[int, Decimal]:
        """Lo abonado a cada cuenta por pagos que no se han revertido."""
        if not cuenta_ids:
            return {}
        filas = self._db.execute(
            select(AplicacionPago.cuenta_id, func.sum(AplicacionPago.importe))
            .join(PagoFinanciero, PagoFinanciero.id == AplicacionPago.pago_id)
            .where(AplicacionPago.cuenta_id.in_(cuenta_ids), PagoFinanciero.estado == "REGISTRADO")
            .group_by(AplicacionPago.cuenta_id)
        ).all()
        return {cuenta_id: Decimal(total or 0) for cuenta_id, total in filas}

    def ajustes_por_cuenta(self, cuenta_ids: list[int]) -> dict[int, Decimal]:
        """Cargos menos descuentos de cada cuenta."""
        if not cuenta_ids:
            return {}
        neto = func.sum(case((AjusteCuentaCobro.tipo == "DEBITO", AjusteCuentaCobro.importe), else_=-AjusteCuentaCobro.importe))
        filas = self._db.execute(
            select(AjusteCuentaCobro.cuenta_id, neto)
            .where(AjusteCuentaCobro.cuenta_id.in_(cuenta_ids))
            .group_by(AjusteCuentaCobro.cuenta_id)
        ).all()
        return {cuenta_id: Decimal(total or 0) for cuenta_id, total in filas}

    def aplicaciones_de_cuenta(self, cuenta_id: int) -> list[tuple[AplicacionPago, PagoFinanciero]]:
        return [tuple(fila) for fila in self._db.execute(
            select(AplicacionPago, PagoFinanciero)
            .join(PagoFinanciero, PagoFinanciero.id == AplicacionPago.pago_id)
            .where(AplicacionPago.cuenta_id == cuenta_id)
            .order_by(PagoFinanciero.fecha_pago, AplicacionPago.id)
        ).all()]

    def ajustes(self, cuenta_id: int) -> list[AjusteCuentaCobro]:
        return list(self._db.scalars(
            select(AjusteCuentaCobro).where(AjusteCuentaCobro.cuenta_id == cuenta_id).order_by(AjusteCuentaCobro.id)
        ).all())

    def entregas(self, *, cuenta_id: int | None = None, pago_id: int | None = None) -> list[EntregaCorreoFinanciero]:
        E = EntregaCorreoFinanciero
        condicion = E.cuenta_id == cuenta_id if cuenta_id is not None else E.pago_id == pago_id
        return list(self._db.scalars(select(E).where(condicion).order_by(E.created_at.desc(), E.id.desc())).all())

    def pagos(self, visibles: ColumnElement[bool], *, cliente_id: int | None = None) -> list[PagoFinanciero]:
        consulta = select(PagoFinanciero).where(visibles).order_by(PagoFinanciero.fecha_pago.desc(), PagoFinanciero.id.desc())
        if cliente_id is not None:
            consulta = consulta.where(PagoFinanciero.cliente_id == cliente_id)
        return list(self._db.scalars(consulta).all())

    def pago(self, pago_id: int, visibles: ColumnElement[bool], *, bloquear: bool = False) -> PagoFinanciero | None:
        consulta = select(PagoFinanciero).where(PagoFinanciero.id == pago_id, visibles)
        if bloquear:
            consulta = consulta.with_for_update()
        return self._db.scalar(consulta)

    def pago_por_clave(self, clave: str) -> PagoFinanciero | None:
        return self._db.scalar(select(PagoFinanciero).where(PagoFinanciero.clave_idempotencia == clave))

    def aplicaciones_de_pagos(self, pago_ids: list[int]) -> dict[int, list[tuple[AplicacionPago, CuentaCobro]]]:
        if not pago_ids:
            return {}
        salida: dict[int, list[tuple[AplicacionPago, CuentaCobro]]] = {pago_id: [] for pago_id in pago_ids}
        for aplicacion, cuenta in self._db.execute(
            select(AplicacionPago, CuentaCobro)
            .join(CuentaCobro, CuentaCobro.id == AplicacionPago.cuenta_id)
            .where(AplicacionPago.pago_id.in_(pago_ids))
            .order_by(AplicacionPago.id)
        ).all():
            salida[aplicacion.pago_id].append((aplicacion, cuenta))
        return salida

    def reversiones(self, pago_ids: list[int]) -> dict[int, ReversionPago]:
        if not pago_ids:
            return {}
        return {r.pago_id: r for r in self._db.scalars(select(ReversionPago).where(ReversionPago.pago_id.in_(pago_ids))).all()}

    def configuracion(self) -> ConfiguracionCorreoFinanciero | None:
        return self._db.get(ConfiguracionCorreoFinanciero, 1)
