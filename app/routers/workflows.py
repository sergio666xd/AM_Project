import hmac
import hashlib
import logging
import os
import smtplib
from datetime import date, datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import and_, case, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.email_service import enviar_correo
from app.notification_policy import (
    abogados_notificables_para_radicado,
    canales_habilitados,
    canales_recordatorio_seleccionados,
    clientes_notificables_para_radicado,
)
from app.notification_service import emitir_notificacion_workflow
from app.message_templates import render_message, render_push_message
from app.timezone import format_colombia_datetime
from app.rama_judicial_api import ejecutar_consulta_api_radicado
from app.reminder_workflow import (
    momento_programado,
    normalizar_utc_naive,
    procesar_recordatorios_tareas,
)
from app.monthly_summary import enviar_resumen_mensual
from app.whatsapp import enviar_mensaje_whatsapp
from app.workflow_service import user_portal_url
from app.web_push import send_web_push


router = APIRouter(
    prefix="/api/internal/workflows",
    tags=["Workflows internos"],
)
logger = logging.getLogger(__name__)

RECONCILIACION_INTERVALO_DIAS = 30
DETALLE_RECONCILIACION_COMPLETA = "ok|RECONCILIACION_COMPLETA_V1"
MAX_INTENTOS_NOTIFICACION = 3


def _diagnostico_entrega(canal: str, error: Exception) -> str:
    """Describe fallos del proveedor sin exponer credenciales ni respuestas privadas."""
    if canal == "EMAIL":
        if isinstance(error, smtplib.SMTPAuthenticationError):
            return "SMTP rechazó la autenticación; verifica usuario y contraseña en Operación > Integraciones."
        if isinstance(error, smtplib.SMTPRecipientsRefused):
            return "El servidor SMTP rechazó el correo del destinatario."
        if isinstance(error, (smtplib.SMTPConnectError, OSError)):
            return "No fue posible conectar con el servidor SMTP; verifica host, puerto y TLS."
        if isinstance(error, smtplib.SMTPResponseException):
            return f"El servidor SMTP rechazó el envío (código {error.smtp_code})."
        return f"Falló el envío SMTP ({type(error).__name__}); revisa la configuración de correo."
    message = str(error)
    if message.startswith(("WhatsApp no está configurado", "WhatsApp API respondió", "No fue posible conectar con la API de WhatsApp")):
        return message
    return f"Falló el proveedor de WhatsApp ({type(error).__name__}); revisa Operación > Integraciones."


def _aplicar_delta_contadores_barrido(
    db: Session,
    ejecucion_id: str,
    procesados_delta: int,
    errores_delta: int,
    actuaciones_delta: int,
    lease_hasta: datetime,
) -> None:
    errores_actualizados = models.EjecucionBarrido.errores + errores_delta
    actuaciones_actualizadas = models.EjecucionBarrido.actuaciones_nuevas + actuaciones_delta
    db.query(models.EjecucionBarrido).filter_by(id=ejecucion_id).update(
        {
            models.EjecucionBarrido.procesados: (
                models.EjecucionBarrido.procesados + procesados_delta
            ),
            models.EjecucionBarrido.errores: case(
                (errores_actualizados < 0, 0),
                else_=errores_actualizados,
            ),
            models.EjecucionBarrido.actuaciones_nuevas: case(
                (actuaciones_actualizadas < 0, 0),
                else_=actuaciones_actualizadas,
            ),
            models.EjecucionBarrido.lease_hasta: lease_hasta,
        },
        synchronize_session=False,
    )


def _reconciliacion_completa_vencida(
    db: Session,
    radicado_id: int,
    ahora: datetime,
) -> bool:
    ultima = (
        db.query(models.ConsultaRadicado)
        .filter_by(
            radicado_id=radicado_id,
            estado="COMPLETADA",
            detalle=DETALLE_RECONCILIACION_COMPLETA,
        )
        .order_by(models.ConsultaRadicado.finalizacion.desc())
        .first()
    )
    return (
        ultima is None
        or ultima.finalizacion is None
        or ultima.finalizacion <= ahora - timedelta(days=RECONCILIACION_INTERVALO_DIAS)
    )


def verificar_token_workflow(authorization: str | None = Header(default=None)) -> None:
    expected = os.getenv("WORKFLOW_SERVICE_TOKEN", "")
    if not expected:
        raise HTTPException(status_code=503, detail="El token interno de Workflow no está configurado.")
    supplied = authorization.removeprefix("Bearer ") if authorization else ""
    if not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Credencial interna inválida.")


@router.post("/consultas/manual/preparar")
def preparar_consulta_manual_workflow(
    datos: schemas.WorkflowConsultaManualCreate,
    _: None = Depends(verificar_token_workflow),
    db: Session = Depends(get_db),
):
    actor = db.query(models.Usuario).filter_by(
        id=datos.actor_id,
        rol=models.RolUsuario.ADMIN,
        estado=models.EstadoUsuario.ACTIVO,
    ).first()
    if not actor:
        raise HTTPException(status_code=403, detail="Se requiere ADMIN activo.")
    radicado = db.query(models.Radicado).filter_by(id=datos.radicado_id).first()
    if not radicado:
        raise HTTPException(status_code=404, detail="Radicado no encontrado.")
    consulta = models.ConsultaRadicado(
        radicado_id=radicado.id,
        tipo="MANUAL",
        estado="ENCOLADA",
        inicio=datetime.utcnow(),
    )
    db.add(consulta)
    db.commit()
    db.refresh(consulta)
    return {"consulta_id": consulta.id}


@router.post("/consultas/nuevo/{consulta_id}/procesar")
def procesar_consulta_nuevo_workflow(
    consulta_id: int,
    datos: schemas.WorkflowConsultaRadicado,
    _: None = Depends(verificar_token_workflow),
    db: Session = Depends(get_db),
):
    consulta = db.query(models.ConsultaRadicado).filter_by(id=consulta_id).with_for_update().first()
    if not consulta or consulta.tipo not in {"AUTOMATICA_NUEVO", "MANUAL"}:
        raise HTTPException(status_code=404, detail="Consulta Workflow no encontrada.")
    if consulta.estado == "COMPLETADA":
        return {
            "estado": "COMPLETADA",
            "actuaciones_nuevas": consulta.actuaciones_nuevas,
            "repetida": True,
        }

    actor = db.query(models.Usuario).filter_by(id=datos.actor_id).first()
    radicado = db.query(models.Radicado).filter_by(id=consulta.radicado_id).first()
    if not actor or not radicado or actor.estado != models.EstadoUsuario.ACTIVO:
        raise HTTPException(status_code=403, detail="Actor o radicado no disponible.")
    if consulta.tipo == "MANUAL":
        autorizado = actor.rol == models.RolUsuario.ADMIN
    elif actor.rol == models.RolUsuario.ADMIN:
        autorizado = True
    elif actor.rol == models.RolUsuario.ABOGADO_ADMIN:
        autorizado = (
            radicado.ambito_key == "FIRMA"
            and any(link.id == actor.id for link in radicado.usuarios_vinculados)
        )
    else:
        autorizado = (
            actor.rol == models.RolUsuario.ABOGADO
            and radicado.ambito_key == f"SAAS:{actor.id}"
            and actor.plan is not None
            and actor.plan.precio_mensual > 0
        )
    if not autorizado:
        raise HTTPException(status_code=403, detail="No puedes consultar este radicado.")
    if consulta.estado == "EN_PROCESO" and consulta.task_id != datos.launch_token:
        raise HTTPException(status_code=409, detail="La consulta ya está siendo procesada.")

    consulta.estado = "EN_PROCESO"
    consulta.task_id = datos.launch_token
    consulta.error = None
    consulta.inicio = datetime.utcnow()
    db.commit()

    resultado = ejecutar_consulta_api_radicado(db, radicado)
    estado_api = str(resultado.get("estado", ""))
    ahora = datetime.utcnow()
    if estado_api.startswith("error"):
        consulta.estado = "ERROR"
        consulta.error = estado_api
        consulta.finalizacion = ahora
        db.commit()
        raise HTTPException(status_code=503, detail="La consulta del radicado falló; el Workflow la reintentará.")

    consulta.estado = "COMPLETADA"
    consulta.error = None
    consulta.finalizacion = ahora
    consulta.actuaciones_nuevas = len(resultado.get("actuaciones_nuevas", []))
    consulta.detalle = estado_api
    db.commit()
    return {
        "estado": "COMPLETADA",
        "actuaciones_nuevas": consulta.actuaciones_nuevas,
        "resultado": resultado,
    }


def _configuracion(db: Session, bloquear: bool = False) -> models.ConfiguracionConsultas:
    query = db.query(models.ConfiguracionConsultas).filter_by(id=1)
    if bloquear:
        query = query.with_for_update()
    configuracion = query.first()
    if configuracion is None:
        configuracion = models.ConfiguracionConsultas(id=1, activa=False)
        db.add(configuracion)
        db.flush()
    return configuracion


def _serializar_ejecucion(ejecucion: models.EjecucionBarrido) -> dict:
    return {
        "id": ejecucion.id,
        "tipo": ejecucion.tipo,
        "estado": ejecucion.estado,
        "inicio": ejecucion.inicio,
        "finalizacion": ejecucion.finalizacion,
        "total_radicados": ejecucion.total_radicados,
        "procesados": ejecucion.procesados,
        "errores": ejecucion.errores,
        "actuaciones_nuevas": ejecucion.actuaciones_nuevas,
    }


def _obtener_id_actuacion(
    db: Session,
    radicado_id: int,
    datos: dict,
) -> int | None:
    return (
        db.query(models.Actuacion.id)
        .filter_by(
            radicado_id=radicado_id,
            fecha_actuacion=datos.get("fecha_actuacion", ""),
            actuacion=datos.get("actuacion", ""),
            anotacion=datos.get("anotacion", ""),
            fecha_inicia_termino=datos.get("fecha_inicia_termino", ""),
            fecha_finaliza_termino=datos.get("fecha_finaliza_termino", ""),
            fecha_registro=datos.get("fecha_registro", ""),
        )
        .order_by(models.Actuacion.id.desc())
        .scalar()
    )


def _agregar_actuaciones_a_grupo(
    grupos: dict,
    usuario: models.Usuario,
    emisor: models.Usuario | None,
    radicado: models.Radicado,
    proceso: models.Proceso | None,
    actuaciones: list[dict],
    db: Session,
) -> None:
    for canal in canales_habilitados(usuario, "ACTUACIONES", emisor=emisor, db=db):
        clave = (usuario.id, canal)
        grupo = grupos.setdefault(clave, {"usuario": usuario, "canal": canal, "secciones": {}})
        proceso_id = proceso.id if proceso else None
        seccion_key = (proceso_id, radicado.id)
        seccion = grupo["secciones"].setdefault(
            seccion_key,
            {
                "proceso": proceso.nombre if proceso else None,
                "radicado": radicado.numero,
                "detalle_url": _url_radicado(usuario, radicado.id, proceso.id if proceso else None),
                "actuaciones": {},
            },
        )
        for actuacion in actuaciones:
            seccion["actuaciones"][actuacion["id"]] = actuacion


def _cuerpo_novedades(secciones: list[dict]) -> str:
    bloques = []
    for seccion in secciones:
        actuaciones = list(seccion["actuaciones"].values())
        actuaciones.sort(key=lambda item: (item.get("orden", 0), item.get("id", 0)))
        # Orden 1 corresponde a la actuación más reciente en la Rama Judicial.
        reciente = actuaciones[0]
        encabezado = f"Proceso: {seccion['proceso']}\n" if seccion["proceso"] else ""
        bloque = (
            f"{encabezado}Radicado: {seccion['radicado']}\n"
            f"Novedades: {len(actuaciones)}\n"
            f"Actuación más reciente ({reciente.get('fecha_actuacion') or 'sin fecha'}): "
            f"{reciente.get('actuacion') or 'Sin descripción'}"
        )
        if reciente.get("anotacion"):
            bloque += f"\nAnotación: {reciente['anotacion']}"
        if seccion.get("detalle_url"):
            bloque += f"\nAbrir radicado: {seccion['detalle_url']}"
        bloques.append(bloque)
    return "\n\n".join(bloques)


def _url_radicado(usuario: models.Usuario, radicado_id: int, proceso_id: int | None = None) -> str:
    if usuario.rol == models.RolUsuario.CLIENTE:
        ruta = f"/gestion-procesos/cliente/procesos/{proceso_id}#radicado-{radicado_id}" if proceso_id else "/gestion-procesos/cliente/procesos"
    elif usuario.rol == models.RolUsuario.ABOGADO:
        ruta = f"/gestion-procesos/dashboard/radicados/{radicado_id}"
    elif usuario.rol == models.RolUsuario.ADMIN:
        ruta = f"/gestion-procesos/admin/radicados?detalle={radicado_id}"
    else:
        ruta = f"/gestion-procesos/abogado/radicados/{radicado_id}"
    return user_portal_url(usuario, ruta)


def _enviar_push_actuacion(
    db: Session,
    usuario: models.Usuario,
    proceso: models.Proceso | None,
    radicado: models.Radicado,
    actuacion: dict,
) -> None:
    if not db.query(models.ChatPushSubscription.id).filter_by(usuario_id=usuario.id).first():
        logger.info(
            "Push de actuación %s no enviada al usuario %s: no tiene suscripciones registradas.",
            actuacion["id"], usuario.id,
        )
        return

    key = f"ACTUACION_PUSH:{usuario.id}:{actuacion['id']}"
    entrega = db.query(models.EntregaNotificacion).filter_by(
        clave_idempotencia=key,
    ).with_for_update().first()
    if entrega and entrega.estado == "ENVIADA":
        return
    if entrega and entrega.estado == "ERROR" and entrega.intentos >= MAX_INTENTOS_NOTIFICACION:
        return
    now = datetime.utcnow()
    if entrega and entrega.estado == "ENVIANDO" and entrega.lease_hasta and entrega.lease_hasta > now:
        return

    valores = {
        "nombre": usuario.nombre_completo,
        "proceso": proceso.nombre if proceso else "Proceso judicial",
        "radicado": radicado.numero,
        "fecha": actuacion.get("fecha_actuacion") or "Sin fecha",
        "actuacion": actuacion.get("actuacion") or "Nueva actuación judicial",
        "anotacion": actuacion.get("anotacion") or "",
        "cantidad": "1",
    }
    try:
        title, body = render_push_message(db, "ACTUACIONES_DIGEST", valores)
    except Exception:
        logger.exception(
            "No se pudo construir Push de actuación %s para usuario %s: revisa los textos Push de ACTUACIONES_DIGEST.",
            actuacion["id"], usuario.id,
        )
        return

    if entrega is None:
        entrega = models.EntregaNotificacion(
            clave_idempotencia=key,
            usuario_id=usuario.id,
            tipo="ACTUACIONES",
            canal="PUSH",
            asunto=title[:255],
            cuerpo=body,
            estado="ENVIANDO",
            intentos=1,
            lease_hasta=now + timedelta(minutes=15),
        )
        db.add(entrega)
        db.flush()
        db.add(models.EntregaNotificacionActuacion(
            entrega_id=entrega.id,
            actuacion_id=actuacion["id"],
            usuario_id=usuario.id,
            canal="PUSH",
        ))
    else:
        entrega.asunto = title[:255]
        entrega.cuerpo = body
        entrega.estado = "ENVIANDO"
        entrega.intentos += 1
        entrega.error = None
        entrega.lease_hasta = now + timedelta(minutes=15)
    db.commit()

    delivered = send_web_push(
        db,
        usuario,
        title=title,
        body=body,
        link=_url_radicado(usuario, radicado.id, proceso.id if proceso else None),
        tag=f"actuacion-{actuacion['id']}",
    )
    entrega.estado = "ENVIADA" if delivered else "ERROR"
    entrega.error = None if delivered else "Push no entregada; consulta los logs del proveedor y reintenta la preparación."
    entrega.enviado_en = datetime.utcnow() if delivered else None
    entrega.lease_hasta = None
    db.commit()


@router.post("/consultas/{ejecucion_id}/notificaciones/preparar")
def preparar_notificaciones_actuaciones(
    ejecucion_id: str,
    datos: schemas.WorkflowNovedadesPreparar,
    _: None = Depends(verificar_token_workflow),
    db: Session = Depends(get_db),
):
    ejecucion = db.query(models.EjecucionBarrido).filter_by(id=ejecucion_id).first()
    if not ejecucion:
        raise HTTPException(status_code=404, detail="Ejecución no encontrada.")

    grupos: dict[tuple[int, str], dict] = {}
    push_targets: dict[tuple[int, int], tuple[models.Usuario, models.Proceso | None, models.Radicado, dict]] = {}
    seen_by_recipient: set[tuple[int, int, str]] = set()
    for evento in datos.eventos:
        resultado_radicado = db.query(models.EjecucionRadicado).filter_by(
            ejecucion_id=ejecucion.id,
            radicado_id=evento.radicado_id,
            estado="COMPLETADA",
        ).first()
        radicado = db.query(models.Radicado).filter_by(id=evento.radicado_id).first()
        if not resultado_radicado or not radicado:
            continue

        nuevas = []
        for actuacion in evento.actuaciones_nuevas:
            actuacion_id = _obtener_id_actuacion(db, radicado.id, actuacion.model_dump())
            if actuacion_id is not None:
                nuevas.append({**actuacion.model_dump(), "id": actuacion_id})
        if not nuevas:
            continue

        processes = [
            link.proceso
            for link in radicado.procesos
            if link.proceso and link.proceso.archivado_en is None
        ]
        lawyers = abogados_notificables_para_radicado(radicado)
        for lawyer in lawyers:
            if processes:
                for proceso in processes:
                    for actuacion in nuevas:
                        push_targets.setdefault((lawyer.id, actuacion["id"]), (lawyer, proceso, radicado, actuacion))
                    _agregar_actuaciones_a_grupo(
                        grupos,
                        lawyer,
                        lawyer,
                        radicado,
                        proceso,
                        nuevas,
                        db=db,
                    )
            else:
                for actuacion in nuevas:
                    push_targets.setdefault((lawyer.id, actuacion["id"]), (lawyer, None, radicado, actuacion))
                _agregar_actuaciones_a_grupo(
                    grupos,
                    lawyer,
                    lawyer,
                    radicado,
                    None,
                    nuevas,
                    db=db,
                )

        for cliente, proceso in clientes_notificables_para_radicado(radicado):
            for actuacion in nuevas:
                push_targets.setdefault((cliente.id, actuacion["id"]), (cliente, proceso, radicado, actuacion))
            if not canales_habilitados(cliente, "ACTUACIONES", emisor=proceso.abogado, db=db):
                omitida = _cuerpo_novedades([{
                    "proceso": proceso.nombre,
                    "radicado": radicado.numero,
                    "detalle_url": _url_radicado(cliente, radicado.id, proceso.id),
                    "actuaciones": {actuacion["id"]: actuacion for actuacion in nuevas},
                }])
                emitir_notificacion_workflow(
                    db,
                    cliente,
                    "ACTUACIONES",
                    f"ACTUACIONES:{ejecucion.id}:{radicado.id}:{proceso.id}",
                    "Novedades judiciales",
                    omitida,
                    emisor=proceso.abogado,
                    iniciar_workflow=False,
                    actuacion_ids=[actuacion["id"] for actuacion in nuevas],
                    plantilla_clave="ACTUACIONES_DIGEST",
                    variables={"nombre": cliente.nombre_completo, "novedades": omitida},
                )
            else:
                _agregar_actuaciones_a_grupo(
                    grupos,
                    cliente,
                    proceso.abogado,
                    radicado,
                    proceso,
                    nuevas,
                    db=db,
                )

    for push_usuario, proceso, radicado, actuacion in push_targets.values():
        _enviar_push_actuacion(db, push_usuario, proceso, radicado, actuacion)

    delivery_ids = []
    for grupo in grupos.values():
        usuario = grupo["usuario"]
        canal = grupo["canal"]
        secciones = list(grupo["secciones"].values())
        actuaciones_por_id = {
            actuacion["id"]: actuacion
            for seccion in secciones
            for actuacion in seccion["actuaciones"].values()
        }
        pendientes = []
        for actuacion_id, actuacion in actuaciones_por_id.items():
            mapping = db.query(models.EntregaNotificacionActuacion).filter_by(
                actuacion_id=actuacion_id,
                usuario_id=usuario.id,
                canal=canal,
            ).first()
            if mapping:
                entrega_previa = db.query(models.EntregaNotificacion).filter_by(
                    id=mapping.entrega_id
                ).first()
                if entrega_previa and entrega_previa.estado in {"ENVIADA", "OMITIDA"}:
                    continue
            key = (actuacion_id, usuario.id, canal)
            if key not in seen_by_recipient:
                seen_by_recipient.add(key)
                pendientes.append((actuacion_id, actuacion))
        if not pendientes:
            continue

        pending_ids = {actuacion_id for actuacion_id, _ in pendientes}
        secciones_pendientes = []
        for seccion in secciones:
            secciones_pendientes.append({
                **seccion,
                "actuaciones": {
                    actuacion_id: actuacion
                    for actuacion_id, actuacion in seccion["actuaciones"].items()
                    if actuacion_id in pending_ids
                },
            })
        secciones_pendientes = [seccion for seccion in secciones_pendientes if seccion["actuaciones"]]

        actuacion_ids = sorted(pending_ids)
        subject, body = render_message(
            db, "ACTUACIONES_DIGEST", {"nombre": usuario.nombre_completo,
                                       "novedades": _cuerpo_novedades(secciones_pendientes)},
            canal=canal,
        )
        event_digest = hashlib.sha256(
            ",".join(map(str, actuacion_ids)).encode("ascii")
        ).hexdigest()
        clave = f"ACTUACIONES:{usuario.id}:{canal}:{event_digest}"
        entrega = db.query(models.EntregaNotificacion).filter_by(clave_idempotencia=clave).with_for_update().first()
        if entrega is None:
            entrega = models.EntregaNotificacion(
                clave_idempotencia=clave,
                usuario_id=usuario.id,
                tipo="ACTUACIONES",
                canal=canal,
                asunto=subject,
                cuerpo=body,
                estado="PENDIENTE",
            )
            db.add(entrega)
            db.flush()
        else:
            if entrega.intentos >= MAX_INTENTOS_NOTIFICACION:
                continue
            entrega.asunto = subject
            entrega.cuerpo = body
            if entrega.estado != "ENVIADA":
                entrega.estado = "PENDIENTE"
                entrega.error = None

        for actuacion_id, _ in pendientes:
            mapping = db.query(models.EntregaNotificacionActuacion).filter_by(
                actuacion_id=actuacion_id,
                usuario_id=usuario.id,
                canal=canal,
            ).first()
            if mapping is None:
                db.add(models.EntregaNotificacionActuacion(
                    entrega_id=entrega.id,
                    actuacion_id=actuacion_id,
                    usuario_id=usuario.id,
                    canal=canal,
                ))
        delivery_ids.append(entrega.id)

    db.commit()
    return {"entrega_ids": delivery_ids}


@router.get("/notificaciones/pendientes")
def listar_entregas_notificacion_pendientes(
    despues_de: int = 0,
    limite: int = Query(default=100, ge=1, le=250),
    _: None = Depends(verificar_token_workflow),
    db: Session = Depends(get_db),
):
    ahora = datetime.utcnow()
    entrega_ids = (
        db.query(models.EntregaNotificacion.id)
        .filter(
            models.EntregaNotificacion.id > despues_de,
            models.EntregaNotificacion.canal.in_(("EMAIL", "WHATSAPP")),
            models.EntregaNotificacion.intentos < MAX_INTENTOS_NOTIFICACION,
            or_(
                models.EntregaNotificacion.estado == "PENDIENTE",
                models.EntregaNotificacion.estado == "ERROR",
                and_(
                    models.EntregaNotificacion.estado == "ENVIANDO",
                    models.EntregaNotificacion.lease_hasta < ahora,
                ),
            ),
        )
        .order_by(models.EntregaNotificacion.id.asc())
        .limit(limite)
        .all()
    )
    ids = [row.id for row in entrega_ids]
    return {"entrega_ids": ids, "siguiente_cursor": ids[-1] if ids else None}


def _marcar_recordatorio_completo_si_aplica(
    db: Session,
    entrega: models.EntregaNotificacion,
) -> None:
    if entrega.recordatorio_id is None:
        return
    recordatorio = db.query(models.RecordatorioTarea).filter_by(
        id=entrega.recordatorio_id
    ).with_for_update().first()
    if (
        recordatorio is None
        or entrega.recordatorio_version is not None
        and recordatorio.version != entrega.recordatorio_version
    ):
        return
    version = recordatorio.version
    pendientes = db.query(models.EntregaNotificacion.id).filter(
        models.EntregaNotificacion.recordatorio_id == entrega.recordatorio_id,
        models.EntregaNotificacion.recordatorio_version == version,
        ~or_(
            models.EntregaNotificacion.estado.in_(("ENVIADA", "OMITIDA")),
            and_(
                models.EntregaNotificacion.estado == "ERROR",
                models.EntregaNotificacion.intentos >= MAX_INTENTOS_NOTIFICACION,
            ),
        ),
    ).count()
    if pendientes == 0:
        if recordatorio.enviado_en is None:
            recordatorio.enviado_en = datetime.utcnow()


@router.post("/recordatorios/reconciliar")
def reconciliar_lanzamientos_recordatorios(
    _: None = Depends(verificar_token_workflow),
):
    """Reintenta lanzamientos de Workflow pendientes; sin scheduler externo."""
    return procesar_recordatorios_tareas()


@router.post("/resumen-mensual")
def ejecutar_resumen_mensual_workflow(
    _: None = Depends(verificar_token_workflow),
):
    """Ejecuta el resumen mensual; el Cron diario lo invoca y el mismo
    handler solo actúa en el último día del mes."""
    return enviar_resumen_mensual()


@router.post("/recordatorios/{recordatorio_id}/preparar")
def preparar_recordatorio_workflow(
    recordatorio_id: int,
    datos: schemas.WorkflowRecordatorioPreparar,
    _: None = Depends(verificar_token_workflow),
    db: Session = Depends(get_db),
):
    recordatorio = db.query(models.RecordatorioTarea).filter_by(
        id=recordatorio_id
    ).with_for_update().first()
    if (
        recordatorio is None
        or recordatorio.version != datos.version
        or not recordatorio.activo
        or recordatorio.enviado_en is not None
    ):
        db.commit()
        return {"estado": "CANCELADO", "entrega_ids": []}

    tarea = recordatorio.tarea
    usuario = (
        tarea.cliente_asignado
        if tarea and recordatorio.interno_sistema and tarea.cliente_id
        else tarea.usuario if tarea else None
    )
    if (
        tarea is None
        or tarea.estado in {models.EstadoTarea.COMPLETADA, models.EstadoTarea.CANCELADA}
        or usuario is None
        or usuario.estado != models.EstadoUsuario.ACTIVO
    ):
        db.commit()
        return {"estado": "CANCELADO", "entrega_ids": []}

    ahora = datetime.utcnow()
    momento = momento_programado(recordatorio, tarea)
    if momento is None:
        recordatorio.activo = False
        recordatorio.version += 1
        db.commit()
        return {"estado": "CANCELADO", "entrega_ids": []}
    if momento > ahora:
        db.commit()
        return {
            "estado": "TODAVIA_NO_VENCE",
            "entrega_ids": [],
            "programado_para": momento.replace(tzinfo=timezone.utc).isoformat(),
        }

    if usuario.rol == models.RolUsuario.ABOGADO:
        tarea_path = f"/gestion-procesos/dashboard/tareas/{tarea.id}"
    elif usuario.rol == models.RolUsuario.CLIENTE:
        tarea_path = f"/gestion-procesos/cliente/tareas?tarea={tarea.id}#tarea-{tarea.id}"
    elif usuario.rol == models.RolUsuario.ADMIN:
        tarea_path = f"/gestion-procesos/admin/tareas?detalle={tarea.id}"
    else:
        tarea_path = f"/gestion-procesos/abogado/tareas/{tarea.id}"
    mensaje = f"Recordatorio de tarea: {tarea.titulo}"
    mensaje += f"\n\nAcción requerida: completa o revisa esta tarea antes de su vencimiento."
    mensaje += f"\nEstado: {tarea.estado.value}\nPrioridad: {tarea.prioridad.value}"
    if tarea.proceso:
        mensaje += f"\nProceso: {tarea.proceso.nombre}"
    if tarea.radicado:
        mensaje += f"\nRadicado: {tarea.radicado.numero}"
    if tarea.actuacion_rel:
        mensaje += f"\nActuación: {tarea.actuacion_rel.actuacion or 'Actuación judicial'}"
    if tarea.descripcion:
        mensaje += f"\nDetalle: {tarea.descripcion}"
    programado_por = "en el momento programado"
    if tarea.fecha_limite:
        fecha_limite = normalizar_utc_naive(tarea.fecha_limite)
        anticipacion = recordatorio.anticipacion_minutos
        programado_por = f"{anticipacion // 60} horas antes" if anticipacion else "en el momento programado"
        mensaje += f"\nVencimiento: {format_colombia_datetime(fecha_limite)}\nAviso: {programado_por}"
    tarea_url = user_portal_url(usuario, tarea_path)
    mensaje += f"\n\nAbrir enlace: Ver tarea | {tarea_url}"
    entrega_ids = emitir_notificacion_workflow(
        db,
        usuario,
        "RECORDATORIOS",
        f"RECORDATORIO:{recordatorio.id}:V{recordatorio.version}",
        "Recordatorio de tarea",
        mensaje,
        emisor=usuario,
        iniciar_workflow=False,
        recordatorio_id=recordatorio.id,
        recordatorio_version=recordatorio.version,
        plantilla_clave="RECORDATORIO_TAREA",
        variables={"nombre": usuario.nombre_completo, "tarea": tarea.titulo,
                   "estado": tarea.estado.value, "prioridad": tarea.prioridad.value,
                   "proceso": tarea.proceso.nombre if tarea.proceso else "Tarea general",
                   "radicado": tarea.radicado.numero if tarea.radicado else "No asociado",
                   "actuacion": tarea.actuacion_rel.actuacion if tarea.actuacion_rel else "No asociada",
                   "detalle": tarea.descripcion or "Sin detalles adicionales",
                   "fecha_limite": format_colombia_datetime(fecha_limite) if tarea.fecha_limite else "Sin fecha límite",
                   "anticipacion": programado_por},
        enlace_texto="Ver tarea", enlace_url=tarea_url,
    )
    if not entrega_ids:
        recordatorio.enviado_en = ahora
        db.commit()
        return {"estado": "OMITIDO", "entrega_ids": []}

    entregas = db.query(models.EntregaNotificacion).filter(
        models.EntregaNotificacion.id.in_(entrega_ids)
    ).all()
    pendientes = any(
        entrega.estado not in {"ENVIADA", "OMITIDA"}
        and not (entrega.estado == "ERROR" and entrega.intentos >= MAX_INTENTOS_NOTIFICACION)
        for entrega in entregas
    )
    if not pendientes:
        recordatorio.enviado_en = ahora
    db.commit()
    return {"estado": "PREPARADO", "entrega_ids": entrega_ids}


@router.post("/notificaciones/{entrega_id}/enviar")
def enviar_entrega_notificacion_workflow(
    entrega_id: int,
    _: None = Depends(verificar_token_workflow),
    db: Session = Depends(get_db),
):
    entrega = db.query(models.EntregaNotificacion).filter_by(id=entrega_id).with_for_update().first()
    if not entrega:
        raise HTTPException(status_code=404, detail="Entrega no encontrada.")
    if entrega.estado in {"DESCARTADA", "OMITIDA"}:
        return {"estado": entrega.estado, "repetida": True}
    if entrega.canal == "PUSH":
        raise HTTPException(status_code=409, detail="Las entregas Push se procesan desde el evento de actuación.")
    if entrega.estado == "ENVIADA":
        return {"estado": "ENVIADA", "repetida": True}
    ahora = datetime.utcnow()
    if entrega.intentos >= MAX_INTENTOS_NOTIFICACION:
        entrega.estado = "ERROR"
        entrega.error = entrega.error or "Se agotaron los reintentos de entrega."
        entrega.lease_hasta = None
        _marcar_recordatorio_completo_si_aplica(db, entrega)
        db.commit()
        return {"estado": "ERROR", "agotada": True}
    if entrega.estado == "ENVIANDO" and entrega.lease_hasta and entrega.lease_hasta > ahora:
        raise HTTPException(status_code=409, detail="La entrega ya está en curso.")

    if entrega.recordatorio_id is not None or entrega.recordatorio_version is not None:
        recordatorio = db.query(models.RecordatorioTarea).filter_by(
            id=entrega.recordatorio_id
        ).with_for_update().first() if entrega.recordatorio_id is not None else None
        tarea_recordatorio = recordatorio.tarea if recordatorio else None
        if (
            recordatorio is None
            or not recordatorio.activo
            or recordatorio.enviado_en is not None
            or entrega.recordatorio_version is not None
            and recordatorio.version != entrega.recordatorio_version
            or tarea_recordatorio is None
            or tarea_recordatorio.estado in {
                models.EstadoTarea.COMPLETADA,
                models.EstadoTarea.CANCELADA,
            }
        ):
            entrega.estado = "OMITIDA"
            entrega.error = "El recordatorio fue cancelado, completado o reprogramado."
            entrega.lease_hasta = None
            _marcar_recordatorio_completo_si_aplica(db, entrega)
            db.commit()
            return {"estado": "OMITIDA", "motivo": entrega.error}

    usuario = db.query(models.Usuario).filter_by(id=entrega.usuario_id).first()
    canal_habilitado = (
        entrega.canal in canales_recordatorio_seleccionados(
            usuario,
            db.query(models.RecordatorioTarea).filter_by(id=entrega.recordatorio_id).first(),
        )
        if entrega.tipo == "RECORDATORIOS" and entrega.recordatorio_id is not None
        else usuario is not None and entrega.canal in canales_habilitados(usuario, entrega.tipo, db=db)
    )
    if not usuario or not canal_habilitado:
        entrega.estado = "OMITIDA"
        entrega.error = "El destinatario ya no tiene habilitado este canal."
        entrega.lease_hasta = None
        _marcar_recordatorio_completo_si_aplica(db, entrega)
        db.commit()
        return {"estado": "OMITIDA", "motivo": entrega.error}

    entrega.intentos += 1
    entrega.estado = "ENVIANDO"
    entrega.error = None
    entrega.lease_hasta = ahora + timedelta(minutes=15)
    db.commit()
    try:
        if entrega.canal == "EMAIL":
            enviado = enviar_correo(usuario.email, entrega.asunto, entrega.cuerpo)
        else:
            enviado = enviar_mensaje_whatsapp(usuario.whatsapp_numero, entrega.cuerpo, raise_on_error=True)
        if not enviado:
            raise RuntimeError("El proveedor no confirmó la entrega.")
    except Exception as exc:
        entrega.estado = "ERROR"
        entrega.error = _diagnostico_entrega(entrega.canal, exc)
        entrega.lease_hasta = None
        _marcar_recordatorio_completo_si_aplica(db, entrega)
        db.commit()
        raise HTTPException(status_code=503, detail=entrega.error) from exc

    entrega.estado = "ENVIADA"
    entrega.error = None
    entrega.enviado_en = datetime.utcnow()
    entrega.lease_hasta = None
    _marcar_recordatorio_completo_si_aplica(db, entrega)
    db.commit()
    return {"estado": "ENVIADA", "intentos": entrega.intentos}


@router.post("/consultas/claim")
def reclamar_barrido(
    datos: schemas.WorkflowClaimConsulta,
    _: None = Depends(verificar_token_workflow),
    db: Session = Depends(get_db),
):
    try:
        fecha = date.fromisoformat(datos.fecha_local)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="fecha_local debe usar YYYY-MM-DD.") from exc

    if len(datos.clave_idempotencia) > 80 or not datos.clave_idempotencia:
        raise HTTPException(status_code=400, detail="clave_idempotencia inválida.")
    if len(datos.token_lanzamiento) > 80 or not datos.token_lanzamiento:
        raise HTTPException(status_code=400, detail="token_lanzamiento inválido.")

    configuracion = _configuracion(db, bloquear=True)
    radicado_ids = sorted(set(datos.radicado_ids or []))
    consulta_seleccionada = datos.radicado_id is not None or bool(radicado_ids)
    consulta_individual_registro = None
    if datos.tipo == "AUTOMATICA":
        if datos.hora_local not in {"12:00", "17:00"}:
            raise HTTPException(status_code=400, detail="Hora automática no permitida.")
        if not configuracion.activa:
            db.commit()
            return {"debe_ejecutar": False, "motivo": "CONSULTAS_DESACTIVADAS"}
        if fecha.weekday() not in (configuracion.dias_habilitados or []):
            db.commit()
            return {"debe_ejecutar": False, "motivo": "DIA_DESHABILITADO"}
    elif datos.tipo == "AUTOMATICA_NUEVO":
        if datos.hora_local != "NUEVO" or datos.radicado_id is None or radicado_ids or not datos.consulta_id:
            raise HTTPException(status_code=400, detail="La consulta inmediata requiere radicado y consulta.")
        radicado = db.query(models.Radicado).filter_by(id=datos.radicado_id).first()
        consulta = db.query(models.ConsultaRadicado).filter_by(
            id=datos.consulta_id,
            radicado_id=datos.radicado_id,
            tipo="AUTOMATICA_NUEVO",
        ).first()
        actor = db.query(models.Usuario).filter_by(id=datos.solicitada_por_id).first()
        if not radicado or not consulta or not actor:
            raise HTTPException(status_code=404, detail="Consulta o radicado no disponible.")
        if actor.rol == models.RolUsuario.ABOGADO:
            autorizado = (
                radicado.ambito_key == f"SAAS:{actor.id}"
                and actor.estado == models.EstadoUsuario.ACTIVO
                and actor.plan is not None
                and actor.plan.precio_mensual > 0
            )
        elif actor.rol == models.RolUsuario.ABOGADO_ADMIN:
            autorizado = (
                radicado.ambito_key == "FIRMA"
                and actor.estado == models.EstadoUsuario.ACTIVO
                and any(link.id == actor.id for link in radicado.usuarios_vinculados)
            )
        else:
            autorizado = actor.rol == models.RolUsuario.ADMIN
        if not autorizado:
            raise HTTPException(status_code=403, detail="No puedes iniciar esta consulta.")
    elif datos.hora_local != "MANUAL":
        raise HTTPException(status_code=400, detail="El lanzamiento manual debe usar hora_local=MANUAL.")
    elif datos.tipo == "MANUAL":
        actor = db.query(models.Usuario).filter_by(id=datos.solicitada_por_id).first()
        if not actor or actor.rol != models.RolUsuario.ADMIN:
            raise HTTPException(status_code=403, detail="Se requiere ADMIN para lanzar consultas manuales.")
        if datos.radicado_id is not None and radicado_ids:
            raise HTTPException(status_code=400, detail="Selecciona un radicado individual o una lista, no ambos.")

    existing = db.query(models.EjecucionBarrido).filter_by(
        clave_idempotencia=datos.clave_idempotencia
    ).first()
    if existing:
        db.commit()
        return {
            "debe_ejecutar": (
                existing.estado == "EN_PROCESO"
                and existing.token_lanzamiento == datos.token_lanzamiento
            ),
            "motivo": "REINTENTO_MISMO_LANZAMIENTO" if existing.token_lanzamiento == datos.token_lanzamiento else "SLOT_YA_RECLAMADO",
            "ejecucion": _serializar_ejecucion(existing),
        }

    ahora = datetime.utcnow()
    activa = None if consulta_seleccionada else (
        db.query(models.EjecucionBarrido)
        .filter(
            models.EjecucionBarrido.estado == "EN_PROCESO",
            models.EjecucionBarrido.lease_hasta.is_not(None),
            models.EjecucionBarrido.lease_hasta > ahora,
        )
        .order_by(models.EjecucionBarrido.inicio.desc())
        .first()
    )
    if activa:
        db.commit()
        return {
            "debe_ejecutar": False,
            "motivo": "YA_HAY_UN_BARRIDO_ACTIVO",
            "ejecucion": _serializar_ejecucion(activa),
        }

    radicados_query = db.query(models.Radicado.id).filter(
        (models.Radicado.ambito_key == "FIRMA")
        | models.Radicado.ambito_key.like("SAAS:%")
    )
    if datos.radicado_id is not None:
        radicados_query = radicados_query.filter(models.Radicado.id == datos.radicado_id)
    elif radicado_ids:
        radicados_query = radicados_query.filter(models.Radicado.id.in_(radicado_ids))
    total = radicados_query.count()
    ids_esperados = 1 if datos.radicado_id is not None else len(radicado_ids)
    if consulta_seleccionada and total != ids_esperados:
        raise HTTPException(status_code=404, detail="Uno o más radicados no existen.")
    if datos.tipo == "AUTOMATICA_NUEVO" and total != 1:
        raise HTTPException(status_code=404, detail="Radicado no encontrado.")
    ejecucion = models.EjecucionBarrido(
        id=str(uuid4()),
        clave_idempotencia=datos.clave_idempotencia,
        token_lanzamiento=datos.token_lanzamiento,
        tipo=datos.tipo,
        estado="EN_PROCESO",
        solicitada_por_id=datos.solicitada_por_id,
        inicio=ahora,
        lease_hasta=ahora + timedelta(minutes=30),
        total_radicados=total,
    )
    try:
        with db.begin_nested():
            db.add(ejecucion)
            db.flush()
    except IntegrityError:
        existente = db.query(models.EjecucionBarrido).filter_by(
            clave_idempotencia=datos.clave_idempotencia
        ).one()
        db.commit()
        return {
            "debe_ejecutar": False,
            "motivo": "SLOT_YA_RECLAMADO",
            "ejecucion": _serializar_ejecucion(existente),
        }

    if not consulta_seleccionada:
        configuracion.ejecucion_activa_id = ejecucion.id
        configuracion.lease_hasta = ejecucion.lease_hasta
    else:
        selected_ids = [datos.radicado_id] if datos.radicado_id is not None else radicado_ids
        for radicado_id in selected_ids:
            consulta_id = datos.consulta_id if datos.tipo == "AUTOMATICA_NUEVO" else None
            if consulta_id is None and datos.tipo == "MANUAL":
                consulta = models.ConsultaRadicado(
                    radicado_id=radicado_id,
                    tipo="MANUAL",
                    estado="ENCOLADA",
                    inicio=ahora,
                )
                db.add(consulta)
                db.flush()
                consulta_id = consulta.id
            db.add(
                models.EjecucionRadicado(
                    ejecucion_id=ejecucion.id,
                    radicado_id=radicado_id,
                    consulta_id=consulta_id,
                    estado="PENDIENTE",
                )
            )
    db.commit()
    return {"debe_ejecutar": True, "ejecucion": _serializar_ejecucion(ejecucion)}


@router.get("/consultas/{ejecucion_id}/radicados")
def listar_radicados_barrido(
    ejecucion_id: str,
    despues_de: int = 0,
    limite: int = Query(default=50, ge=1, le=100),
    _: None = Depends(verificar_token_workflow),
    db: Session = Depends(get_db),
):
    ejecucion = db.query(models.EjecucionBarrido).filter_by(id=ejecucion_id).first()
    if not ejecucion:
        raise HTTPException(status_code=404, detail="Ejecución no encontrada.")
    radicados = (
        db.query(models.Radicado.id, models.Radicado.numero)
        .filter(
            (models.Radicado.ambito_key == "FIRMA")
            | models.Radicado.ambito_key.like("SAAS:%"),
            models.Radicado.id > despues_de,
        )
        .order_by(models.Radicado.id.asc())
    )
    if ejecucion.clave_idempotencia.startswith(("NUEVO:", "MANUAL_RADICADO:")):
        selected_ids = db.query(models.EjecucionRadicado.radicado_id).filter_by(
            ejecucion_id=ejecucion.id
        )
        radicados = radicados.filter(models.Radicado.id.in_(selected_ids))
    radicados = radicados.limit(limite).all()
    ejecucion.lease_hasta = datetime.utcnow() + timedelta(minutes=30)
    configuracion = db.query(models.ConfiguracionConsultas).filter_by(id=1).first()
    if configuracion and configuracion.ejecucion_activa_id == ejecucion.id:
        configuracion.lease_hasta = ejecucion.lease_hasta
    db.commit()
    return {
        "radicados": [{"id": radicado.id, "numero": radicado.numero} for radicado in radicados],
        "siguiente_cursor": radicados[-1].id if radicados else None,
    }


@router.post("/consultas/{ejecucion_id}/radicados/{radicado_id}")
def ejecutar_consulta_barrido_radicado(
    ejecucion_id: str,
    radicado_id: int,
    _: None = Depends(verificar_token_workflow),
    db: Session = Depends(get_db),
):
    ejecucion = db.query(models.EjecucionBarrido).filter_by(id=ejecucion_id).first()
    if not ejecucion or ejecucion.estado != "EN_PROCESO":
        raise HTTPException(status_code=409, detail="La ejecución no está activa.")
    radicado = db.query(models.Radicado).filter_by(id=radicado_id).first()
    if not radicado or not (
        radicado.ambito_key == "FIRMA"
        or (radicado.ambito_key or "").startswith("SAAS:")
    ):
        raise HTTPException(status_code=404, detail="Radicado fuera de un ámbito consultable.")

    resultado_radicado = db.query(models.EjecucionRadicado).filter_by(
        ejecucion_id=ejecucion.id,
        radicado_id=radicado.id,
    ).with_for_update().first()
    if resultado_radicado and resultado_radicado.estado == "COMPLETADA":
        return {
            "estado": resultado_radicado.estado,
            "actuaciones_nuevas": resultado_radicado.actuaciones_nuevas,
            "repetida": True,
        }
    ahora = datetime.utcnow()
    if (
        resultado_radicado
        and resultado_radicado.estado == "EN_PROCESO"
        and resultado_radicado.lease_hasta
        and resultado_radicado.lease_hasta > ahora
    ):
        raise HTTPException(status_code=409, detail="El radicado ya está siendo procesado en esta ejecución.")
    estado_previo = resultado_radicado.estado if resultado_radicado else None
    errores_previos = 1 if estado_previo == "ERROR" else 0
    procesado_previo = 1 if estado_previo in {"COMPLETADA", "ERROR"} else 0
    actuaciones_previas = resultado_radicado.actuaciones_nuevas if resultado_radicado else 0
    if resultado_radicado is None:
        resultado_radicado = models.EjecucionRadicado(
            ejecucion_id=ejecucion.id,
            radicado_id=radicado.id,
            estado="EN_PROCESO",
            lease_hasta=ahora + timedelta(minutes=10),
        )
        db.add(resultado_radicado)
        db.flush()
    resultado_radicado.lease_hasta = ahora + timedelta(minutes=10)

    if resultado_radicado.consulta_id:
        consulta = db.query(models.ConsultaRadicado).filter_by(
            id=resultado_radicado.consulta_id
        ).first()
        consulta.estado = "EN_PROCESO"
        consulta.error = None
    else:
        consulta = models.ConsultaRadicado(
            radicado_id=radicado.id,
            tipo=ejecucion.tipo,
            estado="EN_PROCESO",
            inicio=datetime.utcnow(),
        )
        db.add(consulta)
        db.flush()
        resultado_radicado.consulta_id = consulta.id
    resultado_radicado.inicio = datetime.utcnow()
    resultado_radicado.estado = "EN_PROCESO"
    resultado_radicado.lease_hasta = datetime.utcnow() + timedelta(minutes=10)
    db.commit()

    reconciliar_historial = _reconciliacion_completa_vencida(db, radicado.id, ahora)
    resultado = ejecutar_consulta_api_radicado(
        db,
        radicado,
        reconciliar_historial=reconciliar_historial,
    )
    estado_api = str(resultado.get("estado", ""))
    ahora = datetime.utcnow()
    if estado_api.startswith("error"):
        resultado_radicado.estado = "ERROR"
        resultado_radicado.error = estado_api
        consulta.estado = "ERROR"
        consulta.error = estado_api
        consulta.finalizacion = ahora
        errores_incremento = 1
    else:
        resultado_radicado.estado = "COMPLETADA"
        resultado_radicado.error = None
        resultado_radicado.actuaciones_nuevas = len(resultado.get("actuaciones_nuevas", []))
        consulta.estado = "COMPLETADA"
        consulta.finalizacion = ahora
        consulta.actuaciones_nuevas = resultado_radicado.actuaciones_nuevas
        consulta.detalle = (
            DETALLE_RECONCILIACION_COMPLETA
            if resultado.get("reconciliacion_completa")
            else estado_api
        )
        errores_incremento = 0

    resultado_radicado.finalizacion = ahora
    resultado_radicado.lease_hasta = None
    lease_hasta = ahora + timedelta(minutes=30)
    _aplicar_delta_contadores_barrido(
        db,
        ejecucion.id,
        procesados_delta=0 if procesado_previo else 1,
        errores_delta=errores_incremento - errores_previos,
        actuaciones_delta=resultado_radicado.actuaciones_nuevas - actuaciones_previas,
        lease_hasta=lease_hasta,
    )
    configuracion = db.query(models.ConfiguracionConsultas).filter_by(id=1).first()
    if configuracion and configuracion.ejecucion_activa_id == ejecucion.id:
        configuracion.lease_hasta = lease_hasta
    db.commit()
    return {
        "estado": resultado_radicado.estado,
        "actuaciones_nuevas": resultado_radicado.actuaciones_nuevas,
        "resultado": resultado,
    }


@router.post("/consultas/{ejecucion_id}/finalizar")
def finalizar_barrido(
    ejecucion_id: str,
    _: None = Depends(verificar_token_workflow),
    db: Session = Depends(get_db),
):
    ejecucion = db.query(models.EjecucionBarrido).filter_by(id=ejecucion_id).with_for_update().first()
    if not ejecucion:
        raise HTTPException(status_code=404, detail="Ejecución no encontrada.")
    if ejecucion.estado == "COMPLETADA":
        return _serializar_ejecucion(ejecucion)
    ejecucion.estado = (
        "COMPLETADA_CON_ERRORES"
        if ejecucion.errores or ejecucion.procesados < ejecucion.total_radicados
        else "COMPLETADA"
    )
    ejecucion.finalizacion = datetime.utcnow()
    ejecucion.lease_hasta = None
    configuracion = db.query(models.ConfiguracionConsultas).filter_by(id=1).with_for_update().first()
    if configuracion and configuracion.ejecucion_activa_id == ejecucion.id:
        configuracion.ejecucion_activa_id = None
        configuracion.lease_hasta = None
    db.commit()
    return _serializar_ejecucion(ejecucion)


@router.get("/consultas/health")
def workflow_health(_: None = Depends(verificar_token_workflow)):
    return {"ok": True}
