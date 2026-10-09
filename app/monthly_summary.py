"""Resumen mensual de radicados; se dispara desde Vercel Cron, sin Celery."""

from calendar import monthrange
from datetime import datetime
import logging

from app.database import SessionLocal
from app import models
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

            mes_actual = datetime.now().strftime("%B %Y").capitalize()
            mensaje = (
                f"📊 *INFORME MENSUAL DE PROCESOS ({mes_actual})*\n"
                f"Estimado(a) *{usuario.nombre_completo}*,\n\n"
                f"A continuación, presentamos el estado consolidado de sus "
                f"*{len(radicados)}* radicados activos:\n"
                f"{'─' * 30}\n\n"
            )
            for idx, rad in enumerate(radicados, 1):
                ultima_act = (
                    db.query(models.Actuacion)
                    .filter(models.Actuacion.radicado_id == rad.id)
                    .order_by(models.Actuacion.orden.desc())
                    .first()
                )
                mensaje += f"*{idx}. Radicado:* `{rad.numero}`\n"
                mensaje += (
                    f"   🏢 *Despacho:* {rad.despacho_departamento or 'Sin asignar'}\n"
                )
                if ultima_act:
                    mensaje += (
                        f"   📅 *Última Actuación ({ultima_act.fecha_actuacion}):* "
                        f"{ultima_act.actuacion}\n"
                    )
                else:
                    mensaje += "   ℹ️ *Sin actuaciones registradas a la fecha.*\n"
                mensaje += "\n"

            mensaje += f"{'─' * 30}\n"
            mensaje += "🤖 *Mensaje automático generado por tu plataforma SaaS Judicial.*"

            entrega_ids = emitir_notificacion_workflow(
                db,
                usuario,
                "RESUMENES",
                f"RESUMEN:{usuario.id}:{hoy.year:04d}-{hoy.month:02d}",
                f"Resumen mensual de procesos ({mes_actual})",
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
