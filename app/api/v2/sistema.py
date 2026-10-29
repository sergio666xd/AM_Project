from datetime import date

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from app import models
from app.api.v2.dependencias import (
    servicio_actividad,
    servicio_almacenamiento,
    servicio_carga,
    servicio_firma,
    servicio_limpieza_chats,
)
from app.modulos.sistema.actividad import ServicioActividad
from app.modulos.sistema.almacenamiento import ServicioAlmacenamiento
from app.modulos.sistema.carga import ServicioCarga
from app.modulos.sistema.chats import ServicioLimpiezaChats
from app.modulos.sistema.esquemas import (
    ArchivoAEliminar,
    AreaActividad,
    CarpetaAEliminar,
    ChatVaciado,
    ConfirmacionVaciado,
    ContenidoCarpeta,
    DatosFirma,
    DetalleRegistro,
    Eliminados,
    EnlaceTemporal,
    PaginaChats,
    PaginaRegistro,
    PanelCarga,
    TextosFirma,
)
from app.modulos.sistema.firma import ServicioFirma
from app.nucleo.paginacion import ParametrosPagina, parametros_pagina
from app.nucleo.sesion import usuario_actual

router = APIRouter(prefix="/admin", tags=["Sistema"])


class FiltrosActividad:
    def __init__(
        self,
        q: str | None = Query(None, max_length=120, description="Nombre de quien lo hizo."),
        actor_id: int | None = Query(None, description="Solo lo que hizo esta persona."),
        area: AreaActividad | None = Query(None),
        desde: date | None = Query(None, description="Día inicial, en hora de Colombia."),
        hasta: date | None = Query(None, description="Día final, incluido."),
        solo_errores: bool = Query(False, description="Solo los registros con error técnico."),
        todo: bool = Query(False, description="Incluir las acciones de rutina (descargas, alertas descartadas)."),
    ):
        self.valores = dict(q=q, actor_id=actor_id, area=area, desde=desde, hasta=hasta, solo_errores=solo_errores, todo=todo)


# ---- Actividad y auditoría -------------------------------------------------------


@router.get("/actividad", response_model=PaginaRegistro, summary="Actividad y auditoría")
def listar_actividad(
    filtros: FiltrosActividad = Depends(),
    pagina: ParametrosPagina = Depends(parametros_pagina),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioActividad = Depends(servicio_actividad),
):
    """Lo que se hizo en la plataforma, lo más reciente primero. Los registros no se pueden borrar."""
    return servicio.listar(usuario, pagina, **filtros.valores)


@router.get(
    "/actividad/csv",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/csv": {}}, "description": "Hasta 5.000 registros."}},
    summary="Descargar la actividad en CSV",
)
def descargar_actividad(
    filtros: FiltrosActividad = Depends(),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioActividad = Depends(servicio_actividad),
):
    return StreamingResponse(
        servicio.csv(usuario, **filtros.valores),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="actividad.csv"'},
    )


@router.get("/actividad/{registro_id}", response_model=DetalleRegistro, summary="Detalle técnico de un registro")
def detalle_actividad(
    registro_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioActividad = Depends(servicio_actividad),
):
    return servicio.detalle(usuario, registro_id)


# ---- Carga de trabajo -------------------------------------------------------------


@router.get("/carga", response_model=PanelCarga, summary="Carga de trabajo del equipo")
def carga_de_trabajo(
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioCarga = Depends(servicio_carga),
):
    """Procesos activos y tareas abiertas por persona. También la ve la abogada directora."""
    return servicio.panel(usuario)


# ---- Datos de la firma -------------------------------------------------------------


@router.get("/firma", response_model=DatosFirma, summary="Datos de la firma")
def ver_datos_firma(
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioFirma = Depends(servicio_firma),
):
    return servicio.ver(usuario)


@router.put("/firma", response_model=DatosFirma, summary="Guardar los datos de la firma")
def guardar_datos_firma(
    datos: TextosFirma,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioFirma = Depends(servicio_firma),
):
    """Los usan el sitio público, el pie de los correos y los PDF de cobro."""
    return servicio.guardar(usuario, datos)


# ---- Almacenamiento -----------------------------------------------------------------


@router.get("/almacenamiento", response_model=ContenidoCarpeta, summary="Archivos guardados")
def contenido_almacenamiento(
    ruta: str = Query("", max_length=1024, description="Carpeta a listar; vacío es la raíz."),
    siguiente: str | None = Query(None, max_length=2048, description="Para pedir más archivos de la misma carpeta."),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioAlmacenamiento = Depends(servicio_almacenamiento),
):
    return servicio.contenido(usuario, ruta, siguiente)


@router.get("/almacenamiento/enlace", response_model=EnlaceTemporal, summary="Abrir un archivo guardado")
def enlace_almacenamiento(
    clave: str = Query(..., min_length=1, max_length=1024),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioAlmacenamiento = Depends(servicio_almacenamiento),
):
    """Un enlace que sirve 15 minutos."""
    return servicio.enlace(usuario, clave)


@router.post("/almacenamiento/eliminar-archivo", response_model=Eliminados, summary="Borrar un archivo huérfano")
def eliminar_archivo_guardado(
    datos: ArchivoAEliminar,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioAlmacenamiento = Depends(servicio_almacenamiento),
):
    """Solo archivos que ningún documento usa; los demás se retiran desde su expediente."""
    return servicio.eliminar_archivo(usuario, datos.clave)


@router.post("/almacenamiento/eliminar-carpeta", response_model=Eliminados, summary="Borrar una carpeta sin documentos")
def eliminar_carpeta_guardada(
    datos: CarpetaAEliminar,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioAlmacenamiento = Depends(servicio_almacenamiento),
):
    return servicio.eliminar_carpeta(usuario, datos.ruta, datos.confirmacion)


# ---- Limpieza de chats -------------------------------------------------------------------


@router.get("/chats", response_model=PaginaChats, summary="Conversaciones del chat")
def listar_chats_para_limpiar(
    pagina: ParametrosPagina = Depends(parametros_pagina),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioLimpiezaChats = Depends(servicio_limpieza_chats),
):
    """Quiénes participan, cuántos mensajes hay y cuándo fue el último. Nunca el contenido."""
    return servicio.listar(usuario, pagina)


@router.post("/chats/{chat_id}/vaciar", response_model=ChatVaciado, summary="Vaciar una conversación")
def vaciar_chat(
    chat_id: int,
    datos: ConfirmacionVaciado,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioLimpiezaChats = Depends(servicio_limpieza_chats),
):
    return servicio.vaciar(usuario, chat_id)
