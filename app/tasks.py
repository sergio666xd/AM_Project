from calendar import monthrange
from datetime import datetime, timedelta
import logging

from app.celery_app import celery_app
from app.database import SessionLocal
from app import models
from app.rama_judicial_api import ejecutar_consulta_api_radicado
from app.notification_policy import plan_whatsapp_habilitado, whatsapp_habilitado
from app.whatsapp import enviar_mensaje_whatsapp
from app.email_service import enviar_correo

logger = logging.getLogger(__name__)


# =============================================================
# ENVIAR MENSAJE POR WHATSAPP
# =============================================================
WHATSAPP_ACTIVO = True


@celery_app.task(
    name="tareas.enviar_whatsapp",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def tarea_enviar_whatsapp(
    self,
    numero_destino: str,
    mensaje: str,
):
    """
    Envía un mensaje de WhatsApp de forma independiente
    de las tareas de consulta judicial.
    """

    try:

        if not numero_destino:
            print(
                "⚠️ [WHATSAPP] Usuario sin número de WhatsApp."
            )

            return {
                "estado": "omitido",
                "motivo": "Usuario sin número de WhatsApp",
            }

        enviado = enviar_mensaje_whatsapp(
            numero_destino,
            mensaje,
        )

        if not enviado:
            raise Exception(
                "No fue posible enviar el mensaje por WhatsApp."
            )

        return {
            "estado": "enviado",
            "numero": numero_destino,
        }

    except Exception as exc:

        print(
            f"❌ [WHATSAPP] Error enviando mensaje: {exc}"
        )

        raise self.retry(
            exc=exc
        )


@celery_app.task(name="tareas.enviar_email", bind=True, max_retries=3, default_retry_delay=60)
def tarea_enviar_email(self, destinatario: str, asunto: str, cuerpo: str):
    try:
        return {"estado": "enviado" if enviar_correo(destinatario, asunto, cuerpo) else "omitido"}
    except Exception as exc:
        raise self.retry(exc=exc)


@celery_app.task(name="tareas.enviar_recordatorios_tareas")
def tarea_enviar_recordatorios_tareas():
    """Celery entry point; QStash can invoke the shared processor on Vercel."""
    return procesar_recordatorios_tareas()


def procesar_recordatorios_tareas():
    """Send due WhatsApp reminders directly and persist successful deliveries."""
    db = SessionLocal()
    enviados = 0
    errores = 0
    try:
        ahora = datetime.utcnow()
        recordatorios = (
            db.query(models.RecordatorioTarea)
            .join(models.Tarea)
            .join(models.Usuario, models.Usuario.id == models.Tarea.usuario_id)
            .filter(
                models.RecordatorioTarea.activo == True,
                models.RecordatorioTarea.enviado_en == None,
                models.Usuario.estado == models.EstadoUsuario.ACTIVO,
            )
            .with_for_update(skip_locked=True, of=models.RecordatorioTarea)
            .all()
        )
        for recordatorio in recordatorios:
            tarea = recordatorio.tarea
            usuario = tarea.usuario
            if not whatsapp_habilitado(usuario) or not plan_whatsapp_habilitado(usuario, "notificaciones_whatsapp_tareas"):
                continue
            momento = recordatorio.fecha_hora
            if momento is None and recordatorio.anticipacion_minutos is not None and tarea.fecha_limite:
                momento = tarea.fecha_limite - timedelta(minutes=recordatorio.anticipacion_minutos)
            if momento is None or momento > ahora:
                continue
            mensaje = f"📌 *Recordatorio de tarea*\n\n*{tarea.titulo}*"
            if tarea.fecha_limite:
                mensaje += f"\nFecha límite: {tarea.fecha_limite.strftime('%d/%m/%Y %H:%M')}"
            try:
                enviado = enviar_mensaje_whatsapp(usuario.whatsapp_numero, mensaje)
            except Exception:
                logger.exception("No se pudo enviar un recordatorio de tarea.")
                enviado = False
            if not enviado:
                errores += 1
                continue
            recordatorio.enviado_en = ahora
            db.commit()
            enviados += 1
        return {"estado": "ok", "recordatorios_enviados": enviados, "errores": errores}
    finally:
        db.close()


# =============================================================
# CONSULTAR RADICADO INDIVIDUAL
# =============================================================

@celery_app.task(
    name="tareas.consultar_radicado_individual",
    bind=True,
    max_retries=3,
    default_retry_delay=300,
)
def tarea_consultar_radicado(
    self,
    radicado_id: int,
    tipo: str = "AUTOMATICA",
    consulta_id: int | None = None,
):
    db = SessionLocal()

    try:

        # ---------------------------------------------------------
        # BUSCAR RADICADO
        # ---------------------------------------------------------

        radicado = (
            db.query(models.Radicado)
            .filter(
                models.Radicado.id == radicado_id
            )
            .first()
        )

        if not radicado:
            return {
                "error": "Radicado no encontrado"
            }

        # ---------------------------------------------------------
        # BUSCAR CONSULTA EXISTENTE
        # ---------------------------------------------------------

        consulta = None

        if consulta_id is not None:

            consulta = (
                db.query(models.ConsultaRadicado)
                .filter(
                    models.ConsultaRadicado.id
                    == consulta_id,
                    models.ConsultaRadicado.radicado_id
                    == radicado_id,
                )
                .first()
            )

            if not consulta:
                raise Exception(
                    f"No se encontró la consulta "
                    f"{consulta_id} para el radicado "
                    f"{radicado_id}."
                )

        # ---------------------------------------------------------
        # COMPATIBILIDAD CON TAREAS ANTIGUAS
        # ---------------------------------------------------------

        if consulta is None:

            consulta = models.ConsultaRadicado(
                radicado_id=radicado_id,
                tipo=tipo,
                estado="EN_PROCESO",
                task_id=self.request.id,
                inicio=datetime.utcnow(),
            )

            db.add(consulta)
            db.commit()
            db.refresh(consulta)

        else:

            consulta.estado = "EN_PROCESO"
            consulta.task_id = self.request.id

            db.commit()

        # ---------------------------------------------------------
        # CONSULTA A LA API DE LA RAMA JUDICIAL
        # ---------------------------------------------------------

        resultado = ejecutar_consulta_api_radicado(
            db,
            radicado,
        )

        if "error" in resultado.get("estado", ""):

            raise Exception(
                f"Fallo en consulta de la API: "
                f"{resultado['estado']}"
            )

        # ---------------------------------------------------------
        # OBTENER NUEVAS ACTUACIONES
        # ---------------------------------------------------------

        nuevas = resultado.get(
            "actuaciones_nuevas",
            [],
        )

        # ---------------------------------------------------------
        # NOTIFICACIÓN WHATSAPP
        # ---------------------------------------------------------

        if nuevas:

            usuario = radicado.creador

            if whatsapp_habilitado(usuario) and plan_whatsapp_habilitado(usuario, "notificaciones_whatsapp_procesos"):

                mensaje = (
                    f"⚖️ *Novedad Judicial Detectada*\n\n"
                    f"📌 *Radicado:* "
                    f"`{radicado.numero}`\n"
                    f"🏢 *Despacho:* "
                    f"{radicado.despacho_departamento}\n\n"
                    f"📝 *Nueva Actuación "
                    f"({nuevas[0]['fecha_actuacion']}):*\n"
                    f"{nuevas[0]['actuacion']}\n"
                )

                if nuevas[0].get("anotacion"):

                    mensaje += (
                        f"\nℹ️ *Anotación:* "
                        f"{nuevas[0]['anotacion']}\n"
                    )

                if nuevas[0].get("es_fijacion"):

                    mensaje += (
                        "\n⚠️ *Atención:* "
                        "Esta actuación incluye "
                        "Fijación en Estado."
                    )

                # Enviar WhatsApp como tarea independiente
                tarea_enviar_whatsapp.delay(
                    usuario.whatsapp_numero,
                    mensaje,
                )

        # ---------------------------------------------------------
        # CONSULTA COMPLETADA
        # ---------------------------------------------------------

        consulta.estado = "COMPLETADA"
        consulta.finalizacion = datetime.utcnow()
        consulta.actuaciones_nuevas = len(nuevas)

        estado_resultado = resultado.get("estado")

        consulta.detalle = (
            str(estado_resultado)
            if estado_resultado
            else "Consulta completada correctamente."
        )

        consulta.error = None

        db.commit()

        return {
            "radicado_id": radicado_id,
            "consulta_id": consulta.id,
            "tipo": consulta.tipo,
            "resultado": resultado,
        }

    except Exception as exc:

        # ---------------------------------------------------------
        # OBTENER CONSULTA SI EXISTE
        # ---------------------------------------------------------

        consulta = None

        if consulta_id is not None:

            consulta = (
                db.query(models.ConsultaRadicado)
                .filter(
                    models.ConsultaRadicado.id
                    == consulta_id,
                    models.ConsultaRadicado.radicado_id
                    == radicado_id,
                )
                .first()
            )

        # ---------------------------------------------------------
        # REINTENTO
        # ---------------------------------------------------------

        if self.request.retries < self.max_retries:

            if consulta:

                consulta.estado = "REINTENTANDO"
                consulta.error = str(exc)

                db.commit()

            retry_consulta_id = consulta.id if consulta else consulta_id
            raise self.retry(
                exc=exc,
                args=(radicado_id, tipo, retry_consulta_id),
                kwargs={},
            )

        # ---------------------------------------------------------
        # ERROR DEFINITIVO
        # ---------------------------------------------------------

        if consulta:

            consulta.estado = "ERROR"
            consulta.finalizacion = datetime.utcnow()
            consulta.error = str(exc)

            db.commit()

        radicado = (
            db.query(models.Radicado)
            .filter(
                models.Radicado.id == radicado_id
            )
            .first()
        )

        if radicado:

            radicado.estado_consulta = (
                "fallo_despues_de_reintentos"
            )

            db.commit()

        return {
            "error": str(exc),
            "radicado_id": radicado_id,
            "consulta_id": (
                consulta.id
                if consulta
                else consulta_id
            ),
        }

    finally:

        db.close()


# =============================================================
# CONSULTAR TODOS LOS RADICADOS
# =============================================================

@celery_app.task(
    name="tareas.consultar_todos_los_radicados"
)
def tarea_consultar_todos_los_radicados():
    """
    Barrido automático de todos los radicados registrados.

    Esta tarea es ejecutada por Celery Beat a las 12:00 y 18:00
    de lunes a viernes.

    En lugar de ejecutar la consulta directamente, encola una
    tarea individual por cada radicado.
    """

    db = SessionLocal()

    try:

        radicados = (
            db.query(models.Radicado)
            .order_by(
                models.Radicado.id.asc()
            )
            .all()
        )

        tareas_enviadas = []

        for radicado in radicados:

            # -------------------------------------------------
            # CREAR REGISTRO DE CONSULTA
            # -------------------------------------------------

            consulta = models.ConsultaRadicado(
                radicado_id=radicado.id,
                tipo="AUTOMATICA",
                estado="ENCOLADA",
                inicio=datetime.utcnow(),
            )

            db.add(consulta)
            db.commit()
            db.refresh(consulta)

            # -------------------------------------------------
            # ENCOLAR TAREA
            # -------------------------------------------------

            try:

                tarea = tarea_consultar_radicado.delay(
                    radicado.id,
                    "AUTOMATICA",
                    consulta.id,
                )

                consulta.task_id = tarea.id

                db.commit()

                tareas_enviadas.append(
                    {
                        "radicado_id": radicado.id,
                        "numero": radicado.numero,
                        "task_id": tarea.id,
                        "consulta_id": consulta.id,
                    }
                )

            except Exception as exc:

                consulta.estado = "ERROR"
                consulta.finalizacion = datetime.utcnow()
                consulta.error = str(exc)

                db.commit()

                tareas_enviadas.append(
                    {
                        "radicado_id": radicado.id,
                        "numero": radicado.numero,
                        "consulta_id": consulta.id,
                        "error": str(exc),
                    }
                )

        return {
            "estado": "completado",
            "total_radicados": len(radicados),
            "tareas_enviadas": tareas_enviadas,
        }

    except Exception as exc:

        return {
            "estado": "error",
            "error": str(exc),
        }

    finally:

        db.close()


# =============================================================
# RESUMEN MENSUAL
# =============================================================

@celery_app.task(
    name="tareas.enviar_resumen_mensual_usuarios"
)
def tarea_enviar_resumen_mensual():
    """
    Tarea programada para el último día del mes.

    Envía a cada abogado un resumen con el total de sus
    radicados y la última actuación registrada.
    """

    db = SessionLocal()

    try:

        hoy = datetime.now()

        ultimo_dia_mes = monthrange(
            hoy.year,
            hoy.month,
        )[1]

        if hoy.day != ultimo_dia_mes:

            return {
                "estado": "omitido",
                "motivo": (
                    "No es el último día del mes"
                ),
            }

        # ---------------------------------------------------------
        # USUARIOS ACTIVOS
        # ---------------------------------------------------------

        usuarios = (
            db.query(models.Usuario)
            .filter(
                models.Usuario.estado == models.EstadoUsuario.ACTIVO
            )
            .all()
        )

        usuarios_notificados = 0

        # ---------------------------------------------------------
        # PROCESAR USUARIOS
        # ---------------------------------------------------------

        for usuario in usuarios:

            radicados = (
                db.query(models.Radicado)
                .join(models.Radicado.usuarios_vinculados)
                .filter(models.Usuario.id == usuario.id)
                .all()
            )

            if not radicados:
                continue

            # -----------------------------------------------------
            # CONSTRUIR INFORME
            # -----------------------------------------------------

            mes_actual = (
                datetime.now()
                .strftime("%B %Y")
                .capitalize()
            )

            mensaje = (
                f"📊 *INFORME MENSUAL DE PROCESOS "
                f"({mes_actual})*\n"
                f"Estimado(a) "
                f"*{usuario.nombre_completo}*,\n\n"
                f"A continuación, presentamos el "
                f"estado consolidado de sus "
                f"*{len(radicados)}* radicados activos:\n"
                f"{'─' * 30}\n\n"
            )

            for idx, rad in enumerate(
                radicados,
                1,
            ):

                # -------------------------------------------------
                # ÚLTIMA ACTUACIÓN
                # -------------------------------------------------

                ultima_act = (
                    db.query(models.Actuacion)
                    .filter(
                        models.Actuacion.radicado_id
                        == rad.id
                    )
                    .order_by(
                        models.Actuacion.orden.desc()
                    )
                    .first()
                )

                mensaje += (
                    f"*{idx}. Radicado:* "
                    f"`{rad.numero}`\n"
                )

                mensaje += (
                    f"   🏢 *Despacho:* "
                    f"{rad.despacho_departamento or 'Sin asignar'}\n"
                )

                if ultima_act:

                    mensaje += (
                        f"   📅 *Última Actuación "
                        f"({ultima_act.fecha_actuacion}):* "
                        f"{ultima_act.actuacion}\n"
                    )

                else:

                    mensaje += (
                        "   ℹ️ *Sin actuaciones "
                        "registradas a la fecha.*\n"
                    )

                mensaje += "\n"

            mensaje += f"{'─' * 30}\n"

            mensaje += (
                "🤖 *Mensaje automático generado "
                "por tu plataforma SaaS Judicial.*"
            )

            # -----------------------------------------------------
            # ENVIAR WHATSAPP
            # -----------------------------------------------------

            if whatsapp_habilitado(usuario) and plan_whatsapp_habilitado(usuario, "notificaciones_whatsapp_procesos"):

                tarea_enviar_whatsapp.delay(
                    usuario.whatsapp_numero,
                    mensaje,
                )

                usuarios_notificados += 1

        return {
            "estado": "ok",
            "usuarios_notificados": usuarios_notificados,
        }

    finally:

        db.close()
