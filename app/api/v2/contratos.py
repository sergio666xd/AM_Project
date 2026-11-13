from urllib.parse import quote

from io import BytesIO

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile, status
from fastapi.responses import StreamingResponse

from app import models
from app.api.v2.dependencias import servicio_contratos
from app.document_validation import MAX_DOCUMENT_BYTES
from app.modulos.contratos.esquemas import (
    CambiosContrato,
    CambiosDatosContrato,
    ContextoContrato,
    PlantillasDeContrato,
    NuevoContratoPlantilla,
    PlantillaDeContrato,
    PlantillaContratoEntrada,
    ContratoCargado,
    ContratoDetalle,
    ContratosDelProceso,
    CitaDeFirma,
    ReaperturaFirma,
    GrupoContratos,
    ListaContratos,
    ListaSinContrato,
    MotivoContrato,
    NuevoContrato,
    PlantillaContrato,
)
from app.modulos.contratos.servicio import ServicioContratos
from app.nucleo.sesion import usuario_actual

router = APIRouter(prefix="/contratos", tags=["Contratos"])


@router.get("", response_model=ListaContratos, summary="Contratos de servicios")
def listar_contratos(
    grupo: GrupoContratos = Query("en_curso", description="en_curso (borrador, listo o en firma), firmados, cerrados o todos."),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioContratos = Depends(servicio_contratos),
):
    """Los contratos de los procesos que el usuario ve, con el escaneado firmado si ya lo hay."""
    return servicio.listar(usuario, grupo)


@router.get("/sin-contrato", response_model=ListaSinContrato, summary="Procesos sin contrato")
def procesos_sin_contrato(
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioContratos = Depends(servicio_contratos),
):
    """Procesos activos con cliente que no tienen un contrato vigente."""
    return servicio.sin_contrato(usuario)


PDF = {200: {"content": {"application/pdf": {}}, "description": "El contrato en PDF."}}


def _pdf(contenido: bytes, nombre: str) -> StreamingResponse:
    return StreamingResponse(BytesIO(contenido), media_type="application/pdf", headers={
        "Content-Disposition": f'inline; filename="{nombre}"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    })


# ---- El contrato dentro del expediente -------------------------------------------


@router.get("/proceso/{proceso_id}", response_model=ContratosDelProceso, summary="Contratos de un proceso")
def contratos_del_proceso(
    proceso_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioContratos = Depends(servicio_contratos),
):
    """Cada contrato con sus datos, versiones, la cita de firma y el último envío de la copia al cliente."""
    return servicio.del_proceso(usuario, proceso_id)


@router.get("/proceso/{proceso_id}/plantilla", response_model=PlantillaContrato, summary="Datos iniciales de un contrato")
def plantilla_contrato(
    proceso_id: int,
    cliente_id: int | None = Query(None, description="Llena los datos que la cuenta del cliente ya tiene."),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioContratos = Depends(servicio_contratos),
):
    return servicio.plantilla(usuario, proceso_id, cliente_id)


@router.post("/proceso/{proceso_id}", response_model=ContratoDetalle, status_code=status.HTTP_201_CREATED,
             summary="Crear un contrato en borrador")
def crear_contrato(
    proceso_id: int,
    datos: NuevoContrato,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioContratos = Depends(servicio_contratos),
):
    return servicio.crear(usuario, proceso_id, datos)


@router.post("/proceso/{proceso_id}/vista-previa", response_class=StreamingResponse, responses=PDF,
             summary="Vista previa del contrato")
def vista_previa_contrato(
    proceso_id: int,
    datos: NuevoContrato,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioContratos = Depends(servicio_contratos),
):
    """El PDF con los datos del formulario, sin guardarlos. Exige los datos completos."""
    return _pdf(servicio.vista_previa(usuario, proceso_id, datos), "contrato-vista-previa.pdf")


# ---- Plantillas de contrato ----------------------------------------------------------


@router.get("/plantillas", response_model=PlantillasDeContrato, summary="Plantillas de contrato")
def listar_plantillas_contrato(
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioContratos = Depends(servicio_contratos),
):
    """Las plantillas vigentes, con cuántos contratos se han hecho con cada una."""
    return servicio.plantillas(usuario)


@router.post("/plantillas", response_model=PlantillaDeContrato, status_code=status.HTTP_201_CREATED, summary="Crear una plantilla")
def crear_plantilla_contrato(
    entrada: PlantillaContratoEntrada,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioContratos = Depends(servicio_contratos),
):
    """No se guarda si el texto usa códigos que no existen o listas mal cerradas."""
    return servicio.crear_plantilla(usuario, entrada)


@router.put("/plantillas/{plantilla_id}", response_model=PlantillaDeContrato, summary="Cambiar una plantilla")
def editar_plantilla_contrato(
    plantilla_id: int,
    entrada: PlantillaContratoEntrada,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioContratos = Depends(servicio_contratos),
):
    """Los contratos ya hechos con ella no cambian: guardan su propia copia."""
    return servicio.editar_plantilla(usuario, plantilla_id, entrada)


@router.post("/plantillas/{plantilla_id}/duplicar", response_model=PlantillaDeContrato, status_code=status.HTTP_201_CREATED,
             summary="Duplicar una plantilla")
def duplicar_plantilla_contrato(
    plantilla_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioContratos = Depends(servicio_contratos),
):
    return servicio.duplicar_plantilla(usuario, plantilla_id)


@router.delete("/plantillas/{plantilla_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Eliminar una plantilla")
def eliminar_plantilla_contrato(
    plantilla_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioContratos = Depends(servicio_contratos),
):
    """Deja de ofrecerse para contratos nuevos; los contratos hechos con ella conservan su copia."""
    servicio.eliminar_plantilla(usuario, plantilla_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/proceso/{proceso_id}/contexto", response_model=ContextoContrato, summary="Datos para un contrato con plantilla")
def contexto_contrato(
    proceso_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioContratos = Depends(servicio_contratos),
):
    """Los datos fijos (proceso, abogado responsable, fecha) y los clientes del proceso con su perfil."""
    return servicio.contexto(usuario, proceso_id)


@router.post("/proceso/{proceso_id}/con-plantilla", response_model=ContratoDetalle, status_code=status.HTTP_201_CREATED,
             summary="Crear un contrato con plantilla")
def crear_contrato_con_plantilla(
    proceso_id: int,
    entrada: NuevoContratoPlantilla,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioContratos = Depends(servicio_contratos),
):
    """Queda en borrador con una copia de la plantilla. Lo que el perfil de un cliente no tenía se guarda también allí."""
    return servicio.crear_con_plantilla(usuario, proceso_id, entrada)


@router.post("/proceso/{proceso_id}/con-plantilla/vista-previa", response_class=StreamingResponse, responses=PDF,
             summary="Vista previa de un contrato con plantilla")
def vista_previa_con_plantilla(
    proceso_id: int,
    entrada: NuevoContratoPlantilla,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioContratos = Depends(servicio_contratos),
):
    """El PDF sin guardar nada; lo que falta sale resaltado."""
    return _pdf(servicio.vista_previa_plantilla(usuario, proceso_id, entrada), "contrato-vista-previa.pdf")


@router.patch("/{contrato_id}/datos", response_model=ContratoDetalle, summary="Cambiar los datos de un borrador con plantilla")
def editar_datos_contrato(
    contrato_id: int,
    cambios: CambiosDatosContrato,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioContratos = Depends(servicio_contratos),
):
    return servicio.editar_datos(usuario, contrato_id, cambios)


@router.get("/{contrato_id}", response_model=ContratoDetalle, summary="Un contrato")
def obtener_contrato(
    contrato_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioContratos = Depends(servicio_contratos),
):
    return servicio.detalle(usuario, contrato_id)


@router.patch("/{contrato_id}", response_model=ContratoDetalle, summary="Cambiar los datos de un borrador")
def editar_contrato(
    contrato_id: int,
    datos: CambiosContrato,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioContratos = Depends(servicio_contratos),
):
    return servicio.editar(usuario, contrato_id, datos)


@router.delete("/{contrato_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Eliminar un contrato anulado")
def eliminar_contrato(
    contrato_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioContratos = Depends(servicio_contratos),
):
    """Los archivos subidos y la agenda quedan en el expediente; una cita de firma activa se cancela."""
    servicio.eliminar(usuario, contrato_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{contrato_id}/pdf", response_class=StreamingResponse, responses=PDF, summary="PDF para imprimir y firmar")
def pdf_contrato(
    contrato_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioContratos = Depends(servicio_contratos),
):
    return _pdf(servicio.pdf(usuario, contrato_id), f"contrato-{contrato_id}.pdf")


@router.post("/{contrato_id}/listo", response_model=ContratoDetalle, summary="Dejar el contrato listo para firmar")
def contrato_listo(
    contrato_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioContratos = Depends(servicio_contratos),
):
    """Exige los datos completos. Desde aquí ya no se edita: se anula y se hace otro."""
    return servicio.marcar_listo(usuario, contrato_id)


@router.post("/{contrato_id}/firma", response_model=ContratoDetalle, status_code=status.HTTP_201_CREATED,
             summary="Agendar la firma")
def agendar_firma_contrato(
    contrato_id: int,
    datos: CitaDeFirma,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioContratos = Depends(servicio_contratos),
):
    """Crea la cita de firma con el cliente del contrato, le avisa y deja el contrato en firma."""
    return servicio.agendar_firma(usuario, contrato_id, datos)


@router.post("/{contrato_id}/firmado", response_model=ContratoCargado, status_code=status.HTTP_201_CREATED,
             summary="Subir el contrato firmado")
def subir_contrato_firmado(
    contrato_id: int,
    archivo: UploadFile = File(..., description="El escaneado en PDF, de máximo 15 MB."),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioContratos = Depends(servicio_contratos),
):
    """Deja el contrato firmado, completa la cita de firma y le envía la copia al cliente por correo."""
    return servicio.subir_firmado(usuario, contrato_id, nombre=archivo.filename or "contrato-firmado.pdf",
                                  tipo=archivo.content_type, contenido=archivo.file.read(MAX_DOCUMENT_BYTES + 1))


@router.post("/{contrato_id}/reenviar-copia", response_model=ContratoDetalle, summary="Reenviar la copia firmada")
def reenviar_copia_contrato(
    contrato_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioContratos = Depends(servicio_contratos),
):
    return servicio.reenviar_copia(usuario, contrato_id)


@router.post("/{contrato_id}/reabrir-firma", response_model=ContratoDetalle, summary="Reabrir la firma")
def reabrir_firma_contrato(
    contrato_id: int,
    datos: ReaperturaFirma | None = None,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioContratos = Depends(servicio_contratos),
):
    """Vuelve a en firma para subir otro escaneado. Con `fecha`, el contrato y la cita pasan a ese día."""
    return servicio.reabrir_firma(usuario, contrato_id, datos)


@router.post("/{contrato_id}/anular", response_model=ContratoDetalle, summary="Anular un contrato sin firmar")
def anular_contrato(
    contrato_id: int,
    datos: MotivoContrato,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioContratos = Depends(servicio_contratos),
):
    return servicio.anular(usuario, contrato_id, datos)


@router.post("/{contrato_id}/terminar", response_model=ContratoDetalle, summary="Terminar un contrato firmado")
def terminar_contrato(
    contrato_id: int,
    datos: MotivoContrato,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioContratos = Depends(servicio_contratos),
):
    return servicio.terminar(usuario, contrato_id, datos)


@router.get(
    "/{contrato_id}/firmado",
    response_class=StreamingResponse,
    responses={200: {"content": {"application/pdf": {}}, "description": "El escaneado firmado."}},
    summary="Ver o descargar el contrato firmado",
)
def contrato_firmado(
    contrato_id: int,
    descargar: bool = Query(True, description="false lo muestra en el navegador."),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioContratos = Depends(servicio_contratos),
):
    cuerpo, documento = servicio.firmado(usuario, contrato_id)
    nombre = quote(documento.nombre_archivo, safe="")
    return StreamingResponse(
        cuerpo,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"{'attachment' if descargar else 'inline'}; filename*=UTF-8''{nombre}",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )
