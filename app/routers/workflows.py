import hmac
import os
from datetime import date, datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.rama_judicial_api import ejecutar_consulta_api_radicado


router = APIRouter(
    prefix="/api/internal/workflows",
    tags=["Workflows internos"],
)


def verificar_token_workflow(authorization: str | None = Header(default=None)) -> None:
    expected = os.getenv("WORKFLOW_SERVICE_TOKEN", "")
    if not expected:
        raise HTTPException(status_code=503, detail="El token interno de Workflow no está configurado.")
    supplied = authorization.removeprefix("Bearer ") if authorization else ""
    if not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Credencial interna inválida.")


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
    if datos.tipo == "AUTOMATICA":
        if datos.hora_local not in {"12:00", "17:00"}:
            raise HTTPException(status_code=400, detail="Hora automática no permitida.")
        if not configuracion.activa:
            db.commit()
            return {"debe_ejecutar": False, "motivo": "CONSULTAS_DESACTIVADAS"}
        if fecha.weekday() not in (configuracion.dias_habilitados or []):
            db.commit()
            return {"debe_ejecutar": False, "motivo": "DIA_DESHABILITADO"}
    elif datos.hora_local != "MANUAL":
        raise HTTPException(status_code=400, detail="El lanzamiento manual debe usar hora_local=MANUAL.")

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
    activa = (
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

    radicados_query = db.query(models.Radicado.id).filter(models.Radicado.ambito_key == "FIRMA")
    total = radicados_query.count()
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

    configuracion.ejecucion_activa_id = ejecucion.id
    configuracion.lease_hasta = ejecucion.lease_hasta
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
            models.Radicado.ambito_key == "FIRMA",
            models.Radicado.id > despues_de,
        )
        .order_by(models.Radicado.id.asc())
        .limit(limite)
        .all()
    )
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
    radicado = db.query(models.Radicado).filter_by(id=radicado_id, ambito_key="FIRMA").first()
    if not radicado:
        raise HTTPException(status_code=404, detail="Radicado fuera del ámbito de la firma.")

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

    resultado = ejecutar_consulta_api_radicado(db, radicado)
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
        consulta.detalle = estado_api
        errores_incremento = 0

    resultado_radicado.finalizacion = ahora
    resultado_radicado.lease_hasta = None
    ejecucion.procesados += 0 if procesado_previo else 1
    ejecucion.errores = max(0, ejecucion.errores - errores_previos + errores_incremento)
    ejecucion.actuaciones_nuevas = max(
        0,
        ejecucion.actuaciones_nuevas - actuaciones_previas + resultado_radicado.actuaciones_nuevas,
    )
    ejecucion.lease_hasta = ahora + timedelta(minutes=30)
    configuracion = db.query(models.ConfiguracionConsultas).filter_by(id=1).first()
    if configuracion and configuracion.ejecucion_activa_id == ejecucion.id:
        configuracion.lease_hasta = ejecucion.lease_hasta
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
