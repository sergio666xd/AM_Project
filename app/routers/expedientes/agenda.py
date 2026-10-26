"""Agenda del abogado: eventos y actuaciones."""

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas, security
from app.audit import registrar_evento_auditoria
from app.database import get_db
from app.firm_access import (
    lawyer_process_ids,
)
from app.routers.expedientes.comun import (
    _abogado,
    _cliente_asignado,
    _notificar_evento_agenda,
    _proceso_abogado,
    _serializar_evento_firma,
    _validar_contrato_evento,
)

router = APIRouter(prefix="/api/expedientes", tags=["Expedientes"])


@router.get("/agenda/eventos")
def listar_eventos_agenda_abogado(fecha_desde: str | None = None, fecha_hasta: str | None = None,
                                  proceso_id: int | None = None, db: Session = Depends(get_db),
                                  usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    query = db.query(models.EventoAgenda).join(models.Proceso).filter(models.Proceso.archivado_en.is_(None))
    if usuario.rol != models.RolUsuario.ADMIN:
        query = query.filter(models.EventoAgenda.proceso_id.in_(lawyer_process_ids(db, usuario)))
    if proceso_id is not None:
        _proceso_abogado(proceso_id, usuario, db)
        query = query.filter(models.EventoAgenda.proceso_id == proceso_id)
    if bool(fecha_desde) != bool(fecha_hasta):
        raise HTTPException(status_code=400, detail="Indica las dos fechas del rango.")
    if fecha_desde and fecha_hasta:
        try:
            desde_local = datetime.fromisoformat(fecha_desde).date()
            hasta_local = datetime.fromisoformat(fecha_hasta).date() + timedelta(days=1)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Usa fechas ISO YYYY-MM-DD.") from exc
        zona = ZoneInfo("America/Bogota")
        desde = datetime.combine(desde_local, datetime.min.time(), tzinfo=zona).astimezone(timezone.utc).replace(tzinfo=None)
        hasta = datetime.combine(hasta_local, datetime.min.time(), tzinfo=zona).astimezone(timezone.utc).replace(tzinfo=None)
        query = query.filter(models.EventoAgenda.fecha_inicio >= desde, models.EventoAgenda.fecha_inicio < hasta)
    return [_serializar_evento_firma(item) for item in query.order_by(models.EventoAgenda.fecha_inicio.asc()).limit(500).all()]


@router.get("/agenda/actuaciones")
def listar_actuaciones_agenda_abogado(proceso_id: int | None = None, db: Session = Depends(get_db),
                                      usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    """Actuaciones judiciales de los expedientes visibles para el abogado."""
    _abogado(usuario)
    query = (
        db.query(models.Actuacion, models.Radicado, models.Proceso)
        .join(models.Radicado, models.Radicado.id == models.Actuacion.radicado_id)
        .join(models.ProcesoRadicado, models.ProcesoRadicado.radicado_id == models.Radicado.id)
        .join(models.Proceso, models.Proceso.id == models.ProcesoRadicado.proceso_id)
        .filter(models.Proceso.archivado_en.is_(None))
    )
    if usuario.rol != models.RolUsuario.ADMIN:
        query = query.filter(models.Proceso.id.in_(lawyer_process_ids(db, usuario)))
    if proceso_id is not None:
        _proceso_abogado(proceso_id, usuario, db)
        query = query.filter(models.Proceso.id == proceso_id)

    rows = query.order_by(models.Actuacion.id.desc()).all()
    process_ids = {proceso.id for _, _, proceso in rows}
    clients_by_process: dict[int, list[int]] = {process_id: [] for process_id in process_ids}
    client_links = db.query(models.ProcesoCliente).filter(models.ProcesoCliente.proceso_id.in_(process_ids)).all() if process_ids else []
    for process_client in client_links:
        clients_by_process[process_client.proceso_id].append(process_client.cliente_id)

    result = []
    for actuacion, radicado, proceso in rows:
        raw_date = (actuacion.fecha_registro or actuacion.fecha_actuacion or "").strip()
        parsed_date = None
        for date_format in ("%d/%m/%Y", "%Y-%m-%d"):
            try:
                parsed_date = datetime.strptime(raw_date[:10], date_format).date()
                break
            except ValueError:
                continue
        if parsed_date is None:
            try:
                parsed_date = datetime.fromisoformat(raw_date.replace("Z", "+00:00")).date()
            except ValueError:
                continue
        result.append({
            "id": actuacion.id,
            "titulo": (actuacion.actuacion or "").strip() or "Actuación judicial",
            "descripcion": (actuacion.anotacion or "").strip(),
            "fecha": f"{parsed_date.isoformat()}T12:00:00",
            "proceso_id": proceso.id,
            "proceso": proceso.nombre,
            "abogado_id": proceso.abogado_id,
            "cliente_ids": clients_by_process.get(proceso.id, []),
            "radicado_id": radicado.id,
            "radicado": radicado.numero,
        })
    return sorted(result, key=lambda item: (item["fecha"], item["id"]), reverse=True)


@router.post("/agenda/eventos", status_code=status.HTTP_201_CREATED)
def crear_evento_agenda_abogado(datos: schemas.EventoAgendaCreate, db: Session = Depends(get_db),
                                usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    if datos.proceso_id is None:
        raise HTTPException(status_code=400, detail="Asocia el evento a un proceso.")
    proceso = _proceso_abogado(datos.proceso_id, usuario, db)
    cliente = _cliente_asignado(proceso, datos.cliente_id, db) if datos.cliente_id else None
    contrato = _validar_contrato_evento(proceso, datos.tipo, datos.contrato_id, cliente, db, usuario)
    if contrato and cliente is None:
        cliente = contrato.cliente
    responsable_id = datos.responsable_id or usuario.id
    responsible_allowed = responsable_id == proceso.abogado_id or responsable_id == usuario.id or any(link.abogado_id == responsable_id for link in proceso.colaboradores)
    responsable = db.query(models.Usuario).filter_by(id=responsable_id, estado=models.EstadoUsuario.ACTIVO).first()
    if not responsable or responsable.rol not in (models.RolUsuario.ABOGADO_ADMIN, models.RolUsuario.ADMIN) or not responsible_allowed:
        raise HTTPException(status_code=400, detail="El responsable debe estar activo y pertenecer al equipo del proceso.")
    inicio = datos.fecha_inicio.astimezone(timezone.utc).replace(tzinfo=None) if datos.fecha_inicio.tzinfo else datos.fecha_inicio
    fin = datos.fecha_fin.astimezone(timezone.utc).replace(tzinfo=None) if datos.fecha_fin and datos.fecha_fin.tzinfo else datos.fecha_fin
    if fin and fin < inicio:
        raise HTTPException(status_code=400, detail="La fecha final debe ser posterior al inicio.")
    evento = models.EventoAgenda(titulo=datos.titulo.strip(), descripcion=datos.descripcion, tipo=datos.tipo, estado=datos.estado,
                                 fecha_inicio=inicio, fecha_fin=fin, responsable_id=responsable_id, proceso_id=proceso.id,
                                 cliente_id=cliente.id if cliente else None, contrato_id=contrato.id if contrato else None,
                                 creado_por_id=usuario.id)
    db.add(evento); db.flush()
    registrar_evento_auditoria(db, usuario, "proceso.evento_agenda.crear", "proceso", proceso.id)
    db.commit(); db.refresh(evento)
    _notificar_evento_agenda(db, proceso, evento, usuario, "programó", cliente)
    return _serializar_evento_firma(evento)


@router.patch("/agenda/eventos/{evento_id}")
def actualizar_evento_agenda_abogado(evento_id: int, datos: schemas.EventoAgendaUpdate, db: Session = Depends(get_db),
                                     usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    evento = db.query(models.EventoAgenda).filter_by(id=evento_id).first()
    if not evento or not evento.proceso_id:
        raise HTTPException(status_code=404, detail="Evento no encontrado.")
    proceso = _proceso_abogado(evento.proceso_id, usuario, db)
    cliente = _cliente_asignado(proceso, datos.cliente_id, db) if datos.cliente_id else None
    contrato = _validar_contrato_evento(
        proceso, datos.tipo, datos.contrato_id, cliente, db, usuario,
        permitir_firmado=evento.contrato_id == datos.contrato_id and evento.contrato_id is not None,
    )
    if contrato and cliente is None:
        cliente = contrato.cliente
    responsable_id = datos.responsable_id or usuario.id
    responsible_allowed = responsable_id == proceso.abogado_id or responsable_id == usuario.id or any(link.abogado_id == responsable_id for link in proceso.colaboradores)
    responsable = db.query(models.Usuario).filter_by(id=responsable_id, estado=models.EstadoUsuario.ACTIVO).first()
    if not responsable or responsable.rol not in (models.RolUsuario.ABOGADO_ADMIN, models.RolUsuario.ADMIN) or not responsible_allowed:
        raise HTTPException(status_code=400, detail="El responsable debe estar activo y pertenecer al equipo del proceso.")
    inicio = datos.fecha_inicio.astimezone(timezone.utc).replace(tzinfo=None) if datos.fecha_inicio.tzinfo else datos.fecha_inicio
    fin = datos.fecha_fin.astimezone(timezone.utc).replace(tzinfo=None) if datos.fecha_fin and datos.fecha_fin.tzinfo else datos.fecha_fin
    if fin and fin < inicio:
        raise HTTPException(status_code=400, detail="La fecha final debe ser posterior al inicio.")
    cliente_anterior = evento.cliente
    for field in ("titulo", "descripcion", "tipo", "estado"):
        setattr(evento, field, getattr(datos, field))
    evento.fecha_inicio = inicio; evento.fecha_fin = fin; evento.responsable_id = responsable_id
    evento.cliente_id = cliente.id if cliente else None
    evento.contrato_id = contrato.id if contrato else None
    registrar_evento_auditoria(db, usuario, "proceso.evento_agenda.actualizar", "proceso", proceso.id)
    db.commit(); db.refresh(evento)
    destinatario = cliente or cliente_anterior
    _notificar_evento_agenda(db, proceso, evento, usuario, "actualizó", destinatario)
    return _serializar_evento_firma(evento)


@router.delete("/agenda/eventos/{evento_id}")
def eliminar_evento_agenda_abogado(evento_id: int, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    evento = db.query(models.EventoAgenda).filter_by(id=evento_id).first()
    if not evento or not evento.proceso_id:
        raise HTTPException(status_code=404, detail="Evento no encontrado.")
    proceso = _proceso_abogado(evento.proceso_id, usuario, db)
    cliente = evento.cliente
    _notificar_evento_agenda(db, proceso, evento, usuario, "canceló", cliente)
    registrar_evento_auditoria(db, usuario, "proceso.evento_agenda.eliminar", "proceso", proceso.id)
    db.delete(evento); db.commit()
    return {"mensaje": "Evento eliminado de la agenda."}
