"""Construcción de servicios por petición (inyección de dependencias con FastAPI)."""

from fastapi import Depends
from sqlalchemy.orm import Session

from app.modulos.administracion.repositorio import RepositorioAdministracion
from app.modulos.administracion.servicio import ServicioAdministracion
from app.modulos.administracion.usuarios import ServicioUsuariosAdmin
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
from app.modulos.finanzas.repositorio import RepositorioFinanzas
from app.modulos.finanzas.servicio import ServicioFinanzas
from app.modulos.folios.repositorio import RepositorioFolios
from app.modulos.folios.servicio import ServicioFolios
from app.modulos.glosario.repositorio import RepositorioGlosario
from app.modulos.operacion.consultas import ServicioConsultas
from app.modulos.operacion.envios import ServicioEnvios
from app.modulos.operacion.integraciones import ServicioIntegraciones
from app.modulos.operacion.plantillas import ServicioPlantillas
from app.modulos.operacion.repositorio import RepositorioOperacion
from app.modulos.sistema.actividad import ServicioActividad
from app.modulos.sistema.almacenamiento import ServicioAlmacenamiento
from app.modulos.sistema.carga import ServicioCarga
from app.modulos.sistema.chats import ServicioLimpiezaChats
from app.modulos.sistema.firma import ServicioFirma
from app.modulos.sistema.repositorio import RepositorioSistema
from app.modulos.glosario.servicio import ServicioGlosario
from app.modulos.mensajes.repositorio import RepositorioMensajes
from app.modulos.mensajes.servicio import ServicioMensajes
from app.modulos.identidad.repositorio import RepositorioUsuarios
from app.modulos.identidad.servicio import ServicioSesion
from app.modulos.portal_cliente.perfil import ServicioPerfilCliente
from app.modulos.portal_cliente.repositorio import RepositorioPortal
from app.modulos.portal_cliente.servicio import ServicioPortalCliente
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


def servicio_mensajes(db: Session = Depends(obtener_bd)) -> ServicioMensajes:
    return ServicioMensajes(db, RepositorioMensajes(db), ServicioFolios(db, RepositorioFolios(db), RepositorioProcesos(db)))


def servicio_glosario(db: Session = Depends(obtener_bd)) -> ServicioGlosario:
    return ServicioGlosario(db, RepositorioGlosario(db))


def servicio_portal_cliente(db: Session = Depends(obtener_bd)) -> ServicioPortalCliente:
    return ServicioPortalCliente(db, RepositorioPortal(db), ServicioFolios(db, RepositorioFolios(db), RepositorioProcesos(db)))


def servicio_perfil_cliente(db: Session = Depends(obtener_bd)) -> ServicioPerfilCliente:
    return ServicioPerfilCliente(db)


def servicio_finanzas(db: Session = Depends(obtener_bd)) -> ServicioFinanzas:
    return ServicioFinanzas(db, RepositorioFinanzas(db))


def servicio_administracion(db: Session = Depends(obtener_bd)) -> ServicioAdministracion:
    return ServicioAdministracion(db, RepositorioAdministracion(db))


def servicio_usuarios_admin(db: Session = Depends(obtener_bd)) -> ServicioUsuariosAdmin:
    return ServicioUsuariosAdmin(db, RepositorioAdministracion(db))


def servicio_consultas(db: Session = Depends(obtener_bd)) -> ServicioConsultas:
    return ServicioConsultas(db, RepositorioOperacion(db))


def servicio_envios(db: Session = Depends(obtener_bd)) -> ServicioEnvios:
    return ServicioEnvios(db, RepositorioOperacion(db))


def servicio_integraciones(db: Session = Depends(obtener_bd)) -> ServicioIntegraciones:
    return ServicioIntegraciones(db, RepositorioOperacion(db))


def servicio_plantillas(db: Session = Depends(obtener_bd)) -> ServicioPlantillas:
    return ServicioPlantillas(db, RepositorioOperacion(db))


def servicio_actividad(db: Session = Depends(obtener_bd)) -> ServicioActividad:
    return ServicioActividad(RepositorioSistema(db))


def servicio_carga(db: Session = Depends(obtener_bd)) -> ServicioCarga:
    return ServicioCarga(RepositorioSistema(db))


def servicio_firma(db: Session = Depends(obtener_bd)) -> ServicioFirma:
    return ServicioFirma(db, RepositorioSistema(db))


def servicio_almacenamiento(db: Session = Depends(obtener_bd)) -> ServicioAlmacenamiento:
    return ServicioAlmacenamiento(db, RepositorioSistema(db))


def servicio_limpieza_chats(db: Session = Depends(obtener_bd)) -> ServicioLimpiezaChats:
    return ServicioLimpiezaChats(db, RepositorioSistema(db))
