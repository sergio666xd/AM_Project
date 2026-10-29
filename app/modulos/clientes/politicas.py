"""Qué clientes ve cada usuario (las mismas reglas de la API v1).

- ADMIN ve a todos los clientes de la firma.
- Un abogado ve a los clientes que creó y a los vinculados a procesos activos que ve.
- Un cliente no ve la lista de clientes.
"""

from sqlalchemy import ColumnElement, false, or_, select, true

from app.modulos.expedientes.modelos import Proceso, ProcesoCliente
from app.modulos.expedientes.politicas import ROLES_ABOGADO, _rol, filtro_procesos_visibles
from app.modulos.identidad.modelos import RolUsuario, Usuario


def es_equipo(usuario: Usuario) -> bool:
    return _rol(usuario) in ROLES_ABOGADO | {RolUsuario.ADMIN}


def filtro_clientes_visibles(usuario: Usuario) -> ColumnElement[bool]:
    rol = _rol(usuario)
    if rol == RolUsuario.ADMIN:
        return true()
    if rol not in ROLES_ABOGADO:
        return false()
    vinculados = (
        select(ProcesoCliente.cliente_id)
        .join(Proceso, Proceso.id == ProcesoCliente.proceso_id)
        .where(filtro_procesos_visibles(usuario), Proceso.archivado_en.is_(None))
    )
    return or_(Usuario.creado_por_abogado_id == usuario.id, Usuario.id.in_(vinculados))


def gestiona_contratos(usuario: Usuario) -> bool:
    return _rol(usuario) in {RolUsuario.ADMIN, RolUsuario.ABOGADO_ADMIN}
