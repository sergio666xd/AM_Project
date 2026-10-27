"""Endpoints de administración (/api/admin), divididos por área.

Los routers se registran en el orden en que estaban en el antiguo admin.py
para que las rutas con segmentos fijos (por ejemplo /usuarios/estado-masivo)
sigan resolviéndose antes que las rutas con parámetros.
"""

from fastapi import APIRouter

from app.routers.admin import (
    agenda,
    alertas,
    almacenamiento,
    auditoria,
    chat,
    configuracion,
    consultas,
    contenido,
    dashboard,
    integraciones,
    inventario,
    migraciones,
    planes,
    usuarios,
)

router = APIRouter()
for modulo in (
    migraciones,
    contenido,
    auditoria,
    chat,
    dashboard,
    alertas,
    inventario,
    almacenamiento,
    consultas,
    agenda,
    integraciones,
    usuarios,
    planes,
    configuracion,
):
    router.include_router(modulo.router)
