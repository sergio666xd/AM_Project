from typing import Literal

from fastapi import APIRouter, Depends, Query

from app import models
from app.api.v2.dependencias import servicio_consultas, servicio_envios, servicio_integraciones, servicio_plantillas
from app.modulos.operacion.consultas import ServicioConsultas
from app.modulos.operacion.envios import ServicioEnvios
from app.modulos.operacion.esquemas import (
    CambioConsultas,
    CambioCorreo,
    CambioWhatsapp,
    ClavePrueba,
    ConfiguracionConsultas,
    DetalleEjecucion,
    DetalleEnvio,
    EnvioPrueba,
    FiltroEnvios,
    PaginaEjecuciones,
    PaginaEnvios,
    PanelConsultas,
    PanelIntegraciones,
    PlantillaAviso,
    PlantillaAvisoFila,
    PruebaEnviada,
    RadicadoConsultable,
    Reintentados,
    Reintento,
    ResultadoPrueba,
    TextosPlantillaAviso,
    VistaPrevia,
)
from app.modulos.operacion.integraciones import ServicioIntegraciones
from app.modulos.operacion.plantillas import ServicioPlantillas
from app.nucleo.paginacion import ParametrosPagina, parametros_pagina
from app.nucleo.sesion import usuario_actual

router = APIRouter(prefix="/admin", tags=["Operación"])


# ---- Consultas judiciales ------------------------------------------------------


@router.get("/consultas", response_model=PanelConsultas, summary="Consultas judiciales")
def panel_consultas(
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioConsultas = Depends(servicio_consultas),
):
    """La programación y los radicados cuya última consulta falló."""
    return servicio.panel(usuario)


@router.put("/consultas/programacion", response_model=ConfiguracionConsultas, summary="Programar las consultas automáticas")
def programar_consultas(
    datos: CambioConsultas,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioConsultas = Depends(servicio_consultas),
):
    return servicio.programar(usuario, datos)


@router.get("/consultas/ejecuciones", response_model=PaginaEjecuciones, summary="Consultas realizadas")
def listar_ejecuciones(
    pagina: ParametrosPagina = Depends(parametros_pagina),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioConsultas = Depends(servicio_consultas),
):
    return servicio.ejecuciones(usuario, pagina)


@router.get("/consultas/ejecuciones/{ejecucion_id}", response_model=DetalleEjecucion, summary="Resultado de una consulta")
def detalle_ejecucion(
    ejecucion_id: str,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioConsultas = Depends(servicio_consultas),
):
    """Cada radicado consultado, con los errores primero."""
    return servicio.detalle(usuario, ejecucion_id)


@router.get("/consultas/radicados", response_model=list[RadicadoConsultable], summary="Buscar radicados para consultar")
def buscar_radicados(
    q: str | None = Query(None, max_length=120, description="Dígitos del radicado o nombre del proceso."),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioConsultas = Depends(servicio_consultas),
):
    return servicio.radicados(usuario, q)


# ---- Envíos de avisos -----------------------------------------------------------


@router.get("/envios", response_model=PaginaEnvios, summary="Avisos enviados")
def listar_envios(
    filtro: FiltroEnvios = "todos",
    canal: Literal["EMAIL", "WHATSAPP", "PUSH"] | None = None,
    q: str | None = Query(None, max_length=120, description="Destinatario o asunto."),
    pagina: ParametrosPagina = Depends(parametros_pagina),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioEnvios = Depends(servicio_envios),
):
    return servicio.listar(usuario, filtro=filtro, canal=canal, q=q, pagina=pagina)


@router.post("/envios/reintentar", response_model=Reintentados, summary="Reintentar avisos fallidos")
def reintentar_envios(
    datos: Reintento,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioEnvios = Depends(servicio_envios),
):
    """Vuelven a la cola con tres intentos nuevos. Solo correo y WhatsApp."""
    return servicio.reintentar(usuario, datos.ids)


@router.get("/envios/{envio_id}", response_model=DetalleEnvio, summary="Un aviso")
def detalle_envio(
    envio_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioEnvios = Depends(servicio_envios),
):
    return servicio.detalle(usuario, envio_id)


# ---- Integraciones -------------------------------------------------------------


@router.get("/integraciones", response_model=PanelIntegraciones, summary="Integraciones")
def panel_integraciones(
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioIntegraciones = Depends(servicio_integraciones),
):
    """Estado de cada servicio y la configuración del correo y WhatsApp (sin las claves)."""
    return servicio.panel(usuario)


@router.put("/integraciones/correo", response_model=PanelIntegraciones, summary="Configurar el servidor de correo")
def guardar_correo(
    datos: CambioCorreo,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioIntegraciones = Depends(servicio_integraciones),
):
    return servicio.guardar_correo(usuario, datos)


@router.put("/integraciones/whatsapp", response_model=PanelIntegraciones, summary="Configurar WhatsApp")
def guardar_whatsapp(
    datos: CambioWhatsapp,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioIntegraciones = Depends(servicio_integraciones),
):
    return servicio.guardar_whatsapp(usuario, datos)


@router.post("/integraciones/envio-prueba", response_model=PruebaEnviada, summary="Enviar un mensaje de prueba")
def enviar_prueba(
    datos: EnvioPrueba,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioIntegraciones = Depends(servicio_integraciones),
):
    """Envía de verdad la plantilla PRUEBA_INTEGRACION al destinatario indicado."""
    return servicio.enviar_prueba(usuario, datos)


@router.post("/integraciones/{clave}/probar", response_model=ResultadoPrueba, summary="Probar la conexión")
def probar_integracion(
    clave: ClavePrueba,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioIntegraciones = Depends(servicio_integraciones),
):
    """No envía mensajes."""
    return servicio.probar(usuario, clave)


# ---- Plantillas ----------------------------------------------------------------


@router.get("/plantillas", response_model=list[PlantillaAvisoFila], summary="Plantillas de los avisos")
def listar_plantillas_avisos(
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioPlantillas = Depends(servicio_plantillas),
):
    return servicio.listar(usuario)


@router.get("/plantillas/{clave}", response_model=PlantillaAviso, summary="Una plantilla")
def detalle_plantilla_aviso(
    clave: str,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioPlantillas = Depends(servicio_plantillas),
):
    return servicio.detalle(usuario, clave)


@router.put("/plantillas/{clave}", response_model=PlantillaAviso, summary="Guardar una plantilla")
def guardar_plantilla_aviso(
    clave: str,
    datos: TextosPlantillaAviso,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioPlantillas = Depends(servicio_plantillas),
):
    return servicio.guardar(usuario, clave, datos)


@router.post("/plantillas/{clave}/vista-previa", response_model=VistaPrevia, summary="Vista previa de una plantilla")
def vista_previa_plantilla(
    clave: str,
    datos: TextosPlantillaAviso,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioPlantillas = Depends(servicio_plantillas),
):
    """Los textos (sin guardar) con los valores de ejemplo y el diseño del correo."""
    return servicio.vista_previa(usuario, clave, datos)
