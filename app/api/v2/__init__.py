"""API v2: `/api/v2`.

Convive con la API v1 hasta que cada panel migre. Todas las rutas comparten el
formato de error de `app.nucleo.errores` y la protección CSRF de la sesión.
"""

from fastapi import APIRouter, Depends

from app.api.v2 import agenda, avisos, bandeja, busqueda, clientes, contratos, documentos, folios, procesos, sesion, tareas, terminos
from app.nucleo.errores import PREFIJO_V2, RESPUESTAS_ERROR
from app.nucleo.sesion import proteger_csrf

router = APIRouter(
    prefix=PREFIJO_V2,
    responses=RESPUESTAS_ERROR,
    dependencies=[Depends(proteger_csrf)],
    # El nombre de la función es el nombre de la operación en el cliente generado.
    generate_unique_id_function=lambda ruta: ruta.name,
)
router.include_router(sesion.router)
router.include_router(procesos.router)
router.include_router(folios.router)
router.include_router(bandeja.router)
router.include_router(avisos.router)
router.include_router(busqueda.router)
router.include_router(terminos.router)
router.include_router(tareas.router)
router.include_router(agenda.router)
router.include_router(documentos.router)
router.include_router(clientes.router)
router.include_router(contratos.router)
