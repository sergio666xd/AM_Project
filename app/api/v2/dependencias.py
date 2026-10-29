"""Construcción de servicios por petición (inyección de dependencias con FastAPI)."""

from fastapi import Depends
from sqlalchemy.orm import Session

from app.modulos.agenda.repositorio import RepositorioAgenda
from app.modulos.agenda.servicio import ServicioAgenda
from app.modulos.avisos.servicio import ServicioAvisos
from app.modulos.bandeja.repositorio import RepositorioBandeja
from app.modulos.bandeja.servicio import ServicioBandeja
from app.modulos.busqueda.servicio import ServicioBusqueda
from app.modulos.clientes.repositorio import RepositorioClientes
from app.modulos.clientes.servicio import ServicioClientes
from app.modulos.contratos.repositorio import RepositorioContratos
from app.modulos.contratos.servicio import ServicioContratos
from app.modulos.documentos.repositorio import RepositorioDocumentos
from app.modulos.documentos.servicio import ServicioDocumentos
from app.modulos.expedientes.repositorio import RepositorioProcesos
from app.modulos.expedientes.servicio import ServicioProcesos
from app.modulos.folios.repositorio import RepositorioFolios
from app.modulos.folios.servicio import ServicioFolios
from app.modulos.identidad.repositorio import RepositorioUsuarios
from app.modulos.identidad.servicio import ServicioSesion
from app.modulos.tareas.repositorio import RepositorioTareas
from app.modulos.tareas.servicio import ServicioTareas
from app.nucleo.bd import obtener_bd


def servicio_sesion(db: Session = Depends(obtener_bd)) -> ServicioSesion:
    return ServicioSesion(db, RepositorioUsuarios(db))


def servicio_procesos(db: Session = Depends(obtener_bd)) -> ServicioProcesos:
    return ServicioProcesos(db, RepositorioProcesos(db))


def servicio_avisos(db: Session = Depends(obtener_bd)) -> ServicioAvisos:
    return ServicioAvisos(db)


def servicio_busqueda(db: Session = Depends(obtener_bd)) -> ServicioBusqueda:
    return ServicioBusqueda(db, RepositorioProcesos(db))


def servicio_folios(db: Session = Depends(obtener_bd)) -> ServicioFolios:
    return ServicioFolios(db, RepositorioFolios(db), RepositorioProcesos(db))


def servicio_bandeja(db: Session = Depends(obtener_bd)) -> ServicioBandeja:
    return ServicioBandeja(RepositorioBandeja(db))


def servicio_tareas(db: Session = Depends(obtener_bd)) -> ServicioTareas:
    return ServicioTareas(db, RepositorioTareas(db))


def servicio_agenda(db: Session = Depends(obtener_bd)) -> ServicioAgenda:
    return ServicioAgenda(db, RepositorioAgenda(db))


def servicio_documentos(db: Session = Depends(obtener_bd)) -> ServicioDocumentos:
    return ServicioDocumentos(db, RepositorioDocumentos(db))


def servicio_clientes(db: Session = Depends(obtener_bd)) -> ServicioClientes:
    return ServicioClientes(db, RepositorioClientes(db))


def servicio_contratos(db: Session = Depends(obtener_bd)) -> ServicioContratos:
    return ServicioContratos(db, RepositorioContratos(db))
