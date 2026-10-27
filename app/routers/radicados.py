"""Radicados del abogado SaaS: alta, listado, detalle, borrado y consulta manual."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app import models, schemas, security
from app.audit import (
    registrar_evento_auditoria,
)
from app.database import get_db
from app.firm_access import (
    has_firm_wide_access,
    lawyer_process_ids,
    lawyer_scope_id,
    require_roles,
)
from app.radicados import (
    iniciar_consulta_nuevo_radicado,
    obtener_o_vincular_radicado,
    radicado_vinculado_a_usuario,
)

router = APIRouter()


def radicados_visibles(usuario: models.Usuario, db: Session):
    query = db.query(models.Radicado)
    if has_firm_wide_access(usuario):
        return query
    responsible_lawyer_id = lawyer_scope_id(usuario)
    if responsible_lawyer_id is None:
        return query.filter(models.Radicado.id == -1)
    assigned_radicados = db.query(models.ProcesoRadicado.radicado_id).filter(
        models.ProcesoRadicado.proceso_id.in_(lawyer_process_ids(db, usuario))
    )
    return query.filter(
        or_(
            models.Radicado.usuarios_vinculados.any(models.Usuario.id == responsible_lawyer_id),
            models.Radicado.id.in_(assigned_radicados),
        )
    )


@router.post("/api/radicados", response_model=schemas.RadicadoOut, status_code=status.HTTP_201_CREATED)
def agregar_radicado(
    radicado_in: schemas.RadicadoCreate,
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """Agrega un radicado a la firma, conservando al creador como responsable."""
    require_roles(usuario_actual, ["ABOGADO", "ABOGADO_ADMIN", "ADMIN"], action="gestionar radicados")
    if usuario_actual.estado != models.EstadoUsuario.ACTIVO:
        raise HTTPException(
            status_code=403, 
            detail="Tu cuenta aún no está activa para agregar radicados."
        )

    if usuario_actual.rol == models.RolUsuario.ABOGADO and usuario_actual.plan is None:
        raise HTTPException(status_code=403, detail="Tu cuenta SaaS necesita un plan activo para agregar radicados.")

    vinculado_previamente = radicado_vinculado_a_usuario(
        db,
        usuario_actual,
        radicado_in.numero,
    )
    try:
        nuevo_radicado, creado = obtener_o_vincular_radicado(
            db, usuario_actual, radicado_in.numero
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if usuario_actual.rol == models.RolUsuario.ABOGADO:
        total_registrados = db.query(models.Radicado).join(
            models.Radicado.usuarios_vinculados
        ).filter(models.Usuario.id == usuario_actual.id).count()
        if total_registrados > usuario_actual.plan.limite_radicados:
            db.rollback()
            raise HTTPException(status_code=400, detail="Has alcanzado el límite de radicados de tu plan.")
    accion = "radicado.crear" if creado else "radicado.vincular"
    registrar_evento_auditoria(db, usuario_actual, accion, "radicado", nuevo_radicado.id)
    db.commit()
    db.refresh(nuevo_radicado)

    if creado or not vinculado_previamente:
        mensaje, consulta_id = iniciar_consulta_nuevo_radicado(
            db,
            usuario_actual,
            nuevo_radicado,
        )
    else:
        mensaje, consulta_id = "El radicado ya estaba agregado; no se inició otra consulta.", None
    limite = (
        usuario_actual.plan.limite_ultimas_actuaciones
        if usuario_actual.rol == models.RolUsuario.ABOGADO
        else None
    )
    resultado = serializar_radicado(nuevo_radicado, limite)
    resultado["mensaje"] = mensaje
    resultado["consulta_id"] = consulta_id
    return resultado


def _limite_actuaciones_visibles(usuario: models.Usuario) -> int | None:
    require_roles(usuario, ["ABOGADO", "ABOGADO_ADMIN", "ADMIN"], action="consultar radicados")
    if usuario.rol == models.RolUsuario.ABOGADO and usuario.plan is None:
        raise HTTPException(status_code=403, detail="Tu cuenta SaaS no tiene un plan asignado.")
    return usuario.plan.limite_ultimas_actuaciones if usuario.rol == models.RolUsuario.ABOGADO else None


@router.get("/api/radicados", response_model=list[schemas.RadicadoOut])
def listar_mis_radicados(
    resumen: bool = False,
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """Retorna radicados dentro del alcance del rol en la firma.

    Con ``resumen=true`` omite las actuaciones; sirve para selectores y
    listados que solo necesitan los datos del radicado.
    """
    limite = _limite_actuaciones_visibles(usuario_actual)
    query = radicados_visibles(usuario_actual, db).order_by(models.Radicado.id.desc())
    if resumen:
        return [serializar_radicado(radicado, 0) for radicado in query.all()]
    radicados = query.options(selectinload(models.Radicado.actuaciones)).all()
    return [serializar_radicado(radicado, limite) for radicado in radicados]


@router.get("/api/radicados/{radicado_id}", response_model=schemas.RadicadoOut)
def obtener_radicado(
    radicado_id: int,
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """Retorna un radicado visible con su historial de actuaciones autorizado."""
    limite = _limite_actuaciones_visibles(usuario_actual)
    radicado = (
        radicados_visibles(usuario_actual, db)
        .filter(models.Radicado.id == radicado_id)
        .options(selectinload(models.Radicado.actuaciones))
        .first()
    )
    if not radicado:
        raise HTTPException(status_code=404, detail="Radicado no encontrado en tu alcance.")
    return serializar_radicado(radicado, limite)


def serializar_radicado(radicado: models.Radicado, limite_actuaciones: int | None) -> dict:
    """Serializa el historial de actuaciones autorizado."""
    actuaciones = [] if limite_actuaciones == 0 else sorted(radicado.actuaciones, key=lambda actuacion: actuacion.orden)
    if limite_actuaciones is not None:
        actuaciones = actuaciones[:limite_actuaciones]
    return {
        "id": radicado.id, "numero": radicado.numero,
        "estado_consulta": radicado.estado_consulta,
        "despacho_departamento": radicado.despacho_departamento,
        "demandante": radicado.demandante, "demandado": radicado.demandado,
        "consultado_en": radicado.consultado_en,
        "alerta_enviada": radicado.alerta_enviada,
        "detalle_pendiente": radicado.detalle_pendiente,
        "actuaciones": [
            {
                "id": actuacion.id, "orden": actuacion.orden,
                "fecha_actuacion": actuacion.fecha_actuacion,
                "actuacion": actuacion.actuacion, "anotacion": actuacion.anotacion,
                "fecha_inicia_termino": actuacion.fecha_inicia_termino,
                "fecha_finaliza_termino": actuacion.fecha_finaliza_termino,
                "fecha_registro": actuacion.fecha_registro,
                "es_fijacion": actuacion.es_fijacion,
            } for actuacion in actuaciones
        ],
    }


@router.delete("/api/radicados/{radicado_id}")
def eliminar_radicado(
    radicado_id: int,
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """Elimina un radicado visible para el usuario dentro de la firma."""
    require_roles(usuario_actual, ["ABOGADO", "ABOGADO_ADMIN", "ADMIN"], action="eliminar radicados")
    radicado = radicados_visibles(usuario_actual, db).filter(models.Radicado.id == radicado_id).first()

    if not radicado:
        raise HTTPException(status_code=404, detail="Radicado no encontrado en tu alcance.")
    if not any(vinculado.id == usuario_actual.id for vinculado in radicado.usuarios_vinculados):
        raise HTTPException(status_code=403, detail="No tienes un vínculo directo con este radicado.")

    radicado.usuarios_vinculados.remove(usuario_actual)
    registrar_evento_auditoria(db, usuario_actual, "radicado.desvincular", "radicado", radicado.id)
    db.commit()
    return {"mensaje": f"Radicado {radicado.numero} retirado de tu lista."}


@router.post("/api/radicados/{radicado_id}/consultar")
def consultar_radicado_manual(
    radicado_id: int,
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """Reject the legacy Celery path; manual calls start through the Next Workflow launcher."""
    require_roles(usuario_actual, ["ADMIN"], action="consultar radicados manualmente")
    raise HTTPException(
        status_code=410,
        detail="Este endpoint legacy fue deshabilitado. Inicia la consulta desde la interfaz ADMIN mediante Workflow.",
    )
