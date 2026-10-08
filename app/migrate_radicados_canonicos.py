"""Preview/apply the first canonical-radicado schema migration.

Run a read-only preview first. Applying requires an independently verified backup.
"""

import argparse
import json
from collections import defaultdict
from datetime import datetime

from sqlalchemy import MetaData, Table, delete, inspect, insert, select, text, update

from app import models
from app.database import engine
from app.radicados import FUENTE_RAMA_JUDICIAL, normalizar_numero_radicado


_RADICADO_REFERENCES = {
    "actuaciones",
    "consultas_radicados",
    "ejecuciones_radicados",
    "procesos_radicados",
    "radicados_usuarios",
    "subtareas",
    "tareas",
}
_ACTUACION_KEY_FIELDS = (
    "fecha_actuacion",
    "actuacion",
    "anotacion",
    "fecha_inicia_termino",
    "fecha_finaliza_termino",
    "fecha_registro",
)


def _scope_for_role(role: str, owner_id: int) -> str:
    if role == models.RolUsuario.ABOGADO.value:
        return f"SAAS:{owner_id}"
    if role in (models.RolUsuario.ABOGADO_ADMIN.value, models.RolUsuario.ADMIN.value):
        return "FIRMA"
    return ""


def _existing_table(connection, name: str):
    if name not in inspect(connection).get_table_names():
        return None
    return Table(name, MetaData(), autoload_with=connection)


def _legacy_records(connection) -> tuple[list[dict], set[str]]:
    radicados = _existing_table(connection, "radicados")
    usuarios = _existing_table(connection, "usuarios")
    if radicados is None or usuarios is None:
        raise RuntimeError("No se encontraron las tablas radicados y usuarios.")

    radicado_columns = set(radicados.c.keys())
    owner_column = "creado_por_id" if "creado_por_id" in radicado_columns else "usuario_id"
    if owner_column not in radicado_columns:
        raise RuntimeError("No se encontró el propietario legacy de los radicados.")

    user_roles = dict(connection.execute(select(usuarios.c.id, usuarios.c.rol)).all())
    rows = connection.execute(select(radicados)).mappings().all()
    records = []
    for row in rows:
        record = dict(row)
        owner_id = record.get(owner_column)
        role = user_roles.get(owner_id)
        role_name = role.value if hasattr(role, "value") else str(role or "")
        number = record.get("numero") or ""
        number_normalized = (
            record.get("numero_normalizado")
            or normalizar_numero_radicado(number)
        )
        source = record.get("fuente") or FUENTE_RAMA_JUDICIAL
        scope = record.get("ambito_key") or (
            _scope_for_role(role_name, owner_id) if owner_id is not None else ""
        )
        record.update(
            {
                "owner_id": owner_id,
                "role": role_name,
                "fuente": source,
                "ambito_key": scope,
                "numero_normalizado": number_normalized,
            }
        )
        records.append(record)
    return records, radicado_columns


def _foreign_key_issues(connection) -> list[str]:
    issues = []
    inspector = inspect(connection)
    for table_name in inspector.get_table_names():
        for foreign_key in inspector.get_foreign_keys(table_name):
            if foreign_key.get("referred_table") == "radicados" and table_name not in _RADICADO_REFERENCES:
                issues.append(table_name)
    return sorted(set(issues))


def _scope_reference_count(connection, records: list[dict]) -> int:
    scope_by_radicado = {
        record["id"]: (record["fuente"], record["ambito_key"])
        for record in records
    }
    usuarios = _existing_table(connection, "usuarios")
    user_roles = {}
    if usuarios is not None:
        user_roles = dict(connection.execute(select(usuarios.c.id, usuarios.c.rol)).all())

    def owner_scope(owner_id):
        role = user_roles.get(owner_id)
        role_name = role.value if hasattr(role, "value") else str(role or "")
        return _scope_for_role(role_name, owner_id) if owner_id is not None else ""

    mismatches = 0
    process_links = _existing_table(connection, "procesos_radicados")
    processes = _existing_table(connection, "procesos")
    if (
        process_links is not None
        and processes is not None
        and "abogado_id" in processes.c
    ):
        rows = connection.execute(
            select(process_links.c.radicado_id, processes.c.abogado_id)
            .select_from(process_links.join(processes, process_links.c.proceso_id == processes.c.id))
        ).all()
        for radicado_id, owner_id in rows:
            scope = scope_by_radicado.get(radicado_id)
            if scope is None or not owner_scope(owner_id) or scope[1] != owner_scope(owner_id):
                mismatches += 1

    tareas = _existing_table(connection, "tareas")
    if tareas is not None and {"usuario_id", "radicado_id"}.issubset(tareas.c.keys()):
        rows = connection.execute(
            select(tareas.c.radicado_id, tareas.c.usuario_id).where(
                tareas.c.radicado_id.is_not(None)
            )
        ).all()
        for radicado_id, owner_id in rows:
            scope = scope_by_radicado.get(radicado_id)
            if scope is None or not owner_scope(owner_id) or scope[1] != owner_scope(owner_id):
                mismatches += 1

    subtareas = _existing_table(connection, "subtareas")
    if tareas is not None and subtareas is not None and {
        "tarea_id", "radicado_id"
    }.issubset(subtareas.c.keys()) and {"id", "usuario_id"}.issubset(tareas.c.keys()):
        rows = connection.execute(
            select(subtareas.c.radicado_id, tareas.c.usuario_id)
            .select_from(subtareas.join(tareas, subtareas.c.tarea_id == tareas.c.id))
            .where(subtareas.c.radicado_id.is_not(None))
        ).all()
        for radicado_id, owner_id in rows:
            scope = scope_by_radicado.get(radicado_id)
            if scope is None or not owner_scope(owner_id) or scope[1] != owner_scope(owner_id):
                mismatches += 1

    associations = _existing_table(connection, "radicados_usuarios")
    if associations is not None:
        rows = connection.execute(
            select(associations.c.radicado_id, associations.c.usuario_id)
        ).all()
        for radicado_id, owner_id in rows:
            scope = scope_by_radicado.get(radicado_id)
            if scope is None or not owner_scope(owner_id) or scope[1] != owner_scope(owner_id):
                mismatches += 1
    return mismatches


def previsualizar(connection) -> dict[str, int | list[str]]:
    records, _ = _legacy_records(connection)
    groups = defaultdict(list)
    invalid_ids = set()
    for record in records:
        if (
            record["role"] not in {
                models.RolUsuario.ABOGADO.value,
                models.RolUsuario.ABOGADO_ADMIN.value,
                models.RolUsuario.ADMIN.value,
            }
            or len(record["numero_normalizado"]) != 23
            or not record["ambito_key"]
        ):
            invalid_ids.add(record["id"])
        groups[(record["fuente"], record["ambito_key"], record["numero_normalizado"])].append(record)

    duplicate_groups = [group for group in groups.values() if len(group) > 1]
    conflict_groups = 0
    for group in duplicate_groups:
        for field in ("id_proceso_rama", "detalle_pendiente", "alerta_enviada"):
            if field not in group[0]:
                continue
            values = {str(record.get(field)) for record in group if record.get(field) not in (None, "")}
            if len(values) > 1:
                conflict_groups += 1
                break

    return {
        "radicados": len(records),
        "duplicate_groups": len(duplicate_groups),
        "rows_to_merge": sum(len(group) - 1 for group in duplicate_groups),
        "invalid_rows": len(invalid_ids),
        "conflict_groups": conflict_groups,
        "cross_scope_references": _scope_reference_count(connection, records),
        "unhandled_reference_tables": _foreign_key_issues(connection),
    }


def _ensure_canonical_columns(connection) -> None:
    columns = {column["name"] for column in inspect(connection).get_columns("radicados")}
    if "creado_por_id" not in columns and "usuario_id" in columns:
        connection.execute(text("ALTER TABLE radicados RENAME COLUMN usuario_id TO creado_por_id"))
        columns.remove("usuario_id")
        columns.add("creado_por_id")

    definitions = {
        "fuente": "VARCHAR(50)",
        "ambito_key": "VARCHAR(64)",
        "numero_normalizado": "VARCHAR(23)",
        "id_proceso_rama": "VARCHAR(64)",
    }
    for column, definition in definitions.items():
        if column not in columns:
            connection.execute(text(f"ALTER TABLE radicados ADD COLUMN {column} {definition}"))

    models.Base.metadata.create_all(connection, tables=[models.radicados_usuarios])


def _mover_vinculo(connection, associations: Table, user_id: int, radicado_id: int) -> None:
    exists = connection.execute(
        select(associations.c.usuario_id).where(
            associations.c.usuario_id == user_id,
            associations.c.radicado_id == radicado_id,
        )
    ).first()
    if not exists:
        connection.execute(
            insert(associations).values(usuario_id=user_id, radicado_id=radicado_id)
        )


def _date_order(value: object) -> int:
    if not value:
        return 0
    text_value = str(value)
    for date_format in ("%d/%m/%Y", "%Y-%m-%d", "%Y-%m-%dT%H:%M:%S"):
        try:
            return int(datetime.strptime(text_value[:19], date_format).timestamp())
        except ValueError:
            continue
    return 0


def _merge_actuations(connection, radicado_ids: list[int], survivor_id: int) -> None:
    actuations = _existing_table(connection, "actuaciones")
    if actuations is None:
        return

    rows = connection.execute(
        select(actuations)
        .where(actuations.c.radicado_id.in_(radicado_ids))
        .order_by(actuations.c.radicado_id, actuations.c.orden, actuations.c.id)
    ).mappings().all()
    ordered_rows = sorted(
        rows,
        key=lambda row: (row["radicado_id"] != survivor_id, row["orden"], row["id"]),
    )
    action_references = []
    inspector = inspect(connection)
    for table_name in inspector.get_table_names():
        for foreign_key in inspector.get_foreign_keys(table_name):
            if foreign_key.get("referred_table") == "actuaciones" and "actuacion_id" in foreign_key.get("constrained_columns", []):
                table = _existing_table(connection, table_name)
                if table is not None:
                    action_references.append(table)

    kept_by_key = {}
    kept_rows = []
    key_fields = [field for field in _ACTUACION_KEY_FIELDS if field in actuations.c]
    for row in ordered_rows:
        key = tuple(row.get(field) or "" for field in key_fields)
        retained_id = kept_by_key.get(key)
        if retained_id is not None:
            for table in action_references:
                connection.execute(
                    update(table)
                    .where(table.c.actuacion_id == row["id"])
                    .values(actuacion_id=retained_id)
                )
            connection.execute(delete(actuations).where(actuations.c.id == row["id"]))
            continue

        kept_by_key[key] = row["id"]
        kept_rows.append(row)
        if row["radicado_id"] != survivor_id:
            connection.execute(
                update(actuations)
                .where(actuations.c.id == row["id"])
                .values(radicado_id=survivor_id)
            )

    kept_rows.sort(
        key=lambda row: (
            -max(_date_order(row.get("fecha_registro")), _date_order(row.get("fecha_actuacion"))),
            row["orden"],
            row["id"],
        )
    )
    for order, row in enumerate(kept_rows, start=1):
        connection.execute(
            update(actuations).where(actuations.c.id == row["id"]).values(orden=order)
        )


def _merge_group(connection, radicados: Table, associations: Table, group: list[dict]) -> None:
    group.sort(key=lambda record: record["id"])
    survivor = group[0]
    survivor_id = survivor["id"]
    old_ids = [record["id"] for record in group[1:]]
    radicado_ids = [record["id"] for record in group]

    process_links = _existing_table(connection, "procesos_radicados")
    if process_links is not None:
        for old_id in old_ids:
            process_ids = connection.execute(
                select(process_links.c.proceso_id).where(process_links.c.radicado_id == old_id)
            ).scalars().all()
            for process_id in process_ids:
                exists = connection.execute(
                    select(process_links.c.proceso_id).where(
                        process_links.c.proceso_id == process_id,
                        process_links.c.radicado_id == survivor_id,
                    )
                ).first()
                if not exists:
                    connection.execute(
                        insert(process_links).values(proceso_id=process_id, radicado_id=survivor_id)
                    )
                connection.execute(
                    delete(process_links).where(
                        process_links.c.proceso_id == process_id,
                        process_links.c.radicado_id == old_id,
                    )
                )

    _merge_actuations(connection, radicado_ids, survivor_id)
    for table_name in ("consultas_radicados", "ejecuciones_radicados", "tareas", "subtareas"):
        table = _existing_table(connection, table_name)
        if table is not None and "radicado_id" in table.c:
            connection.execute(
                update(table)
                .where(table.c.radicado_id.in_(old_ids))
                .values(radicado_id=survivor_id)
            )

    for old_id in old_ids:
        users = connection.execute(
            select(associations.c.usuario_id).where(associations.c.radicado_id == old_id)
        ).scalars().all()
        for user_id in users:
            _mover_vinculo(connection, associations, user_id, survivor_id)
        connection.execute(delete(associations).where(associations.c.radicado_id == old_id))

    updated = {}
    latest = max(group, key=lambda record: str(record.get("consultado_en") or ""))
    for field in ("estado_consulta", "consultado_en"):
        if field in radicados.c:
            updated[field] = latest.get(field)
    for field in ("despacho_departamento", "demandante", "demandado", "detalle_pendiente"):
        if field in radicados.c and not survivor.get(field):
            updated[field] = next((record.get(field) for record in group if record.get(field)), survivor.get(field))
    if "alerta_enviada" in radicados.c and survivor.get("alerta_enviada") is None:
        updated["alerta_enviada"] = next(
            (record.get("alerta_enviada") for record in group if record.get("alerta_enviada") is not None),
            None,
        )
    if "id_proceso_rama" in radicados.c:
        updated["id_proceso_rama"] = next(
            (record.get("id_proceso_rama") for record in group if record.get("id_proceso_rama")),
            None,
        )
    if "created_at" in radicados.c:
        dates = [record.get("created_at") for record in group if record.get("created_at") is not None]
        if dates:
            updated["created_at"] = min(dates, key=str)
    if updated:
        connection.execute(update(radicados).where(radicados.c.id == survivor_id).values(**updated))
    connection.execute(delete(radicados).where(radicados.c.id.in_(old_ids)))


def migrar(connection) -> dict[str, int | list[str]]:
    report = previsualizar(connection)
    blockers = (
        report["invalid_rows"]
        or report["conflict_groups"]
        or report["cross_scope_references"]
        or report["unhandled_reference_tables"]
    )
    if blockers:
        raise RuntimeError(f"La migración requiere revisión manual; diagnóstico: {report}")

    _ensure_canonical_columns(connection)
    radicados = _existing_table(connection, "radicados")
    associations = models.radicados_usuarios
    records, _ = _legacy_records(connection)
    grouped = defaultdict(list)
    for record in records:
        connection.execute(
            update(radicados)
            .where(radicados.c.id == record["id"])
            .values(
                fuente=record["fuente"],
                ambito_key=record["ambito_key"],
                numero_normalizado=record["numero_normalizado"],
            )
        )
        _mover_vinculo(connection, associations, record["owner_id"], record["id"])
        grouped[(record["fuente"], record["ambito_key"], record["numero_normalizado"])].append(record)

    for group in grouped.values():
        if len(group) > 1:
            _merge_group(connection, radicados, associations, group)

    index = next(
        index
        for index in models.Radicado.__table__.indexes
        if index.name == "uq_radicados_fuente_ambito_numero"
    )
    index.create(connection, checkfirst=True)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrar radicados a fichas canónicas por ámbito.")
    parser.add_argument("--apply", action="store_true", help="Aplicar la migración en una transacción.")
    parser.add_argument(
        "--backup-confirmed",
        action="store_true",
        help="Confirma que existe un backup verificado antes de aplicar.",
    )
    args = parser.parse_args()
    if args.apply and not args.backup_confirmed:
        parser.error("Antes de aplicar, crea y verifica un backup; luego añade --backup-confirmed.")

    with engine.connect() as connection:
        if args.apply:
            with connection.begin():
                report = migrar(connection)
        else:
            report = previsualizar(connection)
    print(json.dumps(report, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
