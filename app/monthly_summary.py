"""Resumen mensual de radicados; se dispara desde Vercel Cron, sin Celery."""

from calendar import monthrange
from datetime import datetime
import logging

from app.database import SessionLocal
from app import models
from app.message_templates import MESES, fecha_texto, radicado_legible
from app.notification_service import emitir_notificacion_workflow

logger = logging.getLogger(__name__)


def enviar_resumen_mensual():
    """Envía a cada usuario activo un resumen mensual de sus radicados.

    Debe invocarse diariamente; solo actúa en el último día del mes.
    """
    db = SessionLocal()
    try:
        hoy = datetime.now()
        ultimo_dia_mes = monthrange(hoy.year, hoy.month)[1]
        if hoy.day != ultimo_dia_mes:
            return {"estado": "omitido", "motivo": "No es el último día del mes"}

        usuarios = (
            db.query(models.Usuario)
            .filter(models.Usuario.estado == models.EstadoUsuario.ACTIVO)
            .all()
        )
        usuarios_notificados = 0

        for usuario in usuarios:
            radicados = (
                db.query(models.Radicado)
                .join(models.Radicado.usuarios_vinculados)
                .filter(models.Usuario.id == usuario.id)
                .all()
            )
            if not radicados:
                continue

            mes_actual = f"{MESES[hoy.month - 1]} de {hoy.year}"
            fichas = []
            for rad in radicados:
                ultima_act = (
                    db.query(models.Actuacion)
                    .filter(models.Actuacion.radicado_id == rad.id)
                    .order_by(models.Actuacion.orden.asc())
                    .first()
                )
                lineas = [f"Radicado: {radicado_legible(rad.numero)}"]
                if rad.despacho_departamento:
                    lineas.append(f"Juzgado: {rad.despacho_departamento}")
                if ultima_act:
                    lineas.append(f"Última actuación: {ultima_act.actuacion}")
                    if ultima_act.fecha_actuacion:
                        lineas.append(f"Fecha: {fecha_texto(ultima_act.fecha_actuacion)}")
                else:
                    lineas.append("Última actuación: todavía no hay actuaciones registradas")
                fichas.append("\n".join(lineas))
            mensaje = "\n\n".join(fichas)

            entrega_ids = emitir_notificacion_workflow(
                db,
                usuario,
                "RESUMENES",
                f"RESUMEN:{usuario.id}:{hoy.year:04d}-{hoy.month:02d}",
                f"Resumen de sus procesos de {mes_actual}",
                mensaje,
                emisor=usuario,
                plantilla_clave="RESUMEN_MENSUAL",
                variables={"nombre": usuario.nombre_completo, "mes": mes_actual, "resumen": mensaje},
            )
            if entrega_ids:
                usuarios_notificados += 1

        return {"estado": "ok", "usuarios_notificados": usuarios_notificados}
    finally:
        db.close()
