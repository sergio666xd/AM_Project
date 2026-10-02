"""Cliente de la API pública de Consulta de Procesos de la Rama Judicial."""

import json
import re
from collections import Counter
from datetime import datetime
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from sqlalchemy.orm import Session

from app import models


API_BASE_URL = "https://consultaprocesos.ramajudicial.gov.co:448/api/v2"
API_TIMEOUT_SECONDS = 30
API_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "GestionProcesosSaaS/1.0",
}


class RamaJudicialAPIError(Exception):
    """Error recuperable al consumir la API de la Rama Judicial."""


def _es_fijacion_estado(actuacion_texto: str) -> bool:
    texto = (actuacion_texto or "").strip().lower()
    return "fijacion" in texto or "fijación" in texto or "estado" in texto


def _fecha_api(valor: str | None) -> str:
    """Convierte las fechas ISO de la API al formato mostrado por la aplicación."""
    if not valor:
        return ""
    try:
        return datetime.fromisoformat(valor.replace("Z", "+00:00")).strftime("%d/%m/%Y")
    except (TypeError, ValueError):
        return str(valor).strip()


def parsear_sujetos(texto: str | None) -> dict:
    """Obtiene demandante y demandado del texto de sujetos de la API."""
    demandante, demandado = "", ""
    texto_normalizado = re.sub(r"\s+", " ", texto or "").strip()

    for segmento in re.split(r"\s*\|\s*", texto_normalizado):
        etiqueta, separador, valor = segmento.partition(":")
        if not separador:
            continue

        etiqueta = etiqueta.strip().lower()
        valor = valor.strip()
        if "defensor" in etiqueta:
            continue
        if "demandante" in etiqueta or "accionante" in etiqueta:
            demandante = valor
        elif (
            "demandado" in etiqueta
            or "indiciado" in etiqueta
            or "causante" in etiqueta
        ):
            demandado = valor

    return {"demandante": demandante, "demandado": demandado}


def _obtener_json(ruta: str, parametros: dict | None = None) -> dict:
    url = f"{API_BASE_URL}{ruta}"
    if parametros:
        url = f"{url}?{urlencode(parametros)}"

    try:
        request = Request(url, headers=API_HEADERS)
        with urlopen(request, timeout=API_TIMEOUT_SECONDS) as respuesta:
            return json.loads(respuesta.read().decode("utf-8-sig"))
    except HTTPError as exc:
        raise RamaJudicialAPIError(f"HTTP {exc.code} al consultar la API") from exc
    except URLError as exc:
        raise RamaJudicialAPIError(f"No fue posible conectar con la API: {exc.reason}") from exc
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RamaJudicialAPIError("La API devolvió una respuesta no válida") from exc


def _obtener_proceso(numero_radicado: str) -> dict | None:
    """Busca el proceso exacto, recorriendo las páginas de resultados si existen."""
    pagina = 1
    while True:
        respuesta = _obtener_json(
            "/Procesos/Consulta/NumeroRadicacion",
            {"numero": numero_radicado, "SoloActivos": "false", "pagina": pagina},
        )
        procesos = respuesta.get("procesos") or []
        for proceso in procesos:
            if str(proceso.get("llaveProceso", "")) == str(numero_radicado):
                return proceso

        paginacion = respuesta.get("paginacion") or {}
        total_paginas = paginacion.get("cantidadPaginas") or 1
        if pagina >= total_paginas:
            return None
        pagina += 1


def _clave_actuacion_api(actuacion: dict) -> tuple:
    return _clave_actuacion(
        {
            "fecha_actuacion": _fecha_api(actuacion.get("fechaActuacion")),
            "actuacion": (actuacion.get("actuacion") or "").strip(),
            "anotacion": (actuacion.get("anotacion") or "").strip(),
            "fecha_inicia_termino": _fecha_api(actuacion.get("fechaInicial")),
            "fecha_finaliza_termino": _fecha_api(actuacion.get("fechaFinal")),
            "fecha_registro": _fecha_api(actuacion.get("fechaRegistro")),
        }
    )


def _obtener_actuaciones(
    id_proceso: int,
    limite: int | None = None,
    claves_conocidas: set[tuple] | None = None,
) -> list[dict]:
    """Fetch recent pages and stop at the first known action when syncing incrementally."""
    actuaciones: list[dict] = []
    pagina = 1

    while True:
        respuesta = _obtener_json(f"/Proceso/Actuaciones/{id_proceso}", {"pagina": pagina})
        limite_alcanzado = False
        for actuacion in respuesta.get("actuaciones") or []:
            actuaciones.append(actuacion)
            if claves_conocidas and _clave_actuacion_api(actuacion) in claves_conocidas:
                return actuaciones
            if limite is not None and len(actuaciones) >= limite:
                limite_alcanzado = True
                break

        # Rama currently returns recent actions first, so the first known action
        # is a safe pagination boundary for normal incremental synchronization.
        if limite_alcanzado:
            return actuaciones[:limite]

        paginacion = respuesta.get("paginacion") or {}
        total_paginas = paginacion.get("cantidadPaginas") or 1
        if pagina >= total_paginas:
            return actuaciones
        pagina += 1


def _actualizar_datos_generales(radicado_obj: models.Radicado, proceso: dict) -> None:
    despacho = (proceso.get("despacho") or "").strip()
    departamento = (proceso.get("departamento") or "").strip()
    radicado_obj.despacho_departamento = (
        f"{despacho} — {departamento}" if despacho and departamento else despacho or departamento
    )

    sujetos = parsear_sujetos(proceso.get("sujetosProcesales"))
    radicado_obj.demandante = sujetos["demandante"].upper()
    radicado_obj.demandado = sujetos["demandado"].upper()


def _clave_actuacion(actuacion: dict) -> tuple:
    """Clave estable para detectar novedades aunque cambie el orden de la API."""
    return (
        actuacion["fecha_actuacion"],
        actuacion["actuacion"],
        actuacion["anotacion"],
        actuacion["fecha_inicia_termino"],
        actuacion["fecha_finaliza_termino"],
        actuacion["fecha_registro"],
    )


def ejecutar_consulta_api_radicado(db: Session, radicado_obj: models.Radicado) -> dict:
    """Consulta un radicado por API, actualiza la base de datos y detecta novedades."""
    try:
        estado_normalizado = (radicado_obj.estado_consulta or "").strip().upper().replace(" ", "_")
        consulta_inicial = (
            estado_normalizado == "SIN_CONSULTAR"
            or not radicado_obj.id_proceso_rama
        )
        if consulta_inicial:
            proceso = _obtener_proceso(radicado_obj.numero)
            if not proceso:
                radicado_obj.estado_consulta = "no_encontrado"
                radicado_obj.consultado_en = datetime.now().isoformat(timespec="minutes")
                db.commit()
                return {"estado": "no_encontrado", "total_actuaciones": 0, "actuaciones_nuevas": []}

            _actualizar_datos_generales(radicado_obj, proceso)
            if proceso.get("esPrivado"):
                radicado_obj.estado_consulta = "omitido: proceso privado"
                radicado_obj.consultado_en = datetime.now().isoformat(timespec="minutes")
                db.commit()
                return {"estado": "omitido: proceso privado", "total_actuaciones": 0, "actuaciones_nuevas": []}

            id_proceso = proceso.get("idProceso")
            if not id_proceso:
                raise RamaJudicialAPIError("La respuesta no contiene el identificador del proceso")
            radicado_obj.id_proceso_rama = str(id_proceso)
        else:
            id_proceso = radicado_obj.id_proceso_rama

        usuario_propietario = radicado_obj.creador
        if usuario_propietario and usuario_propietario.rol == models.RolUsuario.ABOGADO:
            limite_actuaciones = (
                usuario_propietario.plan.limite_ultimas_actuaciones
                if usuario_propietario.plan
                else 5
            )
        else:
            limite_actuaciones = None
        actuaciones_conocidas = (
            db.query(models.Actuacion)
            .filter(models.Actuacion.radicado_id == radicado_obj.id)
            .order_by(models.Actuacion.orden.asc())
            .all()
        )
        claves_conocidas = Counter(
            (
                act.fecha_actuacion,
                act.actuacion,
                act.anotacion,
                act.fecha_inicia_termino,
                act.fecha_finaliza_termino,
                act.fecha_registro,
            )
            for act in actuaciones_conocidas
        )
        actuaciones_capturadas = []
        claves_capturadas = Counter()
        for actuacion in _obtener_actuaciones(
            int(id_proceso),
            limite_actuaciones if consulta_inicial else None,
            None if consulta_inicial else set(claves_conocidas),
        ):
            actuacion_texto = (actuacion.get("actuacion") or "").strip()
            actuacion_capturada = {
                "orden": len(actuaciones_capturadas) + 1,
                "fecha_actuacion": _fecha_api(actuacion.get("fechaActuacion")),
                "actuacion": actuacion_texto,
                "anotacion": (actuacion.get("anotacion") or "").strip(),
                "fecha_inicia_termino": _fecha_api(actuacion.get("fechaInicial")),
                "fecha_finaliza_termino": _fecha_api(actuacion.get("fechaFinal")),
                "fecha_registro": _fecha_api(actuacion.get("fechaRegistro")),
                "es_fijacion": _es_fijacion_estado(actuacion_texto),
            }
            clave = _clave_actuacion(actuacion_capturada)
            if claves_capturadas[clave]:
                continue
            claves_capturadas[clave] += 1
            actuaciones_capturadas.append(actuacion_capturada)
    except RamaJudicialAPIError as exc:
        radicado_obj.estado_consulta = f"error_api: {exc}"
        db.commit()
        return {"estado": radicado_obj.estado_consulta}
    except Exception as exc:
        radicado_obj.estado_consulta = f"error: {exc}"
        db.commit()
        return {"estado": radicado_obj.estado_consulta}

    actuaciones_nuevas = []
    if db.get_bind().dialect.name == "postgresql":
        db.query(models.Radicado.id).filter(
            models.Radicado.id == radicado_obj.id
        ).with_for_update().scalar()

    actuaciones_existentes = (
        db.query(models.Actuacion)
        .filter(models.Actuacion.radicado_id == radicado_obj.id)
        .order_by(models.Actuacion.orden.asc())
        .populate_existing()
        .all()
    )
    claves_existentes = Counter(
        (
            act.fecha_actuacion,
            act.actuacion,
            act.anotacion,
            act.fecha_inicia_termino,
            act.fecha_finaliza_termino,
            act.fecha_registro,
        )
        for act in actuaciones_existentes
    )
    claves_restantes = claves_existentes.copy()
    for actuacion in actuaciones_capturadas:
        clave = _clave_actuacion(actuacion)
        if claves_restantes[clave]:
            claves_restantes[clave] -= 1
        else:
            actuaciones_nuevas.append(actuacion)

    historial_actualizado = actuaciones_capturadas.copy()
    claves_historial = Counter(_clave_actuacion(actuacion) for actuacion in historial_actualizado)
    for existente in actuaciones_existentes:
        clave = (
            existente.fecha_actuacion,
            existente.actuacion,
            existente.anotacion,
            existente.fecha_inicia_termino,
            existente.fecha_finaliza_termino,
            existente.fecha_registro,
        )
        if claves_historial[clave]:
            claves_historial[clave] -= 1
            continue
        historial_actualizado.append(
            {
                "orden": existente.orden,
                "fecha_actuacion": existente.fecha_actuacion,
                "actuacion": existente.actuacion,
                "anotacion": existente.anotacion,
                "fecha_inicia_termino": existente.fecha_inicia_termino,
                "fecha_finaliza_termino": existente.fecha_finaliza_termino,
                "fecha_registro": existente.fecha_registro,
                "es_fijacion": existente.es_fijacion,
            }
        )

    if limite_actuaciones is not None:
        historial_actualizado = historial_actualizado[:limite_actuaciones]
    claves_existentes_ordenadas = [
        (
            act.fecha_actuacion, act.actuacion, act.anotacion,
            act.fecha_inicia_termino, act.fecha_finaliza_termino, act.fecha_registro,
        )
        for act in actuaciones_existentes
    ]
    claves_actualizadas = [_clave_actuacion(act) for act in historial_actualizado]

    if claves_existentes_ordenadas != claves_actualizadas:
        db.query(models.Actuacion).filter(models.Actuacion.radicado_id == radicado_obj.id).delete()
        for orden, actuacion in enumerate(historial_actualizado, start=1):
            actuacion["orden"] = orden
            db.add(models.Actuacion(radicado_id=radicado_obj.id, **actuacion))

    radicado_obj.estado_consulta = "ok"
    radicado_obj.consultado_en = datetime.now().isoformat(timespec="minutes")
    db.commit()
    return {
        "estado": "ok",
        "total_actuaciones": len(historial_actualizado),
        "actuaciones_nuevas": actuaciones_nuevas,
    }
