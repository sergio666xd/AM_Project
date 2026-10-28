from fastapi import APIRouter, Depends

from app import models
from app.modulos.judicial.esquemas import CalcularTermino, Termino
from app.modulos.judicial.servicio import calcular_termino
from app.nucleo.sesion import usuario_actual

router = APIRouter(prefix="/terminos", tags=["Términos judiciales"])


@router.post("/calcular", response_model=Termino, summary="Calcular el vencimiento de un término")
def calcular(datos: CalcularTermino, usuario: models.Usuario = Depends(usuario_actual)):
    """Cuenta días hábiles desde el día siguiente a la notificación, sin festivos de Colombia
    ni vacancia judicial (20 de diciembre a 10 de enero y Semana Santa)."""
    return calcular_termino(usuario, datos)
