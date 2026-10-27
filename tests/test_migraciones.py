from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import Column, Integer, MetaData, Table, create_engine, inspect, text

from app import models
from app.migraciones import REVISION_BASE, RUTA_VERSIONES, aplicar_migraciones

RAIZ = Path(__file__).resolve().parents[1]


def _head() -> str:
    config = Config(str(RAIZ / "alembic.ini"))
    config.set_main_option("script_location", str(RAIZ / "alembic_migrations"))
    return ScriptDirectory.from_config(config).get_current_head()


def _version(engine) -> str:
    with engine.connect() as conexion:
        return conexion.execute(text("SELECT version_num FROM alembic_version")).scalar()


def test_revisions_form_a_single_chain_from_the_base():
    config = Config(str(RAIZ / "alembic.ini"))
    config.set_main_option("script_location", str(RAIZ / "alembic_migrations"))
    script = ScriptDirectory.from_config(config)
    assert len(script.get_heads()) == 1
    assert [rev.revision for rev in script.walk_revisions()][-1] == REVISION_BASE
    assert RUTA_VERSIONES.is_dir()


def test_empty_database_is_created_from_models_and_marked_at_head(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'vacia.db'}")
    aplicar_migraciones(engine)

    tablas = set(inspect(engine).get_table_names())
    assert set(models.Base.metadata.tables) <= tablas
    assert _version(engine) == _head()


def test_database_created_before_alembic_is_stamped_and_upgraded(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'heredada.db'}")
    models.Base.metadata.create_all(engine)
    with engine.begin() as conexion:
        conexion.execute(models.Plan.__table__.insert().values(nombre="Básico", limite_radicados=10, precio_mensual=0))

    aplicar_migraciones(engine)
    aplicar_migraciones(engine)  # Repetirlo no cambia nada.

    assert _version(engine) == _head()
    with engine.connect() as conexion:
        assert conexion.execute(text("SELECT COUNT(*) FROM planes")).scalar() == 1


def test_unrelated_tables_do_not_count_as_an_existing_schema(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'otra.db'}")
    Table("otra_cosa", MetaData(), Column("id", Integer, primary_key=True)).create(engine)

    aplicar_migraciones(engine)

    assert models.Usuario.__tablename__ in inspect(engine).get_table_names()
    assert _version(engine) == _head()


def test_pending_revisions_are_applied_to_a_versioned_database(tmp_path, monkeypatch):
    import shutil

    from app import migraciones

    raiz = tmp_path / "proyecto"
    shutil.copytree(RAIZ / "alembic_migrations", raiz / "alembic_migrations", ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copy(RAIZ / "alembic.ini", raiz / "alembic.ini")
    monkeypatch.setattr(migraciones, "RAIZ", raiz)

    engine = create_engine(f"sqlite:///{tmp_path / 'versionada.db'}")
    aplicar_migraciones(engine)

    (raiz / "alembic_migrations" / "versions" / "9999_columna_prueba.py").write_text(
        f'revision = "9999"\ndown_revision = "{_head()}"\nbranch_labels = None\ndepends_on = None\n\n'
        "from alembic import op\nimport sqlalchemy as sa\n\n\n"
        "def upgrade():\n    op.add_column('planes', sa.Column('columna_prueba', sa.Integer(), nullable=True))\n\n\n"
        "def downgrade():\n    op.drop_column('planes', 'columna_prueba')\n",
        encoding="utf-8",
    )
    aplicar_migraciones(engine)

    assert _version(engine) == "9999"
    assert "columna_prueba" in {col["name"] for col in inspect(engine).get_columns("planes")}
