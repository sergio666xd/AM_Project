"""Avisos de actuaciones nuevas: destinatarios, intento registrado y estado hasta abrir el detalle."""

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import models
from app.api.internos import esquemas as schemas
from app.message_templates import radicado_legible
from app.notification_policy import abogados_notificables_para_radicado
from app.radicados import obtener_o_vincular_radicado
from app.modulos.avisos.fuentes import avisos_abogado
from app.modulos.radicados.repositorio import RepositorioRadicados
from app.api.internos.workflows import (
    ejecutar_consulta_barrido_radicado,
    preparar_notificaciones_actuaciones,
)
from app.timezone import utc_ahora

ACTUACION = {
    "orden": 1,
    "fecha_actuacion": "20/10/2026",
    "actuacion": "Auto que fija fecha",
    "anotacion": "Audiencia",
    "fecha_inicia_termino": "",
    "fecha_finaliza_termino": "",
    "fecha_registro": "20/10/2026",
    "es_fijacion": False,
}


def _usuario(db, email, rol, **extra):
    usuario = models.Usuario(
        email=email, password_hash="hash", nombre_completo=email.split("@")[0],
        whatsapp_numero="", rol=rol, estado=models.EstadoUsuario.ACTIVO, **extra,
    )
    db.add(usuario)
    db.flush()
    return usuario


def _ejecucion(db, radicado, estado_radicado="COMPLETADA"):
    ejecucion = models.EjecucionBarrido(
        id=f"run-{radicado.id}", clave_idempotencia=f"AUTO:{radicado.id}",
        token_lanzamiento=f"token-{radicado.id}", tipo="AUTOMATICA",
        estado="EN_PROCESO", inicio=utc_ahora(), total_radicados=1,
    )
    db.add(ejecucion)
    if estado_radicado:
        db.add(models.EjecucionRadicado(
            ejecucion_id=ejecucion.id, radicado_id=radicado.id,
            estado=estado_radicado, actuaciones_nuevas=1,
        ))
    db.commit()
    return ejecucion


def test_process_lawyers_are_notified_even_when_not_linked_to_the_radicado():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    with Session(engine) as db:
        admin = _usuario(db, "admin@example.test", models.RolUsuario.ADMIN)
        responsable = _usuario(db, "responsable@example.test", models.RolUsuario.ABOGADO_ADMIN)
        colaborador = _usuario(db, "colaborador@example.test", models.RolUsuario.ABOGADO_ADMIN)
        radicado, _ = obtener_o_vincular_radicado(db, admin, "11111111111111111111111")
        proceso = models.Proceso(abogado_id=responsable.id, nombre="Proceso firma")
        db.add(proceso)
        db.flush()
        db.add_all([
            models.ProcesoRadicado(proceso_id=proceso.id, radicado_id=radicado.id),
            models.ProcesoColaborador(proceso_id=proceso.id, abogado_id=colaborador.id),
        ])
        db.commit()
        db.refresh(radicado)

        destinatarios = abogados_notificables_para_radicado(radicado)

        assert {usuario.id for usuario in destinatarios} == {responsable.id, colaborador.id}


def test_lawyer_without_channels_gets_an_omitted_delivery_for_a_radicado_without_process():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    with Session(engine) as db:
        abogado = _usuario(
            db, "sin-canales@example.test", models.RolUsuario.ABOGADO_ADMIN,
            preferencias_notificacion={"ACTUACIONES": {"email": False, "whatsapp": False}},
        )
        radicado, _ = obtener_o_vincular_radicado(db, abogado, "22222222222222222222222")
        db.add(models.Actuacion(radicado_id=radicado.id, **ACTUACION))
        ejecucion = _ejecucion(db, radicado)
        payload = schemas.WorkflowNovedadesPreparar(eventos=[schemas.WorkflowEventoActuaciones(
            radicado_id=radicado.id,
            actuaciones_nuevas=[schemas.WorkflowActuacionNueva(**ACTUACION)],
        )])

        preparar_notificaciones_actuaciones(ejecucion.id, payload, _=None, db=db)
        preparar_notificaciones_actuaciones(ejecucion.id, payload, _=None, db=db)

        entrega = db.query(models.EntregaNotificacion).filter_by(usuario_id=abogado.id).one()
        assert entrega.tipo == "ACTUACIONES"
        assert entrega.estado == "OMITIDA"
        assert "Push" in entrega.error
        # El radicado se muestra en sus siete segmentos y el enlace lleva directo a él.
        assert radicado_legible(radicado.numero) in entrega.cuerpo
        assert f"/radicados/{radicado.id}\n" in entrega.cuerpo
        assert db.query(models.EntregaNotificacionActuacion).filter_by(usuario_id=abogado.id).count() == 1


def test_new_actuations_stay_flagged_until_the_lawyer_opens_the_radicado(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    monkeypatch.setattr(
        "app.api.internos.workflows.ejecutar_consulta_api_radicado",
        lambda db, radicado, reconciliar_historial=False: {
            "estado": "ok", "actuaciones_nuevas": [ACTUACION, {**ACTUACION, "orden": 2}],
        },
    )
    with Session(engine) as db:
        abogado = _usuario(db, "firma@example.test", models.RolUsuario.ABOGADO_ADMIN)
        radicado, _ = obtener_o_vincular_radicado(db, abogado, "33333333333333333333333")
        ejecucion = _ejecucion(db, radicado, estado_radicado=None)

        ejecutar_consulta_barrido_radicado(ejecucion.id, radicado.id, _=None, db=db)

        detalle = f"/gestion-procesos/abogado/radicados/{radicado.id}"
        radicados = RepositorioRadicados(db)
        assert radicados.novedades(abogado.id) == {radicado.id: 2}
        aviso = next(item for item in avisos_abogado(db, abogado) if item["tipo"] == "ACTUACIONES_NUEVAS")
        assert aviso["href"] == detalle
        assert aviso["descripcion"].startswith("2 actuaciones nuevas")

        # Abrir el detalle del radicado es lo que quita el aviso.
        radicados.marcar_revisado(abogado.id, radicado.id)
        assert radicados.novedades(abogado.id) == {}
        assert not any(item["tipo"] == "ACTUACIONES_NUEVAS" for item in avisos_abogado(db, abogado))
