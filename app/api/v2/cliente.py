from fastapi import APIRouter, Depends, status

from app import models
from app.api.v2.dependencias import servicio_portal_cliente
from app.modulos.portal_cliente.esquemas import InicioCliente, PaginaHistoria, ProcesoCliente
from app.modulos.portal_cliente.servicio import ServicioPortalCliente
from app.nucleo.paginacion import ParametrosPagina, parametros_pagina
from app.nucleo.sesion import usuario_actual

router = APIRouter(prefix="/cliente", tags=["Portal del cliente"])


@router.get("/inicio", response_model=InicioCliente, summary="Inicio del cliente")
def inicio_cliente(
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioPortalCliente = Depends(servicio_portal_cliente),
):
    """Lo que la firma necesita del cliente, en qué va cada uno de sus procesos y lo último que pasó."""
    return servicio.inicio(usuario)


@router.get("/procesos/{proceso_id}", response_model=ProcesoCliente, summary="Un proceso del cliente")
def proceso_cliente(
    proceso_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioPortalCliente = Depends(servicio_portal_cliente),
):
    """Etapa, próxima fecha, pendientes y documentos de un proceso del cliente."""
    return servicio.proceso(usuario, proceso_id)


@router.get("/procesos/{proceso_id}/historia", response_model=PaginaHistoria, summary="Historia del proceso")
def historia_proceso_cliente(
    proceso_id: int,
    pagina: ParametrosPagina = Depends(parametros_pagina),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioPortalCliente = Depends(servicio_portal_cliente),
):
    """Los folios del expediente que le corresponden al cliente, del más reciente al más antiguo y en lenguaje claro."""
    return servicio.historia(usuario, proceso_id, pagina)


@router.post("/procesos/{proceso_id}/visto", status_code=status.HTTP_204_NO_CONTENT, summary="Marcar el proceso como visto")
def marcar_proceso_visto(
    proceso_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioPortalCliente = Depends(servicio_portal_cliente),
):
    """Lo que hay hasta ahora deja de aparecerle como nuevo."""
    servicio.marcar_visto(usuario, proceso_id)
