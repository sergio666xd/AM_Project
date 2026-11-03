"""Reúne los avisos de cada rol en el formato de la campana.

Cada rol tiene su fuente de avisos (`fuentes`: abogado, cliente y alertas de
administración) y su propia tabla de lecturas. Este servicio les da una forma
común y marca qué se leyó.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Callable

from sqlalchemy.orm import Session

from app import models
from app.modulos.avisos import fuentes
from app.modulos.avisos.esquemas import Aviso, Avisos
from app.modulos.identidad.modelos import Usuario
from app.nucleo.errores import SinPermiso


@dataclass(frozen=True)
class _Fuente:
    construir: Callable[[Session, Usuario], list[dict]]
    lecturas: type
    # Avisos que no se marcan a mano (p. ej. actuaciones nuevas: se quitan al abrir el radicado).
    marcable: Callable[[str], bool] = lambda _id: True


CATEGORIAS = {"proceso", "tarea", "documento", "solicitud", "radicado", "evento", "mensaje", "cliente"}


def _categoria(valor) -> str:
    valor = str(valor or "").lower()
    return valor if valor in CATEGORIAS else "sistema"


def _avisos_abogado(db: Session, usuario: Usuario) -> list[dict]:
    return [
        {"id": item["id"], "categoria": _categoria(item.get("categoria")), "titulo": item["titulo"], "detalle": item.get("descripcion"),
         "proceso": item.get("proceso"), "fecha": item.get("fecha"), "href": item["href"]}
        for item in fuentes.avisos_abogado(db, usuario)
    ]


def _avisos_cliente(db: Session, usuario: Usuario) -> list[dict]:
    return [
        {"id": item["id"], "categoria": _categoria(item.get("categoria")), "titulo": item["titulo"], "detalle": item.get("descripcion"),
         "proceso": item.get("proceso"), "fecha": item.get("fecha"), "href": item["href"]}
        for item in fuentes.avisos_cliente(db, usuario)
    ]


def _avisos_admin(db: Session, _usuario: Usuario) -> list[dict]:
    return [
        {"id": item["id"], "categoria": "sistema", "titulo": item["descripcion"], "detalle": item.get("accion_recomendada"), "proceso": None,
         "fecha": item.get("fecha"), "href": item["href"]}
        for item in fuentes.alertas_admin(db)
        if item.get("estado") != "ELIMINADA"
    ]


def _no_es_actuacion(aviso_id: str) -> bool:
    return not aviso_id.startswith(fuentes.PREFIJO_AVISO_ACTUACIONES)


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
            raise SinPermiso("Su cuenta no tiene avisos.")
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
