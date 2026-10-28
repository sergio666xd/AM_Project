"""Modelos ORM de expedientes (definidos en `app.models` mientras viva la API v1)."""

from app.models import EtapaProceso, Proceso, ProcesoCliente, ProcesoColaborador, ProcesoRadicado, Radicado

__all__ = ["EtapaProceso", "Proceso", "ProcesoCliente", "ProcesoColaborador", "ProcesoRadicado", "Radicado"]
