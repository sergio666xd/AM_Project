from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app import models
from app.api.v2.dependencias import obtener_bd, servicio_sitio
from app.modulos.sitio import avisos
from app.modulos.sitio.esquemas import (
    CambioMensajeSitio,
    CambioPaginaSitio,
    ContactoPublico,
    EstadoSolicitud,
    NuevoMensajeSitio,
    PaginaPublica,
    PaginaMensajesSitio,
    PaginaSitio,
    PaginaSitioDetalle,
    MensajeSitio,
    MensajeSitioRecibido,
)
from app.modulos.sitio.servicio import ServicioSitio
from app.nucleo.paginacion import ParametrosPagina, parametros_pagina
from app.nucleo.sesion import usuario_actual
from app.rate_limit import ip_cliente

router = APIRouter(tags=["Sitio público"])


@router.get("/sitio/contacto", response_model=ContactoPublico, summary="Datos de contacto del sitio")
def ver_contacto_publico(servicio: ServicioSitio = Depends(servicio_sitio)):
    """Sin sesión. Si la administración oculta el contacto, solo trae el nombre de la firma."""
    return servicio.contacto()


@router.get("/sitio/paginas/{slug}", response_model=PaginaPublica, summary="Contenido de una página pública")
def ver_pagina_publica(slug: str, servicio: ServicioSitio = Depends(servicio_sitio)):
    """Sin sesión. `contenido` es null mientras la página use su texto base."""
    return servicio.pagina(slug)


@router.post("/sitio/mensajes", response_model=MensajeSitioRecibido, status_code=status.HTTP_201_CREATED,
             summary="Enviar un mensaje desde el formulario de contacto")
def enviar_mensaje_sitio(
    datos: NuevoMensajeSitio,
    request: Request,
    tareas: BackgroundTasks,
    db: Session = Depends(obtener_bd),
    servicio: ServicioSitio = Depends(servicio_sitio),
):
    """Sin sesión. Guarda el mensaje; el aviso a la firma y la confirmación por correo salen después de responder."""
    respuesta, solicitud_id = servicio.recibir(datos, ip=ip_cliente(request))
    if solicitud_id is not None:
        tareas.add_task(avisos.procesar, solicitud_id, db.get_bind())
    return respuesta


@router.get("/admin/sitio/mensajes", response_model=PaginaMensajesSitio, summary="Mensajes del sitio")
def listar_mensajes_sitio(
    estado: EstadoSolicitud | None = Query(None, description="Sin filtro trae todos."),
    pagina: ParametrosPagina = Depends(parametros_pagina),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioSitio = Depends(servicio_sitio),
):
    return servicio.listar(usuario, estado, pagina)


@router.get("/admin/sitio/mensajes/{mensaje_id}", response_model=MensajeSitio, summary="Ver un mensaje del sitio")
def ver_mensaje_sitio(
    mensaje_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioSitio = Depends(servicio_sitio),
):
    return servicio.detalle(usuario, mensaje_id)


@router.put("/admin/sitio/mensajes/{mensaje_id}", response_model=MensajeSitio, summary="Marcar o anotar un mensaje del sitio")
def cambiar_mensaje_sitio(
    mensaje_id: int,
    datos: CambioMensajeSitio,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioSitio = Depends(servicio_sitio),
):
    """Atendido, descartado (por ejemplo, publicidad) o de vuelta a nuevo; la nota es interna."""
    return servicio.cambiar(usuario, mensaje_id, datos)


@router.get("/admin/sitio/paginas", response_model=list[PaginaSitio], summary="Páginas del sitio y si tienen cambios")
def listar_paginas_sitio(
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioSitio = Depends(servicio_sitio),
):
    return servicio.paginas(usuario)


@router.get("/admin/sitio/paginas/{slug}", response_model=PaginaSitioDetalle, summary="Ver el contenido editado de una página")
def ver_pagina_sitio(
    slug: str,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioSitio = Depends(servicio_sitio),
):
    """`contenido` es null mientras la página use su texto base."""
    return servicio.pagina_admin(usuario, slug)


@router.put("/admin/sitio/paginas/{slug}", response_model=PaginaSitioDetalle, summary="Guardar el contenido de una página")
def guardar_pagina_sitio(
    slug: str,
    datos: CambioPaginaSitio,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioSitio = Depends(servicio_sitio),
):
    """La dirección de cada página es fija; `route` se ignora si llega."""
    return servicio.guardar_pagina(usuario, slug, datos)


@router.delete("/admin/sitio/paginas/{slug}", response_model=PaginaSitioDetalle, summary="Volver al texto base de una página")
def restaurar_pagina_sitio(
    slug: str,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioSitio = Depends(servicio_sitio),
):
    return servicio.restaurar_pagina(usuario, slug)
