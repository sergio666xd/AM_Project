"""Construcción de servicios por petición (inyección de dependencias con FastAPI)."""

from fastapi import Depends
from sqlalchemy.orm import Session

from app.modulos.avisos.servicio import ServicioAvisos
from app.modulos.busqueda.servicio import ServicioBusqueda
from app.modulos.expedientes.repositorio import RepositorioProcesos
from app.modulos.expedientes.servicio import ServicioProcesos
from app.modulos.identidad.repositorio import RepositorioUsuarios
from app.modulos.identidad.servicio import ServicioSesion
from app.nucleo.bd import obtener_bd


def servicio_sesion(db: Session = Depends(obtener_bd)) -> ServicioSesion:
    return ServicioSesion(db, RepositorioUsuarios(db))


def servicio_procesos(db: Session = Depends(obtener_bd)) -> ServicioProcesos:
    return ServicioProcesos(db, RepositorioProcesos(db))


def servicio_avisos(db: Session = Depends(obtener_bd)) -> ServicioAvisos:
    return ServicioAvisos(db)


def servicio_busqueda(db: Session = Depends(obtener_bd)) -> ServicioBusqueda:
    return ServicioBusqueda(db, RepositorioProcesos(db))
