"""Documentos del despacho: listado, descarga, revisión y solicitudes al cliente."""

import os
from urllib.parse import quote
from uuid import uuid4

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app import models, schemas, security, storage
from app.audit import registrar_evento_auditoria
from app.database import get_db
from app.document_validation import (
    ALLOWED_DOCUMENT_TYPES,
    MAX_DOCUMENT_BYTES,
)
from app.document_validation import (
    document_content_matches_type as _document_content_matches_type,
)
from app.firm_access import (
    lawyer_process_ids,
    lawyer_scope_id,
)
from app.routers.expedientes.comun import (
    _abogado,
    _cliente_asignado,
    _documento_actual_por_item,
    _documentos_requeridos,
    _estado_solicitud_documento,
    _notificar,
    _proceso_abogado,
    logger,
)
from app.timezone import format_colombia_datetime, utc_ahora
from app.workflow_service import user_portal_url

router = APIRouter(prefix="/api/expedientes", tags=["Expedientes"])


@router.get("/documentos")
def listar_documentos_despacho(db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    if usuario.rol == models.RolUsuario.CLIENTE:
        solicitudes_query = (
            db.query(models.SolicitudDocumento)
            .join(models.Proceso, models.Proceso.id == models.SolicitudDocumento.proceso_id)
            .join(
                models.ProcesoCliente,
                models.ProcesoCliente.proceso_id == models.SolicitudDocumento.proceso_id,
            )
            .filter(
                models.SolicitudDocumento.cliente_id == usuario.id,
                models.ProcesoCliente.cliente_id == usuario.id,
                models.Proceso.archivado_en.is_(None),
            )
        )
        documentos_query = (
            db.query(models.DocumentoProceso)
            .join(models.Proceso, models.Proceso.id == models.DocumentoProceso.proceso_id)
            .join(
                models.ProcesoCliente,
                models.ProcesoCliente.proceso_id == models.DocumentoProceso.proceso_id,
            )
            .filter(
                models.DocumentoProceso.cliente_id == usuario.id,
                models.ProcesoCliente.cliente_id == usuario.id,
                models.Proceso.archivado_en.is_(None),
            )
        )
    else:
        _abogado(usuario)
        solicitudes_query = db.query(models.SolicitudDocumento).join(models.Proceso).filter(
            models.Proceso.archivado_en.is_(None)
        )
        documentos_query = db.query(models.DocumentoProceso).join(models.Proceso).filter(
            models.Proceso.archivado_en.is_(None)
        )
        responsible_lawyer_id = lawyer_scope_id(usuario)
        if responsible_lawyer_id is not None:
            assigned_processes = lawyer_process_ids(db, usuario)
            solicitudes_query = solicitudes_query.filter(
                models.Proceso.id.in_(assigned_processes)
            )
            documentos_query = documentos_query.filter(
                models.Proceso.id.in_(assigned_processes)
            )
    solicitudes = solicitudes_query.order_by(models.SolicitudDocumento.created_at.desc()).all()
    documentos = documentos_query.order_by(models.DocumentoProceso.created_at.desc(), models.DocumentoProceso.id.desc()).all()
    if usuario.rol == models.RolUsuario.CLIENTE:
        contract_ids = {document.contrato_id for document in documentos if document.contrato_id is not None}
        if contract_ids:
            contracts = db.query(models.ContratoServicio).filter(models.ContratoServicio.id.in_(contract_ids)).all()
            visible_contract_ids = {contract.id for contract in contracts if contract.estado in {"FIRMADO", "TERMINADO"}}
            latest_document_by_contract = {}
            for document in documentos:
                if document.contrato_id in visible_contract_ids and document.contrato_id not in latest_document_by_contract:
                    latest_document_by_contract[document.contrato_id] = document.id
            documentos = [document for document in documentos if document.contrato_id is None or latest_document_by_contract.get(document.contrato_id) == document.id]
    solicitudes_json = []
    for solicitud in solicitudes:
        required = _documentos_requeridos(solicitud)
        por_item = _documento_actual_por_item(solicitud, required)
        items_json = [{
            "id": item["id"], "nombre": item["nombre"],
            "estado": por_item[item["id"]].estado_revision if item["id"] in por_item else "FALTANTE",
            "documento": ({
                "id": por_item[item["id"]].id,
                "nombre_archivo": por_item[item["id"]].nombre_archivo,
                "estado_revision": por_item[item["id"]].estado_revision,
                "comentario_revision": por_item[item["id"]].comentario_revision,
                "created_at": por_item[item["id"]].created_at,
            } if item["id"] in por_item else None),
        } for item in required]
        estado = _estado_solicitud_documento(items_json)
        solicitudes_json.append({
            "id": solicitud.id, "proceso": solicitud.proceso.nombre, "proceso_id": solicitud.proceso_id,
            "cliente": solicitud.cliente.nombre_completo, "cliente_id": solicitud.cliente_id,
            "titulo": solicitud.titulo, "instrucciones": solicitud.instrucciones,
            "documentos_requeridos": items_json, "estado": estado,
            "atendida_en": solicitud.atendida_en, "fecha_limite": solicitud.fecha_limite,
            "created_at": solicitud.created_at,
        })
    return {"solicitudes": solicitudes_json, "documentos": [{"id": d.id, "proceso": d.proceso.nombre, "proceso_id": d.proceso_id, "cliente": d.cliente.nombre_completo if d.cliente else "Usuario eliminado", "cliente_id": d.cliente_id, "solicitud_id": d.solicitud_id, "solicitud_item_id": d.solicitud_item_id, "contrato_id": d.contrato_id, "nombre_archivo": d.nombre_archivo, "mime_type": d.mime_type, "estado_revision": d.estado_revision, "comentario_revision": d.comentario_revision, "created_at": d.created_at} for d in documentos]}


@router.get("/documentos/{documento_id}/archivo")
def descargar_documento(
    documento_id: int,
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(security.obtener_usuario_actual),
):
    query = (
        db.query(models.DocumentoProceso)
        .join(models.Proceso, models.Proceso.id == models.DocumentoProceso.proceso_id)
        .filter(
            models.DocumentoProceso.id == documento_id,
            models.Proceso.archivado_en.is_(None),
        )
    )
    responsible_lawyer_id = lawyer_scope_id(usuario)
    if usuario.rol == models.RolUsuario.CLIENTE:
        query = query.join(
            models.ProcesoCliente,
            models.ProcesoCliente.proceso_id == models.DocumentoProceso.proceso_id,
        ).filter(
            models.DocumentoProceso.cliente_id == usuario.id,
            models.ProcesoCliente.cliente_id == usuario.id,
        )
    else:
        _abogado(usuario)
        if responsible_lawyer_id is not None:
            query = query.filter(models.Proceso.id.in_(lawyer_process_ids(db, usuario)))

    documento = query.first()
    if not documento:
        raise HTTPException(status_code=404, detail="Documento no encontrado.")
    if usuario.rol == models.RolUsuario.CLIENTE and documento.contrato_id is not None:
        contrato = db.query(models.ContratoServicio).filter_by(id=documento.contrato_id).first()
        documento_actual = db.query(models.DocumentoProceso).filter_by(contrato_id=documento.contrato_id).order_by(
            models.DocumentoProceso.created_at.desc(), models.DocumentoProceso.id.desc(),
        ).first()
        if not contrato or contrato.estado not in {"FIRMADO", "TERMINADO"} or not documento_actual or documento_actual.id != documento.id:
            raise HTTPException(status_code=404, detail="Documento no encontrado.")

    try:
        objeto = storage.get_r2_client().get_object(
            Bucket=storage.get_r2_bucket(),
            Key=documento.ruta_archivo,
        )
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(status_code=502, detail="No fue posible descargar el documento.") from exc

    registrar_evento_auditoria(db, usuario, "documento.descargar", "documento_proceso", documento.id)
    db.commit()
    nombre_archivo = quote(documento.nombre_archivo, safe="")
    return StreamingResponse(
        objeto["Body"],
        media_type=documento.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{nombre_archivo}",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.patch("/documentos/{documento_id}/revision")
def revisar_documento(documento_id: int, datos: schemas.DocumentoRevisionUpdate, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    query = db.query(models.DocumentoProceso).join(models.Proceso).filter(
        models.DocumentoProceso.id == documento_id, models.Proceso.archivado_en.is_(None)
    )
    if usuario.rol != models.RolUsuario.ADMIN:
        query = query.filter(models.Proceso.id.in_(lawyer_process_ids(db, usuario)))
    documento = query.first()
    if not documento:
        raise HTTPException(status_code=404, detail="Documento no encontrado.")
    documento.estado_revision = datos.estado_revision
    documento.comentario_revision = datos.comentario_revision.strip() or None
    documento.revisado_por_id = usuario.id
    documento.revisado_en = utc_ahora()
    if documento.solicitud:
        required_items = _documentos_requeridos(documento.solicitud)
        latest_by_item = _documento_actual_por_item(documento.solicitud, required_items)
        fully_supplied = all(
            item["id"] in latest_by_item
            and latest_by_item[item["id"]].estado_revision != "REQUIERE_CORRECCION"
            for item in required_items
        )
        documento.solicitud.atendida_en = utc_ahora() if fully_supplied else None
    registrar_evento_auditoria(db, usuario, "documento.revisar", "documento_proceso", documento.id)
    db.commit()
    cliente = documento.cliente
    if cliente and cliente.estado == models.EstadoUsuario.ACTIVO:
        try:
            _notificar(
                db, cliente, f"Documento revisado: {documento.solicitud.titulo if documento.solicitud else documento.nombre_archivo}",
                f"Hola {cliente.nombre_completo},\n\n{usuario.nombre_completo} revisó el documento {documento.nombre_archivo} del proceso {documento.proceso.nombre}.\n\nEstado: {documento.estado_revision.replace('_', ' ')}\nComentario: {documento.comentario_revision or 'Sin comentarios adicionales'}\nFecha de revisión: {format_colombia_datetime(documento.revisado_en)}\n\nAbrir enlace: Ver documentos | {user_portal_url(cliente, f'/gestion-procesos/cliente/procesos/{documento.proceso_id}#documentos')}",
                "DOCUMENTOS", f"REVISION_DOCUMENTO:{documento.id}:{documento.estado_revision}", emisor=usuario,
                plantilla_clave="DOCUMENTO_REVISION",
                variables={"nombre": cliente.nombre_completo, "actor": usuario.nombre_completo,
                           "documento": next((item["nombre"] for item in _documentos_requeridos(documento.solicitud) if item["id"] == documento.solicitud_item_id), documento.solicitud.titulo) if documento.solicitud else documento.nombre_archivo,
                           "archivo": documento.nombre_archivo,
                           "solicitud": documento.solicitud.titulo if documento.solicitud else "Sin solicitud asociada",
                           "proceso": documento.proceso.nombre,
                           "estado": documento.estado_revision.replace("_", " "),
                           "comentario": documento.comentario_revision or "Sin comentarios adicionales",
                           "fecha": format_colombia_datetime(documento.revisado_en)},
                enlace_texto="Ver documentos", enlace_url=user_portal_url(cliente, f"/gestion-procesos/cliente/procesos/{documento.proceso_id}#documentos"),
            )
        except Exception:
            db.rollback()
            logger.exception(
                "No se pudo programar la notificación de revisión para el documento %s.",
                documento.id,
            )
    return {"id": documento.id, "estado_revision": documento.estado_revision, "comentario_revision": documento.comentario_revision, "mensaje": "Revisión guardada."}


@router.post("/procesos/{proceso_id}/solicitudes-documento", status_code=status.HTTP_201_CREATED)
def solicitar_documento(proceso_id: int, datos: schemas.SolicitudDocumentoCreate, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario); proceso = _proceso_abogado(proceso_id, usuario, db); cliente = _cliente_asignado(proceso, datos.cliente_id, db)
    nombres = [nombre.strip()[:180] for nombre in datos.documentos if nombre and nombre.strip()]
    if not nombres:
        nombres = [datos.titulo.strip()]
    if len(nombres) > 30:
        raise HTTPException(status_code=400, detail="Una solicitud puede incluir hasta 30 documentos.")
    if len({nombre.casefold() for nombre in nombres}) != len(nombres):
        raise HTTPException(status_code=400, detail="Cada documento solicitado debe tener un nombre distinto.")
    request_title = datos.titulo.strip()[:255]
    if not request_title:
        raise HTTPException(status_code=400, detail="El nombre de la solicitud es obligatorio.")
    required_items = [{"id": str(uuid4()), "nombre": nombre} for nombre in nombres]
    solicitud = models.SolicitudDocumento(proceso_id=proceso.id, cliente_id=datos.cliente_id, titulo=request_title, documentos_requeridos=required_items, instrucciones=datos.instrucciones, fecha_limite=datos.fecha_limite)
    db.add(solicitud); db.flush()
    registrar_evento_auditoria(db, usuario, "documento.solicitar", "solicitud_documento", solicitud.id)
    db.commit(); db.refresh(solicitud)
    required_text = "\n".join(f"- {item['nombre']}" for item in required_items)
    notification_body = (
        f"Hola {cliente.nombre_completo},\n\n{usuario.nombre_completo} solicitó documentos para el proceso {proceso.nombre}.\n\n"
        f"Solicitud: {solicitud.titulo}\nDocumentos requeridos:\n{required_text}\n\n"
        f"Instrucciones: {solicitud.instrucciones or 'Sin instrucciones adicionales'}\n"
        f"Fecha límite: {format_colombia_datetime(solicitud.fecha_limite) if solicitud.fecha_limite else 'Sin fecha límite'}\n"
        f"Fecha de solicitud: {format_colombia_datetime(solicitud.created_at)}\n\n"
        f"Abrir enlace: Ver documentos | {user_portal_url(cliente, f'/gestion-procesos/cliente/procesos/{proceso.id}#documentos')}"
    )
    _notificar(
        db,
        cliente,
        f"Documentos solicitados: {solicitud.titulo}",
        notification_body,
        "DOCUMENTOS",
        f"SOLICITUD_DOCUMENTO:{solicitud.id}",
        usuario,
        plantilla_clave="SOLICITUD_DOCUMENTO",
        variables={"nombre": cliente.nombre_completo, "actor": usuario.nombre_completo,
                   "proceso": proceso.nombre, "solicitud": solicitud.titulo,
                   "documentos": required_text,
                   "instrucciones": solicitud.instrucciones or "Sin instrucciones adicionales",
                   "fecha_limite": format_colombia_datetime(solicitud.fecha_limite) if solicitud.fecha_limite else "Sin fecha límite",
                   "fecha": format_colombia_datetime(solicitud.created_at)},
        enlace_texto="Ver documentos", enlace_url=user_portal_url(cliente, f"/gestion-procesos/cliente/procesos/{proceso.id}#documentos"),
    )
    return {"id": solicitud.id, "documentos_requeridos": required_items, "mensaje": "Solicitud enviada al cliente."}


@router.delete("/solicitudes-documento/{solicitud_id}")
def eliminar_solicitud_documento(solicitud_id: int, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    """Elimina una solicitud; los archivos ya cargados se conservan en el proceso sin solicitud asociada."""
    _abogado(usuario)
    solicitud = db.query(models.SolicitudDocumento).filter(models.SolicitudDocumento.id == solicitud_id).first()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada.")
    try:
        _proceso_abogado(solicitud.proceso_id, usuario, db)
    except HTTPException as exc:
        if exc.status_code == 404:
            raise HTTPException(status_code=404, detail="Solicitud no encontrada.") from exc
        raise
    archivos_conservados = db.query(models.DocumentoProceso).filter(
        models.DocumentoProceso.solicitud_id == solicitud.id
    ).update(
        {models.DocumentoProceso.solicitud_id: None, models.DocumentoProceso.solicitud_item_id: None},
        synchronize_session=False,
    )
    registrar_evento_auditoria(db, usuario, "documento.solicitud_eliminar", "solicitud_documento", solicitud.id)
    db.delete(solicitud)
    db.commit()
    return {"id": solicitud_id, "archivos_conservados": archivos_conservados, "mensaje": "Solicitud eliminada."}


@router.post("/solicitudes-documento/{solicitud_id}/archivo", status_code=status.HTTP_201_CREATED)
def cargar_documento_cliente(solicitud_id: int, archivo: UploadFile = File(...), item_id: str | None = Form(default=None), db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    if usuario.rol != models.RolUsuario.CLIENTE: raise HTTPException(status_code=403, detail="Solo el cliente puede cargar este documento.")
    solicitud = (
        db.query(models.SolicitudDocumento)
        .join(models.Proceso)
        .join(
            models.ProcesoCliente,
            models.ProcesoCliente.proceso_id == models.SolicitudDocumento.proceso_id,
        )
        .filter(
            models.SolicitudDocumento.id == solicitud_id,
            models.SolicitudDocumento.cliente_id == usuario.id,
            models.ProcesoCliente.cliente_id == usuario.id,
            models.Proceso.archivado_en.is_(None),
        )
        .first()
    )
    if not solicitud: raise HTTPException(status_code=404, detail="Solicitud de documento no disponible.")
    required_items = _documentos_requeridos(solicitud)
    selected_item = next((item for item in required_items if item["id"] == (item_id or (required_items[0]["id"] if len(required_items) == 1 else ""))), None)
    if not selected_item: raise HTTPException(status_code=400, detail="Selecciona un documento solicitado válido.")
    previous_document = _documento_actual_por_item(solicitud, required_items).get(selected_item["id"])
    if previous_document and previous_document.estado_revision != "REQUIERE_CORRECCION":
        raise HTTPException(status_code=409, detail="Este documento ya fue suministrado y está pendiente de revisión.")
    if archivo.content_type not in ALLOWED_DOCUMENT_TYPES: raise HTTPException(status_code=400, detail="Tipo de documento no permitido.")
    contenido = archivo.file.read(MAX_DOCUMENT_BYTES + 1)
    if not contenido or len(contenido) > MAX_DOCUMENT_BYTES: raise HTTPException(status_code=400, detail="El archivo debe pesar máximo 15 MB.")
    if not _document_content_matches_type(archivo.content_type, contenido): raise HTTPException(status_code=400, detail="El contenido del archivo no coincide con su tipo.")
    extension = os.path.splitext(archivo.filename or "")[1].lower(); clave = f"procesos/{solicitud.proceso_id}/clientes/{usuario.id}/{uuid4().hex}{extension}"
    cliente_r2 = storage.get_r2_client()
    bucket = storage.get_r2_bucket()
    try: cliente_r2.put_object(Bucket=bucket, Key=clave, Body=contenido, ContentType=archivo.content_type)
    except (BotoCoreError, ClientError) as exc: raise HTTPException(status_code=502, detail="No fue posible guardar el documento.") from exc
    try:
        documento = models.DocumentoProceso(proceso_id=solicitud.proceso_id, cliente_id=usuario.id, solicitud_id=solicitud.id, solicitud_item_id=selected_item["id"], nombre_archivo=archivo.filename or "documento", ruta_archivo=clave, mime_type=archivo.content_type)
        db.add(documento)
        db.flush()
        latest_by_item = _documento_actual_por_item(solicitud, required_items)
        latest_by_item[selected_item["id"]] = documento
        fully_supplied = all(
            item["id"] in latest_by_item
            and latest_by_item[item["id"]].estado_revision != "REQUIERE_CORRECCION"
            for item in required_items
        )
        solicitud.atendida_en = utc_ahora() if fully_supplied else None
        registrar_evento_auditoria(db, usuario, "documento.cargar", "documento_proceso", documento.id)
        db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            logger.exception("No se pudo revertir la transacción de carga documental.")
        try:
            cliente_r2.delete_object(Bucket=bucket, Key=clave)
        except Exception:
            logger.exception("No se pudo limpiar el objeto R2 tras fallar la transacción documental.")
        raise
    db.refresh(documento)
    proceso = solicitud.proceso
    upload_notification_body = (
        f"Hola {proceso.abogado.nombre_completo},\n\n{usuario.nombre_completo} cargó un archivo para la solicitud {solicitud.titulo}.\n\n"
        f"Documento solicitado: {selected_item['nombre']}\nArchivo recibido: {documento.nombre_archivo}\n"
        f"Proceso: {proceso.nombre}\nTipo: {documento.mime_type}\n"
        f"Fecha de carga: {format_colombia_datetime(documento.created_at)}\n\n"
        f"Abrir enlace: Revisar documentos | {user_portal_url(usuario, f'/gestion-procesos/abogado/procesos/{proceso.id}/documentos')}"
    )
    _notificar(
        db, proceso.abogado, f"Documentos recibidos: {solicitud.titulo}",
        upload_notification_body,
        "DOCUMENTOS", f"DOCUMENTO_RECIBIDO:{documento.id}", emisor=usuario,
        plantilla_clave="DOCUMENTO_RECIBIDO",
        variables={"nombre": proceso.abogado.nombre_completo, "actor": usuario.nombre_completo,
                   "proceso": proceso.nombre, "documento": selected_item["nombre"],
                   "archivo": documento.nombre_archivo,
                   "solicitud": solicitud.titulo, "tipo": documento.mime_type,
                   "fecha": format_colombia_datetime(documento.created_at)},
        enlace_texto="Revisar documentos",
        enlace_url=user_portal_url(usuario, f"/gestion-procesos/abogado/procesos/{proceso.id}/documentos"),
    )
    return {"id": documento.id, "nombre_archivo": documento.nombre_archivo, "solicitud_item_id": selected_item["id"], "estado_revision": documento.estado_revision}
