"""Aplicación FastAPI: middleware, CORS y registro de routers."""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api import v2
from app.audit import (
    establecer_contexto_solicitud_auditoria,
    limpiar_contexto_solicitud_auditoria,
)
from app.esquema import crear_datos_iniciales
from app.nucleo.errores import registrar_manejadores
from app.routers import (
    admin,
    auth,
    chat,
    contratos,
    dashboard,
    expedientes,
    publico,
    radicados,
    solicitudes_registro,
    tareas,
    workflows,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    crear_datos_iniciales()
    yield


app = FastAPI(
    lifespan=lifespan,
    title="Gestión de procesos AM",
    description=(
        "API de Alejandra Muñoz | Abogada y Asociados. Las rutas nuevas viven en "
        "`/api/v2` (sesión por cookie, errores uniformes, listados por cursor); "
        "el resto es la API v1, que se retira a medida que cada panel migra."
    ),
    version="2.0.0",
)
registrar_manejadores(app)


@app.middleware("http")
async def registrar_contexto_tecnico_auditoria(request: Request, call_next):
    token = establecer_contexto_solicitud_auditoria(request.method, request.url.path)
    try:
        return await call_next(request)
    finally:
        limpiar_contexto_solicitud_auditoria(token)

app.include_router(admin.router)
app.include_router(tareas.router)
app.include_router(expedientes.router)
app.include_router(workflows.router)
app.include_router(contratos.router)
app.include_router(chat.router)
# Los endpoints que antes vivían en este archivo se registraban después de
# los routers anteriores; se conserva ese orden para no alterar las rutas.
app.include_router(publico.router)
app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(solicitudes_registro.router)
app.include_router(radicados.router)
app.include_router(v2.router)


def get_cors_origins() -> list[str]:
    configured = os.getenv("CORS_ORIGINS", "")
    # Keep the known application origins available even when a deployment
    # provides additional CORS_ORIGINS entries. Replacing this list outright
    # made the admin/panel subdomains fail in the browser while the API still
    # returned HTTP 200 to the request itself.
    defaults = [
        "http://localhost:3000",
        "http://admin.localhost:3000",
        "http://panel.localhost:3000",
        "http://127.0.0.1:3000",
        "https://alejandramunozabogada.com",
        "https://www.alejandramunozabogada.com",
        "https://admin.alejandramunozabogada.com",
        "https://panel.alejandramunozabogada.com",
    ]
    extra = [origin.strip().rstrip("/") for origin in configured.split(",") if origin.strip()]
    return list(dict.fromkeys([*defaults, *extra]))


# Keep CORS outside Starlette's ServerErrorMiddleware so unhandled 500
# responses still carry the allowed origin header. Browser clients can then
# report the API error instead of a misleading CORS/network failure.
_fastapi_app = app
app = CORSMiddleware(
    app=_fastapi_app,
    allow_origins=get_cors_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
