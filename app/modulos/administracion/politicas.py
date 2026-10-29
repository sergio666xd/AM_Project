"""Toda la administración de la plataforma es del rol ADMIN; las cuentas ADMIN no se editan desde aquí."""

from app.modulos.expedientes.politicas import _rol
from app.modulos.identidad.modelos import RolUsuario, Usuario
from app.nucleo.errores import SinPermiso


def exigir_admin(usuario: Usuario) -> None:
    if _rol(usuario) != RolUsuario.ADMIN:
        raise SinPermiso("Solo la administración puede ver esto.")


def es_admin(usuario: Usuario) -> bool:
    return _rol(usuario) == RolUsuario.ADMIN
