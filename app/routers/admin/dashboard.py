"""Dashboard y visión global del ADMIN."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.routers.admin.comun import _filtrar_radicados_por_sector, verificar_admin

router = APIRouter(prefix="/api/admin", tags=["Administración"])


def _dashboard_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def _dashboard_activity_description(action: str, resource_type: str) -> tuple[str, str]:
    resource = {
        "usuario": "un usuario",
        "solicitud_registro": "una solicitud de registro",
        "proceso": "un proceso",
        "proceso_cliente": "un cliente del proceso",
        "proceso_radicado": "un radicado del proceso",
        "radicado": "un radicado",
        "tarea": "una tarea",
        "documento_proceso": "un documento",
        "solicitud_documento": "una solicitud de documento",
        "pagina_publica": "una página pública",
        "plan": "un plan",
    }.get(resource_type.lower(), "un registro")
    known_actions = {
        "admin.usuario.crear": "creó un usuario",
        "abogado.crear": "creó un abogado",
        "cliente.crear": "creó un cliente",
        "admin.solicitud.aprobar": "aprobó una solicitud de registro",
        "admin.solicitud.rechazar": "rechazó una solicitud de registro",
        "proceso.crear": "creó un proceso",
        "proceso.actualizar": "actualizó un proceso",
        "proceso.archivar": "archivó un proceso",
        "proceso.restaurar": "restauró un proceso",
        "documento.cargar": "cargó un documento",
        "documento.solicitar": "solicitó un documento",
        "tarea.crear": "creó una tarea",
        "tarea.actualizar": "actualizó una tarea",
        "tarea.completar": "completó una tarea",
        "radicado.crear": "agregó un radicado",
        "radicado.vincular": "vinculó un radicado",
    }
    description = known_actions.get(action)
    if description is None:
        if "radicado" in action and any(word in action for word in ("consulta", "consultar")):
            description = "consultó un radicado"
        elif action.endswith(".aprobar"):
            description = f"aprobó {resource}"
        elif action.endswith(".rechazar"):
            description = f"rechazó {resource}"
        elif action.endswith(".actualizar"):
            description = f"actualizó {resource}"
        elif action.endswith(".crear") or action.endswith(".cargar"):
            description = f"registró {resource}"
        elif action.endswith(".eliminar") or action.endswith(".retirar"):
            description = f"retiró {resource}"
        elif action.endswith(".enviar"):
            description = f"envió {resource}"
        else:
            description = f"realizó una acción sobre {resource}"
    return description, resource.capitalize()


def _dashboard_activity_href(resource_type: str, resource_id: str | None) -> str:
    resource = resource_type.lower()
    if resource == "usuario" and resource_id and resource_id.isdigit():
        return f"/gestion-procesos/admin/usuarios/{resource_id}"
    if resource in {"solicitud_registro"}:
        return "/gestion-procesos/admin/solicitudes"
    if resource in {"proceso", "proceso_cliente", "proceso_radicado"}:
        return "/gestion-procesos/admin/procesos"
    if resource in {"radicado"}:
        return "/gestion-procesos/admin/radicados"
    if resource in {"tarea", "subtarea", "recordatorio_tarea"}:
        return "/gestion-procesos/admin/tareas"
    if resource in {"documento_proceso", "solicitud_documento"}:
        return "/gestion-procesos/admin/documentos"
    if resource == "pagina_publica":
        return "/gestion-procesos/admin/contenido"
    if resource == "plan":
        return "/gestion-procesos/admin/planes"
    return "/gestion-procesos/admin/auditoria"


@router.get("/dashboard")
def obtener_dashboard_admin(
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    roles_firma = (models.RolUsuario.ABOGADO_ADMIN, models.RolUsuario.ADMIN)
    estados_tarea_activa = (models.EstadoTarea.PENDIENTE, models.EstadoTarea.EN_CURSO)
    ahora = datetime.now(timezone.utc).replace(tzinfo=None)

    cuentas = db.query(models.Usuario).filter(models.Usuario.rol != models.RolUsuario.ADMIN)
    usuarios_activos = cuentas.filter(models.Usuario.estado == models.EstadoUsuario.ACTIVO).count()
    usuarios_pendientes = cuentas.filter(models.Usuario.estado == models.EstadoUsuario.PENDIENTE_APROBACION).count()
    solicitudes_registro = db.query(models.SolicitudRegistro).count()
    solicitudes_perfil = db.query(models.SolicitudEdicionPerfilCliente).filter(
        models.SolicitudEdicionPerfilCliente.estado == "PENDIENTE"
    ).count()

    procesos_activos_firma = (
        db.query(models.Proceso)
        .join(models.Usuario, models.Usuario.id == models.Proceso.abogado_id)
        .filter(models.Usuario.rol.in_(roles_firma), models.Proceso.archivado_en.is_(None))
    )
    procesos_activos_saas = (
        db.query(models.Proceso)
        .join(models.Usuario, models.Usuario.id == models.Proceso.abogado_id)
        .filter(models.Usuario.rol == models.RolUsuario.ABOGADO, models.Proceso.archivado_en.is_(None))
    )
    procesos_firma_count = procesos_activos_firma.count()
    procesos_saas_count = procesos_activos_saas.count()

    tareas_activas = (
        db.query(models.Tarea)
        .filter(models.Tarea.estado.in_(estados_tarea_activa))
        .filter(or_(models.Tarea.proceso_id.is_(None), models.Tarea.proceso.has(models.Proceso.archivado_en.is_(None))))
    )
    tareas_pendientes = tareas_activas.count()
    tareas_firma = (
        db.query(models.Tarea)
        .join(models.Usuario, models.Usuario.id == models.Tarea.usuario_id)
        .filter(models.Usuario.rol.in_(roles_firma), models.Tarea.estado.in_(estados_tarea_activa))
        .filter(or_(models.Tarea.proceso_id.is_(None), models.Tarea.proceso.has(models.Proceso.archivado_en.is_(None))))
    )
    tareas_vencidas = tareas_firma.filter(models.Tarea.fecha_limite < ahora).count()

    documentos_pendientes = (
        db.query(models.SolicitudDocumento)
        .join(models.Proceso, models.Proceso.id == models.SolicitudDocumento.proceso_id)
        .filter(models.SolicitudDocumento.atendida_en.is_(None), models.Proceso.archivado_en.is_(None))
        .count()
    )
    errores_consulta = db.query(models.ConsultaRadicado).filter(models.ConsultaRadicado.estado == "ERROR").count()
    notificaciones_criticas = db.query(models.EntregaNotificacion).filter(
        models.EntregaNotificacion.estado == "ERROR",
        models.EntregaNotificacion.intentos >= 3,
    ).count()
    errores_operativos = errores_consulta + notificaciones_criticas
    total_alertas = (
        solicitudes_registro
        + solicitudes_perfil
        + tareas_vencidas
        + documentos_pendientes
        + errores_operativos
    )

    radicados_firma = _filtrar_radicados_por_sector(db.query(models.Radicado), "FIRMA").count()
    radicados_saas = _filtrar_radicados_por_sector(db.query(models.Radicado), "SAAS").count()
    tareas_firma_count = (
        db.query(models.Tarea)
        .join(models.Usuario, models.Usuario.id == models.Tarea.usuario_id)
        .filter(models.Usuario.rol.in_(roles_firma))
        .filter(or_(models.Tarea.proceso_id.is_(None), models.Tarea.proceso.has(models.Proceso.archivado_en.is_(None))))
        .count()
    )
    tareas_saas_count = (
        db.query(models.Tarea)
        .join(models.Usuario, models.Usuario.id == models.Tarea.usuario_id)
        .filter(models.Usuario.rol == models.RolUsuario.ABOGADO)
        .filter(or_(models.Tarea.proceso_id.is_(None), models.Tarea.proceso.has(models.Proceso.archivado_en.is_(None))))
        .count()
    )
    documentos_firma = (
        db.query(models.DocumentoProceso)
        .join(models.Proceso, models.Proceso.id == models.DocumentoProceso.proceso_id)
        .join(models.Usuario, models.Usuario.id == models.Proceso.abogado_id)
        .filter(models.Usuario.rol.in_(roles_firma), models.Proceso.archivado_en.is_(None))
        .count()
    )

    proceso_ids = [row[0] for row in (
        db.query(models.Proceso.id)
        .join(models.Usuario, models.Usuario.id == models.Proceso.abogado_id)
        .filter(models.Usuario.rol.in_(roles_firma), models.Proceso.archivado_en.is_(None))
        .order_by(models.Proceso.created_at.desc(), models.Proceso.id.desc())
        .all()
    )]
    procesos_riesgo_query = (
        db.query(models.Tarea.proceso_id)
        .join(models.Proceso, models.Proceso.id == models.Tarea.proceso_id)
        .join(models.Usuario, models.Usuario.id == models.Proceso.abogado_id)
        .filter(
            models.Usuario.rol.in_(roles_firma),
            models.Proceso.archivado_en.is_(None),
            models.Tarea.estado.in_(estados_tarea_activa),
            or_(models.Tarea.fecha_limite < ahora, models.Tarea.prioridad == models.PrioridadTarea.URGENTE),
        )
        .distinct()
    )
    procesos_riesgo_count = procesos_riesgo_query.count()

    procesos = []
    if proceso_ids:
        process_rows = (
            db.query(
                models.Proceso.id,
                models.Proceso.nombre,
                models.Proceso.created_at,
                models.Usuario.nombre_completo,
            )
            .join(models.Usuario, models.Usuario.id == models.Proceso.abogado_id)
            .filter(models.Proceso.id.in_(proceso_ids))
            .all()
        )
        task_rows = db.query(
            models.Tarea.proceso_id,
            models.Tarea.id,
            models.Tarea.titulo,
            models.Tarea.estado,
            models.Tarea.prioridad,
            models.Tarea.fecha_limite,
            models.Tarea.updated_at,
        ).filter(models.Tarea.proceso_id.in_(proceso_ids)).all()
        tasks_by_process: dict[int, list] = {}
        for row in task_rows:
            tasks_by_process.setdefault(row.proceso_id, []).append(row)
        clients_by_process: dict[int, list[str]] = {}
        for process_id, client_name in db.query(
            models.ProcesoCliente.proceso_id, models.Usuario.nombre_completo
        ).join(models.Usuario, models.Usuario.id == models.ProcesoCliente.cliente_id).filter(
            models.ProcesoCliente.proceso_id.in_(proceso_ids)
        ).order_by(models.ProcesoCliente.proceso_id, models.Usuario.nombre_completo).all():
            clients_by_process.setdefault(process_id, []).append(client_name)
        docs_by_process = dict(db.query(
            models.DocumentoProceso.proceso_id,
            func.max(models.DocumentoProceso.created_at),
        ).filter(models.DocumentoProceso.proceso_id.in_(proceso_ids)).group_by(models.DocumentoProceso.proceso_id).all())

        for process_id, name, created_at, lawyer_name in process_rows:
            all_tasks = tasks_by_process.get(process_id, [])
            open_tasks = [task for task in all_tasks if task.estado in estados_tarea_activa]
            overdue = [task for task in open_tasks if task.fecha_limite and task.fecha_limite < ahora]
            urgent = [task for task in open_tasks if task.prioridad == models.PrioridadTarea.URGENTE]
            open_tasks.sort(key=lambda task: (task.fecha_limite is None, task.fecha_limite or datetime.max, task.id))
            activity_dates = [created_at]
            activity_dates.extend(task.updated_at for task in all_tasks if task.updated_at)
            if docs_by_process.get(process_id):
                activity_dates.append(docs_by_process[process_id])
            client_names = clients_by_process.get(process_id, [])
            risk_label = "Tarea vencida" if overdue else "Tarea urgente" if urgent else None
            procesos.append({
                "id": process_id,
                "nombre": name,
                "cliente": client_names[0] if client_names else None,
                "clientes": len(client_names),
                "responsable": lawyer_name,
                "estado": "ACTIVO",
                "ultima_actividad": _dashboard_iso(max(activity_dates) if activity_dates else None),
                "riesgo": risk_label,
                "proxima_accion": open_tasks[0].titulo if open_tasks else None,
                "vencido": bool(overdue),
                "en_atencion": bool(open_tasks),
                "sin_actividad": not all_tasks and not docs_by_process.get(process_id),
            })
        procesos.sort(key=lambda item: (
            item["riesgo"] is None,
            not item["en_atencion"],
            item["ultima_actividad"] or "",
        ))

    eventos = (
        db.query(models.EventoAuditoria, models.Usuario.nombre_completo)
        .outerjoin(models.Usuario, models.Usuario.id == models.EventoAuditoria.actor_id)
        .order_by(models.EventoAuditoria.created_at.desc(), models.EventoAuditoria.id.desc())
        .limit(12)
        .all()
    )
    actividad = []
    for event, actor_name in eventos:
        description, resource_label = _dashboard_activity_description(event.accion, event.tipo_recurso)
        actividad.append({
            "id": f"audit-{event.id}",
            "actor": actor_name or "Sistema",
            "descripcion": description,
            "recurso": resource_label,
            "fecha": _dashboard_iso(event.created_at),
            "href": _dashboard_activity_href(event.tipo_recurso, event.recurso_id),
            "tipo": "normal",
        })
    consultas_recientes = (
        db.query(models.ConsultaRadicado)
        .filter(models.ConsultaRadicado.estado.in_(("COMPLETADA", "ERROR")))
        .order_by(models.ConsultaRadicado.finalizacion.desc(), models.ConsultaRadicado.inicio.desc())
        .limit(8)
        .all()
    )
    for consulta in consultas_recientes:
        fecha = consulta.finalizacion or consulta.inicio
        numero = consulta.radicado.numero if consulta.radicado else "radicado"
        actividad.append({
            "id": f"consulta-{consulta.id}",
            "actor": "Sistema",
            "descripcion": "detectó un error en una consulta judicial" if consulta.estado == "ERROR" else "completó una consulta judicial",
            "recurso": f"Radicado {numero}",
            "fecha": _dashboard_iso(fecha),
            "href": "/gestion-procesos/admin/operacion",
            "tipo": "error" if consulta.estado == "ERROR" else "normal",
        })
    actividad.sort(key=lambda item: item["fecha"] or "", reverse=True)

    atencion = [
        {"key": "registro", "label": "Solicitudes de registro", "count": solicitudes_registro, "href": "/gestion-procesos/admin/solicitudes", "tone": "warning"},
        {"key": "aprobacion", "label": "Usuarios pendientes de aprobación", "count": usuarios_pendientes, "href": "/gestion-procesos/admin/usuarios", "tone": "warning"},
        {"key": "perfil", "label": "Solicitudes de perfil por revisar", "count": solicitudes_perfil, "href": "/gestion-procesos/admin/solicitudes-perfil", "tone": "warning"},
        {"key": "procesos", "label": "Procesos con tareas de riesgo", "count": procesos_riesgo_count, "href": "/gestion-procesos/admin/procesos", "tone": "danger"},
        {"key": "tareas", "label": "Tareas vencidas", "count": tareas_vencidas, "href": "/gestion-procesos/admin/tareas", "tone": "danger"},
        {"key": "documentos", "label": "Documentos pendientes de revisión", "count": documentos_pendientes, "href": "/gestion-procesos/admin/documentos", "tone": "warning"},
        {"key": "consultas", "label": "Consultas judiciales con error", "count": errores_consulta, "href": "/gestion-procesos/admin/operacion", "tone": "danger"},
        {"key": "notificaciones", "label": "Notificaciones críticas sin entregar", "count": notificaciones_criticas, "href": "/gestion-procesos/admin/operacion", "tone": "danger"},
    ]

    return {
        "usuarios": {
            "total": db.query(models.Usuario).filter(models.Usuario.rol == models.RolUsuario.ABOGADO).count(),
            "activos": usuarios_activos,
            "pendientes": db.query(models.Usuario).filter(
                models.Usuario.rol == models.RolUsuario.ABOGADO,
                models.Usuario.estado == models.EstadoUsuario.PENDIENTE_APROBACION,
            ).count(),
            "rechazados": db.query(models.Usuario).filter(
                models.Usuario.rol == models.RolUsuario.ABOGADO,
                models.Usuario.estado == models.EstadoUsuario.RECHAZADO,
            ).count(),
        },
        "radicados": {
            "total": db.query(models.Radicado).count(),
        },
        "planes": {
            "total": db.query(models.Plan).count(),
            "activos": db.query(models.Plan).filter(models.Plan.activo.is_(True)).count(),
        },
        "resumen": {
            "usuarios_activos": usuarios_activos,
            "usuarios_pendientes_aprobacion": usuarios_pendientes,
            "solicitudes_pendientes": solicitudes_registro + solicitudes_perfil,
            "procesos_activos": procesos_firma_count + procesos_saas_count,
            "tareas_pendientes": tareas_pendientes,
            "documentos_pendientes": documentos_pendientes,
            "alertas": total_alertas,
            "errores_operativos": errores_operativos,
            "notificaciones_criticas": notificaciones_criticas,
        },
        "firma": {
            "procesos": procesos_firma_count,
            "radicados": radicados_firma,
            "tareas": tareas_firma_count,
            "documentos": documentos_firma,
        },
        "saas": {
            "abogados": db.query(models.Usuario).filter(models.Usuario.rol == models.RolUsuario.ABOGADO).count(),
            "procesos": procesos_saas_count,
            "radicados": radicados_saas,
            "tareas": tareas_saas_count,
        },
        "atencion": atencion,
        "actividad": actividad[:8],
        "procesos_criticos": procesos,
    }


@router.get("/vision-global")
def obtener_vision_global(
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    """Datos agregados para la consola de operación, sin depender de webhooks."""
    usuarios_por_rol = {
        (rol.value if hasattr(rol, "value") else str(rol)): total
        for rol, total in db.query(models.Usuario.rol, func.count(models.Usuario.id)).group_by(models.Usuario.rol).all()
    }
    tareas_por_estado = {
        (estado.value if hasattr(estado, "value") else str(estado)): total
        for estado, total in db.query(models.Tarea.estado, func.count(models.Tarea.id)).group_by(models.Tarea.estado).all()
    }
    consultas_error = db.query(models.ConsultaRadicado).filter(models.ConsultaRadicado.estado == "ERROR").count()
    consultas_en_cola = db.query(models.ConsultaRadicado).filter(models.ConsultaRadicado.estado.in_(["ENCOLADA", "EN_PROCESO", "REINTENTANDO"])).count()
    configuracion = db.query(models.ConfiguracionSaas).filter_by(id=1).first()
    usuarios_recientes = db.query(models.Usuario).order_by(models.Usuario.created_at.desc()).limit(8).all()
    consultas_recientes = db.query(models.ConsultaRadicado).order_by(models.ConsultaRadicado.inicio.desc()).limit(8).all()
    return {
        "resumen": {
            "usuarios": db.query(models.Usuario).count(),
            "abogados_admin": usuarios_por_rol.get("ABOGADO_ADMIN", 0),
            "abogados_saas": usuarios_por_rol.get("ABOGADO", 0),
            "clientes": usuarios_por_rol.get("CLIENTE", 0),
            "procesos": db.query(models.Proceso).count(),
            "radicados": db.query(models.Radicado).count(),
            "actuaciones": db.query(models.Actuacion).count(),
            "tareas": db.query(models.Tarea).count(),
            "documentos": db.query(models.DocumentoProceso).count(),
            "solicitudes_documento_pendientes": db.query(models.SolicitudDocumento).filter(models.SolicitudDocumento.atendida_en == None).count(),
            "consultas_error": consultas_error,
            "consultas_en_cola": consultas_en_cola,
        },
        "usuarios_por_rol": usuarios_por_rol,
        "tareas_por_estado": tareas_por_estado,
        "operacion": {
            "motor_local": "Vercel Workflows",
            "webhooks_vercel": "no configurados",
            "mostrar_planes": configuracion.mostrar_planes if configuracion else False,
        },
        "usuarios_recientes": [{"id": u.id, "nombre": u.nombre_completo, "email": u.email, "rol": u.rol.value, "estado": u.estado.value, "created_at": u.created_at.isoformat() if u.created_at else None} for u in usuarios_recientes],
        "consultas_recientes": [{"id": c.id, "radicado": c.radicado.numero if c.radicado else "", "estado": c.estado, "tipo": c.tipo, "inicio": c.inicio.isoformat() if c.inicio else None, "actuaciones_nuevas": c.actuaciones_nuevas} for c in consultas_recientes],
    }
