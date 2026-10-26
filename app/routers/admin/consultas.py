"""Consultas judiciales: ejecución manual, programación y ejecuciones."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.audit import registrar_evento_auditoria
from app.database import get_db
from app.routers.admin.comun import verificar_admin

router = APIRouter(prefix="/api/admin", tags=["Administración"])


@router.post("/radicados/consultar")
def consultar_todos_radicados_admin(
    sector: str,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    raise HTTPException(
        status_code=410,
        detail="Este endpoint legacy fue deshabilitado. Usa el launcher ADMIN de Workflows.",
    )


@router.post("/radicados/{radicado_id}/consultar")
def consultar_radicado_admin(
    radicado_id: int,
    sector: str,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    raise HTTPException(
        status_code=410,
        detail="Este endpoint legacy fue deshabilitado. Usa el launcher ADMIN de Workflows.",
    )


def _serializar_configuracion_consultas(configuracion: models.ConfiguracionConsultas) -> dict:
    dias = sorted(set(configuracion.dias_habilitados or []))
    proxima = None
    if configuracion.activa and dias:
        zona_colombia = ZoneInfo("America/Bogota")
        ahora = datetime.now(zona_colombia)
        for desplazamiento in range(8):
            fecha = (ahora + timedelta(days=desplazamiento)).date()
            if fecha.weekday() not in dias:
                continue
            for hora in (12, 17):
                candidata = datetime(
                    fecha.year,
                    fecha.month,
                    fecha.day,
                    hora,
                    tzinfo=zona_colombia,
                )
                if candidata > ahora:
                    proxima = candidata
                    break
            if proxima:
                break
    return {
        "activa": configuracion.activa,
        "dias_habilitados": dias,
        "horas_colombia": ["12:00", "17:00"],
        "proxima_ejecucion": proxima,
        "updated_at": configuracion.updated_at,
    }


@router.get("/consultas/configuracion", response_model=schemas.ConfiguracionConsultasOut)
def obtener_configuracion_consultas(
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    configuracion = db.query(models.ConfiguracionConsultas).filter_by(id=1).first()
    if configuracion is None:
        configuracion = models.ConfiguracionConsultas(id=1)
        db.add(configuracion)
        db.commit()
        db.refresh(configuracion)
    return _serializar_configuracion_consultas(configuracion)


@router.get("/consultas/radicados")
def buscar_radicados_consulta_manual(
    q: str = "",
    limite: int = 25,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    query = db.query(models.Radicado)
    texto = q.strip()
    if texto:
        query = query.filter(models.Radicado.numero.ilike(f"%{texto}%"))
    radicados = (
        query.order_by(models.Radicado.created_at.desc(), models.Radicado.id.desc())
        .limit(min(max(limite, 1), 100))
        .all()
    )
    return [
        {"id": radicado.id, "numero": radicado.numero, "ambito": radicado.ambito_key}
        for radicado in radicados
    ]


@router.put("/consultas/configuracion", response_model=schemas.ConfiguracionConsultasOut)
def actualizar_configuracion_consultas(
    datos: schemas.ConfiguracionConsultasUpdate,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    dias = sorted(set(datos.dias_habilitados))
    if any(dia < 0 or dia > 6 for dia in dias):
        raise HTTPException(status_code=400, detail="Los días deben estar entre 0 (lunes) y 6 (domingo).")
    configuracion = db.query(models.ConfiguracionConsultas).filter_by(id=1).with_for_update().first()
    if configuracion is None:
        configuracion = models.ConfiguracionConsultas(id=1)
        db.add(configuracion)
    configuracion.activa = datos.activa
    configuracion.dias_habilitados = dias
    configuracion.actualizado_por_id = admin.id
    registrar_evento_auditoria(db, admin, "admin.consultas.configuracion.actualizar", "configuracion_consultas", 1)
    db.commit()
    db.refresh(configuracion)
    return _serializar_configuracion_consultas(configuracion)


@router.get("/consultas/ejecuciones")
def listar_ejecuciones_consultas(
    limite: int = 20,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    limite = min(max(limite, 1), 100)
    ejecuciones = (
        db.query(models.EjecucionBarrido)
        .order_by(models.EjecucionBarrido.inicio.desc())
        .limit(limite)
        .all()
    )
    return [
        {
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
        for ejecucion in ejecuciones
    ]


@router.get("/consultas/ejecuciones/{ejecucion_id}")
def detalle_ejecucion_consultas(
    ejecucion_id: str,
    limite: int = 250,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    limite = min(max(limite, 1), 500)
    ejecucion = db.query(models.EjecucionBarrido).filter_by(id=ejecucion_id).first()
    if not ejecucion:
        raise HTTPException(status_code=404, detail="Ejecución no encontrada.")

    resultados = (
        db.query(models.EjecucionRadicado, models.Radicado.numero)
        .join(models.Radicado, models.Radicado.id == models.EjecucionRadicado.radicado_id)
        .filter(models.EjecucionRadicado.ejecucion_id == ejecucion.id)
        .order_by(models.EjecucionRadicado.id.asc())
        .limit(limite)
        .all()
    )
    return {
        "ejecucion": {
            "id": ejecucion.id,
            "tipo": ejecucion.tipo,
            "estado": ejecucion.estado,
            "inicio": ejecucion.inicio,
            "finalizacion": ejecucion.finalizacion,
            "total_radicados": ejecucion.total_radicados,
            "procesados": ejecucion.procesados,
            "errores": ejecucion.errores,
            "actuaciones_nuevas": ejecucion.actuaciones_nuevas,
        },
        "radicados": [
            {
                "id": resultado.EjecucionRadicado.id,
                "radicado_id": resultado.EjecucionRadicado.radicado_id,
                "numero": resultado.numero,
                "consulta_id": resultado.EjecucionRadicado.consulta_id,
                "estado": resultado.EjecucionRadicado.estado,
                "inicio": resultado.EjecucionRadicado.inicio,
                "finalizacion": resultado.EjecucionRadicado.finalizacion,
                "actuaciones_nuevas": resultado.EjecucionRadicado.actuaciones_nuevas,
                "error": resultado.EjecucionRadicado.error,
            }
            for resultado in resultados
        ],
    }
