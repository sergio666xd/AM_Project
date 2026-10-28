"""Procesos: listado, detalle, comunicaciones, colaboradores, clientes y radicados vinculados."""

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app import models, schemas, security
from app.audit import registrar_evento_auditoria
from app.database import get_db
from app.firm_access import (
    is_process_manager,
    lawyer_process_ids,
    lawyer_scope_id,
    require_process_manager,
)
from app.radicados import (
    ambito_radicado_usuario,
    iniciar_consulta_nuevo_radicado,
    obtener_o_vincular_radicado,
    radicado_vinculado_a_usuario,
)
from app.routers.expedientes.comun import (
    _abogado,
    _cliente_asignado,
    _equipo_proceso,
    _estado_proceso_cliente,
    _notificar,
    _notificar_clientes_proceso,
    _proceso_abogado,
    _resumen_solicitud_documento,
    _serializar_evento_firma,
    _timeline_cliente_visible,
    _timeline_proceso,
)
from app.timezone import format_colombia_datetime, utc_ahora
from app.workflow_service import chat_conversation_url, user_portal_url

router = APIRouter(prefix="/api/expedientes", tags=["Expedientes"])


@router.post("/procesos", status_code=status.HTTP_201_CREATED)
def crear_proceso(datos: schemas.ProcesoCreate, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    if not datos.nombre.strip(): raise HTTPException(status_code=400, detail="El nombre del proceso es obligatorio.")
    proceso = models.Proceso(abogado_id=usuario.id, nombre=datos.nombre.strip(), descripcion=datos.descripcion)
    db.add(proceso); db.flush()
    registrar_evento_auditoria(db, usuario, "proceso.crear", "proceso", proceso.id)
    db.commit(); db.refresh(proceso)
    return {"id": proceso.id, "nombre": proceso.nombre, "descripcion": proceso.descripcion}


@router.put("/procesos/{proceso_id}")
def actualizar_proceso(proceso_id: int, datos: schemas.ProcesoUpdate, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario); proceso = _proceso_abogado(proceso_id, usuario, db)
    require_process_manager(usuario, proceso.abogado_id, action="editar el proceso")
    if datos.nombre is not None:
        if not datos.nombre.strip(): raise HTTPException(status_code=400, detail="El nombre del proceso es obligatorio.")
        proceso.nombre = datos.nombre.strip()
    if datos.descripcion is not None: proceso.descripcion = datos.descripcion
    registrar_evento_auditoria(db, usuario, "proceso.actualizar", "proceso", proceso.id)
    db.commit(); db.refresh(proceso)
    _notificar_clientes_proceso(db, proceso, usuario, f"Actualización del proceso {proceso.nombre}",
                                "actualizó la información general", datos.nombre or datos.descripcion or "Se actualizaron los datos generales del expediente.",
                                "#resumen")
    return {"id": proceso.id, "nombre": proceso.nombre, "descripcion": proceso.descripcion}


_CARGA_LISTADO_PROCESOS = (
    selectinload(models.Proceso.abogado),
    selectinload(models.Proceso.colaboradores).selectinload(models.ProcesoColaborador.abogado),
    selectinload(models.Proceso.clientes).selectinload(models.ProcesoCliente.cliente),
    selectinload(models.Proceso.radicados)
    .selectinload(models.ProcesoRadicado.radicado)
    .selectinload(models.Radicado.actuaciones),
)


def _resumen_actividad_procesos(db: Session, proceso_ids: list[int]) -> dict[int, dict[str, list]]:
    """Agrupa en tres consultas las tareas, solicitudes y documentos de varios procesos."""
    resumen: dict[int, dict[str, list]] = defaultdict(lambda: {"tareas": [], "solicitudes": [], "documentos": []})
    if not proceso_ids:
        return resumen
    fuentes = (
        ("tareas", models.Tarea, models.Tarea.proceso_id),
        ("solicitudes", models.SolicitudDocumento, models.SolicitudDocumento.proceso_id),
        ("documentos", models.DocumentoProceso, models.DocumentoProceso.proceso_id),
    )
    for clave, modelo, columna in fuentes:
        for item in db.query(modelo).filter(columna.in_(proceso_ids)).all():
            resumen[item.proceso_id][clave].append(item)
    return resumen


@router.get("/procesos")
def listar_procesos(db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    if usuario.rol == models.RolUsuario.CLIENTE:
        procesos = db.query(models.Proceso).join(models.ProcesoCliente).filter(
            models.ProcesoCliente.cliente_id == usuario.id,
            models.Proceso.archivado_en.is_(None),
        ).options(*_CARGA_LISTADO_PROCESOS).all()
    else:
        _abogado(usuario); query = db.query(models.Proceso)
        query = query.filter(models.Proceso.archivado_en.is_(None))
        responsible_lawyer_id = lawyer_scope_id(usuario)
        procesos = (
            query
            if responsible_lawyer_id is None
            else query.filter(models.Proceso.id.in_(lawyer_process_ids(db, usuario)))
        ).options(*_CARGA_LISTADO_PROCESOS).all()
    resumen_staff = (
        _resumen_actividad_procesos(db, [proceso.id for proceso in procesos])
        if usuario.rol != models.RolUsuario.CLIENTE
        else {}
    )
    result = []
    for proceso in procesos:
        item = {
            "id": proceso.id,
            "nombre": proceso.nombre,
            "descripcion": proceso.descripcion,
            "etapa": proceso.etapa,
            **_equipo_proceso(proceso),
            "soy_responsable": usuario.rol == models.RolUsuario.ADMIN or usuario.id == proceso.abogado_id,
            "radicados": [
                {
                    "id": enlace.radicado.id,
                    "numero": enlace.radicado.numero,
                    "estado_consulta": enlace.radicado.estado_consulta,
                    "actuaciones": [
                        {
                            "id": actuacion.id,
                            "fecha_actuacion": actuacion.fecha_actuacion,
                            "actuacion": actuacion.actuacion,
                            **(
                                {"anotacion": actuacion.anotacion}
                                if usuario.rol != models.RolUsuario.CLIENTE
                                else {}
                            ),
                        }
                        for actuacion in (
                            sorted(enlace.radicado.actuaciones, key=lambda item: (item.orden, item.id))[:1]
                            if usuario.rol == models.RolUsuario.CLIENTE
                            else sorted(enlace.radicado.actuaciones, key=lambda item: (item.orden, item.id))
                        )
                    ],
                }
                for enlace in proceso.radicados
                if enlace.radicado
            ],
            "clientes": [
                {"id": enlace.cliente.id, "nombre_completo": enlace.cliente.nombre_completo}
                for enlace in proceso.clientes
                if enlace.cliente and enlace.cliente.rol == models.RolUsuario.CLIENTE
            ],
        }
        if usuario.rol == models.RolUsuario.CLIENTE:
            tareas_cliente = db.query(models.Tarea).filter(
                models.Tarea.proceso_id == proceso.id,
                models.Tarea.cliente_id == usuario.id,
            ).all()
            pendientes_cliente = [tarea for tarea in tareas_cliente if tarea.estado in (models.EstadoTarea.PENDIENTE, models.EstadoTarea.EN_CURSO)]
            solicitudes_cliente = db.query(models.SolicitudDocumento).filter_by(
                proceso_id=proceso.id, cliente_id=usuario.id, atendida_en=None,
            ).all()
            proximos_eventos = db.query(models.EventoAgenda).filter(
                models.EventoAgenda.proceso_id == proceso.id,
                models.EventoAgenda.cliente_id == usuario.id,
                models.EventoAgenda.estado == "PROGRAMADO",
                models.EventoAgenda.fecha_inicio >= utc_ahora(),
            ).order_by(models.EventoAgenda.fecha_inicio.asc()).all()
            estado_visible, explicacion_estado = _estado_proceso_cliente(proceso)
            timeline_cliente = _timeline_cliente_visible(proceso, db, usuario.id)
            proximas_fechas = [
                (event.fecha_inicio, event.titulo) for event in proximos_eventos
            ] + [
                (task.fecha_limite, task.titulo)
                for task in pendientes_cliente
                if task.fecha_limite and task.fecha_limite >= utc_ahora()
            ]
            proxima_fecha, proxima_titulo = min(proximas_fechas, key=lambda item: item[0]) if proximas_fechas else (None, None)
            item.update({
                "responsable": {"id": proceso.abogado.id, "nombre_completo": proceso.abogado.nombre_completo},
                "estado_visible": estado_visible,
                "explicacion_estado": explicacion_estado,
                "tareas_pendientes": len(pendientes_cliente),
                "documentos_pendientes": len(solicitudes_cliente),
                "ultima_actividad": timeline_cliente[0]["fecha"].isoformat() if timeline_cliente and timeline_cliente[0].get("fecha") else proceso.created_at.isoformat(),
                "proxima_actividad": proxima_fecha.isoformat() if proxima_fecha else None,
                "proxima_actividad_titulo": proxima_titulo,
            })
        else:
            actividad = resumen_staff.get(proceso.id, {})
            tareas = actividad.get("tareas", [])
            solicitudes = actividad.get("solicitudes", [])
            documentos = actividad.get("documentos", [])
            pendientes = [task for task in tareas if task.estado in (models.EstadoTarea.PENDIENTE, models.EstadoTarea.EN_CURSO)]
            vencidas = [task for task in pendientes if task.fecha_limite and task.fecha_limite < utc_ahora()]
            solicitudes_pendientes = [request for request in solicitudes if request.atendida_en is None]
            fechas = [proceso.created_at]
            fechas.extend(item.updated_at for item in tareas if item.updated_at)
            fechas.extend(item.created_at for item in solicitudes if item.created_at)
            fechas.extend(item.created_at for item in documentos if item.created_at)
            fechas.extend(item.created_at for item in proceso.colaboradores if item.created_at)
            ultima_actividad = max(fechas) if fechas else None
            proxima = min((task.fecha_limite for task in pendientes if task.fecha_limite and task.fecha_limite >= utc_ahora()), default=None)
            item.update({
                "responsable": {"id": proceso.abogado.id, "nombre_completo": proceso.abogado.nombre_completo},
                "clientes": [{"id": link.cliente.id, "nombre_completo": link.cliente.nombre_completo} for link in proceso.clientes if link.cliente],
                "tareas_pendientes": len(pendientes),
                "tareas_vencidas": len(vencidas),
                "documentos_pendientes": len(solicitudes_pendientes),
                "proxima_actividad": proxima,
                "ultima_actividad": ultima_actividad,
                "estado_atencion": "ATENCION" if vencidas or solicitudes_pendientes else "ACTIVO",
                "riesgo": bool(vencidas or solicitudes_pendientes),
                "responsable_asignado": proceso.abogado_id is not None,
                "inactivo": bool(ultima_actividad and ultima_actividad < utc_ahora() - timedelta(days=30)),
            })
        result.append(item)
    return result


@router.get("/procesos/archivados")
def listar_procesos_archivados(
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(security.obtener_usuario_actual),
):
    _abogado(usuario)
    query = db.query(models.Proceso).filter(models.Proceso.archivado_en.is_not(None))
    responsible_lawyer_id = lawyer_scope_id(usuario)
    if responsible_lawyer_id is not None:
        query = query.filter(models.Proceso.abogado_id == responsible_lawyer_id)
    return [
        {
            "id": proceso.id,
            "nombre": proceso.nombre,
            "descripcion": proceso.descripcion,
            "etapa": proceso.etapa,
            "archivado_en": proceso.archivado_en,
            "radicados": [
                {
                    "id": enlace.radicado.id,
                    "numero": enlace.radicado.numero,
                    "actuaciones": [{"id": actuacion.id} for actuacion in enlace.radicado.actuaciones],
                }
                for enlace in proceso.radicados
                if enlace.radicado
            ],
            "radicados_count": len(proceso.radicados),
            "clientes_count": len(proceso.clientes),
        }
        for proceso in query.order_by(models.Proceso.archivado_en.desc()).all()
    ]


@router.get("/procesos/{proceso_id}")
def obtener_proceso_detalle(proceso_id: int, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    proceso = _proceso_abogado(proceso_id, usuario, db)
    tareas = (
        db.query(models.Tarea)
        .filter(
            models.Tarea.proceso_id == proceso.id,
        )
        .order_by(models.Tarea.created_at.desc())
        .all()
    )
    tareas = [
        tarea for tarea in tareas
        if tarea.cliente_id is None
        or (tarea.cliente_asignado is not None and tarea.cliente_asignado.rol == models.RolUsuario.CLIENTE)
    ]
    notificaciones = (
        db.query(models.NotificacionProceso, models.Usuario.nombre_completo)
        .join(models.Usuario, models.Usuario.id == models.NotificacionProceso.cliente_id)
        .filter(models.NotificacionProceso.proceso_id == proceso.id)
        .order_by(models.NotificacionProceso.created_at.desc())
        .limit(10)
        .all()
    )
    puede_gestionar_equipo = is_process_manager(usuario, proceso.abogado_id)
    abogados_disponibles = []
    if puede_gestionar_equipo and proceso.abogado.rol == models.RolUsuario.ABOGADO_ADMIN:
        assigned_ids = {enlace.abogado_id for enlace in proceso.colaboradores}
        abogados_disponibles = [
            {"id": abogado.id, "nombre_completo": abogado.nombre_completo}
            for abogado in db.query(models.Usuario)
            .filter(
                models.Usuario.rol == models.RolUsuario.ABOGADO_ADMIN,
                models.Usuario.estado == models.EstadoUsuario.ACTIVO,
                models.Usuario.id != proceso.abogado_id,
            )
            .order_by(models.Usuario.nombre_completo)
            .all()
            if abogado.id not in assigned_ids
        ]
    return {
        "id": proceso.id, "nombre": proceso.nombre, "descripcion": proceso.descripcion,
        **_equipo_proceso(proceso),
        "soy_responsable": usuario.rol == models.RolUsuario.ADMIN or usuario.id == proceso.abogado_id,
        "puede_gestionar_equipo": puede_gestionar_equipo,
        "abogados_disponibles": abogados_disponibles,
        "radicados": [{"id": enlace.radicado.id, "numero": enlace.radicado.numero, "estado_consulta": enlace.radicado.estado_consulta, "actuaciones": [{"id": a.id, "fecha_actuacion": a.fecha_actuacion, "actuacion": a.actuacion, "anotacion": a.anotacion} for a in sorted(enlace.radicado.actuaciones, key=lambda a: a.orden)]} for enlace in proceso.radicados if enlace.radicado],
        "clientes": [{"id": enlace.cliente.id, "nombre_completo": enlace.cliente.nombre_completo, "email": enlace.cliente.email, "whatsapp_numero": enlace.cliente.whatsapp_numero, "genero": enlace.cliente.genero, "numero_documento": enlace.cliente.numero_documento, "domicilio": enlace.cliente.domicilio, "direccion": enlace.cliente.direccion} for enlace in proceso.clientes if enlace.cliente and enlace.cliente.rol == models.RolUsuario.CLIENTE],
        "tareas": [{"id": t.id, "titulo": t.titulo, "descripcion": t.descripcion, "estado": t.estado.value, "prioridad": t.prioridad.value, "cliente_id": t.cliente_id, "fecha_limite": t.fecha_limite, "radicado_id": t.radicado_id, "actuacion_id": t.actuacion_id, "responsable": t.usuario.nombre_completo if t.usuario else None} for t in tareas],
        "solicitudes_documento": [{"id": s.id, "titulo": s.titulo, "instrucciones": s.instrucciones, "cliente_id": s.cliente_id, "cliente": s.cliente.nombre_completo, "atendida_en": s.atendida_en, "created_at": s.created_at, **_resumen_solicitud_documento(s)} for s in proceso.solicitudes_documento if s.cliente and s.cliente.rol == models.RolUsuario.CLIENTE],
        "documentos": [{"id": d.id, "solicitud_id": d.solicitud_id, "solicitud_item_id": d.solicitud_item_id, "contrato_id": d.contrato_id, "nombre_archivo": d.nombre_archivo, "cliente": d.cliente.nombre_completo if d.cliente else "Usuario eliminado", "cliente_id": d.cliente_id, "mime_type": d.mime_type, "estado_revision": d.estado_revision, "comentario_revision": d.comentario_revision, "created_at": d.created_at} for d in proceso.documentos if d.cliente and d.cliente.rol == models.RolUsuario.CLIENTE],
        "contratos": [{"id": contract.id, "cliente_id": contract.cliente_id, "cliente": contract.cliente.nombre_completo if contract.cliente else contract.parte_cliente_snapshot.get("nombre", "Cliente"), "estado": contract.estado, "version_actual": contract.version_actual, "emitido_en": contract.emitido_en, "firmado_en": contract.firmado_en, "terminado_en": contract.terminado_en, "documento_firmado": ({"id": signed.id, "nombre_archivo": signed.nombre_archivo, "mime_type": signed.mime_type, "created_at": signed.created_at} if (signed := db.query(models.DocumentoProceso).filter_by(contrato_id=contract.id).order_by(models.DocumentoProceso.created_at.desc()).first()) else None)} for contract in db.query(models.ContratoServicio).filter_by(proceso_id=proceso.id).order_by(models.ContratoServicio.created_at.desc()).all()],
        "notificaciones": [
            {
                "id": notificacion.id,
                "cliente": nombre_cliente,
                "asunto": notificacion.asunto,
                "cuerpo": notificacion.cuerpo,
                "created_at": notificacion.created_at,
            }
            for notificacion, nombre_cliente in notificaciones
        ],
        "comunicaciones": [
            {"id": item.id, "asunto": item.asunto, "contenido": item.contenido, "visibilidad": item.visibilidad,
             "canal": item.canal, "cliente_id": item.cliente_id, "cliente": item.cliente.nombre_completo if item.cliente else None,
             "actor": item.actor.nombre_completo if item.actor else None, "created_at": item.created_at}
            for item in db.query(models.ComunicacionProceso).filter_by(proceso_id=proceso.id).order_by(models.ComunicacionProceso.created_at.desc()).limit(100).all()
        ],
        "timeline": _timeline_proceso(proceso, db),
        "eventos": [_serializar_evento_firma(event) for event in db.query(models.EventoAgenda).filter_by(proceso_id=proceso.id).order_by(models.EventoAgenda.fecha_inicio.asc()).all()],
    }


@router.get("/procesos/{proceso_id}/comunicaciones")
def listar_comunicaciones_proceso(proceso_id: int, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    proceso = _proceso_abogado(proceso_id, usuario, db)
    incoming = db.query(models.ComunicacionProceso).filter(
        models.ComunicacionProceso.proceso_id == proceso.id,
        models.ComunicacionProceso.visibilidad == "CLIENTE",
        models.ComunicacionProceso.actor_id != usuario.id,
        models.ComunicacionProceso.leido_en.is_(None),
    ).all()
    for message in incoming:
        message.leido_en = utc_ahora()
    if incoming:
        db.commit()
    return [{"id": item.id, "asunto": item.asunto, "contenido": item.contenido, "visibilidad": item.visibilidad,
             "canal": item.canal, "cliente_id": item.cliente_id, "cliente": item.cliente.nombre_completo if item.cliente else None,
             "actor": item.actor.nombre_completo if item.actor else None, "created_at": item.created_at, "leido_en": item.leido_en}
            for item in db.query(models.ComunicacionProceso).filter_by(proceso_id=proceso.id).order_by(models.ComunicacionProceso.created_at.desc()).all()]


@router.post("/procesos/{proceso_id}/comunicaciones", status_code=status.HTTP_201_CREATED)
def crear_comunicacion_proceso(proceso_id: int, datos: schemas.ComunicacionProcesoCreate, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    proceso = _proceso_abogado(proceso_id, usuario, db)
    cliente = _cliente_asignado(proceso, datos.cliente_id, db) if datos.visibilidad == "CLIENTE" and datos.cliente_id else None
    if datos.visibilidad == "CLIENTE" and cliente is None:
        raise HTTPException(status_code=400, detail="Selecciona el cliente asignado al que corresponde la comunicación.")
    if datos.visibilidad == "INTERNA" and datos.cliente_id is not None:
        raise HTTPException(status_code=400, detail="Una nota interna no puede asociarse a un cliente.")
    item = models.ComunicacionProceso(proceso_id=proceso.id, actor_id=usuario.id, cliente_id=cliente.id if cliente else None,
                                      visibilidad=datos.visibilidad, canal=datos.canal, asunto=datos.asunto.strip(), contenido=datos.contenido.strip())
    db.add(item)
    db.flush()
    registrar_evento_auditoria(db, usuario, "proceso.comunicacion.registrar", "proceso", proceso.id)
    db.commit()
    db.refresh(item)
    if cliente:
        client_chat_url = chat_conversation_url(cliente, proceso.id, usuario.id)
        cuerpo = f"Hola {cliente.nombre_completo},\n\n{usuario.nombre_completo} registró una comunicación para el proceso {proceso.nombre}.\n\nAsunto: {item.asunto}\nFecha: {format_colombia_datetime(item.created_at)}\nDetalle: {item.contenido}\n\nAbrir enlace: Abrir chat | {client_chat_url}"
        _notificar(db, cliente, f"Nueva comunicacion: {item.asunto}", cuerpo,
                   "RESUMENES", f"COMUNICACION_PROCESO:{item.id}", emisor=usuario,
                   plantilla_clave="COMUNICACION_ABOGADO_CLIENTE",
                   variables={"nombre": cliente.nombre_completo, "actor": usuario.nombre_completo,
                              "proceso": proceso.nombre, "asunto": item.asunto,
                              "fecha": format_colombia_datetime(item.created_at), "mensaje": item.contenido},
                   enlace_texto="Abrir chat",
                   enlace_url=client_chat_url)
    return {"id": item.id, "mensaje": "Comunicación registrada en el expediente."}


@router.post("/procesos/{proceso_id}/colaboradores", status_code=status.HTTP_201_CREATED)
def asignar_colaborador_proceso(
    proceso_id: int,
    datos: schemas.ProcesoColaboradorCreate,
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(security.obtener_usuario_actual),
):
    _abogado(usuario)
    proceso = _proceso_abogado(proceso_id, usuario, db)
    require_process_manager(usuario, proceso.abogado_id, action="gestionar el equipo del proceso")
    if proceso.abogado.rol != models.RolUsuario.ABOGADO_ADMIN:
        raise HTTPException(status_code=400, detail="Los procesos SaaS individuales no admiten colaboradores.")
    if datos.abogado_id == proceso.abogado_id:
        raise HTTPException(status_code=400, detail="El responsable ya pertenece al equipo del proceso.")
    abogado = db.query(models.Usuario).filter(
        models.Usuario.id == datos.abogado_id,
        models.Usuario.rol == models.RolUsuario.ABOGADO_ADMIN,
        models.Usuario.estado == models.EstadoUsuario.ACTIVO,
    ).first()
    if not abogado:
        raise HTTPException(status_code=404, detail="Solo se pueden asignar abogados activos de la firma.")
    if db.query(models.ProcesoColaborador).filter_by(
        proceso_id=proceso.id, abogado_id=abogado.id
    ).first():
        raise HTTPException(status_code=409, detail="El abogado ya está asignado al proceso.")
    db.add(models.ProcesoColaborador(
        proceso_id=proceso.id,
        abogado_id=abogado.id,
        asignado_por_id=usuario.id,
        visible_cliente=datos.visible_cliente,
    ))
    registrar_evento_auditoria(db, usuario, "proceso.colaborador.asignar", "proceso", proceso.id)
    db.commit()
    permiso = "abogado participante, visible para el cliente" if datos.visible_cliente else "colaborador interno"
    cuerpo = (
        f"Hola {abogado.nombre_completo},\n\n"
        f"{usuario.nombre_completo} te agregó como {permiso} en el proceso {proceso.nombre}.\n\n"
        f"Proceso: {proceso.nombre}\n"
        f"Responsable: {proceso.abogado.nombre_completo}\n"
        f"Permiso: {permiso}\n\n"
        f"Abrir enlace: Ver proceso | {user_portal_url(abogado, f'/gestion-procesos/abogado/procesos/{proceso.id}/resumen')}"
    )
    _notificar(
        db, abogado, f"Te agregaron al proceso {proceso.nombre}", cuerpo,
        "RESUMENES", f"COLABORACION_PROCESO:{proceso.id}:{abogado.id}:{uuid4().hex}",
        emisor=usuario, incluir_email=True,
        plantilla_clave="COLABORADOR_AGREGADO",
        variables={"nombre": abogado.nombre_completo, "actor": usuario.nombre_completo,
                   "permiso": permiso, "proceso": proceso.nombre,
                   "responsable": proceso.abogado.nombre_completo},
        enlace_texto="Ver proceso",
        enlace_url=user_portal_url(abogado, f"/gestion-procesos/abogado/procesos/{proceso.id}/resumen"),
    )
    return {"mensaje": f"{abogado.nombre_completo} fue agregado como {permiso}."}


@router.patch("/procesos/{proceso_id}/colaboradores/{abogado_id}")
def actualizar_permiso_colaborador_proceso(
    proceso_id: int,
    abogado_id: int,
    datos: schemas.ProcesoColaboradorUpdate,
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(security.obtener_usuario_actual),
):
    _abogado(usuario)
    proceso = _proceso_abogado(proceso_id, usuario, db)
    require_process_manager(usuario, proceso.abogado_id, action="gestionar el equipo del proceso")
    colaboracion = db.query(models.ProcesoColaborador).filter_by(
        proceso_id=proceso.id, abogado_id=abogado_id
    ).first()
    if not colaboracion:
        raise HTTPException(status_code=404, detail="El abogado no está asignado al proceso.")
    colaboracion.visible_cliente = datos.visible_cliente
    registrar_evento_auditoria(db, usuario, "proceso.colaborador.actualizar_permiso", "proceso", proceso.id)
    db.commit()
    return {"mensaje": "Permiso del abogado actualizado."}


@router.delete("/procesos/{proceso_id}/colaboradores/{abogado_id}")
def retirar_colaborador_proceso(
    proceso_id: int,
    abogado_id: int,
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(security.obtener_usuario_actual),
):
    _abogado(usuario)
    proceso = _proceso_abogado(proceso_id, usuario, db)
    require_process_manager(usuario, proceso.abogado_id, action="gestionar el equipo del proceso")
    colaboracion = db.query(models.ProcesoColaborador).filter_by(
        proceso_id=proceso.id, abogado_id=abogado_id
    ).first()
    if not colaboracion:
        raise HTTPException(status_code=404, detail="El abogado no está asignado al proceso.")
    registrar_evento_auditoria(db, usuario, "proceso.colaborador.retirar", "proceso", proceso.id)
    db.delete(colaboracion)
    db.commit()
    return {"mensaje": "Acceso del colaborador retirado."}


@router.delete("/procesos/{proceso_id}")
def eliminar_proceso(proceso_id: int, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    proceso = _proceso_abogado(proceso_id, usuario, db)
    require_process_manager(usuario, proceso.abogado_id, action="archivar el proceso")
    proceso.archivado_en = datetime.now(timezone.utc)
    registrar_evento_auditoria(db, usuario, "proceso.archivar", "proceso", proceso.id)
    db.commit()
    return {"mensaje": "Proceso archivado. Puedes restaurarlo desde la lista de archivados."}


@router.patch("/procesos/{proceso_id}/restaurar")
def restaurar_proceso(
    proceso_id: int,
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(security.obtener_usuario_actual),
):
    _abogado(usuario)
    proceso = _proceso_abogado(proceso_id, usuario, db, incluir_archivado=True)
    require_process_manager(usuario, proceso.abogado_id, action="restaurar el proceso")
    proceso.archivado_en = None
    registrar_evento_auditoria(db, usuario, "proceso.restaurar", "proceso", proceso.id)
    db.commit()
    return {"mensaje": "Proceso restaurado."}


@router.delete("/procesos/{proceso_id}/clientes/{cliente_id}")
def retirar_cliente(proceso_id: int, cliente_id: int, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario); proceso = _proceso_abogado(proceso_id, usuario, db)
    enlace = db.query(models.ProcesoCliente).filter_by(proceso_id=proceso.id, cliente_id=cliente_id).first()
    if not enlace: raise HTTPException(status_code=404, detail="El cliente no está asignado al proceso.")
    registrar_evento_auditoria(db, usuario, "proceso.cliente.retirar", "proceso_cliente", f"{proceso.id}:{cliente_id}")
    db.delete(enlace); db.commit()
    return {"mensaje": "Cliente retirado del proceso."}


@router.delete("/procesos/{proceso_id}/radicados/{radicado_id}")
def retirar_radicado(proceso_id: int, radicado_id: int, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario); proceso = _proceso_abogado(proceso_id, usuario, db)
    enlace = db.query(models.ProcesoRadicado).filter_by(proceso_id=proceso.id, radicado_id=radicado_id).first()
    if not enlace: raise HTTPException(status_code=404, detail="El radicado no está asociado al proceso.")
    registrar_evento_auditoria(db, usuario, "proceso.radicado.retirar", "proceso_radicado", f"{proceso.id}:{radicado_id}")
    db.delete(enlace); db.commit()
    return {"mensaje": "Radicado retirado del proceso."}


@router.post("/procesos/{proceso_id}/radicados/{radicado_id}")
def asignar_radicado(proceso_id: int, radicado_id: int, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario); proceso = _proceso_abogado(proceso_id, usuario, db)
    if not proceso.abogado:
        raise HTTPException(status_code=404, detail="Proceso no encontrado.")
    try:
        scope_key = ambito_radicado_usuario(proceso.abogado)
    except ValueError:
        raise HTTPException(status_code=404, detail="Proceso no encontrado.")
    radicado = db.query(models.Radicado).filter(
        models.Radicado.id == radicado_id,
        models.Radicado.ambito_key == scope_key,
    ).first()
    if not radicado: raise HTTPException(status_code=404, detail="Radicado no encontrado en la firma.")
    vinculado_previamente = radicado_vinculado_a_usuario(
        db,
        proceso.abogado,
        radicado.numero,
    )
    if not db.query(models.ProcesoRadicado).filter_by(proceso_id=proceso.id, radicado_id=radicado.id).first():
        try:
            obtener_o_vincular_radicado(db, proceso.abogado, radicado.numero)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail="Radicado no disponible en el ámbito del proceso.") from exc
        db.add(models.ProcesoRadicado(proceso_id=proceso.id, radicado_id=radicado.id))
        registrar_evento_auditoria(db, usuario, "proceso.radicado.asignar", "proceso_radicado", f"{proceso.id}:{radicado.id}")
        db.commit()
        _notificar_clientes_proceso(
            db, proceso, usuario, f"Radicado asociado: {radicado.numero}",
            "asoció un radicado judicial", f"Radicado: {radicado.numero}\nProceso: {proceso.nombre}\nEstado de consulta: {radicado.estado_consulta}",
            "radicados", tipo="ACTUACIONES",
        )
        if not vinculado_previamente:
            mensaje_consulta, consulta_id = iniciar_consulta_nuevo_radicado(
                db,
                proceso.abogado,
                radicado,
            )
            return {
                "mensaje": f"Radicado asignado al proceso. {mensaje_consulta}",
                "consulta_id": consulta_id,
            }
    return {"mensaje": "Radicado asignado al proceso."}


@router.post("/procesos/{proceso_id}/radicados", status_code=status.HTTP_201_CREATED)
def crear_y_asignar_radicado(
    proceso_id: int,
    datos: schemas.RadicadoCreate,
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(security.obtener_usuario_actual),
):
    """Crea el radicado del abogado y lo vincula al proceso de forma atómica."""
    _abogado(usuario)
    proceso = _proceso_abogado(proceso_id, usuario, db)
    numero = datos.numero.strip()
    vinculado_previamente = radicado_vinculado_a_usuario(
        db,
        proceso.abogado,
        numero,
    )
    try:
        radicado, created = obtener_o_vincular_radicado(db, proceso.abogado, numero)
        if usuario.id != proceso.abogado_id:
            obtener_o_vincular_radicado(db, usuario, numero)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not db.query(models.ProcesoRadicado).filter_by(
        proceso_id=proceso.id, radicado_id=radicado.id
    ).first():
        db.add(models.ProcesoRadicado(proceso_id=proceso.id, radicado_id=radicado.id))
    action = "radicado.crear_en_proceso" if created else "radicado.vincular_en_proceso"
    registrar_evento_auditoria(db, usuario, action, "radicado", radicado.id)
    db.commit(); db.refresh(radicado)
    _notificar_clientes_proceso(
        db, proceso, usuario, f"Radicado asociado: {radicado.numero}",
        "asoció un radicado judicial", f"Radicado: {radicado.numero}\nProceso: {proceso.nombre}\nEstado de consulta: {radicado.estado_consulta}",
        "radicados", tipo="ACTUACIONES",
    )
    mensaje = "Radicado creado y asociado al proceso."
    consulta_id = None
    if created or not vinculado_previamente:
        mensaje_consulta, consulta_id = iniciar_consulta_nuevo_radicado(
            db,
            proceso.abogado,
            radicado,
        )
        mensaje = f"{mensaje} {mensaje_consulta}"
    return {
        "id": radicado.id,
        "numero": radicado.numero,
        "mensaje": mensaje,
        "consulta_id": consulta_id,
    }


@router.post("/procesos/{proceso_id}/clientes/{cliente_id}")
def asignar_cliente(proceso_id: int, cliente_id: int, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario); proceso = _proceso_abogado(proceso_id, usuario, db)
    if not proceso.abogado:
        raise HTTPException(status_code=404, detail="Proceso no encontrado.")
    cliente_query = db.query(models.Usuario).filter(
        models.Usuario.id == cliente_id,
        models.Usuario.rol == models.RolUsuario.CLIENTE,
    )
    if proceso.abogado.rol == models.RolUsuario.ABOGADO:
        cliente_query = cliente_query.filter(
            models.Usuario.creado_por_abogado_id == proceso.abogado_id
        )
    elif proceso.abogado.rol in (models.RolUsuario.ABOGADO_ADMIN, models.RolUsuario.ADMIN):
        firm_lawyer_ids = db.query(models.Usuario.id).filter(
            models.Usuario.rol.in_((models.RolUsuario.ABOGADO_ADMIN, models.RolUsuario.ADMIN))
        )
        cliente_query = cliente_query.filter(
            models.Usuario.creado_por_abogado_id.in_(firm_lawyer_ids)
        )
    else:
        raise HTTPException(status_code=404, detail="Proceso no encontrado.")
    cliente = cliente_query.first()
    if not cliente: raise HTTPException(status_code=404, detail="Cliente no disponible para este abogado.")
    if not db.query(models.ProcesoCliente).filter_by(proceso_id=proceso.id, cliente_id=cliente.id).first():
        db.add(models.ProcesoCliente(proceso_id=proceso.id, cliente_id=cliente.id))
        registrar_evento_auditoria(db, usuario, "proceso.cliente.asignar", "proceso_cliente", f"{proceso.id}:{cliente.id}")
        db.commit()
        _notificar_clientes_proceso(
            db, proceso, usuario, f"Proceso asignado: {proceso.nombre}",
            "te dio acceso al siguiente proceso", f"Proceso: {proceso.nombre}\nResponsable: {proceso.abogado.nombre_completo}\nDescripción: {proceso.descripcion or 'Sin descripción'}",
            "resumen", tipo="RESUMENES", cliente=cliente,
        )
    return {"mensaje": "Cliente asignado al proceso."}


@router.post("/procesos/{proceso_id}/actuaciones/{actuacion_id}/notificar")
def notificar_actuacion(proceso_id: int, actuacion_id: int, datos: schemas.NotificacionActuacionCreate, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario); proceso = _proceso_abogado(proceso_id, usuario, db); cliente = _cliente_asignado(proceso, datos.cliente_id, db)
    actuacion = db.query(models.Actuacion).join(models.ProcesoRadicado).filter(models.Actuacion.id == actuacion_id, models.ProcesoRadicado.proceso_id == proceso.id, models.ProcesoRadicado.radicado_id == models.Actuacion.radicado_id).first()
    if not actuacion: raise HTTPException(status_code=404, detail="La actuación no corresponde al proceso.")
    cuerpo = (f"Hola {cliente.nombre_completo},\n\n{usuario.nombre_completo} le notifica una actuacion del proceso {proceso.nombre}.\n\n"
              f"Radicado: {actuacion.radicado_rel.numero}\nFecha: {actuacion.fecha_actuacion or 'No informada'}\n"
              f"Actuacion: {actuacion.actuacion}\nAnotacion: {actuacion.anotacion or 'Sin anotacion'}\n"
              f"Comentarios del abogado: {datos.comentarios}\n\n"
              f"Abrir enlace: Ver actuación | {user_portal_url(cliente, f'/gestion-procesos/cliente/procesos/{proceso.id}#actuacion-{actuacion.id}')}")
    asunto = f"Actualización del proceso {proceso.nombre}"
    _notificar(
        db,
        cliente,
        asunto,
        cuerpo,
        "ACTUACIONES",
        f"NOTIFICACION_ACTUACION:{actuacion.id}:{cliente.id}",
        emisor=usuario,
        plantilla_clave="ACTUACION_NOTIFICADA",
        variables={"nombre": cliente.nombre_completo, "actor": usuario.nombre_completo,
                   "proceso": proceso.nombre, "radicado": actuacion.radicado_rel.numero,
                   "fecha": actuacion.fecha_actuacion or "No informada",
                   "actuacion": actuacion.actuacion, "anotacion": actuacion.anotacion or "Sin anotación",
                   "comentarios": datos.comentarios},
        enlace_texto="Ver actuación", enlace_url=user_portal_url(cliente, f"/gestion-procesos/cliente/procesos/{proceso.id}#actuacion-{actuacion.id}"),
    )
    db.add(models.NotificacionProceso(
        abogado_id=usuario.id, proceso_id=proceso.id, cliente_id=cliente.id,
        actuacion_id=actuacion.id, comentarios=datos.comentarios,
        asunto=asunto, cuerpo=cuerpo,
    ))
    db.flush()
    registrar_evento_auditoria(db, usuario, "proceso.notificacion.enviar", "proceso", proceso.id)
    db.commit()
    return {"mensaje": "Notificación enviada según las preferencias del cliente."}
