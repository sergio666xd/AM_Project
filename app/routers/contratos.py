"""Contract preparation, signature upload and client delivery."""

import hashlib
import json
import logging
import os
import re
import uuid
from io import BytesIO
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime
from pathlib import Path

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from app import models, schemas, security, storage
from app.audit import registrar_evento_auditoria
from app.database import get_db
from app.document_validation import MAX_DOCUMENT_BYTES, document_content_matches_type
from app.email_service import enviar_correo
from app.contract_pdf import (
    DEFAULT_ATTORNEY_PROFILE,
    FIELD_LABELS,
    default_contract_fields,
    render_contract_pdf,
    validate_contract_fields,
)
from app.firm_access import lawyer_process_ids, require_process_manager, require_roles
from app.workflow_service import public_site_url
from app.message_templates import render_direct_message

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/contratos", tags=["Contratos"])
SIGNED_TYPES = {"application/pdf"}
_DOCX_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _require_contract_staff(actor: models.Usuario) -> None:
    require_roles(actor, {"ADMIN", "ABOGADO_ADMIN"}, action="gestionar contratos")


def _process(db: Session, process_id: int, actor: models.Usuario) -> models.Proceso:
    _require_contract_staff(actor)
    query = db.query(models.Proceso).filter(models.Proceso.id == process_id)
    if actor.rol != models.RolUsuario.ADMIN:
        query = query.filter(models.Proceso.id.in_(lawyer_process_ids(db, actor, include_archived=True)))
    process = query.first()
    if not process:
        raise HTTPException(status_code=404, detail="Expediente no encontrado.")
    require_process_manager(actor, process.abogado_id, action="gestionar los contratos de este expediente")
    return process


def _contract(db: Session, contract_id: int, actor: models.Usuario, *, editable: bool = False) -> models.ContratoServicio:
    _require_contract_staff(actor)
    contract = db.query(models.ContratoServicio).filter_by(id=contract_id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contrato no encontrado.")
    _process(db, contract.proceso_id, actor)
    if editable and contract.proceso.archivado_en is not None:
        raise HTTPException(status_code=409, detail="No se pueden modificar contratos de un expediente archivado.")
    return contract


def _snapshot(cliente: models.Usuario) -> dict:
    return {"id": cliente.id, "nombre": cliente.nombre_completo, "email": cliente.email}


def _add_version(db: Session, contract: models.ContratoServicio, actor: models.Usuario, *, state: str, snapshot: dict | None = None):
    number = contract.version_actual
    if contract.versiones:
        number = max(number, max(version.version for version in contract.versiones) + 1)
    contract.version_actual = number
    content = json.dumps(contract.campos_actual or {}, ensure_ascii=False, sort_keys=True)
    version = models.ContratoServicioVersion(
        contrato_id=contract.id,
        version=number,
        estado=state,
        contenido=content,
        campos=contract.campos_actual or {},
        parte_cliente_snapshot=snapshot or contract.parte_cliente_snapshot or {},
        hash_sha256=hashlib.sha256(content.encode("utf-8")).hexdigest(),
        creado_por_id=actor.id,
    )
    db.add(version)
    return version


def _signed_document(db: Session, contract_id: int):
    return db.query(models.DocumentoProceso).filter_by(contrato_id=contract_id).order_by(
        models.DocumentoProceso.created_at.desc(), models.DocumentoProceso.id.desc(),
    ).first()


def _serialize(contract: models.ContratoServicio, db: Session, *, include_content: bool = True) -> dict:
    signed = _signed_document(db, contract.id)
    result = {
        "id": contract.id,
        "proceso_id": contract.proceso_id,
        "proceso": contract.proceso.nombre if contract.proceso else "Expediente",
        "cliente_id": contract.cliente_id,
        "cliente": contract.cliente.nombre_completo if contract.cliente else contract.parte_cliente_snapshot.get("nombre", "Cliente"),
        "cliente_email": contract.cliente.email if contract.cliente else contract.parte_cliente_snapshot.get("email", ""),
        "abogado_id": contract.abogado_id,
        "estado": contract.estado,
        "version_actual": contract.version_actual,
        "emitido_en": contract.emitido_en,
        "firmado_en": contract.firmado_en,
        "terminado_en": contract.terminado_en,
        "motivo_terminacion": contract.motivo_terminacion,
        "anulado_en": contract.anulado_en,
        "motivo_anulacion": contract.motivo_anulacion,
        "documento_firmado": ({
            "id": signed.id,
            "nombre_archivo": signed.nombre_archivo,
            "mime_type": signed.mime_type,
            "created_at": signed.created_at,
        } if signed else None),
        "created_at": contract.created_at,
        "updated_at": contract.updated_at,
        "versiones": [{
            "version": item.version,
            "estado": item.estado,
            "hash_sha256": item.hash_sha256,
            "created_at": item.created_at,
        } for item in contract.versiones],
    }
    if include_content:
        result["campos"] = _validated_fields(contract.campos_actual or {})
    return result


def _extract_docx_text() -> str:
    path = Path(__file__).resolve().parents[2] / "CPS.docx"
    if not path.is_file():
        raise HTTPException(status_code=503, detail="La plantilla CPS.docx no está disponible en el servidor.")
    try:
        with zipfile.ZipFile(path) as archive:
            root = ET.fromstring(archive.read("word/document.xml"))
        paragraphs: list[str] = []
        for paragraph in root.iter(f"{_DOCX_NS}p"):
            chunks: list[str] = []
            for child in paragraph.iter():
                if child.tag == f"{_DOCX_NS}t":
                    chunks.append(child.text or "")
                elif child.tag == f"{_DOCX_NS}tab":
                    chunks.append("\t")
                elif child.tag == f"{_DOCX_NS}br":
                    chunks.append("\n")
            paragraphs.append("".join(chunks))
        return "\n\n".join(paragraphs).strip()
    except (OSError, KeyError, zipfile.BadZipFile, ET.ParseError) as exc:
        logger.exception("No se pudo leer el texto base de CPS.docx")
        raise HTTPException(status_code=500, detail="No se pudo leer el contenido base de la plantilla.") from exc


@router.get("/plantilla")
def obtener_plantilla(proceso_id: int | None = None, db: Session = Depends(get_db), actor: models.Usuario = Depends(security.obtener_usuario_actual)):
    _require_contract_staff(actor)
    config = db.query(models.ConfiguracionFirma).filter_by(id=1).first()
    parameters = config.parametros_generales if config and isinstance(config.parametros_generales, dict) else {}
    configured_profile = parameters.get("contrato_abogado")
    if not isinstance(configured_profile, dict):
        configured_profile = {}
    lawyer_profile = {**DEFAULT_ATTORNEY_PROFILE, **configured_profile}
    profile_user = _process(db, proceso_id, actor).abogado if proceso_id is not None else actor
    user_values = {
        "nombre": profile_user.nombre_completo,
        "genero": profile_user.genero,
        "documento": profile_user.numero_documento,
        "tarjeta_profesional": profile_user.tarjeta_profesional,
        "correo": profile_user.email,
        "telefono": profile_user.whatsapp_numero,
        "domicilio": profile_user.domicilio,
    }
    for key, value in user_values.items():
        if isinstance(value, str) and value.strip():
            lawyer_profile[key] = value.strip().upper() if key != "correo" else value.strip()
    return {
        "nombre": "CPS.pdf",
        "campos": FIELD_LABELS,
        "campos_iniciales": default_contract_fields(attorney_profile=lawyer_profile),
        "datos_abogado": lawyer_profile,
    }


def _validar_cliente_en_proceso(db: Session, process: models.Proceso, client_id: int) -> models.Usuario:
    client = db.query(models.Usuario).join(
        models.ProcesoCliente, models.ProcesoCliente.cliente_id == models.Usuario.id,
    ).filter(
        models.ProcesoCliente.proceso_id == process.id,
        models.Usuario.id == client_id,
        models.Usuario.rol == models.RolUsuario.CLIENTE,
    ).first()
    if not client:
        raise HTTPException(status_code=400, detail="Selecciona un cliente asociado a este expediente.")
    return client


def _validated_fields(raw: dict[str, str], *, require_complete: bool = False) -> dict[str, str]:
    try:
        return validate_contract_fields(raw, require_complete=require_complete)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _pdf_response(raw_fields: dict[str, str]):
    try:
        payload = render_contract_pdf(raw_fields)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return StreamingResponse(
        BytesIO(payload), media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="contrato-cps.pdf"', "Cache-Control": "private, no-store"},
    )


@router.get("/{contract_id}/pdf")
def generar_pdf_contrato(contract_id: int, db: Session = Depends(get_db), actor: models.Usuario = Depends(security.obtener_usuario_actual)):
    contract = _contract(db, contract_id)
    if contract.estado in {"BORRADOR", "ANULADO"}:
        raise HTTPException(status_code=409, detail="El contrato debe estar listo para firma para generar su PDF.")
    return _pdf_response(contract.campos_actual or {})


@router.post("/proceso/{proceso_id}/vista-previa")
def vista_previa_contrato(proceso_id: int, datos: schemas.ContratoVistaPrevia, db: Session = Depends(get_db), actor: models.Usuario = Depends(security.obtener_usuario_actual)):
    process = _process(db, proceso_id, actor)
    if process.archivado_en is not None:
        raise HTTPException(status_code=409, detail="No se puede generar un contrato para un expediente archivado.")
    _validar_cliente_en_proceso(db, process, datos.cliente_id)
    return _pdf_response(_validated_fields(datos.campos, require_complete=True))


@router.get("/plantilla/referencia")
def descargar_referencia_visual(actor: models.Usuario = Depends(security.obtener_usuario_actual)):
    _require_contract_staff(actor)
    path = Path(__file__).resolve().parents[2] / "CPS.pdf"
    if not path.is_file():
        raise HTTPException(status_code=503, detail="La referencia visual CPS.pdf no está disponible.")
    return FileResponse(path, media_type="application/pdf", filename="CPS.pdf", headers={"Cache-Control": "private, no-store"})


@router.get("")
def listar_contratos_despacho(db: Session = Depends(get_db), actor: models.Usuario = Depends(security.obtener_usuario_actual)):
    """Lista contratos de todos los expedientes que el usuario puede gestionar."""
    _require_contract_staff(actor)
    query = db.query(models.ContratoServicio).join(models.Proceso)
    if actor.rol != models.RolUsuario.ADMIN:
        query = query.filter(models.Proceso.id.in_(lawyer_process_ids(db, actor, include_archived=True)))
    contracts = query.order_by(models.ContratoServicio.created_at.desc(), models.ContratoServicio.id.desc()).all()
    return [{**_serialize(contract, db), "expediente_archivado": contract.proceso.archivado_en is not None} for contract in contracts]


@router.get("/proceso/{proceso_id}")
def listar_contratos_proceso(proceso_id: int, db: Session = Depends(get_db), actor: models.Usuario = Depends(security.obtener_usuario_actual)):
    process = _process(db, proceso_id, actor)
    contracts = db.query(models.ContratoServicio).filter_by(proceso_id=process.id).order_by(
        models.ContratoServicio.created_at.desc(), models.ContratoServicio.id.desc(),
    ).all()
    return [_serialize(item, db) for item in contracts]


@router.post("/proceso/{proceso_id}", status_code=status.HTTP_201_CREATED)
def crear_contrato(proceso_id: int, datos: schemas.ContratoServicioCreate, db: Session = Depends(get_db), actor: models.Usuario = Depends(security.obtener_usuario_actual)):
    process = _process(db, proceso_id, actor)
    if process.archivado_en is not None:
        raise HTTPException(status_code=409, detail="No se pueden crear contratos en un expediente archivado.")
    client = _validar_cliente_en_proceso(db, process, datos.cliente_id)
    fields = _validated_fields(datos.campos)
    snapshot = _snapshot(client)
    contract = models.ContratoServicio(
        proceso_id=process.id, cliente_id=client.id, abogado_id=process.abogado_id,
        estado="BORRADOR", version_actual=1, contenido_actual="", campos_actual=fields,
        parte_cliente_snapshot=snapshot, creado_por_id=actor.id,
    )
    db.add(contract)
    db.flush()
    _add_version(db, contract, actor, state="BORRADOR", snapshot=snapshot)
    registrar_evento_auditoria(db, actor, "contrato.crear", "contrato_servicio", contract.id, {"proceso_id": process.id, "cliente_id": client.id})
    db.commit()
    db.refresh(contract)
    return _serialize(contract, db)


@router.get("/cliente/proceso/{proceso_id}")
def listar_contratos_cliente(proceso_id: int, db: Session = Depends(get_db), client: models.Usuario = Depends(security.obtener_usuario_actual)):
    require_roles(client, {"CLIENTE"}, action="consultar los contratos de tu expediente")
    process = db.query(models.Proceso).join(
        models.ProcesoCliente, models.ProcesoCliente.proceso_id == models.Proceso.id,
    ).filter(
        models.Proceso.id == proceso_id,
        models.ProcesoCliente.cliente_id == client.id,
        models.Proceso.archivado_en.is_(None),
    ).first()
    if not process:
        raise HTTPException(status_code=404, detail="Expediente no encontrado.")
    contracts = db.query(models.ContratoServicio).filter_by(
        proceso_id=process.id, cliente_id=client.id,
    ).filter(
        models.ContratoServicio.estado.in_({"FIRMADO", "TERMINADO"}),
    ).order_by(models.ContratoServicio.firmado_en.desc()).all()
    return [_serialize(item, db, include_content=False) for item in contracts if _signed_document(db, item.id)]


@router.put("/{contract_id}")
def actualizar_contrato(contract_id: int, datos: schemas.ContratoServicioUpdate, db: Session = Depends(get_db), actor: models.Usuario = Depends(security.obtener_usuario_actual)):
    contract = _contract(db, contract_id, actor, editable=True)
    if contract.estado != "BORRADOR":
        raise HTTPException(status_code=409, detail="Solo puedes editar un contrato en borrador.")
    contract.campos_actual = _validated_fields(datos.campos)
    _add_version(db, contract, actor, state="BORRADOR")
    registrar_evento_auditoria(db, actor, "contrato.actualizar", "contrato_servicio", contract.id, {"version": contract.version_actual})
    db.commit()
    db.refresh(contract)
    return _serialize(contract, db)


@router.patch("/{contract_id}/estado")
def cambiar_estado_contrato(contract_id: int, datos: schemas.ContratoServicioEstadoUpdate, db: Session = Depends(get_db), actor: models.Usuario = Depends(security.obtener_usuario_actual)):
    contract = _contract(db, contract_id, actor, editable=True)
    transitions = {
        "BORRADOR": {"LISTO_PARA_FIRMA", "ANULADO"},
        # EN_FIRMA is reached only by scheduling the linked signature event.
        "LISTO_PARA_FIRMA": {"ANULADO"},
        "EN_FIRMA": {"ANULADO"},
        "FIRMADO": {"TERMINADO", "EN_FIRMA"},
    }
    if datos.estado not in transitions.get(contract.estado, set()):
        raise HTTPException(status_code=409, detail=f"No se permite cambiar de {contract.estado} a {datos.estado}.")
    if datos.estado == "LISTO_PARA_FIRMA":
        _validated_fields(contract.campos_actual or {}, require_complete=True)
    if contract.estado == "FIRMADO" and datos.estado == "EN_FIRMA":
        signature_events = db.query(models.EventoAgenda).filter(
            models.EventoAgenda.contrato_id == contract.id,
            models.EventoAgenda.tipo == "FIRMA_CONTRATO",
            models.EventoAgenda.estado != "CANCELADO",
        ).with_for_update().all()
        if not signature_events:
            raise HTTPException(status_code=409, detail="No hay una actividad de firma activa para reabrir este contrato.")
        for signature_event in signature_events:
            signature_event.estado = "PROGRAMADO"
        contract.firmado_en = None
    if datos.estado in {"TERMINADO", "ANULADO"} and not (datos.motivo or "").strip():
        raise HTTPException(status_code=400, detail="Indica el motivo para terminar o anular el contrato.")
    contract.estado = datos.estado
    if datos.estado == "LISTO_PARA_FIRMA":
        contract.emitido_en = datetime.utcnow()
    elif datos.estado == "TERMINADO":
        contract.terminado_en = datetime.utcnow()
        contract.motivo_terminacion = datos.motivo.strip()
    elif datos.estado == "ANULADO":
        contract.anulado_en = datetime.utcnow()
        contract.motivo_anulacion = datos.motivo.strip()
    _add_version(db, contract, actor, state=contract.estado)
    registrar_evento_auditoria(db, actor, "contrato.estado", "contrato_servicio", contract.id, {"estado": datos.estado, "motivo": datos.motivo})
    db.commit()
    db.refresh(contract)
    return _serialize(contract, db)


def _enviar_copia_firmada(db: Session, contract: models.ContratoServicio, document: models.DocumentoProceso, actor: models.Usuario) -> dict:
    client = contract.cliente
    recipient = client.email if client else contract.parte_cliente_snapshot.get("email", "")
    delivery = models.EntregaCorreoContrato(
        contrato_id=contract.id, documento_id=document.id, version=contract.version_actual,
        destinatario=recipient, estado="ERROR", creado_por_id=actor.id,
    )
    db.add(delivery)
    try:
        if not recipient:
            raise ValueError("El cliente no tiene correo registrado.")
        stored = storage.get_r2_client().get_object(Bucket=storage.get_r2_bucket(), Key=document.ruta_archivo)
        content = stored["Body"].read(MAX_DOCUMENT_BYTES + 1)
        if len(content) > MAX_DOCUMENT_BYTES:
            raise ValueError("El archivo supera el límite permitido para adjuntar al correo.")
        subject, body = render_direct_message(db, "CONTRATO_FIRMADO", {
            "nombre": contract.parte_cliente_snapshot.get("nombre", "cliente"),
            "proceso": contract.proceso.nombre,
        }, link_label="Ver expediente",
           link_url=f"{public_site_url()}/gestion-procesos/cliente/procesos/{contract.proceso_id}")
        sent = enviar_correo(
            recipient,
            subject,
            body,
            adjunto=(document.nombre_archivo, content, document.mime_type),
        )
        if not sent:
            raise RuntimeError("El servidor SMTP no está configurado para enviar el correo.")
        delivery.estado = "ENVIADO"
        delivery.error = None
    except Exception as exc:
        delivery.estado = "ERROR"
        delivery.error = str(exc)[:1000]
        logger.exception("No se pudo enviar la copia del contrato %s", contract.id)
    db.flush()
    return {"estado": delivery.estado, "destinatario": recipient, "entrega_id": delivery.id}


@router.post("/{contract_id}/firmado", status_code=status.HTTP_201_CREATED)
def cargar_contrato_firmado(contract_id: int, archivo: UploadFile = File(...), db: Session = Depends(get_db), actor: models.Usuario = Depends(security.obtener_usuario_actual)):
    contract = _contract(db, contract_id, actor, editable=True)
    reemplazo = contract.estado == "FIRMADO"
    if contract.estado not in {"EN_FIRMA", "FIRMADO"}:
        raise HTTPException(status_code=409, detail="El contrato debe estar En firma o Firmado para cargar o reemplazar el PDF.")
    signature_events = db.query(models.EventoAgenda).filter(
        models.EventoAgenda.contrato_id == contract.id,
        models.EventoAgenda.tipo == "FIRMA_CONTRATO",
        models.EventoAgenda.estado != "CANCELADO",
    ).with_for_update().all()
    if not signature_events:
        raise HTTPException(status_code=409, detail="Agenda primero la firma del contrato en los eventos del expediente.")
    mime = archivo.content_type or ""
    if mime not in SIGNED_TYPES:
        raise HTTPException(status_code=400, detail="El documento firmado debe cargarse en formato PDF.")
    content = archivo.file.read(MAX_DOCUMENT_BYTES + 1)
    if not content or len(content) > MAX_DOCUMENT_BYTES:
        raise HTTPException(status_code=400, detail="El escaneado debe pesar máximo 15 MB.")
    if not document_content_matches_type(mime, content):
        raise HTTPException(status_code=400, detail="El contenido del archivo no coincide con su tipo.")
    ext = ".pdf"
    safe_name = re.sub(r"[^\w.-]+", "_", os.path.basename(archivo.filename or f"contrato-firmado{ext}"), flags=re.UNICODE)[:180]
    key = f"procesos/{contract.proceso_id}/contratos/{contract.id}/{uuid.uuid4().hex}{ext}"
    client = storage.get_r2_client()
    bucket = storage.get_r2_bucket()
    try:
        client.put_object(Bucket=bucket, Key=key, Body=content, ContentType=mime)
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(status_code=502, detail="No fue posible guardar el escaneado firmado.") from exc
    try:
        document = models.DocumentoProceso(
            proceso_id=contract.proceso_id, cliente_id=contract.cliente_id,
            contrato_id=contract.id, nombre_archivo=safe_name, ruta_archivo=key,
            mime_type=mime, estado_revision="APROBADO",
        )
        db.add(document)
        contract.estado = "FIRMADO"
        contract.firmado_en = datetime.utcnow()
        for signature_event in signature_events:
            signature_event.estado = "COMPLETADO"
        _add_version(db, contract, actor, state="FIRMADO")
        db.flush()
        registrar_evento_auditoria(db, actor, "contrato.firmado.cargar", "contrato_servicio", contract.id, {"documento_id": document.id, "version": contract.version_actual})
        db.commit()
        db.refresh(document)
    except Exception:
        db.rollback()
        try:
            client.delete_object(Bucket=bucket, Key=key)
        except Exception:
            logger.exception("No se pudo limpiar el escaneado de R2 tras fallar la transacción.")
        raise
    delivery = _enviar_copia_firmada(db, contract, document, actor)
    registrar_evento_auditoria(db, actor, "contrato.copia_correo", "contrato_servicio", contract.id, delivery)
    db.commit()
    mensaje_archivo = "PDF firmado reemplazado." if reemplazo else "Contrato firmado cargado."
    return {"documento_id": document.id, "correo": delivery, "mensaje": mensaje_archivo + " " + ("La copia fue enviada al correo del cliente." if delivery["estado"] == "ENVIADO" else "No se pudo enviar el correo; puedes reintentar el envío desde el contrato.")}


@router.post("/{contract_id}/reenviar-copia")
def reenviar_copia_firmada(contract_id: int, db: Session = Depends(get_db), actor: models.Usuario = Depends(security.obtener_usuario_actual)):
    contract = _contract(db, contract_id, actor)
    if contract.estado != "FIRMADO":
        raise HTTPException(status_code=409, detail="Solo se puede enviar una copia de un contrato firmado.")
    document = _signed_document(db, contract.id)
    if not document:
        raise HTTPException(status_code=404, detail="No se encontró el escaneado firmado.")
    delivery = _enviar_copia_firmada(db, contract, document, actor)
    registrar_evento_auditoria(db, actor, "contrato.copia_correo.reintentar", "contrato_servicio", contract.id, delivery)
    db.commit()
    return {"correo": delivery, "mensaje": "Copia enviada." if delivery["estado"] == "ENVIADO" else "No fue posible enviar la copia; revisa la configuración del correo."}
