"""Inventario global de recursos (procesos, documentos, tareas...) y solicitudes documentales."""

import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from app import models, schemas, storage
from app.audit import registrar_evento_auditoria
from app.database import get_db
from app.document_validation import (
    ALLOWED_DOCUMENT_TYPES,
    MAX_DOCUMENT_BYTES,
    document_content_matches_type,
)
from app.radicados import (
    ambito_radicado_usuario,
    iniciar_consulta_nuevo_radicado,
    normalizar_numero_radicado,
    obtener_o_vincular_radicado,
    radicado_vinculado_a_usuario,
)
from app.routers.admin.comun import (
    _filtrar_radicados_por_sector,
    _owner_admin,
    _query_inventario_admin,
    _recurso_admin_por_id,
    _roles_para_sector,
    verificar_admin,
)
from app.timezone import utc_ahora

router = APIRouter(prefix="/api/admin", tags=["Administración"])


INVENTARIO_LIMITE_MAXIMO = 5000


def _ultima_actuacion(radicado: models.Radicado) -> models.Actuacion | None:
    # La Rama Judicial lista primero lo más reciente: orden 1 es la última actuación.
    return min(radicado.actuaciones, key=lambda item: (item.orden, -item.id), default=None)


def _inventario_procesos(db: Session, roles, archivados: bool, limite: int) -> list[dict]:
    procesos = (
        db.query(models.Proceso)
        .join(models.Usuario, models.Usuario.id == models.Proceso.abogado_id)
        .filter(models.Usuario.rol.in_(roles))
        .filter(models.Proceso.archivado_en.is_not(None) if archivados else models.Proceso.archivado_en.is_(None))
        .options(
            selectinload(models.Proceso.abogado),
            selectinload(models.Proceso.tareas),
            selectinload(models.Proceso.documentos),
            selectinload(models.Proceso.solicitudes_documento),
            selectinload(models.Proceso.clientes).selectinload(models.ProcesoCliente.cliente),
            selectinload(models.Proceso.radicados).selectinload(models.ProcesoRadicado.radicado),
            selectinload(models.Proceso.colaboradores).selectinload(models.ProcesoColaborador.abogado),
        )
        .order_by(models.Proceso.created_at.desc())
        .limit(limite)
        .all()
    )
    ids = [proceso.id for proceso in procesos]
    if not ids:
        return []

    # Consultas agregadas en bloque: antes se ejecutaban cuatro por proceso.
    consultas_por_proceso: dict[int, list] = defaultdict(list)
    errores_por_proceso: dict[int, int] = defaultdict(int)
    for proceso_id, fecha, estado in (
        db.query(
            models.ProcesoRadicado.proceso_id,
            func.coalesce(models.ConsultaRadicado.finalizacion, models.ConsultaRadicado.inicio),
            models.ConsultaRadicado.estado,
        )
        .join(models.ConsultaRadicado, models.ConsultaRadicado.radicado_id == models.ProcesoRadicado.radicado_id)
        .filter(models.ProcesoRadicado.proceso_id.in_(ids))
        .all()
    ):
        if fecha:
            consultas_por_proceso[proceso_id].append(fecha)
        if estado == "ERROR":
            errores_por_proceso[proceso_id] += 1
    auditoria_por_proceso: dict[int, list] = defaultdict(list)
    for recurso_id, fecha in db.query(models.EventoAuditoria.recurso_id, models.EventoAuditoria.created_at).filter(
        models.EventoAuditoria.tipo_recurso == "proceso",
        models.EventoAuditoria.recurso_id.in_([str(item) for item in ids]),
        ~models.EventoAuditoria.accion.endswith(".crear"),
    ).all():
        if fecha and str(recurso_id).isdigit():
            auditoria_por_proceso[int(recurso_id)].append(fecha)

    ahora = datetime.now(timezone.utc).replace(tzinfo=None)
    resultado = []
    for proceso in procesos:
        actividad = [tarea.updated_at for tarea in proceso.tareas if tarea.updated_at]
        actividad.extend(documento.created_at for documento in proceso.documentos if documento.created_at)
        actividad.extend(consultas_por_proceso[proceso.id])
        actividad.extend(auditoria_por_proceso[proceso.id])
        tareas_activas = [
            tarea for tarea in proceso.tareas
            if tarea.estado in (models.EstadoTarea.PENDIENTE, models.EstadoTarea.EN_CURSO)
        ]
        tareas_vencidas = [tarea for tarea in tareas_activas if tarea.fecha_limite and tarea.fecha_limite < ahora]
        documentos_pendientes = sum(1 for solicitud in proceso.solicitudes_documento if solicitud.atendida_en is None)
        errores_consulta = errores_por_proceso[proceso.id]
        responsable_activo = bool(proceso.abogado and proceso.abogado.estado == models.EstadoUsuario.ACTIVO)
        sin_actividad = not actividad
        if proceso.archivado_en is not None:
            salud = "ARCHIVADO"
        elif tareas_vencidas or errores_consulta or not responsable_activo:
            salud = "RIESGO"
        elif sin_actividad or documentos_pendientes:
            salud = "ATENCION"
        else:
            salud = "NORMAL"
        senales = []
        if sin_actividad:
            senales.append("Sin actividad")
        if tareas_vencidas:
            senales.append(f"{len(tareas_vencidas)} tarea(s) vencida(s)")
        if documentos_pendientes:
            senales.append(f"{documentos_pendientes} documento(s) pendiente(s)")
        if errores_consulta:
            senales.append(f"{errores_consulta} consulta(s) con error")
        if not responsable_activo:
            senales.append("Sin responsable activo")
        clientes = [enlace.cliente for enlace in proceso.clientes if enlace.cliente]
        resultado.append({
            "id": proceso.id,
            "owner_id": proceso.abogado_id,
            "owner_rol": proceso.abogado.rol.value,
            "nombre": proceso.nombre,
            "descripcion": proceso.descripcion,
            "archivado_en": proceso.archivado_en,
            "abogado": proceso.abogado.nombre_completo,
            "colaboradores": [enlace.abogado.nombre_completo for enlace in proceso.colaboradores if enlace.abogado],
            "radicados": len(proceso.radicados),
            "radicados_numeros": [enlace.radicado.numero for enlace in proceso.radicados if enlace.radicado],
            "clientes": len(clientes),
            "cliente": clientes[0].nombre_completo if clientes else None,
            "clientes_nombres": [cliente.nombre_completo for cliente in clientes],
            "ultima_actividad": max(actividad).isoformat() if actividad else None,
            "salud": salud,
            "senales_salud": senales,
            "tareas_activas": len(tareas_activas),
            "tareas_vencidas": len(tareas_vencidas),
            "documentos_pendientes": documentos_pendientes,
            "consultas_con_error": errores_consulta,
            "sin_responsable": not responsable_activo,
            "sin_actividad": sin_actividad,
            "created_at": proceso.created_at,
        })
    return resultado


@router.get("/inventario/{recurso}")
def listar_inventario_global(
    recurso: str,
    sector: str = "GLOBAL",
    archivados: bool = False,
    limite: int = INVENTARIO_LIMITE_MAXIMO,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    """Read an inventory in one explicit platform, firm, or SaaS scope.

    Devuelve el inventario completo (hasta ``INVENTARIO_LIMITE_MAXIMO``) para
    que la consola busque, ordene y pagine sobre todos los registros; antes se
    cortaba en los 100 más recientes.
    """
    limite = min(max(limite, 1), INVENTARIO_LIMITE_MAXIMO)
    roles_por_sector = {
        "FIRMA": (models.RolUsuario.ABOGADO_ADMIN, models.RolUsuario.ADMIN),
        "SAAS": (models.RolUsuario.ABOGADO,),
        "GLOBAL": (models.RolUsuario.ABOGADO_ADMIN, models.RolUsuario.ADMIN, models.RolUsuario.ABOGADO),
    }
    if sector not in roles_por_sector:
        raise HTTPException(status_code=400, detail="Selecciona un ámbito válido: FIRMA, SAAS o GLOBAL.")
    roles = roles_por_sector[sector]
    if recurso == "procesos":
        return _inventario_procesos(db, roles, archivados, limite)
    if recurso == "radicados":
        query = _filtrar_radicados_por_sector(db.query(models.Radicado), sector).options(
            selectinload(models.Radicado.creador),
            selectinload(models.Radicado.actuaciones),
            selectinload(models.Radicado.procesos).selectinload(models.ProcesoRadicado.proceso),
        )
        resultado = []
        for r in query.order_by(models.Radicado.created_at.desc()).limit(limite).all():
            ultima = _ultima_actuacion(r)
            procesos = [enlace.proceso for enlace in r.procesos if enlace.proceso]
            resultado.append({
                "id": r.id, "owner_id": r.creado_por_id, "numero": r.numero,
                "abogado": r.creador.nombre_completo, "estado_consulta": r.estado_consulta,
                "actuaciones": len(r.actuaciones), "consultado_en": r.consultado_en,
                "despacho": r.despacho_departamento, "demandante": r.demandante, "demandado": r.demandado,
                "procesos": [proceso.nombre for proceso in procesos],
                "proceso_ids": [proceso.id for proceso in procesos],
                "ultima_actuacion": ultima.actuacion if ultima else None,
                "ultima_actuacion_fecha": ultima.fecha_actuacion if ultima else None,
                "created_at": r.created_at,
            })
        return resultado
    if recurso == "tareas":
        query = (
            db.query(models.Tarea)
            .join(models.Usuario, models.Usuario.id == models.Tarea.usuario_id)
            .filter(models.Usuario.rol.in_(roles))
            .filter(or_(models.Tarea.proceso_id.is_(None), models.Tarea.proceso.has(models.Proceso.archivado_en.is_(None))))
            .options(
                selectinload(models.Tarea.usuario),
                selectinload(models.Tarea.cliente_asignado),
                selectinload(models.Tarea.proceso),
                selectinload(models.Tarea.radicado),
                selectinload(models.Tarea.subtareas),
            )
        )
        return [{
            "id": t.id, "owner_id": t.usuario_id, "titulo": t.titulo, "descripcion": t.descripcion,
            "estado": t.estado.value, "prioridad": t.prioridad.value, "abogado": t.usuario.nombre_completo,
            "cliente": t.cliente_asignado.nombre_completo if t.cliente_asignado else None, "cliente_id": t.cliente_id,
            "proceso": t.proceso.nombre if t.proceso else None, "proceso_id": t.proceso_id,
            "radicado_id": t.radicado_id, "radicado": t.radicado.numero if t.radicado else None,
            "subtareas": len(t.subtareas), "subtareas_completadas": sum(1 for item in t.subtareas if item.completada),
            "fecha_limite": t.fecha_limite, "completada_en": t.completada_en,
            "created_at": t.created_at, "updated_at": t.updated_at,
        } for t in query.order_by(models.Tarea.created_at.desc()).limit(limite).all()]
    if recurso == "documentos":
        query = _query_inventario_admin(db, recurso, sector).filter(or_(
            models.DocumentoProceso.proceso_id.is_(None),
            models.Proceso.archivado_en.is_(None),
        )).options(
            selectinload(models.DocumentoProceso.proceso),
            selectinload(models.DocumentoProceso.cliente),
        )
        return [{"id": d.id, "owner_id": d.proceso.abogado_id if d.proceso else None, "nombre_archivo": d.nombre_archivo, "mime_type": d.mime_type, "proceso": d.proceso.nombre if d.proceso else "Sin proceso asociado", "proceso_id": d.proceso_id, "cliente": d.cliente.nombre_completo if d.cliente else "Usuario eliminado", "cliente_id": d.cliente_id, "solicitud_id": d.solicitud_id, "contrato_id": d.contrato_id, "estado_revision": d.estado_revision, "comentario_revision": d.comentario_revision, "revisado_en": d.revisado_en, "created_at": d.created_at} for d in query.order_by(models.DocumentoProceso.created_at.desc()).limit(limite).all()]
    raise HTTPException(status_code=404, detail="Inventario no disponible.")


@router.post("/inventario/{recurso}", status_code=status.HTTP_201_CREATED)
def crear_recurso_admin(
    recurso: str,
    datos: schemas.AdminResourceCreate,
    sector: str,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    owner = _owner_admin(db, datos.owner_id, sector)
    radicado_vinculado_previamente = False
    if recurso == "procesos":
        if not datos.nombre or not datos.nombre.strip():
            raise HTTPException(status_code=400, detail="El nombre del proceso es obligatorio.")
        item = models.Proceso(abogado_id=owner.id, nombre=datos.nombre.strip(), descripcion=datos.descripcion)
        action = "crear_proceso"
    elif recurso == "radicados":
        radicado_vinculado_previamente = radicado_vinculado_a_usuario(
            db,
            owner,
            datos.numero or "",
        )
        try:
            item, created = obtener_o_vincular_radicado(db, owner, datos.numero or "")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        action = "crear_radicado" if created else "vincular_radicado"
    elif recurso == "tareas":
        title = (datos.titulo or "").strip()
        if not title:
            raise HTTPException(status_code=400, detail="El título de la tarea es obligatorio.")
        process = None
        if datos.proceso_id is not None:
            process = db.query(models.Proceso).filter(
                models.Proceso.id == datos.proceso_id,
                models.Proceso.abogado_id == owner.id,
                models.Proceso.archivado_en.is_(None),
            ).first()
            if not process:
                raise HTTPException(status_code=400, detail="El proceso no pertenece al responsable seleccionado.")
        radicado = None
        if datos.radicado_id is not None:
            radicado = db.query(models.Radicado).filter(
                models.Radicado.id == datos.radicado_id,
                models.Radicado.ambito_key == ambito_radicado_usuario(owner),
            ).first()
            if not radicado:
                raise HTTPException(status_code=400, detail="El radicado no pertenece al responsable seleccionado.")
        if process and radicado and not db.query(models.ProcesoRadicado).filter_by(
            proceso_id=process.id, radicado_id=radicado.id
        ).first():
            raise HTTPException(status_code=400, detail="El radicado no está asociado al proceso.")
        if datos.cliente_id is not None:
            client = db.query(models.Usuario).filter(
                models.Usuario.id == datos.cliente_id,
                models.Usuario.rol == models.RolUsuario.CLIENTE,
            ).first()
            assigned = process and db.query(models.ProcesoCliente).filter_by(
                proceso_id=process.id, cliente_id=datos.cliente_id
            ).first()
            if not client or (client.creado_por_abogado_id != owner.id and not assigned):
                raise HTTPException(status_code=400, detail="El cliente no pertenece al responsable ni está asignado al proceso.")
        item = models.Tarea(
            usuario_id=owner.id,
            titulo=title,
            descripcion=datos.descripcion,
            estado=datos.estado or models.EstadoTarea.PENDIENTE,
            prioridad=datos.prioridad or models.PrioridadTarea.MEDIA,
            fecha_limite=datos.fecha_limite,
            proceso_id=process.id if process else None,
            radicado_id=radicado.id if radicado else None,
            actuacion_id=datos.actuacion_id,
            cliente_id=datos.cliente_id,
        )
        action = "crear_tarea"
    else:
        raise HTTPException(status_code=405, detail="La creación de documentos requiere una carga autenticada.")

    db.add(item)
    db.flush()
    registrar_evento_auditoria(db, admin, f"admin.inventario.{sector.lower()}.{action}", recurso, item.id)
    db.commit()
    db.refresh(item)
    mensaje = "Registro creado."
    consulta_id = None
    if recurso == "radicados" and (created or not radicado_vinculado_previamente):
        mensaje, consulta_id = iniciar_consulta_nuevo_radicado(db, owner, item)
    return {
        "id": item.id,
        "mensaje": mensaje,
        "sector": sector.upper(),
        "consulta_id": consulta_id,
    }


@router.post("/inventario/documentos/cargar", status_code=status.HTTP_201_CREATED)
def cargar_documento_admin(
    sector: str = Form(...),
    owner_id: int = Form(...),
    proceso_id: int = Form(...),
    cliente_id: int = Form(...),
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    owner = _owner_admin(db, owner_id, sector)
    process = db.query(models.Proceso).filter(
        models.Proceso.id == proceso_id,
        models.Proceso.abogado_id == owner.id,
        models.Proceso.archivado_en.is_(None),
    ).first()
    if not process:
        raise HTTPException(status_code=400, detail="El proceso no pertenece al responsable seleccionado.")
    client = db.query(models.Usuario).filter(
        models.Usuario.id == cliente_id,
        models.Usuario.rol == models.RolUsuario.CLIENTE,
    ).first()
    assigned = db.query(models.ProcesoCliente).filter_by(
        proceso_id=process.id,
        cliente_id=cliente_id,
    ).first()
    if not client or (client.creado_por_abogado_id != owner.id and not assigned):
        raise HTTPException(status_code=400, detail="El cliente no pertenece al responsable ni está asignado al proceso.")
    if archivo.content_type not in ALLOWED_DOCUMENT_TYPES:
        raise HTTPException(status_code=400, detail="Tipo de documento no permitido.")
    content = archivo.file.read(MAX_DOCUMENT_BYTES + 1)
    if not content or len(content) > MAX_DOCUMENT_BYTES:
        raise HTTPException(status_code=400, detail="El archivo debe pesar máximo 15 MB.")
    if not document_content_matches_type(archivo.content_type, content):
        raise HTTPException(status_code=400, detail="El contenido del archivo no coincide con su tipo.")

    filename = os.path.basename(archivo.filename or "documento").strip()[:255] or "documento"
    extension = {
        "application/pdf": ".pdf",
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    }[archivo.content_type]
    key = f"procesos/{process.id}/clientes/{client.id}/{uuid4().hex}{extension}"
    solicitud = models.SolicitudDocumento(
        proceso_id=process.id,
        cliente_id=client.id,
        titulo=f"Carga administrativa: {filename}"[:255],
        instrucciones="Documento asociado por administración.",
        atendida_en=utc_ahora(),
    )
    db.add(solicitud)
    db.flush()
    try:
        storage.get_r2_client().put_object(
            Bucket=storage.get_r2_bucket(),
            Key=key,
            Body=content,
            ContentType=archivo.content_type,
        )
    except (BotoCoreError, ClientError, RuntimeError) as exc:
        db.rollback()
        raise HTTPException(status_code=502, detail="No fue posible guardar el documento.") from exc
    document = models.DocumentoProceso(
        proceso_id=process.id,
        cliente_id=client.id,
        solicitud_id=solicitud.id,
        nombre_archivo=filename,
        ruta_archivo=key,
        mime_type=archivo.content_type,
    )
    db.add(document)
    db.flush()
    registrar_evento_auditoria(
        db,
        admin,
        f"admin.inventario.{sector.lower()}.crear_documento",
        "documento",
        document.id,
    )
    db.commit()
    db.refresh(document)
    return {"id": document.id, "mensaje": "Documento cargado.", "sector": sector.upper()}


@router.patch("/inventario/{recurso}/{item_id}")
def actualizar_recurso_admin(
    recurso: str,
    item_id: int,
    datos: schemas.AdminResourceUpdate,
    sector: str,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    item = _recurso_admin_por_id(db, recurso, item_id, sector)
    if not item:
        raise HTTPException(status_code=404, detail="Registro no encontrado en el ámbito seleccionado.")
    values = datos.model_dump(exclude_unset=True)
    if recurso == "procesos":
        if "owner_id" in values:
            owner = _owner_admin(db, values["owner_id"], sector)
            if owner.rol != item.abogado.rol:
                raise HTTPException(status_code=400, detail="La reasignación debe conservar el sector y tipo de responsable del proceso.")
            item.abogado_id = owner.id
            db.query(models.ProcesoColaborador).filter_by(
                proceso_id=item.id, abogado_id=owner.id
            ).delete(synchronize_session=False)
        if "nombre" in values:
            if not values["nombre"] or not values["nombre"].strip():
                raise HTTPException(status_code=400, detail="El nombre del proceso es obligatorio.")
            item.nombre = values["nombre"].strip()
        if "descripcion" in values:
            item.descripcion = values["descripcion"]
    elif recurso == "radicados":
        if "numero" in values:
            numero = normalizar_numero_radicado(values["numero"] or "")
            if len(numero) != 23:
                raise HTTPException(status_code=400, detail="El radicado debe tener exactamente 23 dígitos.")
            duplicate = db.query(models.Radicado).filter(
                models.Radicado.fuente == item.fuente,
                models.Radicado.ambito_key == item.ambito_key,
                models.Radicado.numero_normalizado == numero,
                models.Radicado.id != item.id,
            ).first()
            if duplicate:
                raise HTTPException(status_code=409, detail="Ya existe una ficha de este radicado en el ámbito seleccionado; vincula esa ficha en lugar de duplicarla.")
            item.numero = numero
            item.numero_normalizado = numero
    elif recurso == "tareas":
        if "titulo" in values:
            if not values["titulo"] or not values["titulo"].strip():
                raise HTTPException(status_code=400, detail="El título de la tarea es obligatorio.")
            item.titulo = values["titulo"].strip()
        if "descripcion" in values: item.descripcion = values["descripcion"]
        if "estado" in values: item.estado = values["estado"]
        if "prioridad" in values: item.prioridad = values["prioridad"]
        if "fecha_limite" in values: item.fecha_limite = values["fecha_limite"]
    elif recurso == "documentos":
        if "nombre_archivo" in values:
            if not values["nombre_archivo"] or not values["nombre_archivo"].strip():
                raise HTTPException(status_code=400, detail="El nombre del archivo es obligatorio.")
            item.nombre_archivo = values["nombre_archivo"].strip()
        if "estado_revision" in values:
            item.estado_revision = values["estado_revision"]
            item.revisado_por_id = admin.id
            item.revisado_en = utc_ahora()
            if item.solicitud:
                required_items = item.solicitud.documentos_requeridos or [{"id": "legacy", "nombre": item.solicitud.titulo}]
                latest_by_item = {}
                for uploaded in sorted(item.solicitud.documentos, key=lambda row: (row.created_at, row.id)):
                    item_id = uploaded.solicitud_item_id or (required_items[0].get("id", "legacy") if len(required_items) == 1 else None)
                    if item_id:
                        latest_by_item[item_id] = uploaded
                item.solicitud.atendida_en = utc_ahora() if all(
                    str(required.get("id", "legacy")) in latest_by_item
                    and latest_by_item[str(required.get("id", "legacy"))].estado_revision != "REQUIERE_CORRECCION"
                    for required in required_items
                ) else None
        if "comentario_revision" in values:
            item.comentario_revision = values["comentario_revision"]
    else:
        raise HTTPException(status_code=404, detail="Recurso no disponible.")

    registrar_evento_auditoria(db, admin, f"admin.inventario.{sector.lower()}.actualizar", recurso, item.id)
    db.commit()
    db.refresh(item)
    return {"id": item.id, "mensaje": "Registro actualizado.", "sector": sector.upper()}


@router.post("/inventario/documentos/{item_id}/url-temporal")
def emitir_url_temporal_documento_admin(
    item_id: int,
    sector: str,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    documento = _recurso_admin_por_id(db, "documentos", item_id, sector)
    if not documento:
        raise HTTPException(
            status_code=404,
            detail="Documento no encontrado en el ámbito seleccionado.",
        )
    expires_in = 15 * 60
    client = storage.get_r2_client()
    bucket = storage.get_r2_bucket()
    try:
        client.head_object(Bucket=bucket, Key=documento.ruta_archivo)
        url = client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": documento.ruta_archivo},
            ExpiresIn=expires_in,
        )
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code")
        if error_code in {"NoSuchKey", "NotFound", "404"}:
            raise HTTPException(status_code=404, detail="El archivo ya no existe en R2.") from exc
        raise HTTPException(status_code=502, detail="No fue posible generar el enlace temporal.") from exc
    except (BotoCoreError, RuntimeError) as exc:
        raise HTTPException(status_code=502, detail="No fue posible generar el enlace temporal.") from exc

    expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    registrar_evento_auditoria(
        db,
        admin,
        f"admin.inventario.{sector.lower()}.emitir_url_temporal",
        "documento",
        documento.id,
    )
    db.commit()
    return {
        "url": url,
        "expires_at": expires_at.isoformat(),
        "expires_in": expires_in,
        "nombre_archivo": documento.nombre_archivo,
    }


@router.delete("/inventario/{recurso}/{item_id}")
def eliminar_recurso_admin(
    recurso: str,
    item_id: int,
    sector: str,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    item = _recurso_admin_por_id(db, recurso, item_id, sector)
    if not item:
        raise HTTPException(status_code=404, detail="Registro no encontrado en el ámbito seleccionado.")
    if recurso == "procesos":
        if item.archivado_en is not None:
            raise HTTPException(status_code=409, detail="El proceso ya está archivado.")
        item.archivado_en = datetime.now(timezone.utc)
        action = "archivar"
    elif recurso == "radicados":
        db.delete(item)
        action = "eliminar"
    elif recurso == "tareas":
        db.delete(item)
        action = "eliminar"
    elif recurso == "documentos":
        try:
            storage.get_r2_client().delete_object(Bucket=storage.get_r2_bucket(), Key=item.ruta_archivo)
        except (BotoCoreError, ClientError, RuntimeError) as exc:
            raise HTTPException(status_code=502, detail="No fue posible eliminar el archivo de almacenamiento.") from exc
        db.delete(item)
        action = "eliminar"
    else:
        raise HTTPException(status_code=404, detail="Recurso no disponible.")

    registrar_evento_auditoria(db, admin, f"admin.inventario.{sector.lower()}.{action}", recurso, item_id)
    db.commit()
    return {"mensaje": "Proceso archivado." if recurso == "procesos" else "Registro eliminado."}


@router.patch("/inventario/procesos/{item_id}/restaurar")
def restaurar_proceso_admin(
    item_id: int,
    sector: str,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    proceso = _recurso_admin_por_id(db, "procesos", item_id, sector)
    if not proceso:
        raise HTTPException(status_code=404, detail="Proceso no encontrado en el ámbito seleccionado.")
    if proceso.archivado_en is None:
        raise HTTPException(status_code=409, detail="El proceso ya está activo.")
    proceso.archivado_en = None
    registrar_evento_auditoria(db, admin, f"admin.inventario.{sector.lower()}.restaurar", "proceso", proceso.id)
    db.commit()
    return {"mensaje": "Proceso restaurado."}


@router.get("/documentos/solicitudes")
def listar_solicitudes_documento_admin(
    sector: str = "FIRMA",
    limite: int = Query(default=500, ge=1, le=1000),
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    roles = _roles_para_sector(sector)
    solicitudes = (
        db.query(models.SolicitudDocumento)
        .join(models.Proceso, models.Proceso.id == models.SolicitudDocumento.proceso_id)
        .join(models.Usuario, models.Usuario.id == models.Proceso.abogado_id)
        .filter(models.Usuario.rol.in_(roles), models.Proceso.archivado_en.is_(None))
        .order_by(models.SolicitudDocumento.created_at.desc())
        .limit(limite)
        .all()
    )
    resultado = []
    for solicitud in solicitudes:
        documento = solicitud.documentos[-1] if solicitud.documentos else None
        required_items = solicitud.documentos_requeridos or [{"id": "legacy", "nombre": solicitud.titulo}]
        current_by_item = {}
        for uploaded in sorted(solicitud.documentos, key=lambda item: (item.created_at, item.id)):
            item_id = uploaded.solicitud_item_id or (required_items[0].get("id", "legacy") if len(required_items) == 1 else None)
            if item_id:
                current_by_item[item_id] = uploaded
        requested_items = [{
            "id": str(item.get("id", "legacy")),
            "nombre": str(item.get("nombre", solicitud.titulo)),
            "estado": current_by_item[str(item.get("id", "legacy"))].estado_revision if str(item.get("id", "legacy")) in current_by_item else "FALTANTE",
            "archivo": current_by_item[str(item.get("id", "legacy"))].nombre_archivo if str(item.get("id", "legacy")) in current_by_item else None,
            "comentario": current_by_item[str(item.get("id", "legacy"))].comentario_revision if str(item.get("id", "legacy")) in current_by_item else None,
            "documento_id": current_by_item[str(item.get("id", "legacy"))].id if str(item.get("id", "legacy")) in current_by_item else None,
        } for item in required_items]
        item_states = [item["estado"] for item in requested_items]
        if "FALTANTE" in item_states:
            estado = "FALTAN_DOCUMENTOS"
        elif any(state in {"REQUIERE_CORRECCION", "RECHAZADO"} for state in item_states):
            estado = "RECHAZADO"
        elif "EN_REVISION" in item_states:
            estado = "EN_REVISION"
        elif item_states and all(state == "APROBADO" for state in item_states):
            estado = "APROBADO"
        else:
            estado = "DOCUMENTOS_SUMINISTRADOS"
        vencida = bool(solicitud.fecha_limite and solicitud.fecha_limite < utc_ahora() and estado == "FALTAN_DOCUMENTOS")
        if vencida:
            estado = "VENCIDO"
        resultado.append({
            "id": solicitud.id,
            "titulo": solicitud.titulo,
            "proceso": solicitud.proceso.nombre,
            "proceso_id": solicitud.proceso_id,
            "cliente": solicitud.cliente.nombre_completo,
            "cliente_id": solicitud.cliente_id,
            "estado": estado,
            "documento": documento.nombre_archivo if documento else None,
            "documento_id": documento.id if documento else None,
            "documentos_requeridos": requested_items,
            "solicitado_en": solicitud.created_at,
            "fecha_limite": solicitud.fecha_limite,
            "atendida_en": solicitud.atendida_en,
        })
    return resultado
