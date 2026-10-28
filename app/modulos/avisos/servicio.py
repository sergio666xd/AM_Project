"""Reúne los avisos de cada rol en el formato de la campana.

Cada rol ya tenía su centro de notificaciones en la API v1 (abogado, cliente y
alertas de administración), con su propia tabla de lecturas. Este servicio
los usa como fuentes y les da una forma común; cuando esos paneles pasen a la
v2, la construcción de cada lista se mueve a este módulo.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Callable

from sqlalchemy.orm import Session

from app import models
from app.modulos.avisos.esquemas import Aviso, Avisos
from app.modulos.identidad.modelos import Usuario
from app.nucleo.errores import SinPermiso


@dataclass(frozen=True)
class _Fuente:
    construir: Callable[[Session, Usuario], list[dict]]
    lecturas: type
    # Avisos que no se marcan a mano (p. ej. actuaciones nuevas: se quitan al abrir el radicado).
    marcable: Callable[[str], bool] = lambda _id: True


def _avisos_abogado(db: Session, usuario: Usuario) -> list[dict]:
    from app.routers.expedientes.notificaciones import _notificaciones_abogado

    return [
        {"id": item["id"], "titulo": item["titulo"], "detalle": item.get("descripcion"), "proceso": item.get("proceso"),
         "fecha": item.get("fecha"), "href": item["href"]}
        for item in _notificaciones_abogado(db, usuario)
    ]


def _avisos_cliente(db: Session, usuario: Usuario) -> list[dict]:
    from app.routers.expedientes.portal_cliente import _notificaciones_cliente

    return [
        {"id": item["id"], "titulo": item["titulo"], "detalle": item.get("descripcion"), "proceso": item.get("proceso"),
         "fecha": item.get("fecha"), "href": item["href"]}
        for item in _notificaciones_cliente(db, usuario)
    ]


def _avisos_admin(db: Session, _usuario: Usuario) -> list[dict]:
    from app.routers.admin.alertas import _alertas_admin

    return [
        {"id": item["id"], "titulo": item["descripcion"], "detalle": item.get("accion_recomendada"), "proceso": None,
         "fecha": item.get("fecha"), "href": item["href"]}
        for item in _alertas_admin(db)
        if item.get("estado") != "ELIMINADA"
    ]


def _no_es_actuacion(aviso_id: str) -> bool:
    from app.routers.expedientes.notificaciones import PREFIJO_AVISO_ACTUACIONES

    return not aviso_id.startswith(PREFIJO_AVISO_ACTUACIONES)


_FUENTES = {
    models.RolUsuario.ABOGADO: _Fuente(_avisos_abogado, models.LecturaNotificacionAbogado, _no_es_actuacion),
    models.RolUsuario.ABOGADO_ADMIN: _Fuente(_avisos_abogado, models.LecturaNotificacionAbogado, _no_es_actuacion),
    models.RolUsuario.CLIENTE: _Fuente(_avisos_cliente, models.LecturaNotificacionCliente),
    models.RolUsuario.ADMIN: _Fuente(_avisos_admin, models.LecturaNotificacionAdmin),
}


def _fecha(valor) -> datetime | None:
    if isinstance(valor, datetime) or valor is None:
        return valor
    try:
        return datetime.fromisoformat(str(valor))
    except ValueError:
        return None


def _orden(aviso: Aviso) -> float:
    return aviso.fecha.timestamp() if aviso.fecha else 0.0


class ServicioAvisos:
    def __init__(self, db: Session):
        self._db = db

    def _fuente(self, usuario: Usuario) -> _Fuente:
        fuente = _FUENTES.get(usuario.rol)
        if fuente is None:
            raise SinPermiso("Tu cuenta no tiene avisos.")
        return fuente

    def _leidos(self, fuente: _Fuente, usuario: Usuario) -> set[str]:
        filas = self._db.query(fuente.lecturas.notificacion_id).filter(fuente.lecturas.usuario_id == usuario.id).all()
        return {fila[0] for fila in filas}

    def listar(self, usuario: Usuario, limite: int) -> Avisos:
        fuente = self._fuente(usuario)
        leidos = self._leidos(fuente, usuario)
        avisos = [
            Aviso(**{**item, "fecha": _fecha(item["fecha"])}, leido=item["id"] in leidos and fuente.marcable(item["id"]))
            for item in fuente.construir(self._db, usuario)
        ]
        avisos.sort(key=_orden, reverse=True)
        return Avisos(items=avisos[:limite], sin_leer=sum(not aviso.leido for aviso in avisos))

    def marcar(self, usuario: Usuario, ids: list[str] | None) -> int:
        """Marca como leídos los avisos indicados (o todos, con `ids=None`) que el usuario tiene ahora."""
        fuente = self._fuente(usuario)
        actuales = {item["id"] for item in fuente.construir(self._db, usuario) if fuente.marcable(item["id"])}
        pedidos = actuales if ids is None else actuales.intersection(ids)
        nuevos = pedidos - self._leidos(fuente, usuario)
        self._db.add_all(fuente.lecturas(usuario_id=usuario.id, notificacion_id=aviso_id) for aviso_id in nuevos)
        self._db.commit()
        return len(nuevos)
