from datetime import date

from fastapi import APIRouter, Depends, Query, Response, status

from app import models
from app.api.v2.dependencias import servicio_agenda
from app.modulos.agenda.esquemas import Agenda, EnlaceSuscripcion, Suscripcion
from app.modulos.agenda.servicio import ServicioAgenda
from app.nucleo.sesion import usuario_actual

router = APIRouter(prefix="/agenda", tags=["Agenda"])


@router.get("", response_model=Agenda, summary="Agenda del equipo")
def agenda(
    desde: date = Query(...),
    hasta: date = Query(..., description="Inclusive. Como máximo 62 días después de «desde»."),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioAgenda = Depends(servicio_agenda),
):
    """Audiencias, reuniones y demás eventos de los procesos activos que el usuario ve, y los
    vencimientos de las tareas abiertas, entre las dos fechas (hora de Colombia)."""
    return servicio.agenda(usuario, desde, hasta)


@router.get("/suscripcion", response_model=Suscripcion, summary="Estado de la suscripción de calendario")
def suscripcion(usuario: models.Usuario = Depends(usuario_actual), servicio: ServicioAgenda = Depends(servicio_agenda)):
    return servicio.suscripcion(usuario)


@router.post("/suscripcion", response_model=EnlaceSuscripcion, status_code=status.HTTP_201_CREATED,
             summary="Crear o renovar el enlace de calendario")
def crear_suscripcion(usuario: models.Usuario = Depends(usuario_actual), servicio: ServicioAgenda = Depends(servicio_agenda)):
    """Devuelve el enlace .ics una sola vez. Si ya había uno, deja de funcionar."""
    return servicio.crear_suscripcion(usuario)


@router.delete("/suscripcion", status_code=status.HTTP_204_NO_CONTENT, summary="Desactivar el enlace de calendario")
def eliminar_suscripcion(usuario: models.Usuario = Depends(usuario_actual), servicio: ServicioAgenda = Depends(servicio_agenda)):
    servicio.eliminar_suscripcion(usuario)


@router.get(
    "/feed.ics",
    response_class=Response,
    summary="Agenda en formato iCalendar",
    responses={200: {"content": {"text/calendar": {}}, "description": "Calendario .ics"}},
)
def feed(token: str = Query(..., max_length=100), servicio: ServicioAgenda = Depends(servicio_agenda)):
    """Lo leen Google Calendar, Outlook y Apple Calendar con el enlace de la suscripción.
    No usa la sesión: el token del enlace identifica al usuario."""
    return Response(
        servicio.feed(token),
        media_type="text/calendar; charset=utf-8",
        headers={"Cache-Control": "private, max-age=300", "Content-Disposition": 'inline; filename="agenda.ics"'},
    )
