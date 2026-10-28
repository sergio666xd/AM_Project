"""Casos de uso de contratos para la página Contratos.

Quién: ADMIN y ABOGADO_ADMIN (las mismas reglas de la API v1), sobre los
procesos que ven, también los archivados. Redactar, cambiar de estado y subir
el escaneado firmado sigue en el expediente (API v1) hasta que se rehaga.

Proceso sin contrato: activo, con al menos un cliente y sin un contrato vigente
(borrador, listo para firmar, en firma o firmado). Uno terminado o anulado no
cuenta: el proceso vuelve a necesitar contrato.
"""

import logging
from typing import Iterator

from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy.orm import Session

from app import storage
from app.audit import registrar_evento_auditoria
from app.modulos.bandeja.esquemas import ProcesoBreve
from app.modulos.clientes.politicas import gestiona_contratos
from app.modulos.contratos.esquemas import (
    Contrato,
    DocumentoFirmado,
    GrupoContratos,
    ListaContratos,
    ListaSinContrato,
    ProcesoSinContrato,
    ResumenContratos,
)
from app.modulos.contratos.modelos import ContratoServicio
from app.modulos.contratos.repositorio import RepositorioContratos
from app.modulos.documentos.modelos import DocumentoProceso
from app.modulos.expedientes.politicas import filtro_procesos_visibles
from app.modulos.identidad.modelos import Usuario
from app.modulos.tareas.esquemas import PersonaBreve
from app.nucleo.errores import ErrorDominio, NoEncontrado, SinPermiso

logger = logging.getLogger(__name__)

VIGENTES = {"BORRADOR", "LISTO_PARA_FIRMA", "EN_FIRMA", "FIRMADO"}
GRUPOS = {
    "en_curso": {"BORRADOR", "LISTO_PARA_FIRMA", "EN_FIRMA"},
    "firmados": {"FIRMADO"},
    "cerrados": {"TERMINADO", "ANULADO"},
}


class ServicioContratos:
    def __init__(self, db: Session, repositorio: RepositorioContratos):
        self._db = db
        self._repo = repositorio

    def _permiso(self, usuario: Usuario) -> None:
        if not gestiona_contratos(usuario):
            raise SinPermiso("Los contratos los gestiona la administración de la firma.")

    def _vista(self, contrato: ContratoServicio, firmado: DocumentoProceso | None) -> Contrato:
        respaldo = contrato.parte_cliente_snapshot or {}
        cliente = (
            PersonaBreve(id=contrato.cliente.id, nombre=contrato.cliente.nombre_completo) if contrato.cliente
            else PersonaBreve(id=int(respaldo["id"]), nombre=str(respaldo.get("nombre") or "Cliente")) if respaldo.get("id")
            else None
        )
        return Contrato(
            id=contrato.id,
            estado=contrato.estado,
            version=contrato.version_actual,
            proceso=ProcesoBreve(id=contrato.proceso_id, nombre=contrato.proceso.nombre),
            expediente_archivado=contrato.proceso.archivado_en is not None,
            cliente=cliente,
            creado_en=contrato.created_at,
            emitido_en=contrato.emitido_en,
            firmado_en=contrato.firmado_en,
            cerrado_en=contrato.anulado_en if contrato.estado == "ANULADO" else contrato.terminado_en,
            motivo_cierre=contrato.motivo_anulacion if contrato.estado == "ANULADO" else contrato.motivo_terminacion,
            documento_firmado=DocumentoFirmado(id=firmado.id, nombre_archivo=firmado.nombre_archivo, subido_en=firmado.created_at)
            if firmado else None,
        )

    def _sin_contrato(self, usuario: Usuario, contratos: list[ContratoServicio]) -> list[ProcesoSinContrato]:
        ultimo: dict[int, str] = {}
        con_vigente: set[int] = set()
        for contrato in sorted(contratos, key=lambda c: (c.created_at, c.id)):
            ultimo[contrato.proceso_id] = contrato.estado
            if contrato.estado in VIGENTES:
                con_vigente.add(contrato.proceso_id)
        return [
            ProcesoSinContrato(
                id=p.id,
                nombre=p.nombre,
                clientes=[PersonaBreve(id=v.cliente.id, nombre=v.cliente.nombre_completo) for v in p.clientes if v.cliente],
                responsable=p.abogado.nombre_completo if p.abogado else "Sin responsable",
                creado_en=p.created_at,
                ultimo_contrato=ultimo.get(p.id),
            )
            for p in self._repo.procesos_activos_con_cliente(filtro_procesos_visibles(usuario))
            if p.id not in con_vigente
        ]

    def listar(self, usuario: Usuario, grupo: GrupoContratos) -> ListaContratos:
        self._permiso(usuario)
        contratos = self._repo.contratos(filtro_procesos_visibles(usuario))
        firmados = self._repo.firmados([c.id for c in contratos])
        cuenta = {estado: 0 for estado in ("BORRADOR", "LISTO_PARA_FIRMA", "EN_FIRMA", "FIRMADO")}
        for contrato in contratos:
            if contrato.estado in cuenta and contrato.proceso.archivado_en is None:
                cuenta[contrato.estado] += 1
        resumen = ResumenContratos(
            en_preparacion=cuenta["BORRADOR"],
            por_firmar=cuenta["LISTO_PARA_FIRMA"] + cuenta["EN_FIRMA"],
            firmados=cuenta["FIRMADO"],
            sin_contrato=len(self._sin_contrato(usuario, contratos)),
        )
        estados = GRUPOS.get(grupo)
        return ListaContratos(
            items=[self._vista(c, firmados.get(c.id)) for c in contratos if estados is None or c.estado in estados],
            resumen=resumen,
        )

    def sin_contrato(self, usuario: Usuario) -> ListaSinContrato:
        self._permiso(usuario)
        return ListaSinContrato(items=self._sin_contrato(usuario, self._repo.contratos(filtro_procesos_visibles(usuario))))

    def firmado(self, usuario: Usuario, contrato_id: int) -> tuple[Iterator[bytes], DocumentoProceso]:
        """El escaneado firmado guardado en R2, para verlo o descargarlo."""
        self._permiso(usuario)
        contrato = self._repo.contrato(contrato_id, filtro_procesos_visibles(usuario))
        documento = self._repo.firmados([contrato.id]).get(contrato.id) if contrato else None
        if documento is None:
            raise NoEncontrado("Este contrato no tiene el escaneado firmado.")
        try:
            objeto = storage.get_r2_client().get_object(Bucket=storage.get_r2_bucket(), Key=documento.ruta_archivo)
        except (BotoCoreError, ClientError) as exc:
            logger.warning("No se pudo leer el contrato firmado %s de R2: %s", contrato.id, exc)
            raise ErrorDominio("No se pudo abrir el archivo. Intenta de nuevo.", codigo="almacenamiento_no_disponible") from exc
        registrar_evento_auditoria(self._db, usuario, "contrato.firmado.descargar", "contrato_servicio", contrato.id)
        self._db.commit()
        return objeto["Body"], documento
