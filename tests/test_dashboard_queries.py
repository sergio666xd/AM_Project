from datetime import timedelta

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session

from app import models
from app.radicados import obtener_o_vincular_radicado
from app.timezone import utc_ahora


def _seed(db, total_radicados):
    lawyer = models.Usuario(
        email="dashboard@example.test",
        password_hash="hash",
        nombre_completo="Dashboard",
        whatsapp_numero="",
        rol=models.RolUsuario.ABOGADO,
        estado=models.EstadoUsuario.ACTIVO,
    )
    db.add(lawyer)
    db.flush()
    base = utc_ahora() - timedelta(days=1)
    for index in range(total_radicados):
        radicado, _ = obtener_o_vincular_radicado(db, lawyer, f"{index + 1:023d}")
        db.flush()
        if index % 3 == 0:
            continue  # Sin consultas.
        db.add(models.ConsultaRadicado(radicado_id=radicado.id, estado="COMPLETADA", actuaciones_nuevas=0, inicio=base))
        ultima = "ERROR" if index % 3 == 1 else "COMPLETADA"
        db.add(models.ConsultaRadicado(
            radicado_id=radicado.id,
            estado=ultima,
            actuaciones_nuevas=0 if ultima == "ERROR" else 2,
            inicio=base + timedelta(hours=1),
        ))
    db.commit()
    return lawyer


def _dashboard(total_radicados):
    from app.routers.dashboard import obtener_dashboard

    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    statements = []
    with Session(engine) as db:
        lawyer = _seed(db, total_radicados)
        db.expire_all()
        event.listen(engine, "before_cursor_execute", lambda *args: statements.append(args[2]))
        result = obtener_dashboard(usuario_actual=lawyer, db=db)
    return result, len(statements)


def test_dashboard_reports_latest_consultation_per_radicado():
    result, _ = _dashboard(6)

    tipos = {item["numero"]: item["tipo"] for item in result["procesos_atencion"]}
    assert tipos == {
        f"{1:023d}": "SIN_CONSULTA",
        f"{2:023d}": "ERROR",
        f"{3:023d}": "ACTUACIONES_NUEVAS",
        f"{4:023d}": "SIN_CONSULTA",
        f"{5:023d}": "ERROR",
        f"{6:023d}": "ACTUACIONES_NUEVAS",
    }
    assert result["resumen"]["total_radicados"] == 6
    assert result["resumen"]["actuaciones_nuevas"] == 4
    assert result["resumen"]["consultas_error"] == 2
    assert len(result["ultimas_consultas"]) == 8
    assert all(item["radicado"] for item in result["ultimas_consultas"])


def test_dashboard_query_count_does_not_grow_with_radicados():
    _, few = _dashboard(3)
    _, many = _dashboard(30)
    assert many == few
