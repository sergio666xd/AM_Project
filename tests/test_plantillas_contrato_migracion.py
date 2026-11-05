"""Revisión 0018: plantillas de contrato."""

from alembic import command
from sqlalchemy import create_engine, inspect, text

from app.migraciones import _configuracion, aplicar_migraciones
from app.modulos.contratos import plantilla_cps


def test_crea_la_tabla_siembra_cps_una_vez_y_se_puede_bajar(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'plantillas.db'}")
    aplicar_migraciones(engine)
    with engine.begin() as conexion:
        command.downgrade(_configuracion(conexion), "0017")
    assert not inspect(engine).has_table("plantillas_contrato")
    assert "plantilla_id" not in {c["name"] for c in inspect(engine).get_columns("contratos_servicios")}

    aplicar_migraciones(engine)
    with engine.begin() as conexion:
        assert conexion.execute(text("SELECT nombre FROM plantillas_contrato")).scalars().all() == [plantilla_cps.NOMBRE]
        conexion.execute(text("UPDATE plantillas_contrato SET eliminada_en = CURRENT_TIMESTAMP"))
        plantilla_cps.sembrar(conexion)  # Si la firma las eliminó todas, no vuelve a aparecer.
        assert conexion.execute(text("SELECT COUNT(*) FROM plantillas_contrato")).scalar() == 1
    assert "plantilla_copia" in {c["name"] for c in inspect(engine).get_columns("contratos_servicios")}
