from fastapi import APIRouter, Depends, Query, status

from app import models
from app.api.v2.dependencias import servicio_etapas
from app.modulos.etapas.esquemas import DatosPlantillaEtapas, ListaPlantillasEtapas, PlantillaDeEtapas
from app.modulos.etapas.servicio import ServicioEtapas
from app.nucleo.sesion import usuario_actual

router = APIRouter(tags=["Etapas de los procesos"])


@router.get("/plantillas-etapas", response_model=ListaPlantillasEtapas, summary="Plantillas de etapas")
def listar_plantillas_etapas(
    todas: bool = Query(False, description="Incluye las desactivadas. Solo para quien puede editarlas."),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioEtapas = Depends(servicio_etapas),
):
    """La predeterminada primero. Las etapas vienen en orden, incluidas las desactivadas."""
    return servicio.listar(usuario, todas)


@router.post("/plantillas-etapas", response_model=PlantillaDeEtapas, status_code=status.HTTP_201_CREATED,
             summary="Crear una plantilla de etapas")
def crear_plantilla_etapas(
    datos: DatosPlantillaEtapas,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioEtapas = Depends(servicio_etapas),
):
    return servicio.crear(usuario, datos)


@router.put("/plantillas-etapas/{plantilla_id}", response_model=PlantillaDeEtapas, summary="Editar una plantilla de etapas")
def editar_plantilla_etapas(
    plantilla_id: int,
    datos: DatosPlantillaEtapas,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioEtapas = Depends(servicio_etapas),
):
    """Se envían todas las etapas en orden. Las que falten se borran si ningún proceso las usó; si no, se desactivan."""
    return servicio.editar(usuario, plantilla_id, datos)


@router.delete("/plantillas-etapas/{plantilla_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Borrar una plantilla de etapas")
def eliminar_plantilla_etapas(
    plantilla_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioEtapas = Depends(servicio_etapas),
):
    """Solo si ningún proceso la usa ni la usó y no es la predeterminada."""
    servicio.eliminar(usuario, plantilla_id)
