"""Procesos de abogados, acceso de clientes y colaboración documental (/api/expedientes).

Los routers se registran en el orden en que aparecían sus rutas en el antiguo
expedientes.py, para que las rutas fijas (por ejemplo /procesos/archivados)
sigan resolviéndose antes que las que llevan parámetros.
"""

from fastapi import APIRouter

from app.routers.expedientes import (
    agenda,
    clientes,
    documentos,
    notificaciones,
    panel,
    portal_cliente,
    procesos,
)

router = APIRouter()
for modulo in (clientes, documentos, notificaciones, panel, agenda, procesos, portal_cliente):
    router.include_router(modulo.router)
