"""Actividad y auditoría: cada registro de `eventos_auditoria`, contado en una frase.

La vista de actividad oculta las acciones de rutina (descargas, alertas
descartadas); la auditoría técnica las muestra todas, con su detalle. Los
registros no se borran desde la plataforma: son la constancia de quién hizo qué.
"""

import csv
import io
import json
from datetime import date, datetime
from typing import Iterator

from sqlalchemy import and_, func, true

from app import models
from app.modulos.administracion.actividad import enlace, frase
from app.modulos.administracion.politicas import exigir_admin
from app.modulos.administracion.repositorio import ACCIONES_SILENCIOSAS
from app.modulos.identidad.modelos import Usuario
from app.modulos.sistema.esquemas import AreaActividad, DetalleRegistro, PaginaRegistro, RegistroActividad
from app.modulos.sistema.repositorio import RepositorioSistema
from app.nucleo.errores import DatosInvalidos, NoEncontrado
from app.nucleo.paginacion import ParametrosPagina, codificar_cursor
from app.nucleo.zona_horaria import a_colombia, inicio_del_dia_utc

A = models.EventoAuditoria
LIMITE_CSV = 5000

AREAS: dict[AreaActividad, tuple[str, ...]] = {
    "cuentas": ("usuario", "solicitud_edicion_perfil", "solicitud_registro"),
    "procesos": ("proceso", "proceso_cliente", "proceso_radicado", "radicado", "glosario", "plantilla_etapas"),
    "tareas": ("tarea", "subtarea", "recordatorio_tarea", "plantilla_tarea", "evento_agenda"),
    "documentos": ("documento_proceso", "solicitud_documento", "contrato_servicio", "archivo_r2", "carpeta_r2"),
    "cobros": ("cuenta_cobro", "pago_financiero", "configuracion_correo_financiero"),
    "mensajes": ("chat_conversacion", "entrega_notificacion", "plantilla_mensaje", "solicitud_contacto"),
    "configuracion": (
        "configuracion_firma", "configuracion_consultas", "configuracion_integraciones", "configuracion_saas",
        "integracion", "pagina_publica", "alerta", "plan", "evento_auditoria",
    ),
}
AREA_DE = {recurso: area for area, recursos in AREAS.items() for recurso in recursos}
CON_AREA = tuple(AREA_DE)


def area_de(tipo_recurso: str) -> AreaActividad:
    return AREA_DE.get(tipo_recurso, "otros")


def _registro(evento: models.EventoAuditoria, actor: str | None) -> RegistroActividad:
    return RegistroActividad(
        id=evento.id, actor=actor, actor_id=evento.actor_id, frase=frase(evento.accion),
        enlace=enlace(evento.tipo_recurso, evento.recurso_id), fecha=evento.created_at,
        area=area_de(evento.tipo_recurso), accion=evento.accion, con_error=bool(evento.error_tecnico),
    )


def _datos(crudo: str | None):
    if not crudo:
        return None
    try:
        return json.loads(crudo)
    except (TypeError, ValueError):
        return crudo


class ServicioActividad:
    def __init__(self, repositorio: RepositorioSistema):
        self._repo = repositorio

    @staticmethod
    def _condicion(*, q: str | None, actor_id: int | None, area: AreaActividad | None, desde: date | None,
                   hasta: date | None, solo_errores: bool, todo: bool):
        condiciones = []
        if not todo:
            condiciones.append(A.accion.not_in(ACCIONES_SILENCIOSAS))
        texto = " ".join((q or "").split()).lower()
        if texto:
            condiciones.append(func.lower(Usuario.nombre_completo).like(f"%{texto}%"))
        if actor_id is not None:
            condiciones.append(A.actor_id == actor_id)
        if area == "otros":
            condiciones.append(A.tipo_recurso.not_in(CON_AREA))
        elif area:
            condiciones.append(A.tipo_recurso.in_(AREAS[area]))
        if desde and hasta and hasta < desde:
            raise DatosInvalidos("La fecha final es anterior a la inicial.", campos={"hasta": "Elija un día igual o posterior."})
        if desde:
            condiciones.append(A.created_at >= inicio_del_dia_utc(desde))
        if hasta:
            condiciones.append(A.created_at < inicio_del_dia_utc(date.fromordinal(hasta.toordinal() + 1)))
        if solo_errores:
            condiciones.append(A.error_tecnico.is_not(None))
        return and_(true(), *condiciones)

    def listar(self, admin: Usuario, pagina: ParametrosPagina, **filtros) -> PaginaRegistro:
        exigir_admin(admin)
        condicion = self._condicion(**filtros)
        despues = None
        if pagina.cursor:
            try:
                despues = (datetime.fromisoformat(str(pagina.cursor["c"])), int(pagina.cursor["id"]))
            except (KeyError, TypeError, ValueError) as exc:
                raise DatosInvalidos("El cursor de la página no es válido.", campos={"cursor": "No es válido."}) from exc
        filas = self._repo.registros(condicion, despues=despues, limite=pagina.limite + 1)
        hay_mas = len(filas) > pagina.limite
        filas = filas[: pagina.limite]
        ultimo = filas[-1][0] if filas else None
        return PaginaRegistro(
            items=[_registro(evento, actor) for evento, actor in filas],
            total=self._repo.contar_registros(condicion),
            siguiente=codificar_cursor({"c": ultimo.created_at.isoformat(), "id": ultimo.id}) if hay_mas and ultimo else None,
        )

    def detalle(self, admin: Usuario, registro_id: int) -> DetalleRegistro:
        exigir_admin(admin)
        fila = self._repo.registro(registro_id)
        if fila is None:
            raise NoEncontrado("No encontramos ese registro.")
        evento, actor = fila
        return DetalleRegistro(
            **_registro(evento, actor).model_dump(), recurso=evento.tipo_recurso, recurso_id=evento.recurso_id,
            endpoint=evento.endpoint, metodo=evento.metodo, datos=_datos(evento.metadata_json), error=evento.error_tecnico,
        )

    def csv(self, admin: Usuario, **filtros) -> Iterator[str]:
        """Hasta 5.000 registros con los mismos filtros, para guardar o revisar en una hoja de cálculo."""
        exigir_admin(admin)
        filas = self._repo.registros(self._condicion(**filtros), despues=None, limite=LIMITE_CSV)
        salida = io.StringIO()
        escritor = csv.writer(salida)
        escritor.writerow(["Fecha", "Persona", "Qué hizo", "Área", "Acción", "Registro", "Error"])
        for evento, actor in filas:
            escritor.writerow([
                a_colombia(evento.created_at).strftime("%Y-%m-%d %H:%M"), actor or "La plataforma", frase(evento.accion),
                area_de(evento.tipo_recurso), evento.accion, f"{evento.tipo_recurso} {evento.recurso_id or ''}".strip(),
                (evento.error_tecnico or "")[:300],
            ])
        yield "﻿" + salida.getvalue()
