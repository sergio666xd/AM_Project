"""Revisión 0016: el retiro del antiguo portal SaaS."""

import pytest
from sqlalchemy import create_engine, inspect, text

from app import models
from app.migraciones import aplicar_migraciones

T = models.Base.metadata.tables


def _base_en_0015(engine) -> None:
    """Esquema tal como quedó en la revisión 0015, con las tablas del SaaS."""
    models.Base.metadata.create_all(engine)
    with engine.begin() as conexion:
        conexion.execute(text(
            "CREATE TABLE planes (id INTEGER PRIMARY KEY, nombre VARCHAR NOT NULL, "
            "limite_radicados INTEGER NOT NULL, precio_mensual INTEGER NOT NULL)"
        ))
        conexion.execute(text("CREATE TABLE configuracion_saas (id INTEGER PRIMARY KEY, mostrar_planes BOOLEAN)"))
        conexion.execute(text("CREATE TABLE intereses_saas (id INTEGER PRIMARY KEY, email VARCHAR(120))"))
        conexion.execute(text(
            "CREATE TABLE solicitudes_registro (id INTEGER PRIMARY KEY, "
            "usuario_id INTEGER NOT NULL REFERENCES usuarios(id), notas_admin TEXT)"
        ))
        conexion.execute(text("ALTER TABLE usuarios ADD COLUMN plan_id INTEGER REFERENCES planes(id)"))
        conexion.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32) PRIMARY KEY)"))
        conexion.execute(text("INSERT INTO alembic_version VALUES ('0015')"))


def _usuario(conexion, id_, rol, **valores) -> int:
    conexion.execute(T["usuarios"].insert().values(
        id=id_, email=f"u{id_}@example.test", password_hash="x", nombre_completo=f"Usuario {id_}",
        whatsapp_numero="", rol=rol, estado="ACTIVO", **valores,
    ))
    return id_


def _radicado(conexion, id_, creador, ambito) -> int:
    numero = f"{id_:023d}"
    conexion.execute(T["radicados"].insert().values(
        id=id_, numero=numero, numero_normalizado=numero, creado_por_id=creador, ambito_key=ambito,
    ))
    conexion.execute(T["radicados_usuarios"].insert().values(usuario_id=creador, radicado_id=id_))
    return id_


def test_borra_las_tablas_del_saas_y_las_cuentas_abogado_con_sus_datos(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'saas.db'}")
    _base_en_0015(engine)
    with engine.begin() as conexion:
        conexion.execute(text("INSERT INTO planes (id, nombre, limite_radicados, precio_mensual) VALUES (1, 'Pro', 50, 50000)"))
        firma = _usuario(conexion, 1, "ABOGADO_ADMIN")
        externo = _usuario(conexion, 2, "ABOGADO")
        cliente_firma = _usuario(conexion, 3, "CLIENTE", creado_por_abogado_id=firma)
        cliente_externo = _usuario(conexion, 4, "CLIENTE", creado_por_abogado_id=externo)
        # Lo creó el abogado externo, pero también es cliente de la firma: se queda.
        cliente_compartido = _usuario(conexion, 5, "CLIENTE", creado_por_abogado_id=externo)
        conexion.execute(text("UPDATE usuarios SET plan_id = 1 WHERE id = 2"))
        conexion.execute(text("INSERT INTO solicitudes_registro (id, usuario_id) VALUES (1, 2)"))

        conexion.execute(T["procesos"].insert().values(id=10, abogado_id=firma, nombre="Proceso de la firma"))
        conexion.execute(T["procesos"].insert().values(id=20, abogado_id=externo, nombre="Proceso del SaaS"))
        for proceso, cliente in ((10, cliente_firma), (10, cliente_compartido), (20, cliente_externo), (20, cliente_compartido)):
            conexion.execute(T["procesos_clientes"].insert().values(proceso_id=proceso, cliente_id=cliente))

        radicado_firma = _radicado(conexion, 100, firma, "FIRMA")
        radicado_externo = _radicado(conexion, 200, externo, f"SAAS:{externo}")
        conexion.execute(T["procesos_radicados"].insert().values(proceso_id=10, radicado_id=radicado_firma))
        conexion.execute(T["procesos_radicados"].insert().values(proceso_id=20, radicado_id=radicado_externo))
        conexion.execute(T["actuaciones"].insert().values(id=1000, radicado_id=radicado_firma, orden=1, actuacion="De la firma"))
        conexion.execute(T["actuaciones"].insert().values(id=2000, radicado_id=radicado_externo, orden=1, actuacion="Del SaaS"))
        conexion.execute(T["tareas"].insert().values(id=1, usuario_id=firma, titulo="De la firma", proceso_id=10))
        conexion.execute(T["tareas"].insert().values(
            id=2, usuario_id=externo, titulo="Del SaaS", proceso_id=20, radicado_id=radicado_externo, actuacion_id=2000,
        ))
        conexion.execute(T["solicitudes_documento"].insert().values(id=1, proceso_id=20, cliente_id=cliente_externo, titulo="Cédula"))
        conexion.execute(T["documentos_proceso"].insert().values(
            id=1, proceso_id=20, cliente_id=cliente_externo, solicitud_id=1,
            nombre_archivo="cedula.pdf", ruta_archivo="r2/cedula.pdf", mime_type="application/pdf",
        ))
        conexion.execute(T["eventos_auditoria"].insert().values(id=1, actor_id=externo, accion="radicado.crear", tipo_recurso="radicado"))
        conexion.execute(T["eventos_auditoria"].insert().values(id=2, actor_id=firma, accion="proceso.crear", tipo_recurso="proceso"))

    aplicar_migraciones(engine)

    inspector = inspect(engine)
    tablas = set(inspector.get_table_names())
    assert not tablas & {"planes", "configuracion_saas", "intereses_saas", "solicitudes_registro"}
    assert "plan_id" not in {columna["name"] for columna in inspector.get_columns("usuarios")}

    with engine.connect() as conexion:
        def ids(sql: str) -> set[int]:
            return {fila[0] for fila in conexion.execute(text(sql))}

        assert ids("SELECT id FROM usuarios") == {firma, cliente_firma, cliente_compartido}
        assert ids("SELECT id FROM procesos") == {10}
        assert ids("SELECT cliente_id FROM procesos_clientes") == {cliente_firma, cliente_compartido}
        assert ids("SELECT id FROM radicados") == {radicado_firma}
        assert ids("SELECT radicado_id FROM procesos_radicados") == {radicado_firma}
        assert ids("SELECT radicado_id FROM radicados_usuarios") == {radicado_firma}
        assert ids("SELECT id FROM actuaciones") == {1000}
        assert ids("SELECT id FROM tareas") == {1}
        assert ids("SELECT id FROM solicitudes_documento") == set()
        assert ids("SELECT id FROM documentos_proceso") == set()
        # La auditoría se conserva: solo pierde la referencia a la cuenta borrada.
        assert dict(conexion.execute(text("SELECT id, actor_id FROM eventos_auditoria")).all()) == {1: None, 2: firma}
        assert conexion.execute(text(
            "SELECT creado_por_abogado_id FROM usuarios WHERE id = :id"
        ), {"id": cliente_compartido}).scalar() is None
        assert conexion.execute(text("PRAGMA foreign_key_check")).all() == []
        assert conexion.execute(text("SELECT version_num FROM alembic_version")).scalar() == "0016"


def test_sin_datos_del_saas_solo_retira_las_tablas(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'limpia.db'}")
    _base_en_0015(engine)
    with engine.begin() as conexion:
        _usuario(conexion, 1, "ADMIN")
        _usuario(conexion, 2, "ABOGADO_ADMIN")

    aplicar_migraciones(engine)
    aplicar_migraciones(engine)  # Repetirlo no cambia nada.

    with engine.connect() as conexion:
        assert {fila[0] for fila in conexion.execute(text("SELECT id FROM usuarios"))} == {1, 2}
    assert "planes" not in inspect(engine).get_table_names()


def test_no_se_aplica_en_una_vista_previa_de_vercel(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'vista.db'}")
    _base_en_0015(engine)
    with engine.begin() as conexion:
        _usuario(conexion, 1, "ABOGADO")
    monkeypatch.setenv("VERCEL_ENV", "preview")

    with pytest.raises(RuntimeError, match="solo se aplica en producción"):
        aplicar_migraciones(engine)

    with engine.connect() as conexion:
        assert conexion.execute(text("SELECT version_num FROM alembic_version")).scalar() == "0015"
        assert conexion.execute(text("SELECT COUNT(*) FROM usuarios")).scalar() == 1
    assert "planes" in inspect(engine).get_table_names()
