from fastapi import APIRouter, Depends, Query, Response, status

from app import models
from app.api.v2.dependencias import servicio_clientes
from app.modulos.clientes.esquemas import (
    AccesoEnviado,
    CambiosPerfil,
    ClienteFicha,
    DatosCliente,
    GrupoClientes,
    ListaClientes,
    NuevoCliente,
    RevisionCambio,
)
from app.modulos.clientes.servicio import ServicioClientes
from app.nucleo.sesion import usuario_actual

router = APIRouter(prefix="/clientes", tags=["Clientes"])


@router.get("", response_model=ListaClientes, summary="Clientes de la firma")
def listar_clientes(
    grupo: GrupoClientes = Query("todos", description="todos, con_pendientes, sin_ingreso (no han entrado al portal) o sin_procesos."),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioClientes = Depends(servicio_clientes),
):
    """Cada cliente con sus procesos activos, lo que le falta entregar y si ya entró al portal."""
    return servicio.listar(usuario, grupo)


@router.post("", response_model=ClienteFicha, status_code=status.HTTP_201_CREATED, summary="Crear un cliente")
def crear_cliente(
    datos: NuevoCliente,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioClientes = Depends(servicio_clientes),
):
    """Crea la cuenta con una contraseña temporal generada y se la envía al cliente por el canal elegido."""
    return servicio.crear(usuario, datos)


@router.get("/{cliente_id}", response_model=ClienteFicha, summary="Ficha del cliente")
def obtener_cliente(
    cliente_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioClientes = Depends(servicio_clientes),
):
    return servicio.ficha(usuario, cliente_id)


@router.patch("/{cliente_id}", response_model=ClienteFicha, summary="Editar los datos del cliente")
def actualizar_cliente(
    cliente_id: int,
    datos: DatosCliente,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioClientes = Depends(servicio_clientes),
):
    """Cambia solo los campos enviados. El correo no se cambia: es el usuario de acceso."""
    return servicio.actualizar(usuario, cliente_id, datos)


@router.post("/{cliente_id}/acceso", response_model=AccesoEnviado, summary="Reenviar el acceso al portal")
def reenviar_acceso(
    cliente_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioClientes = Depends(servicio_clientes),
):
    """Genera otra contraseña temporal y se la envía. Solo mientras el cliente no haya entrado (409 si ya entró)."""
    return servicio.reenviar_acceso(usuario, cliente_id)


cambios_router = APIRouter(prefix="/cambios-perfil", tags=["Clientes"])


@cambios_router.get("", response_model=CambiosPerfil, summary="Cambios de datos por revisar")
def cambios_perfil(
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioClientes = Depends(servicio_clientes),
):
    """Lo que los clientes pidieron corregir en sus datos, con lo que tienen hoy al lado."""
    return servicio.cambios_perfil(usuario)


@cambios_router.post("/{solicitud_id}/aprobar", status_code=status.HTTP_204_NO_CONTENT, summary="Aprobar un cambio de datos")
def aprobar_cambio_perfil(
    solicitud_id: int,
    datos: RevisionCambio,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioClientes = Depends(servicio_clientes),
):
    servicio.aprobar_cambio(usuario, solicitud_id, datos)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@cambios_router.post("/{solicitud_id}/rechazar", status_code=status.HTTP_204_NO_CONTENT, summary="Rechazar un cambio de datos")
def rechazar_cambio_perfil(
    solicitud_id: int,
    datos: RevisionCambio,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioClientes = Depends(servicio_clientes),
):
    servicio.rechazar_cambio(usuario, solicitud_id, datos)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
