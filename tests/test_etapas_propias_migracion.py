"""Revisión 0017: las etapas propias de cada proceso."""

from alembic import command
from sqlalchemy import create_engine, inspect, text

from app import models
from app.migraciones import _configuracion, aplicar_migraciones

T = models.Base.metadata.tables


def _columnas(engine) -> set[str]:
    return {columna["name"] for columna in inspect(engine).get_columns("plantillas_etapas")}


def test_agrega_la_columna_y_al_bajar_devuelve_los_procesos_a_su_plantilla(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'etapas.db'}")
    aplicar_migraciones(engine)
    with engine.begin() as conexion:
        command.downgrade(_configuracion(conexion), "0016")
    assert "proceso_id" not in _columnas(engine)

    aplicar_migraciones(engine)
    assert "proceso_id" in _columnas(engine)
    with engine.begin() as conexion:
        conexion.execute(T["usuarios"].insert().values(
            id=1, email="a@example.test", password_hash="x", nombre_completo="Abogada",
            whatsapp_numero="", rol="ABOGADO_ADMIN", estado="ACTIVO",
        ))
        conexion.execute(T["procesos"].insert().values(id=10, abogado_id=1, nombre="Sucesión"))
        conexion.execute(T["plantillas_etapas"].insert().values(id=1, nombre="General", activa=True))
        conexion.execute(T["plantillas_etapas"].insert().values(id=2, nombre="General", activa=True, proceso_id=10))
        conexion.execute(T["etapas_plantilla"].insert().values(id=5, plantilla_id=2, nombre="Propia", orden=0, activa=True))
        conexion.execute(text("UPDATE procesos SET plantilla_etapas_id = 2, etapa_id = 5 WHERE id = 10"))
        conexion.execute(T["etapas_proceso"].insert().values(proceso_id=10, etapa_id=5))

    with engine.begin() as conexion:
        command.downgrade(_configuracion(conexion), "0016")

    assert "proceso_id" not in _columnas(engine)
    with engine.connect() as conexion:
        assert conexion.execute(text("SELECT plantilla_etapas_id, etapa_id FROM procesos")).one() == (None, None)
        assert conexion.execute(text("SELECT id FROM plantillas_etapas")).scalars().all() == [1]
        assert conexion.execute(text("SELECT COUNT(*) FROM etapas_proceso")).scalar() == 0
        assert conexion.execute(text("PRAGMA foreign_key_check")).all() == []
