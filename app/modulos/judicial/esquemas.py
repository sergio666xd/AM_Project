from datetime import date

from pydantic import BaseModel, Field


class CalcularTermino(BaseModel):
    notificacion: date = Field(description="Día en que se notificó la providencia (por estado, personal, etc.).")
    dias: int = Field(ge=1, le=365, description="Duración del término en días hábiles.")


class PeriodoInhabil(BaseModel):
    desde: date
    hasta: date
    motivo: str = Field(description="Festivo o vacancia judicial que no contó.")


class Termino(BaseModel):
    notificacion: date
    dias: int
    inicia: date = Field(description="Primer día hábil del término: el siguiente a la notificación.")
    vence: date = Field(description="Último día hábil del término.")
    inhabiles: list[PeriodoInhabil] = Field(
        description="Festivos y vacancia judicial dentro del término. Los fines de semana no se listan."
    )
