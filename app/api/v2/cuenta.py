from fastapi import APIRouter, BackgroundTasks, Depends, Query, Response, status

from app import models
from app.api.v2.dependencias import servicio_cuenta
from app.modulos.cuenta.esquemas import (
    AccionSegura,
    CambioAplicado,
    CambioMisAvisos,
    CambioMiCuenta,
    CambioSeguro,
    CodigoIngresado,
    CodigoSeguridad,
    MiCuenta,
    NuevoCodigo,
    Reenvio,
)
from app.modulos.cuenta.servicio import ServicioCuenta
from app.nucleo.sesion import usuario_actual

router = APIRouter(prefix="/cuenta", tags=["Mi cuenta"])


@router.get("", response_model=MiCuenta, summary="Mi cuenta")
def mi_cuenta(
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioCuenta = Depends(servicio_cuenta),
):
    return servicio.mi_cuenta(usuario)


@router.patch("", response_model=MiCuenta, summary="Cambiar mis datos")
def cambiar_mi_cuenta(
    datos: CambioMiCuenta,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioCuenta = Depends(servicio_cuenta),
):
    """Nombre y datos para los contratos. Correo, WhatsApp y contraseña se cambian con código."""
    return servicio.cambiar(usuario, datos)


@router.put("/avisos", response_model=MiCuenta, summary="Cambiar mis canales de aviso")
def cambiar_mis_avisos(
    datos: CambioMisAvisos,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioCuenta = Depends(servicio_cuenta),
):
    return servicio.cambiar_avisos(usuario, datos)


@router.post("/codigos", response_model=CodigoSeguridad, status_code=status.HTTP_201_CREATED, summary="Pedir un código de seguridad")
def pedir_codigo(
    datos: NuevoCodigo,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioCuenta = Depends(servicio_cuenta),
):
    """Envía un código de seis dígitos por correo o WhatsApp para cambiar el correo, el WhatsApp o la contraseña."""
    return servicio.pedir_codigo(usuario, datos)


@router.get("/codigos/activo", response_model=CodigoSeguridad | None, summary="Código vigente para un cambio")
def codigo_activo(
    accion: AccionSegura = Query(description="email, whatsapp o password."),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioCuenta = Depends(servicio_cuenta),
):
    return servicio.codigo_activo(usuario, accion)


@router.post("/codigos/{codigo_id}/reenviar", response_model=CodigoSeguridad, summary="Reenviar el código")
def reenviar_codigo(
    codigo_id: str,
    datos: Reenvio,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioCuenta = Depends(servicio_cuenta),
):
    return servicio.reenviar(usuario, codigo_id, datos.canal)


@router.post("/codigos/{codigo_id}/verificar", response_model=CodigoSeguridad, summary="Verificar el código")
def verificar_codigo(
    codigo_id: str,
    datos: CodigoIngresado,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioCuenta = Depends(servicio_cuenta),
):
    return servicio.verificar(usuario, codigo_id, datos.codigo)


@router.post("/codigos/{codigo_id}/aplicar", response_model=CambioAplicado, summary="Aplicar el cambio")
def aplicar_cambio(
    codigo_id: str,
    datos: CambioSeguro,
    tareas: BackgroundTasks,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioCuenta = Depends(servicio_cuenta),
):
    """Cambia el dato después de verificar el código y avisa del cambio al correo y al WhatsApp anteriores y nuevos."""
    resultado, confirmar = servicio.aplicar(usuario, codigo_id, datos)
    tareas.add_task(confirmar)
    return resultado


@router.delete("/codigos/{codigo_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Cancelar el cambio")
def cancelar_codigo(
    codigo_id: str,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioCuenta = Depends(servicio_cuenta),
):
    servicio.cancelar(usuario, codigo_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
