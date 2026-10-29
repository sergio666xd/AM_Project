from fastapi import APIRouter, Depends, status

from app import models
from app.api.v2.dependencias import servicio_glosario
from app.modulos.glosario.esquemas import DatosTermino, Explicacion, ListaGlosario, TerminoDelGlosario
from app.modulos.glosario.servicio import ServicioGlosario
from app.nucleo.sesion import usuario_actual

router = APIRouter(tags=["Lenguaje claro"])


@router.get("/glosario", response_model=ListaGlosario, summary="Glosario de lenguaje claro")
def listar_glosario(
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioGlosario = Depends(servicio_glosario),
):
    """Cómo se le explica al cliente cada tipo de actuación judicial."""
    return servicio.listar(usuario)


@router.post("/glosario", response_model=TerminoDelGlosario, status_code=status.HTTP_201_CREATED, summary="Agregar un término")
def crear_termino(
    datos: DatosTermino,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioGlosario = Depends(servicio_glosario),
):
    return servicio.crear(usuario, datos)


@router.put("/glosario/{termino_id}", response_model=TerminoDelGlosario, summary="Corregir un término")
def editar_termino(
    termino_id: int,
    datos: DatosTermino,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioGlosario = Depends(servicio_glosario),
):
    return servicio.editar(usuario, termino_id, datos)


@router.delete("/glosario/{termino_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Quitar un término")
def eliminar_termino(
    termino_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioGlosario = Depends(servicio_glosario),
):
    servicio.eliminar(usuario, termino_id)


@router.get("/actuaciones/{actuacion_id}/explicacion", response_model=Explicacion, summary="Explicar una actuación")
def explicar_actuacion(
    actuacion_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioGlosario = Depends(servicio_glosario),
):
    """La actuación en lenguaje claro: el comentario que la firma envió al cliente o, si no hay, el del glosario."""
    return servicio.explicacion(usuario, actuacion_id)
