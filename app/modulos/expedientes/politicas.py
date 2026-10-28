"""Quién puede ver y administrar cada proceso.

Reglas (las mismas de la API v1, en un solo lugar):

- ADMIN ve y administra todos los procesos de la firma.
- ABOGADO_ADMIN ve los procesos de los que es responsable o colaborador.
- ABOGADO ve los procesos de los que es responsable.
- CLIENTE ve los procesos a los que está vinculado y no administra ninguno.
- Administrar (archivar, reabrir, cambiar el equipo) es del responsable o de ADMIN.
"""

from sqlalchemy import ColumnElement, false, or_, select, true

from app.modulos.expedientes.modelos import Proceso, ProcesoCliente, ProcesoColaborador
from app.modulos.identidad.modelos import RolUsuario, Usuario

ROLES_ABOGADO = {RolUsuario.ABOGADO, RolUsuario.ABOGADO_ADMIN}


def _rol(usuario: Usuario) -> RolUsuario:
    return RolUsuario(getattr(usuario.rol, "value", usuario.rol))


def filtro_procesos_visibles(usuario: Usuario) -> ColumnElement[bool]:
    """Condición SQL con los procesos que el usuario puede ver."""
    rol = _rol(usuario)
    if rol == RolUsuario.ADMIN:
        return true()
    if rol == RolUsuario.ABOGADO_ADMIN:
        colaboraciones = select(ProcesoColaborador.proceso_id).where(ProcesoColaborador.abogado_id == usuario.id)
        return or_(Proceso.abogado_id == usuario.id, Proceso.id.in_(colaboraciones))
    if rol == RolUsuario.ABOGADO:
        return Proceso.abogado_id == usuario.id
    if rol == RolUsuario.CLIENTE:
        vinculos = select(ProcesoCliente.proceso_id).where(ProcesoCliente.cliente_id == usuario.id)
        return Proceso.id.in_(vinculos)
    return false()


def puede_administrar(usuario: Usuario, proceso: Proceso) -> bool:
    rol = _rol(usuario)
    return rol == RolUsuario.ADMIN or (rol in ROLES_ABOGADO and proceso.abogado_id == usuario.id)


def es_cliente(usuario: Usuario) -> bool:
    return _rol(usuario) == RolUsuario.CLIENTE
