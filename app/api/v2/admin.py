from typing import Literal

from fastapi import APIRouter, Depends, Query, status

from app import models
from app.api.v2.dependencias import servicio_administracion, servicio_usuarios_admin
from app.modulos.administracion.esquemas import (
    EnlaceEnviado,
    CambioEstado,
    CambioEstadoVarios,
    CambioUsuario,
    EstadoActualizado,
    EstadoCuenta,
    FichaUsuario,
    GrupoUsuarios,
    ListaAlertas,
    NuevoUsuario,
    PaginaUsuarios,
    ResumenAdmin,
)
from app.modulos.administracion.servicio import ServicioAdministracion
from app.modulos.administracion.usuarios import ServicioUsuariosAdmin
from app.nucleo.paginacion import ParametrosPagina, parametros_pagina
from app.nucleo.sesion import usuario_actual

router = APIRouter(prefix="/admin", tags=["Administración"])


@router.get("/resumen", response_model=ResumenAdmin, summary="Resumen de la administración")
def resumen_admin(
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioAdministracion = Depends(servicio_administracion),
):
    """Alertas vigentes, estado de las integraciones, cifras de la firma y actividad reciente."""
    return servicio.resumen(usuario)


@router.get("/alertas", response_model=ListaAlertas, summary="Alertas de la administración")
def listar_alertas_admin(
    descartadas: bool = Query(False, description="true: las que la administración ocultó."),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioAdministracion = Depends(servicio_administracion),
):
    return servicio.alertas(usuario, descartadas=descartadas)


@router.post("/alertas/{alerta_id}/descartar", response_model=ListaAlertas, summary="Descartar una alerta")
def descartar_alerta(
    alerta_id: str,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioAdministracion = Depends(servicio_administracion),
):
    """La oculta del resumen. Devuelve las alertas que siguen a la vista."""
    return servicio.decidir(usuario, alerta_id, descartar=True)


@router.post("/alertas/{alerta_id}/restaurar", response_model=ListaAlertas, summary="Volver a mostrar una alerta")
def restaurar_alerta(
    alerta_id: str,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioAdministracion = Depends(servicio_administracion),
):
    """Devuelve las alertas que siguen descartadas."""
    return servicio.decidir(usuario, alerta_id, descartar=False)


@router.get("/usuarios", response_model=PaginaUsuarios, summary="Cuentas de la plataforma")
def listar_usuarios_admin(
    grupo: GrupoUsuarios = "equipo",
    estado: EstadoCuenta | None = None,
    acceso: Literal["activo", "sin_ingreso"] | None = None,
    q: str | None = Query(None, max_length=120, description="Nombre, correo o WhatsApp."),
    pagina: ParametrosPagina = Depends(parametros_pagina),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioUsuariosAdmin = Depends(servicio_usuarios_admin),
):
    return servicio.listar(usuario, grupo=grupo, estado=estado, acceso=acceso, q=q, pagina=pagina)


@router.post("/usuarios", response_model=FichaUsuario, status_code=status.HTTP_201_CREATED, summary="Crear una cuenta")
def crear_usuario_admin(
    datos: NuevoUsuario,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioUsuariosAdmin = Depends(servicio_usuarios_admin),
):
    """La contraseña temporal se genera y llega por correo; la persona la cambia al entrar."""
    return servicio.crear(usuario, datos)


@router.post("/usuarios/estado", response_model=EstadoActualizado, summary="Suspender o reactivar varias cuentas")
def cambiar_estado_usuarios(
    datos: CambioEstadoVarios,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioUsuariosAdmin = Depends(servicio_usuarios_admin),
):
    return servicio.cambiar_estado_varios(usuario, datos)


@router.get("/usuarios/{usuario_id}", response_model=FichaUsuario, summary="Ficha de una cuenta")
def ficha_usuario_admin(
    usuario_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioUsuariosAdmin = Depends(servicio_usuarios_admin),
):
    return servicio.ficha(usuario, usuario_id)


@router.patch("/usuarios/{usuario_id}", response_model=FichaUsuario, summary="Editar una cuenta")
def editar_usuario_admin(
    usuario_id: int,
    datos: CambioUsuario,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioUsuariosAdmin = Depends(servicio_usuarios_admin),
):
    """El rol solo cambia en cuentas activas que aún no tienen información de la firma."""
    return servicio.cambiar(usuario, usuario_id, datos)


@router.post("/usuarios/{usuario_id}/estado", response_model=FichaUsuario, summary="Suspender o reactivar una cuenta")
def cambiar_estado_usuario(
    usuario_id: int,
    datos: CambioEstado,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioUsuariosAdmin = Depends(servicio_usuarios_admin),
):
    """Suspender cierra sus sesiones abiertas."""
    return servicio.cambiar_estado(usuario, usuario_id, datos)


@router.post("/usuarios/{usuario_id}/acceso", response_model=EnlaceEnviado, summary="Reenviar el acceso")
def reenviar_acceso_usuario(
    usuario_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioUsuariosAdmin = Depends(servicio_usuarios_admin),
):
    """Nueva contraseña temporal por correo, para quien aún no ha entrado."""
    return servicio.reenviar_acceso(usuario, usuario_id)


@router.post("/usuarios/{usuario_id}/enlace-contrasena", response_model=EnlaceEnviado, summary="Enviar enlace para cambiar la contraseña")
def enviar_enlace_contrasena(
    usuario_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioUsuariosAdmin = Depends(servicio_usuarios_admin),
):
    """Para quien ya entró y olvidó su contraseña."""
    return servicio.enviar_enlace(usuario, usuario_id)


@router.post("/usuarios/{usuario_id}/cerrar-sesiones", response_model=FichaUsuario, summary="Cerrar sus sesiones")
def cerrar_sesiones_usuario(
    usuario_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioUsuariosAdmin = Depends(servicio_usuarios_admin),
):
    """Tendrá que iniciar sesión de nuevo en todos sus dispositivos."""
    return servicio.cerrar_sesiones(usuario, usuario_id)


@router.delete("/usuarios/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Eliminar una cuenta sin información")
def eliminar_usuario_admin(
    usuario_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioUsuariosAdmin = Depends(servicio_usuarios_admin),
):
    """Solo cuentas creadas por error, sin procesos, tareas, documentos, cobros ni mensajes."""
    servicio.eliminar(usuario, usuario_id)
