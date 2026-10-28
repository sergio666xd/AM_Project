from fastapi import APIRouter, Depends, Query, status

from app import models
from app.api.v2.dependencias import servicio_clientes
from app.modulos.clientes.esquemas import AccesoEnviado, ClienteFicha, DatosCliente, GrupoClientes, ListaClientes, NuevoCliente
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
