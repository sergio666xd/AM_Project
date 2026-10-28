from fastapi import APIRouter, Depends

from app import models
from app.api.v2.dependencias import servicio_bandeja
from app.modulos.bandeja.esquemas import Bandeja
from app.modulos.bandeja.servicio import ServicioBandeja
from app.nucleo.sesion import usuario_actual

router = APIRouter(prefix="/bandeja", tags=["Bandeja"])


@router.get("", response_model=Bandeja, summary="Bandeja «Hoy»")
def bandeja(usuario: models.Usuario = Depends(usuario_actual), servicio: ServicioBandeja = Depends(servicio_bandeja)):
    """Tareas vencidas y por vencer, agenda de la semana y documentos del cliente por revisar,
    de los procesos activos que el usuario ve."""
    return servicio.bandeja(usuario)
