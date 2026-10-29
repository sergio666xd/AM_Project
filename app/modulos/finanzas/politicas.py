"""Quién cobra y quién ve cada cuenta y cada pago.

- ADMIN ve y corrige todo, con motivo y auditoría.
- ABOGADO_ADMIN es el acreedor: cobra a los clientes de sus procesos y ve sus
  propias cuentas y pagos.
- ABOGADO no tiene permisos financieros.
- CLIENTE ve sus cuentas emitidas (nunca borradores) y sus pagos.
"""

from sqlalchemy import ColumnElement, and_, false, true

from app.modulos.expedientes.politicas import _rol
from app.modulos.finanzas.modelos import CuentaCobro, PagoFinanciero
from app.modulos.identidad.modelos import RolUsuario, Usuario


def gestiona_cobros(usuario: Usuario) -> bool:
    return _rol(usuario) in {RolUsuario.ADMIN, RolUsuario.ABOGADO_ADMIN}


def es_admin(usuario: Usuario) -> bool:
    return _rol(usuario) == RolUsuario.ADMIN


def filtro_cuentas(usuario: Usuario) -> ColumnElement[bool]:
    rol = _rol(usuario)
    if rol == RolUsuario.ADMIN:
        return true()
    if rol == RolUsuario.ABOGADO_ADMIN:
        return CuentaCobro.abogado_id == usuario.id
    if rol == RolUsuario.CLIENTE:
        return and_(CuentaCobro.cliente_id == usuario.id, CuentaCobro.estado != "BORRADOR")
    return false()


def filtro_pagos(usuario: Usuario) -> ColumnElement[bool]:
    rol = _rol(usuario)
    if rol == RolUsuario.ADMIN:
        return true()
    if rol == RolUsuario.ABOGADO_ADMIN:
        return PagoFinanciero.abogado_id == usuario.id
    if rol == RolUsuario.CLIENTE:
        return PagoFinanciero.cliente_id == usuario.id
    return false()
