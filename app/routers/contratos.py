"""Contract preparation, signature upload and client delivery."""

import hashlib
import logging
import os
import re
import uuid
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime
from pathlib import Path

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app import models, schemas, security, storage
from app.audit import registrar_evento_auditoria
from app.database import get_db
from app.document_validation import MAX_DOCUMENT_BYTES, document_content_matches_type
from app.email_service import enviar_correo
from app.firm_access import lawyer_process_ids, require_process_manager, require_roles
from app.workflow_service import public_site_url

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/contratos", tags=["Contratos"])
SIGNED_TYPES = {"application/pdf", "image/jpeg", "image/png"}
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


def _add_version(db: Session, contract: models.ContratoServicio, actor: models.Usuario, *, content: str, state: str, snapshot: dict | None = None):
    number = contract.version_actual
    if contract.versiones:
        number = max(number, max(version.version for version in contract.versiones) + 1)
    contract.version_actual = number
    version = models.ContratoServicioVersion(
        contrato_id=contract.id,
        version=number,
        estado=state,
        contenido=content,
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
        result["contenido"] = contract.contenido_actual
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
def obtener_plantilla(actor: models.Usuario = Depends(security.obtener_usuario_actual)):
    _require_contract_staff(actor)
    return {"nombre": "CPS.docx", "referencia_visual": "CPS.pdf", "contenido": _extract_docx_text()}


@router.get("/plantilla/referencia")
def descargar_referencia_visual(actor: models.Usuario = Depends(security.obtener_usuario_actual)):
    _require_contract_staff(actor)
    path = Path(__file__).resolve().parents[2] / "CPS.pdf"
    if not path.is_file():
        raise HTTPException(status_code=503, detail="La referencia visual CPS.pdf no está disponible.")
    return FileResponse(path, media_type="application/pdf", filename="CPS.pdf", headers={"Cache-Control": "private, no-store"})


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
    client = db.query(models.Usuario).join(
        models.ProcesoCliente, models.ProcesoCliente.cliente_id == models.Usuario.id,
    ).filter(
        models.ProcesoCliente.proceso_id == process.id,
        models.Usuario.id == datos.cliente_id,
        models.Usuario.rol == models.RolUsuario.CLIENTE,
    ).first()
    if not client:
        raise HTTPException(status_code=400, detail="Selecciona un cliente asociado a este expediente.")
    content = datos.contenido.strip() or _extract_docx_text()
    snapshot = _snapshot(client)
    contract = models.ContratoServicio(
        proceso_id=process.id, cliente_id=client.id, abogado_id=process.abogado_id,
        estado="BORRADOR", version_actual=1, contenido_actual=content,
        parte_cliente_snapshot=snapshot, creado_por_id=actor.id,
    )
    db.add(contract)
    db.flush()
    _add_version(db, contract, actor, content=content, state="BORRADOR", snapshot=snapshot)
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
    content = datos.contenido.strip()
    if not content:
        raise HTTPException(status_code=400, detail="El contenido del contrato no puede quedar vacío.")
    contract.contenido_actual = content
    _add_version(db, contract, actor, content=content, state="BORRADOR")
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
        "FIRMADO": {"TERMINADO"},
    }
    if datos.estado not in transitions.get(contract.estado, set()):
        raise HTTPException(status_code=409, detail=f"No se permite cambiar de {contract.estado} a {datos.estado}.")
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
    _add_version(db, contract, actor, content=contract.contenido_actual, state=contract.estado)
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
        sent = enviar_correo(
            recipient,
            f"Copia de contrato firmado — {contract.proceso.nombre}",
            f"Hola {contract.parte_cliente_snapshot.get('nombre', 'cliente')},\n\nAdjuntamos una copia del contrato firmado asociado a tu expediente {contract.proceso.nombre}. También puedes consultarlo en el portal:\n\nAbrir enlace: Ver expediente | {public_site_url()}/gestion-procesos/cliente/procesos/{contract.proceso_id}\n\nEl documento queda disponible en la sección Documentos del expediente.",
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
    if contract.estado != "EN_FIRMA":
        raise HTTPException(status_code=409, detail="El contrato debe estar en estado En firma antes de cargar el escaneado.")
    signature_event = db.query(models.EventoAgenda.id).filter(
        models.EventoAgenda.contrato_id == contract.id,
        models.EventoAgenda.tipo == "FIRMA_CONTRATO",
        models.EventoAgenda.estado != "CANCELADO",
    ).first()
    if not signature_event:
        raise HTTPException(status_code=409, detail="Agenda primero la firma del contrato en los eventos del expediente.")
    mime = archivo.content_type or ""
    if mime not in SIGNED_TYPES:
        raise HTTPException(status_code=400, detail="Carga el escaneado como PDF, JPG o PNG.")
    content = archivo.file.read(MAX_DOCUMENT_BYTES + 1)
    if not content or len(content) > MAX_DOCUMENT_BYTES:
        raise HTTPException(status_code=400, detail="El escaneado debe pesar máximo 15 MB.")
    if not document_content_matches_type(mime, content):
        raise HTTPException(status_code=400, detail="El contenido del archivo no coincide con su tipo.")
    ext = {"application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png"}[mime]
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
        _add_version(db, contract, actor, content=contract.contenido_actual, state="FIRMADO")
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
    return {"documento_id": document.id, "correo": delivery, "mensaje": "Contrato firmado cargado. " + ("La copia fue enviada al correo del cliente." if delivery["estado"] == "ENVIADO" else "No se pudo enviar el correo; puedes reintentar el envío desde el contrato.")}


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
