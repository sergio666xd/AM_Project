"""Errores de dominio y formato uniforme de las respuestas de error de la API v2.

Los servicios lanzan `ErrorDominio` (o una subclase) sin saber nada de HTTP.
Los manejadores de este módulo los convierten en:

    {"codigo": "no_encontrado", "mensaje": "No encontramos el proceso.", "campos": {}}

Las rutas de la API v1 conservan el formato `{"detail": ...}` de FastAPI.
"""

from fastapi import FastAPI, Request
from fastapi.exception_handlers import (
    http_exception_handler,
    request_validation_exception_handler,
)
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

PREFIJO_V2 = "/api/v2"


class ErrorRespuesta(BaseModel):
    codigo: str = Field(description="Identificador estable del error, para decidir qué mostrar.")
    mensaje: str = Field(description="Texto listo para mostrar al usuario.")
    campos: dict[str, str] = Field(
        default_factory=dict,
        description="Errores por campo del formulario, con el nombre del campo como clave.",
    )


class ErrorDominio(Exception):
    estado = 400
    codigo = "solicitud_invalida"

    def __init__(self, mensaje: str, *, codigo: str | None = None, campos: dict[str, str] | None = None):
        super().__init__(mensaje)
        self.mensaje = mensaje
        if codigo:
            self.codigo = codigo
        self.campos = campos or {}


class NoAutenticado(ErrorDominio):
    estado = 401
    codigo = "no_autenticado"


class SinPermiso(ErrorDominio):
    estado = 403
    codigo = "sin_permiso"


class NoEncontrado(ErrorDominio):
    estado = 404
    codigo = "no_encontrado"


class Conflicto(ErrorDominio):
    estado = 409
    codigo = "conflicto"


class DatosInvalidos(ErrorDominio):
    estado = 422
    codigo = "datos_invalidos"


class DemasiadosIntentos(ErrorDominio):
    estado = 429
    codigo = "demasiados_intentos"


CODIGO_POR_ESTADO = {
    400: "solicitud_invalida",
    401: "no_autenticado",
    403: "sin_permiso",
    404: "no_encontrado",
    405: "metodo_no_permitido",
    409: "conflicto",
    413: "archivo_muy_grande",
    422: "datos_invalidos",
    429: "demasiados_intentos",
}

MENSAJE_POR_ESTADO = {
    401: "Inicia sesión para continuar.",
    403: "No tienes permiso para realizar esta acción.",
    404: "No encontramos lo que buscas.",
    405: "Esta acción no está disponible.",
}

# Respuestas de error que se documentan en todas las rutas v2, para que el
# cliente generado conozca el formato.
RESPUESTAS_ERROR = {
    estado: {"model": ErrorRespuesta}
    for estado in (400, 401, 403, 404, 409, 422, 429)
}


def _es_v2(request: Request) -> bool:
    return request.url.path.startswith(PREFIJO_V2)


def _respuesta(estado: int, codigo: str, mensaje: str, campos: dict[str, str] | None = None, headers=None):
    cuerpo = ErrorRespuesta(codigo=codigo, mensaje=mensaje, campos=campos or {})
    return JSONResponse(status_code=estado, content=cuerpo.model_dump(), headers=headers)


async def _manejar_error_dominio(request: Request, exc: ErrorDominio):
    return _respuesta(exc.estado, exc.codigo, exc.mensaje, exc.campos)


async def _manejar_http(request: Request, exc: StarletteHTTPException):
    if not _es_v2(request):
        return await http_exception_handler(request, exc)
    mensaje = exc.detail if isinstance(exc.detail, str) and exc.detail.strip() else None
    return _respuesta(
        exc.status_code,
        CODIGO_POR_ESTADO.get(exc.status_code, "error"),
        mensaje or MENSAJE_POR_ESTADO.get(exc.status_code, "No se pudo completar la solicitud."),
        headers=getattr(exc, "headers", None),
    )


def _nombre_campo(loc: tuple) -> str:
    partes = [str(parte) for parte in loc if parte not in ("body", "query", "path", "header", "cookie")]
    return ".".join(partes) or "solicitud"


async def _manejar_validacion(request: Request, exc: RequestValidationError):
    if not _es_v2(request):
        return await request_validation_exception_handler(request, exc)
    campos: dict[str, str] = {}
    for error in exc.errors():
        campos.setdefault(_nombre_campo(tuple(error.get("loc", ()))), str(error.get("msg", "")).removeprefix("Value error, "))
    return _respuesta(422, "datos_invalidos", "Revisa los datos enviados.", campos)


def registrar_manejadores(app: FastAPI) -> None:
    app.add_exception_handler(ErrorDominio, _manejar_error_dominio)
    app.add_exception_handler(StarletteHTTPException, _manejar_http)
    app.add_exception_handler(RequestValidationError, _manejar_validacion)
