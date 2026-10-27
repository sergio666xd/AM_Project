"""Revisión de solicitudes de registro de abogados SaaS por parte del ADMIN."""

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app import models, schemas, security, storage
from app.audit import (
    registrar_evento_auditoria,
)
from app.database import get_db
from app.firm_access import require_roles

router = APIRouter()


# --- ENDPOINTS DE ADMINISTRACIÓN ---
@router.get("/api/admin/solicitudes", response_model=list[schemas.SolicitudRegistroOut])
def listar_solicitudes_pendientes(
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """Retorna las solicitudes pendientes de abogados para revisión manual."""
    require_roles(usuario_actual, ["ADMIN"], action="listar solicitudes pendientes")

    return (
        db.query(models.SolicitudRegistro)
        .join(models.Usuario)
        .filter(models.Usuario.estado == models.EstadoUsuario.PENDIENTE_APROBACION)
        .all()
    )


@router.get("/api/admin/solicitudes/{solicitud_id}/tarjeta")
def descargar_tarjeta_profesional(
    solicitud_id: int,
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """Entrega una tarjeta privada de R2 solamente a administradores autenticados."""
    require_roles(usuario_actual, ["ADMIN"], action="descargar la tarjeta profesional")

    solicitud = db.query(models.SolicitudRegistro).filter(models.SolicitudRegistro.id == solicitud_id).first()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada.")
    if not solicitud.ruta_tarjeta_profesional:
        raise HTTPException(status_code=404, detail="La tarjeta profesional fue retirada del almacenamiento.")

    try:
        response = storage.get_r2_client().get_object(
            Bucket=storage.get_r2_tp_registros_bucket(), Key=solicitud.ruta_tarjeta_profesional
        )
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code")
        if error_code in {"NoSuchKey", "404"}:
            raise HTTPException(status_code=404, detail="Documento no encontrado.") from exc
        raise HTTPException(status_code=502, detail="No fue posible obtener el documento.") from exc
    except BotoCoreError as exc:
        raise HTTPException(status_code=502, detail="No fue posible obtener el documento.") from exc

    registrar_evento_auditoria(
        db, usuario_actual, "admin.solicitud.tarjeta.descargar", "solicitud_registro", solicitud.id
    )
    db.commit()
    content_type = response.get("ContentType") or "application/octet-stream"
    extension = ".pdf" if content_type == "application/pdf" else ".jpg" if content_type == "image/jpeg" else ".png"
    return StreamingResponse(
        response["Body"].iter_chunks(chunk_size=64 * 1024),
        media_type=content_type,
        headers={"Content-Disposition": f'inline; filename="tarjeta-profesional{extension}"'},
        background=BackgroundTask(response["Body"].close),
    )


@router.post("/api/admin/solicitudes/{solicitud_id}/aprobar")
def aprobar_solicitud(
    solicitud_id: int,
    plan_id: int = 1,  # Por defecto Plan Básico (id 1)
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """Aprueba la cuenta del abogado y le asigna un plan con límite de radicados."""
    require_roles(usuario_actual, ["ADMIN"], action="aprobar la solicitud del abogado")

    solicitud = db.query(models.SolicitudRegistro).filter(models.SolicitudRegistro.id == solicitud_id).first()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada.")

    plan = (
    db.query(models.Plan)
    .filter(
        models.Plan.id == plan_id,
        models.Plan.activo == True
    )
    .first()
    )

    if not plan:
        raise HTTPException(
            status_code=400,
            detail="El plan especificado no existe o está inactivo."
        )

    usuario = solicitud.usuario
    usuario.estado = models.EstadoUsuario.ACTIVO
    usuario.plan_id = plan.id

    registrar_evento_auditoria(db, usuario_actual, "admin.solicitud.aprobar", "solicitud_registro", solicitud.id)
    db.commit()
    return {
        "mensaje": f"Cuenta de {usuario.nombre_completo} aprobada exitosamente con el plan {plan.nombre}."
    }


@router.post("/api/admin/solicitudes/{solicitud_id}/rechazar")
def rechazar_solicitud(
    solicitud_id: int,
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """Rechaza la solicitud de registro de un abogado."""

    require_roles(usuario_actual, ["ADMIN"], action="rechazar la solicitud del abogado")

    solicitud = (
        db.query(models.SolicitudRegistro)
        .filter(models.SolicitudRegistro.id == solicitud_id)
        .first()
    )

    if not solicitud:
        raise HTTPException(
            status_code=404,
            detail="Solicitud no encontrada."
        )

    usuario = solicitud.usuario

    usuario.estado = models.EstadoUsuario.RECHAZADO

    registrar_evento_auditoria(db, usuario_actual, "admin.solicitud.rechazar", "solicitud_registro", solicitud.id)
    db.commit()

    return {
        "mensaje": f"La solicitud de {usuario.nombre_completo} fue rechazada."
    }
