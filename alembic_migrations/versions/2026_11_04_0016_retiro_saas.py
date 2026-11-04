'''Retiro del antiguo portal SaaS.

La aplicación es de una sola firma. Esta revisión borra lo que quedaba del
SaaS, con la confirmación de la firma:

- Las tablas `planes`, `configuracion_saas`, `intereses_saas` y
  `solicitudes_registro`, y la columna `usuarios.plan_id`.
- Las cuentas con perfil ABOGADO (los abogados externos del SaaS) con todo lo
  suyo: sus procesos, sus radicados con las actuaciones y consultas, sus tareas
  y los clientes que crearon y que no están en ningún proceso de la firma.
  Los registros de la firma que solo los mencionaban (auditoría, autor de un
  cambio, remitente de un mensaje) se conservan sin esa referencia.
- Los radicados que aún tengan el ámbito aislado `SAAS:<id>`.

No se puede deshacer: `downgrade` vuelve a crear las tablas y la columna,
vacías, pero no recupera los datos.

Revision ID: 0016
Revises: 0015
Create Date: 2026-11-04
'''
import logging
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0016"
down_revision: Union[str, Sequence[str], None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger("alembic.runtime.migration")

TABLAS_SAAS = ("solicitudes_registro", "intereses_saas", "configuracion_saas", "planes")

# Quién apunta a cada tabla, tomado del esquema de la revisión 0015, y qué se
# hace con esa fila cuando se borra la fila a la que apunta: "borrar" (es parte
# de lo borrado) o "nulo" (es de la firma y solo pierde la referencia).
REFERENCIAS = {
    "actuaciones": (
        ("entregas_notificacion_actuaciones", "actuacion_id", "borrar"),
        ("notificaciones_proceso", "actuacion_id", "borrar"),
        ("subtareas", "actuacion_id", "borrar"),
        ("tareas", "actuacion_id", "borrar"),
    ),
    "chat_conversaciones": (
        ("chat_mensajes", "conversacion_id", "borrar"),
        ("chat_participantes", "conversacion_id", "borrar"),
    ),
    "consultas_radicados": (
        ("ejecuciones_radicados", "consulta_id", "nulo"),
    ),
    "contratos_servicios": (
        ("contratos_servicios_versiones", "contrato_id", "borrar"),
        ("documentos_proceso", "contrato_id", "nulo"),
        ("entregas_correo_contrato", "contrato_id", "borrar"),
        ("eventos_agenda", "contrato_id", "nulo"),
    ),
    "cuentas_cobro": (
        ("ajustes_cuenta_cobro", "cuenta_id", "borrar"),
        ("aplicaciones_pago", "cuenta_id", "borrar"),
        ("cuentas_cobro_lineas", "cuenta_id", "borrar"),
        ("entregas_correo_financiero", "cuenta_id", "nulo"),
    ),
    "documentos_proceso": (
        ("entregas_correo_contrato", "documento_id", "nulo"),
    ),
    "ejecuciones_barrido": (
        ("ejecuciones_radicados", "ejecucion_id", "borrar"),
    ),
    "entregas_notificacion": (
        ("entregas_notificacion_actuaciones", "entrega_id", "borrar"),
    ),
    "etapas_plantilla": (
        ("etapas_proceso", "etapa_id", "borrar"),
        ("procesos", "etapa_id", "nulo"),
    ),
    "pagos_financieros": (
        ("aplicaciones_pago", "pago_id", "borrar"),
        ("entregas_correo_financiero", "pago_id", "nulo"),
        ("reversiones_pago", "pago_id", "borrar"),
    ),
    "plantillas_etapas": (
        ("etapas_plantilla", "plantilla_id", "borrar"),
        ("procesos", "plantilla_etapas_id", "nulo"),
    ),
    "procesos": (
        ("chat_conversaciones", "proceso_id", "borrar"),
        ("comunicaciones_proceso", "proceso_id", "borrar"),
        ("contratos_servicios", "proceso_id", "borrar"),
        ("cuentas_cobro", "proceso_id", "nulo"),
        ("documentos_proceso", "proceso_id", "borrar"),
        ("etapas_proceso", "proceso_id", "borrar"),
        ("eventos_agenda", "proceso_id", "nulo"),
        ("folios_expediente", "proceso_id", "borrar"),
        ("notificaciones_proceso", "proceso_id", "borrar"),
        ("pagos_financieros", "proceso_id", "nulo"),
        ("procesos_clientes", "proceso_id", "borrar"),
        ("procesos_colaboradores", "proceso_id", "borrar"),
        ("procesos_radicados", "proceso_id", "borrar"),
        ("solicitudes_documento", "proceso_id", "borrar"),
        ("subtareas", "proceso_id", "borrar"),
        ("tareas", "proceso_id", "borrar"),
        ("vistas_proceso_cliente", "proceso_id", "borrar"),
    ),
    "radicados": (
        ("actuaciones", "radicado_id", "borrar"),
        ("consultas_radicados", "radicado_id", "borrar"),
        ("ejecuciones_radicados", "radicado_id", "borrar"),
        ("novedades_radicado_usuario", "radicado_id", "borrar"),
        ("procesos_radicados", "radicado_id", "borrar"),
        ("radicados_usuarios", "radicado_id", "borrar"),
        ("subtareas", "radicado_id", "borrar"),
        ("tareas", "radicado_id", "borrar"),
    ),
    "recordatorios_tareas": (
        ("entregas_notificacion", "recordatorio_id", "nulo"),
    ),
    "solicitudes_documento": (
        ("documentos_proceso", "solicitud_id", "borrar"),
    ),
    "tareas": (
        ("recordatorios_tareas", "tarea_id", "borrar"),
        ("subtareas", "tarea_id", "borrar"),
    ),
    "usuarios": (
        ("ajustes_cuenta_cobro", "creado_por_id", "nulo"),
        ("aplicaciones_pago", "creado_por_id", "nulo"),
        ("chat_avisos_destinatario", "destinatario_id", "borrar"),
        ("chat_avisos_destinatario", "remitente_id", "borrar"),
        ("chat_conversaciones", "cliente_id", "nulo"),
        ("chat_conversaciones", "creado_por_id", "nulo"),
        ("chat_mensajes", "remitente_id", "nulo"),
        ("chat_participantes", "usuario_id", "borrar"),
        ("chat_presencias_panel", "usuario_id", "borrar"),
        ("chat_push_subscriptions", "usuario_id", "borrar"),
        ("codigos_seguridad_usuario", "usuario_id", "borrar"),
        ("comunicaciones_proceso", "actor_id", "nulo"),
        ("comunicaciones_proceso", "cliente_id", "nulo"),
        ("configuracion_consultas", "actualizado_por_id", "nulo"),
        ("configuracion_correo_financiero", "actualizado_por_id", "nulo"),
        ("configuracion_firma", "actualizado_por_id", "nulo"),
        ("configuracion_integraciones", "actualizado_por_id", "nulo"),
        ("contenido_paginas", "actualizado_por_id", "nulo"),
        ("contratos_servicios", "abogado_id", "nulo"),
        ("contratos_servicios", "cliente_id", "nulo"),
        ("contratos_servicios", "creado_por_id", "nulo"),
        ("contratos_servicios_versiones", "creado_por_id", "nulo"),
        ("cuentas_cobro", "abogado_id", "nulo"),
        ("cuentas_cobro", "cliente_id", "nulo"),
        ("cuentas_cobro", "creado_por_id", "nulo"),
        ("documentos_proceso", "cliente_id", "borrar"),
        ("documentos_proceso", "revisado_por_id", "nulo"),
        ("ejecuciones_barrido", "solicitada_por_id", "nulo"),
        ("entregas_correo_contrato", "creado_por_id", "nulo"),
        ("entregas_correo_financiero", "creado_por_id", "nulo"),
        ("entregas_notificacion", "usuario_id", "borrar"),
        ("entregas_notificacion_actuaciones", "usuario_id", "borrar"),
        ("etapas_proceso", "usuario_id", "nulo"),
        ("eventos_agenda", "cliente_id", "nulo"),
        ("eventos_agenda", "creado_por_id", "nulo"),
        ("eventos_agenda", "responsable_id", "nulo"),
        ("eventos_auditoria", "actor_id", "nulo"),
        ("folios_expediente", "revisado_por_id", "nulo"),
        ("glosario_actuaciones", "actualizado_por_id", "nulo"),
        ("lecturas_notificacion_abogado", "usuario_id", "borrar"),
        ("lecturas_notificacion_admin", "usuario_id", "borrar"),
        ("lecturas_notificacion_cliente", "usuario_id", "borrar"),
        ("notificaciones_proceso", "abogado_id", "borrar"),
        ("notificaciones_proceso", "cliente_id", "borrar"),
        ("novedades_radicado_usuario", "usuario_id", "borrar"),
        ("pagos_financieros", "abogado_id", "nulo"),
        ("pagos_financieros", "cliente_id", "nulo"),
        ("pagos_financieros", "registrado_por_id", "nulo"),
        ("plantillas_mensaje", "actualizado_por_id", "nulo"),
        ("plantillas_tarea", "creado_por_id", "nulo"),
        ("procesos", "abogado_id", "borrar"),
        ("procesos_clientes", "cliente_id", "borrar"),
        ("procesos_colaboradores", "abogado_id", "borrar"),
        ("procesos_colaboradores", "asignado_por_id", "nulo"),
        ("radicados", "creado_por_id", "borrar"),
        ("radicados_usuarios", "usuario_id", "borrar"),
        ("reversiones_pago", "revertido_por_id", "nulo"),
        ("solicitudes_contacto", "atendida_por_id", "nulo"),
        ("solicitudes_documento", "cliente_id", "borrar"),
        ("solicitudes_edicion_perfil_cliente", "cliente_id", "borrar"),
        ("solicitudes_edicion_perfil_cliente", "revisada_por_id", "nulo"),
        ("subtareas", "cliente_id", "borrar"),
        ("suscripciones_calendario", "usuario_id", "borrar"),
        ("tareas", "cliente_id", "borrar"),
        ("tareas", "usuario_id", "borrar"),
        ("usuarios", "creado_por_abogado_id", "nulo"),
        ("vistas_proceso_cliente", "usuario_id", "borrar"),
    ),
}

# Tablas sin columna `id`: sus filas se borran directamente y nadie las referencia.
SIN_ID = {"procesos_clientes", "procesos_colaboradores", "procesos_radicados", "radicados_usuarios"}

LOTE = 500


class _Borrado:
    """Borra filas y, antes, todo lo que depende de ellas según `REFERENCIAS`."""

    def __init__(self, conexion) -> None:
        self.conexion = conexion
        inspector = sa.inspect(conexion)
        self.columnas = {
            tabla: {columna["name"] for columna in inspector.get_columns(tabla)}
            for tabla in inspector.get_table_names()
        }
        self.borrados: dict[str, set[int]] = {}

    def _existe(self, tabla: str, columna: str) -> bool:
        return columna in self.columnas.get(tabla, set())

    def _lotes(self, ids):
        ids = sorted(ids)
        for inicio in range(0, len(ids), LOTE):
            yield ids[inicio:inicio + LOTE]

    def ids(self, sql: str, **parametros) -> set[int]:
        return {fila[0] for fila in self.conexion.execute(sa.text(sql), parametros)}

    def _hijos(self, tabla: str, columna: str, ids: set[int]) -> set[int]:
        encontrados: set[int] = set()
        for lote in self._lotes(ids):
            consulta = sa.text(f"SELECT id FROM {tabla} WHERE {columna} IN :ids").bindparams(sa.bindparam("ids", expanding=True))
            encontrados |= {fila[0] for fila in self.conexion.execute(consulta, {"ids": lote})}
        return encontrados

    def _ejecutar(self, sql: str, ids: set[int]) -> None:
        for lote in self._lotes(ids):
            consulta = sa.text(sql).bindparams(sa.bindparam("ids", expanding=True))
            self.conexion.execute(consulta, {"ids": lote})

    def borrar(self, tabla: str, ids: set[int]) -> None:
        ya = self.borrados.setdefault(tabla, set())
        ids = set(ids) - ya
        if not ids or tabla not in self.columnas:
            return
        ya |= ids
        for hijo, columna, accion in REFERENCIAS.get(tabla, ()):
            if not self._existe(hijo, columna):
                continue
            if accion == "nulo":
                self._ejecutar(f"UPDATE {hijo} SET {columna} = NULL WHERE {columna} IN :ids", ids)
            elif hijo in SIN_ID:
                self._ejecutar(f"DELETE FROM {hijo} WHERE {columna} IN :ids", ids)
            else:
                self.borrar(hijo, self._hijos(hijo, columna, ids))
        self._ejecutar(f"DELETE FROM {tabla} WHERE id IN :ids", ids)


def upgrade() -> None:
    conexion = op.get_bind()
    inspector = sa.inspect(conexion)

    if "plan_id" in {columna["name"] for columna in inspector.get_columns("usuarios")}:
        with op.batch_alter_table("usuarios") as tabla:
            tabla.drop_column("plan_id")
    for nombre in TABLAS_SAAS:
        if inspector.has_table(nombre):
            op.drop_table(nombre)

    borrado = _Borrado(conexion)
    abogados = borrado.ids("SELECT id FROM usuarios WHERE rol = 'ABOGADO'")
    if abogados:
        procesos = set()
        for lote in borrado._lotes(abogados):
            procesos |= borrado._hijos("procesos", "abogado_id", set(lote))
        borrado.borrar("procesos", procesos)
    # Los clientes que crearon y que no quedan en ningún proceso eran solo suyos.
    clientes = {
        cliente
        for cliente, creador in conexion.execute(sa.text(
            "SELECT id, creado_por_abogado_id FROM usuarios WHERE rol = 'CLIENTE' "
            "AND creado_por_abogado_id IS NOT NULL "
            "AND id NOT IN (SELECT cliente_id FROM procesos_clientes)"
        ))
        if creador in abogados
    }
    borrado.borrar("usuarios", abogados | clientes)
    borrado.borrar("radicados", borrado.ids("SELECT id FROM radicados WHERE ambito_key LIKE 'SAAS:%'"))

    resumen = {tabla: len(ids) for tabla, ids in sorted(borrado.borrados.items()) if ids}
    if resumen:
        logger.warning("Retiro del SaaS: filas borradas por tabla %s", resumen)


def downgrade() -> None:
    op.create_table(
        "planes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nombre", sa.String(), nullable=False),
        sa.Column("limite_radicados", sa.Integer(), nullable=False),
        sa.Column("precio_mensual", sa.Integer(), nullable=False),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("limite_ultimas_actuaciones", sa.Integer(), nullable=True),
        sa.Column("notificaciones_whatsapp_procesos", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("notificaciones_whatsapp_tareas", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_table(
        "configuracion_saas",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("mostrar_planes", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_table(
        "intereses_saas",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(120), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "solicitudes_registro",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("usuario_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=False, unique=True),
        sa.Column("ruta_tarjeta_profesional", sa.String(255), nullable=True),
        sa.Column("notas_admin", sa.Text(), nullable=True),
        sa.Column("fecha_solicitud", sa.DateTime(), nullable=True),
    )
    with op.batch_alter_table("usuarios") as tabla:
        tabla.add_column(sa.Column("plan_id", sa.Integer(), nullable=True))
        tabla.create_foreign_key("usuarios_plan_id_fkey", "planes", ["plan_id"], ["id"])
