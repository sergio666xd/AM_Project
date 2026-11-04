"""Lo que envían los flujos programados (Vercel Workflow) a la API interna."""
from typing import Literal

from pydantic import BaseModel


class WorkflowClaimConsulta(BaseModel):
    clave_idempotencia: str
    token_lanzamiento: str
    tipo: Literal["AUTOMATICA", "MANUAL", "AUTOMATICA_NUEVO"]
    fecha_local: str
    hora_local: Literal["12:00", "17:00", "MANUAL", "NUEVO"]
    solicitada_por_id: int | None = None
    radicado_id: int | None = None
    radicado_ids: list[int] | None = None
    consulta_id: int | None = None


class WorkflowActuacionNueva(BaseModel):
    orden: int = 0
    fecha_actuacion: str = ""
    actuacion: str = ""
    anotacion: str = ""
    fecha_inicia_termino: str = ""
    fecha_finaliza_termino: str = ""
    fecha_registro: str = ""
    es_fijacion: bool = False


class WorkflowEventoActuaciones(BaseModel):
    radicado_id: int
    actuaciones_nuevas: list[WorkflowActuacionNueva]


class WorkflowNovedadesPreparar(BaseModel):
    eventos: list[WorkflowEventoActuaciones]


class WorkflowRecordatorioPreparar(BaseModel):
    version: int
