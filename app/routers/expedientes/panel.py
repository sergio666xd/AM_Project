"""Dashboard, búsqueda global y métricas de carga del abogado."""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app import models, security
from app.database import get_db
from app.firm_access import (
    lawyer_process_ids,
)
from app.novedades_radicado import descripcion_novedades, novedades_pendientes, ruta_detalle_radicado
from app.routers.expedientes.comun import _abogado, _staff_scope, _timeline_proceso
from app.routers.expedientes.notificaciones import _notificaciones_abogado
from app.routers.expedientes.procesos import listar_procesos
from app.timezone import utc_ahora
from app.visibility import CLIENT_VISIBLE

router = APIRouter(prefix="/api/expedientes", tags=["Expedientes"])


@router.get("/dashboard")
def dashboard_abogado(db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    procesos = listar_procesos(db=db, usuario=usuario)
    tasks_query = db.query(models.Tarea)
    if usuario.rol != models.RolUsuario.ADMIN:
        tasks_query = tasks_query.filter(models.Tarea.proceso_id.in_(lawyer_process_ids(db, usuario)))
    tasks = tasks_query.all()
    today = utc_ahora()
    active_tasks = [task for task in tasks if task.estado in (models.EstadoTarea.PENDIENTE, models.EstadoTarea.EN_CURSO)]
    overdue = [task for task in active_tasks if task.fecha_limite and task.fecha_limite < today]
    upcoming = [task for task in active_tasks if task.fecha_limite and today <= task.fecha_limite <= today + timedelta(days=7)]
    agenda_query = db.query(models.EventoAgenda).join(models.Proceso).filter(
        models.EventoAgenda.estado == "PROGRAMADO",
        models.EventoAgenda.fecha_inicio >= today,
        models.EventoAgenda.fecha_inicio <= today + timedelta(days=7),
        models.Proceso.archivado_en.is_(None),
    )
    if usuario.rol != models.RolUsuario.ADMIN:
        agenda_query = agenda_query.filter(models.EventoAgenda.proceso_id.in_(lawyer_process_ids(db, usuario)))
    upcoming_events = agenda_query.order_by(models.EventoAgenda.fecha_inicio.asc()).all()
    pending_documents = sum(item["documentos_pendientes"] for item in procesos)
    notices = _notificaciones_abogado(db, usuario)
    attention = []
    # Las actuaciones nuevas van primero: siguen ahí hasta que el abogado abre el radicado.
    for novedad in novedades_pendientes(db, usuario):
        attention.append({"tipo": "RADICADO", "titulo": novedad.radicado.numero,
                          "descripcion": descripcion_novedades(novedad.actuaciones_nuevas),
                          "fecha": novedad.actualizado_en, "href": ruta_detalle_radicado(usuario, novedad.radicado_id)})
    for task in sorted(overdue + upcoming, key=lambda item: item.fecha_limite or datetime.max)[:12]:
        attention.append({"tipo": "TAREA", "titulo": task.titulo, "descripcion": "Vencida" if task in overdue else "Próxima a vencer",
                          "fecha": task.fecha_limite, "href": f"/gestion-procesos/abogado/procesos/{task.proceso_id}/tareas" if task.proceso_id else "/gestion-procesos/abogado/tareas"})
    for event in upcoming_events[:12]:
        attention.append({"tipo": "EVENTO", "titulo": event.titulo,
                          "descripcion": f"{event.tipo.lower().replace('_', ' ')} programado",
                          "fecha": event.fecha_inicio,
                          "href": f"/gestion-procesos/abogado/procesos/{event.proceso_id}/agenda"})
    for process in procesos:
        if process["riesgo"]:
            attention.append({"tipo": "PROCESO", "titulo": process["nombre"], "descripcion": "Requiere atención por tareas vencidas o documentos pendientes",
                              "fecha": process["ultima_actividad"], "href": f"/gestion-procesos/abogado/procesos/{process['id']}"})
        if process.get("inactivo"):
            attention.append({"tipo": "PROCESO", "titulo": process["nombre"], "descripcion": "Sin actividad en los últimos 30 días",
                              "fecha": process["ultima_actividad"], "href": f"/gestion-procesos/abogado/procesos/{process['id']}/actividad"})
    return {
        "resumen": {"procesos_activos": len(procesos), "tareas_pendientes": len(active_tasks), "tareas_vencidas": len(overdue),
                    "documentos_pendientes": pending_documents, "solicitudes_clientes": sum(1 for item in notices if item["categoria"] in {"documento", "solicitud"}),
                    "consultas_con_error": sum(1 for item in notices if item["tipo"] == "ERROR_CONSULTA"), "proximos_eventos": len(upcoming) + len(upcoming_events),
                    "procesos_sin_actividad": sum(1 for item in procesos if item.get("inactivo")),
                    "procesos_sin_responsable": sum(1 for item in procesos if not item.get("responsable_asignado"))},
        "atencion": attention[:30],
        "actividad_reciente": sorted([
            {**item, "proceso_id": process["id"], "proceso": process["nombre"], "href": f"/gestion-procesos/abogado/procesos/{process['id']}/actividad"}
            for process in procesos[:12]
            for item in _timeline_proceso(db.query(models.Proceso).filter_by(id=process["id"]).first(), db)[:8]
        ], key=lambda item: item.get("fecha") or datetime.min, reverse=True)[:30],
        "acciones": [
            {"label": "Nuevo proceso", "href": "/gestion-procesos/abogado/procesos?nuevo=1"},
            {"label": "Nuevo cliente", "href": "/gestion-procesos/abogado/clientes?nuevo=1"},
            {"label": "Agregar radicado", "href": "/gestion-procesos/abogado/radicados?nuevo=1"},
            {"label": "Crear tarea", "href": "/gestion-procesos/abogado/tareas?nuevo=1"},
            {"label": "Solicitar documento", "href": "/gestion-procesos/abogado/documentos?nuevo=1"},
            {"label": "Agendar evento", "href": "/gestion-procesos/abogado/agenda?nuevo=1"},
        ],
    }


@router.get("/busqueda-global")
def busqueda_global(q: str, usuario: models.Usuario = Depends(security.obtener_usuario_actual), db: Session = Depends(get_db)):
    """Search firm records while enforcing the caller's process scope."""
    process_ids = _staff_scope(usuario, db)
    term = q.strip()[:100]
    if len(term) < 2:
        return []
    pattern = f"%{term}%"
    limit = 7
    results: list[dict] = []

    processes = db.query(models.Proceso).filter(models.Proceso.archivado_en.is_(None), or_(models.Proceso.nombre.ilike(pattern), models.Proceso.descripcion.ilike(pattern)))
    if process_ids is not None:
        processes = processes.filter(models.Proceso.id.in_(process_ids))
    for item in processes.order_by(models.Proceso.nombre).limit(limit):
        results.append({"id": f"proceso:{item.id}", "tipo": "Proceso", "titulo": item.nombre,
                        "subtitulo": item.abogado.nombre_completo if item.abogado else "Proceso", "href": "/gestion-procesos/admin/procesos" if usuario.rol == models.RolUsuario.ADMIN else f"/gestion-procesos/abogado/procesos/{item.id}"})

    clients = db.query(models.Usuario).filter(models.Usuario.rol == models.RolUsuario.CLIENTE, or_(models.Usuario.nombre_completo.ilike(pattern), models.Usuario.email.ilike(pattern)))
    if process_ids is not None:
        clients = clients.outerjoin(models.ProcesoCliente, models.ProcesoCliente.cliente_id == models.Usuario.id).filter(or_(models.Usuario.creado_por_abogado_id == usuario.id, models.ProcesoCliente.proceso_id.in_(process_ids)))
    seen_clients: set[int] = set()
    for item in clients.order_by(models.Usuario.nombre_completo).limit(limit * 3):
        if item.id in seen_clients:
            continue
        seen_clients.add(item.id)
        results.append({"id": f"cliente:{item.id}", "tipo": "Cliente", "titulo": item.nombre_completo,
                        "subtitulo": item.email, "href": f"/gestion-procesos/admin/usuarios/{item.id}" if usuario.rol == models.RolUsuario.ADMIN else f"/gestion-procesos/abogado/clientes/{item.id}"})
        if len(seen_clients) >= limit:
            break

    radicados = db.query(models.Radicado).filter(or_(models.Radicado.numero.ilike(pattern), models.Radicado.demandante.ilike(pattern), models.Radicado.demandado.ilike(pattern)))
    if process_ids is not None:
        radicados = radicados.outerjoin(models.ProcesoRadicado).filter(or_(
            models.ProcesoRadicado.proceso_id.in_(process_ids),
            models.Radicado.usuarios_vinculados.any(models.Usuario.id == usuario.id),
        ))
    for item in radicados.order_by(models.Radicado.id.desc()).limit(limit):
        results.append({"id": f"radicado:{item.id}", "tipo": "Radicado", "titulo": item.numero,
                        "subtitulo": f"{item.demandante or ''} · {item.demandado or ''}".strip(" ·"), "href": "/gestion-procesos/admin/radicados" if usuario.rol == models.RolUsuario.ADMIN else f"/gestion-procesos/abogado/radicados/{item.id}"})

    tasks = db.query(models.Tarea).filter(models.Tarea.estado != models.EstadoTarea.CANCELADA, or_(models.Tarea.titulo.ilike(pattern), models.Tarea.descripcion.ilike(pattern)))
    if process_ids is not None:
        accessible_radicados = db.query(models.ProcesoRadicado.radicado_id).filter(models.ProcesoRadicado.proceso_id.in_(process_ids))
        tasks = tasks.filter(or_(models.Tarea.proceso_id.in_(process_ids), models.Tarea.radicado_id.in_(accessible_radicados), models.Tarea.usuario_id == usuario.id))
    for item in tasks.order_by(models.Tarea.updated_at.desc()).limit(limit):
        results.append({"id": f"tarea:{item.id}", "tipo": "Tarea", "titulo": item.titulo,
                        "subtitulo": item.estado.value if hasattr(item.estado, "value") else str(item.estado), "href": "/gestion-procesos/admin/tareas" if usuario.rol == models.RolUsuario.ADMIN else f"/gestion-procesos/abogado/tareas/{item.id}"})

    documents = db.query(models.DocumentoProceso).filter(models.DocumentoProceso.nombre_archivo.ilike(pattern))
    if process_ids is not None:
        documents = documents.filter(models.DocumentoProceso.proceso_id.in_(process_ids))
    for item in documents.order_by(models.DocumentoProceso.created_at.desc()).limit(limit):
        results.append({"id": f"documento:{item.id}", "tipo": "Documento", "titulo": item.nombre_archivo,
                        "subtitulo": item.proceso.nombre if item.proceso else "Documento del proceso", "href": f"/gestion-procesos/admin/documentos?proceso={item.proceso_id}" if usuario.rol == models.RolUsuario.ADMIN else f"/gestion-procesos/abogado/documentos?proceso={item.proceso_id}"})
    return results[:35]


@router.get("/metricas-carga")
def metricas_carga(usuario: models.Usuario = Depends(security.obtener_usuario_actual), db: Session = Depends(get_db)):
    """Workload view for platform admins and firm administrators."""
    process_ids = _staff_scope(usuario, db)
    now = utc_ahora()
    process_query = db.query(models.Proceso).filter(models.Proceso.archivado_en.is_(None))
    task_query = db.query(models.Tarea).filter(models.Tarea.estado.in_([models.EstadoTarea.PENDIENTE, models.EstadoTarea.EN_CURSO]))
    if process_ids is not None:
        process_query = process_query.filter(models.Proceso.id.in_(process_ids))
        task_query = task_query.filter(or_(models.Tarea.proceso_id.in_(process_ids), models.Tarea.usuario_id == usuario.id))
    process_rows = process_query.with_entities(models.Proceso.abogado_id, func.count(models.Proceso.id)).group_by(models.Proceso.abogado_id).all()
    task_rows = task_query.with_entities(models.Tarea.usuario_id, func.count(models.Tarea.id)).group_by(models.Tarea.usuario_id).all()

    def responsible_rows(rows):
        ids = [row[0] for row in rows if row[0] is not None]
        names = {item.id: item.nombre_completo for item in db.query(models.Usuario).filter(models.Usuario.id.in_(ids)).all()} if ids else {}
        return [{"responsable_id": identifier, "responsable": names.get(identifier, "Sin responsable"), "cantidad": count} for identifier, count in rows]

    due_query = task_query.filter(models.Tarea.fecha_limite.is_not(None))
    overdue = due_query.filter(models.Tarea.fecha_limite < now).count()
    upcoming = due_query.filter(models.Tarea.fecha_limite >= now, models.Tarea.fecha_limite <= now + timedelta(days=7)).count()
    activity_query = db.query(models.ComunicacionProceso).join(models.Proceso).filter(models.Proceso.archivado_en.is_(None))
    if process_ids is not None:
        activity_query = activity_query.filter(models.ComunicacionProceso.proceso_id.in_(process_ids))
    activity = [{"tipo": "Comunicación" if item.visibilidad == CLIENT_VISIBLE else "Nota interna", "titulo": item.asunto,
                 "fecha": item.created_at, "proceso_id": item.proceso_id}
                for item in activity_query.order_by(models.ComunicacionProceso.created_at.desc()).limit(10).all()]
    return {"procesos_activos": process_query.count(), "tareas_abiertas": task_query.count(), "vencidas": overdue,
            "por_vencer_7_dias": upcoming, "procesos_por_responsable": responsible_rows(process_rows),
            "tareas_por_responsable": responsible_rows(task_rows), "actividad_reciente": activity}
