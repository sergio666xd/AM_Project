import os
from celery import Celery
from celery.schedules import crontab

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "saas_tasks",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.tasks"]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="America/Bogota",
    enable_utc=True,
)

# --- PROGRAMACIÓN DE TAREAS PERIÓDICAS (CELERY BEAT) ---
celery_app.conf.beat_schedule = {
    "recordatorios-de-tareas-cada-minuto": {
        "task": "tareas.enviar_recordatorios_tareas",
        "schedule": crontab(minute="*"),
    },
    # Informe consolidado de fin de mes (Ejecuta el día 28, 29, 30 o 31 a las 17:00 según el mes)
    "informe-fin-de-mes-5pm": {
        "task": "tareas.enviar_resumen_mensual_usuarios",
        "schedule": crontab(hour=17, minute=0, day_of_month="28-31"),
    },
}
