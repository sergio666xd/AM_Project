"""Casos de uso de contratos para la página Contratos.

Quién: ADMIN y ABOGADO_ADMIN, sobre los
procesos que ven, también los archivados. Redactar, agendar la firma, subir el
escaneado y cerrar el contrato es del responsable del proceso o de ADMIN, y
nunca en un expediente archivado.

Estados: BORRADOR → LISTO_PARA_FIRMA → EN_FIRMA (al agendar la firma) →
FIRMADO (al subir el escaneado) → TERMINADO. Antes de firmarse se puede anular,
y uno anulado se puede eliminar; un firmado puede volver a EN_FIRMA para subir
otro escaneado.

Proceso sin contrato: activo, con al menos un cliente y sin un contrato vigente
(borrador, listo para firmar, en firma o firmado). Uno terminado o anulado no
cuenta: el proceso vuelve a necesitar contrato.
"""

import hashlib
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Iterator

from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy.orm import Session

from app import models, storage
from app.audit import registrar_evento_auditoria
from app.contract_pdf import (
    DEFAULT_ATTORNEY_PROFILE,
    FIELD_LABELS,
    LEGACY_FIELD_KEYS,
    default_contract_fields,
    render_contract_pdf,
    validate_contract_fields,
)
from app.document_validation import MAX_DOCUMENT_BYTES, document_content_matches_type
from app.email_service import enviar_correo
from app.message_templates import render_direct_message
from app.modulos.agenda.avisos import notificar_evento
from app.modulos.bandeja.esquemas import ProcesoBreve
from app.modulos.clientes.politicas import gestiona_contratos
from app.modulos.contratos import motor
from app.modulos.contratos.documento import render_pdf_plantilla
from app.modulos.contratos.esquemas import (
    CambiosContrato,
    CambiosDatosContrato,
    ContextoContrato,
    DatosContrato,
    DatosGuardados,
    PlantillasDeContrato,
    NuevoContratoPlantilla,
    PersonaContrato,
    PlantillaDeContrato,
    CopiaPlantillaContrato,
    PlantillaContratoEntrada,
    Contrato,
    ContratoCargado,
    ContratoDetalle,
    ContratosDelProceso,
    CitaDeFirma,
    DocumentoFirmado,
    EntregaCopia,
    FirmaAgendada,
    GrupoContratos,
    ListaContratos,
    ListaSinContrato,
    MotivoContrato,
    NuevoContrato,
    PlantillaContrato,
    ProcesoSinContrato,
    ResumenContratos,
    VersionContrato,
)
from app.modulos.contratos.modelos import ContratoServicio
from app.modulos.contratos.modelos import PlantillaContrato as PlantillaModelo
from app.modulos.contratos.repositorio import RepositorioContratos
from app.modulos.documentos.modelos import DocumentoProceso
from app.modulos.expedientes.modelos import Proceso
from app.modulos.expedientes.politicas import filtro_procesos_visibles, puede_administrar
from app.modulos.identidad.modelos import Usuario
from app.modulos.tareas.esquemas import PersonaBreve
from app.nucleo.errores import Conflicto, DatosInvalidos, ErrorDominio, NoEncontrado, SinPermiso
from app.timezone import COLOMBIA, utc_ahora
from app.workflow_service import user_portal_url

logger = logging.getLogger(__name__)

NO_ENCONTRADO = "No encontramos ese contrato, o no tiene acceso a él."
SOLO_RESPONSABLE = "Solo el abogado responsable del proceso o la administración pueden cambiar sus contratos."


class AlmacenamientoNoDisponible(ErrorDominio):
    estado = 503
    codigo = "almacenamiento_no_disponible"


def _utc(momento):
    return momento.astimezone(timezone.utc).replace(tzinfo=None) if momento is not None else None


def _validados(campos: dict[str, str], *, completos: bool = False) -> dict[str, str]:
    try:
        return validate_contract_fields(campos, require_complete=completos)
    except ValueError as exc:
        raise DatosInvalidos(str(exc), codigo="campos_contrato") from exc


def _leidos(campos: dict | None) -> dict[str, str]:
    """Los campos guardados, para mostrarlos: ignora claves viejas o valores que ya no validan."""
    conocidos = {k: v for k, v in (campos or {}).items() if k in FIELD_LABELS or k in LEGACY_FIELD_KEYS}
    try:
        return validate_contract_fields(conocidos, require_complete=False)
    except ValueError:
        return {k: str(v) for k, v in conocidos.items() if k in FIELD_LABELS}

def _identificador(valor: str | None) -> str:
    """Cédula o tarjeta con puntos de miles, como en CPS: 40328563 → 40.328.563. Otro formato queda igual."""
    valor = (valor or "").strip()
    digitos = valor.replace(".", "")
    return f"{int(digitos):,}".replace(",", ".") if digitos.isdigit() else valor


def _genero(valor: str | None) -> str:
    return {"FEMENINO": "f", "MASCULINO": "m"}.get((valor or "").strip().upper(), "")


def _es_con_plantilla(contrato: ContratoServicio) -> bool:
    return isinstance(contrato.plantilla_copia, dict)


def _personas(contrato: ContratoServicio) -> list[dict]:
    if not _es_con_plantilla(contrato):
        return []
    listas = (contrato.campos_actual or {}).get("listas") or {}
    return [p for c in contrato.plantilla_copia.get("campos") or [] if c.get("tipo") == "lista" for p in listas.get(c["clave"]) or []]


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
            personas=[p.get("nombre") or "Sin nombre" for p in _personas(contrato)],
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

    # ---- Redacción, firma y entrega -----------------------------------------

    def _proceso(self, usuario: Usuario, proceso_id: int) -> Proceso:
        self._permiso(usuario)
        proceso = self._repo.proceso(proceso_id, filtro_procesos_visibles(usuario))
        if proceso is None:
            raise NoEncontrado("No encontramos el proceso, o no tiene acceso a él.")
        return proceso

    def _para_cambiar(self, usuario: Usuario, proceso: Proceso) -> None:
        if not puede_administrar(usuario, proceso):
            raise SinPermiso(SOLO_RESPONSABLE)
        if proceso.archivado_en is not None:
            raise Conflicto("El expediente está archivado; reábralo para cambiar sus contratos.", codigo="expediente_archivado")

    def _contrato(self, usuario: Usuario, contrato_id: int, *, para_cambiar: bool = False) -> ContratoServicio:
        self._permiso(usuario)
        contrato = self._repo.contrato(contrato_id, filtro_procesos_visibles(usuario))
        if contrato is None:
            raise NoEncontrado(NO_ENCONTRADO)
        if para_cambiar:
            self._para_cambiar(usuario, contrato.proceso)
        return contrato

    def _detalle(self, usuario: Usuario, contrato: ContratoServicio) -> ContratoDetalle:
        firmado = self._repo.firmados([contrato.id]).get(contrato.id)
        firmas = self._repo.firmas([contrato.id])[contrato.id]
        entrega = self._repo.ultimas_entregas([contrato.id]).get(contrato.id)
        return self._detalle_con(usuario, contrato, firmado, firmas[0] if firmas else None, entrega)

    def _detalle_con(self, usuario, contrato, firmado, firma, entrega) -> ContratoDetalle:
        return ContratoDetalle(
            **self._vista(contrato, firmado).model_dump(),
            campos={} if _es_con_plantilla(contrato) else _leidos(contrato.campos_actual),
            plantilla=CopiaPlantillaContrato.model_validate({**contrato.plantilla_copia, "id": contrato.plantilla_id})
            if _es_con_plantilla(contrato) else None,
            datos=DatosGuardados.model_validate(contrato.campos_actual or {}) if _es_con_plantilla(contrato) else None,
            versiones=[VersionContrato(version=v.version, estado=v.estado, creado_en=v.created_at) for v in contrato.versiones],
            firma=FirmaAgendada(evento_id=firma.id, inicio=firma.fecha_inicio, fin=firma.fecha_fin, estado=firma.estado) if firma else None,
            ultima_entrega=EntregaCopia(estado=entrega.estado, destinatario=entrega.destinatario, enviado_en=entrega.created_at,
                                        error=entrega.error) if entrega else None,
            puede_editar=puede_administrar(usuario, contrato.proceso) and contrato.proceso.archivado_en is None,
        )

    def _version(self, usuario: Usuario, contrato: ContratoServicio, estado: str, respaldo: dict | None = None) -> None:
        numero = contrato.version_actual
        if contrato.versiones:
            numero = max(numero, max(v.version for v in contrato.versiones) + 1)
        contrato.version_actual = numero
        guardado = {"plantilla": contrato.plantilla_copia, "datos": contrato.campos_actual} if _es_con_plantilla(contrato) else contrato.campos_actual
        contenido = json.dumps(guardado or {}, ensure_ascii=False, sort_keys=True)
        self._db.add(models.ContratoServicioVersion(
            contrato_id=contrato.id, version=numero, estado=estado, contenido=contenido, campos=contrato.campos_actual or {},
            parte_cliente_snapshot=respaldo or contrato.parte_cliente_snapshot or {},
            hash_sha256=hashlib.sha256(contenido.encode("utf-8")).hexdigest(), creado_por_id=usuario.id,
        ))

    def _guardar(self, usuario: Usuario, contrato: ContratoServicio, accion: str, detalle: dict | None = None) -> ContratoDetalle:
        registrar_evento_auditoria(self._db, usuario, accion, "contrato_servicio", contrato.id, detalle)
        self._db.commit()
        self._db.expire_all()
        return self._detalle(usuario, self._repo.contrato(contrato.id, filtro_procesos_visibles(usuario)))

    def del_proceso(self, usuario: Usuario, proceso_id: int) -> ContratosDelProceso:
        proceso = self._proceso(usuario, proceso_id)
        contratos = self._repo.contratos_del_proceso(proceso.id)
        ids = [c.id for c in contratos]
        firmados, firmas, entregas = self._repo.firmados(ids), self._repo.firmas(ids), self._repo.ultimas_entregas(ids)
        clientes = sorted((v.cliente for v in proceso.clientes if v.cliente), key=lambda c: c.nombre_completo.casefold())
        editable = puede_administrar(usuario, proceso) and proceso.archivado_en is None
        return ContratosDelProceso(
            items=[self._detalle_con(usuario, c, firmados.get(c.id), (firmas[c.id] or [None])[0], entregas.get(c.id))
                   for c in contratos],
            clientes=[PersonaBreve(id=c.id, nombre=c.nombre_completo) for c in clientes],
            puede_crear=editable,
        )

    def _perfil_abogado(self, proceso: Proceso) -> dict[str, str]:
        """Los datos del abogado responsable, sobre los de la firma (CPS) para lo que su perfil no tenga."""
        config = self._db.get(models.ConfiguracionFirma, 1)
        parametros = config.parametros_generales if config and isinstance(config.parametros_generales, dict) else {}
        perfil = {**DEFAULT_ATTORNEY_PROFILE, **(parametros.get("contrato_abogado") if isinstance(parametros.get("contrato_abogado"), dict) else {})}
        abogado = proceso.abogado
        for clave, valor in {
            "nombre": abogado.nombre_completo, "genero": abogado.genero, "documento": abogado.numero_documento,
            "tarjeta_profesional": abogado.tarjeta_profesional, "correo": abogado.email, "telefono": abogado.whatsapp_numero,
            "domicilio": abogado.domicilio,
        }.items():
            if isinstance(valor, str) and valor.strip():
                perfil[clave] = valor.strip() if clave == "correo" else valor.strip().upper()
        return perfil

    def plantilla(self, usuario: Usuario, proceso_id: int, cliente_id: int | None) -> PlantillaContrato:
        """Los datos del abogado responsable (o los de la firma) y lo que la cuenta del cliente ya sabe."""
        proceso = self._proceso(usuario, proceso_id)
        campos = default_contract_fields(attorney_profile=self._perfil_abogado(proceso))
        cliente = self._repo.cliente_del_proceso(proceso.id, cliente_id) if cliente_id else None
        if cliente_id and cliente is None:
            raise NoEncontrado("Ese cliente no está en el proceso.")
        if cliente:
            campos.update({
                "nombre": cliente.nombre_completo.upper(), "correo": cliente.email or "",
                "telefono": (cliente.whatsapp_numero or "").upper(), "genero_cliente": (cliente.genero or "").upper(),
                "documento": (cliente.numero_documento or "").replace(".", ""), "ciudad": (cliente.domicilio or "").upper(),
                "direccion": (cliente.direccion or "").upper(),
            })
            if campos["genero_cliente"] not in {"MASCULINO", "FEMENINO"}:
                campos["genero_cliente"] = ""
        return PlantillaContrato(campos=campos)

    # ---- Plantillas ------------------------------------------------------------------

    def _plantilla(self, plantilla_id: int) -> PlantillaModelo:
        plantilla = self._db.get(PlantillaModelo, plantilla_id)
        if plantilla is None or plantilla.eliminada_en is not None:
            raise NoEncontrado("No encontramos esa plantilla; puede que la hayan eliminado.")
        return plantilla

    @staticmethod
    def _revisada(entrada: PlantillaContratoEntrada) -> dict:
        datos = entrada.model_dump(mode="json")
        resultado = motor.revisar(datos["cuerpo"], datos["campos"])
        if resultado.errores:
            raise DatosInvalidos("Corrija la plantilla: " + " ".join(resultado.errores[:4]), codigo="plantilla_con_errores")
        return datos

    def _vista_plantilla(self, plantilla: PlantillaModelo, usos: int) -> PlantillaDeContrato:
        return PlantillaDeContrato(
            id=plantilla.id, nombre=plantilla.nombre, descripcion=plantilla.descripcion, cuerpo=plantilla.cuerpo,
            campos=plantilla.campos or [], firmas=plantilla.firmas or {}, actualizada_en=plantilla.updated_at, usos=usos,
        )

    def plantillas(self, usuario: Usuario) -> PlantillasDeContrato:
        self._permiso(usuario)
        usos = self._repo.usos_de_plantillas()
        return PlantillasDeContrato(items=[self._vista_plantilla(p, usos.get(p.id, 0)) for p in self._repo.plantillas()])

    def crear_plantilla(self, usuario: Usuario, entrada: PlantillaContratoEntrada) -> PlantillaDeContrato:
        self._permiso(usuario)
        datos = self._revisada(entrada)
        plantilla = PlantillaModelo(**datos, creado_por_id=usuario.id)
        self._db.add(plantilla)
        self._db.flush()
        registrar_evento_auditoria(self._db, usuario, "plantilla_contrato.crear", "plantilla_contrato", plantilla.id, {"nombre": plantilla.nombre})
        self._db.commit()
        return self._vista_plantilla(plantilla, 0)

    def editar_plantilla(self, usuario: Usuario, plantilla_id: int, entrada: PlantillaContratoEntrada) -> PlantillaDeContrato:
        """Los contratos ya hechos no cambian: guardan su propia copia."""
        self._permiso(usuario)
        plantilla = self._plantilla(plantilla_id)
        for clave, valor in self._revisada(entrada).items():
            setattr(plantilla, clave, valor)
        plantilla.updated_at = utc_ahora()
        registrar_evento_auditoria(self._db, usuario, "plantilla_contrato.actualizar", "plantilla_contrato", plantilla.id, {"nombre": plantilla.nombre})
        self._db.commit()
        return self._vista_plantilla(plantilla, self._repo.usos_de_plantillas().get(plantilla.id, 0))

    def duplicar_plantilla(self, usuario: Usuario, plantilla_id: int) -> PlantillaDeContrato:
        self._permiso(usuario)
        origen = self._plantilla(plantilla_id)
        copia = PlantillaModelo(
            nombre=f"{origen.nombre} (copia)"[:160], descripcion=origen.descripcion, cuerpo=origen.cuerpo,
            campos=origen.campos, firmas=origen.firmas, creado_por_id=usuario.id,
        )
        self._db.add(copia)
        self._db.flush()
        registrar_evento_auditoria(self._db, usuario, "plantilla_contrato.duplicar", "plantilla_contrato", copia.id, {"origen_id": origen.id})
        self._db.commit()
        return self._vista_plantilla(copia, 0)

    def eliminar_plantilla(self, usuario: Usuario, plantilla_id: int) -> None:
        """Deja de ofrecerse para contratos nuevos; los contratos hechos con ella conservan su copia."""
        self._permiso(usuario)
        plantilla = self._plantilla(plantilla_id)
        plantilla.eliminada_en = utc_ahora()
        registrar_evento_auditoria(self._db, usuario, "plantilla_contrato.eliminar", "plantilla_contrato", plantilla.id, {"nombre": plantilla.nombre})
        self._db.commit()

    # ---- Contratos con plantilla ------------------------------------------------------

    def _fijos(self, proceso: Proceso) -> dict[str, str]:
        """Proceso, abogado responsable y fecha de hoy (en Colombia), por código."""
        perfil = self._perfil_abogado(proceso)
        radicado = next((v.radicado for v in proceso.radicados if v.radicado), None)
        hoy = datetime.now(COLOMBIA).date()
        config = self._db.get(models.ConfiguracionFirma, 1)
        ciudad = ((config.ciudad if config else None) or "Sabaneta, Antioquia").split(",")[0].strip()
        domicilio = perfil.get("domicilio") or ""
        return {
            "proceso.nombre": proceso.nombre,
            "proceso.radicado": radicado.numero if radicado else "",
            "proceso.despacho": (radicado.despacho_departamento or "") if radicado else "",
            "abogado.nombre": perfil["nombre"].upper(),
            "abogado.documento": _identificador(perfil.get("documento")),
            "abogado.tarjeta": _identificador(perfil.get("tarjeta_profesional")),
            "abogado.correo": perfil.get("correo") or "",
            "abogado.telefono": perfil.get("telefono") or "",
            "abogado.domicilio": domicilio.title() if domicilio.isupper() else domicilio,
            "abogado.genero": _genero(perfil.get("genero")) or "f",
            "fecha.hoy": motor.fecha_en_letras(hoy),
            "fecha.dia": str(hoy.day),
            "fecha.mes": motor.MESES[hoy.month - 1],
            "fecha.anio": str(hoy.year),
            "fecha.ciudad": ciudad,
        }

    @staticmethod
    def _persona_de(cliente: Usuario) -> PersonaContrato:
        return PersonaContrato(
            ref=f"c{cliente.id}", cliente_id=cliente.id, nombre=cliente.nombre_completo, cedula=_identificador(cliente.numero_documento),
            ciudad=cliente.domicilio or "", direccion=cliente.direccion or "", correo=cliente.email or "",
            telefono=cliente.whatsapp_numero or "", genero=_genero(cliente.genero),
        )

    def contexto(self, usuario: Usuario, proceso_id: int) -> ContextoContrato:
        """Lo que el formulario necesita: los datos fijos y los clientes del proceso con su perfil."""
        proceso = self._proceso(usuario, proceso_id)
        clientes = sorted((v.cliente for v in proceso.clientes if v.cliente), key=lambda c: c.nombre_completo.casefold())
        return ContextoContrato(fijos=self._fijos(proceso), clientes=[self._persona_de(c) for c in clientes])

    def _datos(self, proceso: Proceso, plantilla: dict, datos: DatosContrato) -> tuple[dict, Usuario | None]:
        """Los datos que se guardan: solo los campos de la plantilla, con los clientes verificados y los fijos de hoy.

        Devuelve también el primer cliente registrado: a él se le agenda la firma y se le envía la copia.
        """
        campos = plantilla.get("campos") or []
        del_proceso = {v.cliente_id: v.cliente for v in proceso.clientes if v.cliente}
        listas: dict[str, list[dict]] = {}
        principal = None
        for definicion in (c for c in campos if c["tipo"] == "lista"):
            personas = []
            for persona in datos.listas.get(definicion["clave"], []):
                if persona.cliente_id is not None:
                    cliente = del_proceso.get(persona.cliente_id)
                    if cliente is None:
                        raise DatosInvalidos("Una de las personas ya no es cliente del proceso.", codigo="cliente_no_es_del_proceso")
                    principal = principal or cliente
                personas.append(persona.model_dump())
            listas[definicion["clave"]] = personas
        propios = {c["clave"] for c in campos if c["tipo"] != "lista"}
        refs = {p["ref"] for personas in listas.values() for p in personas}
        guardado = {
            "valores": {k: v for k, v in datos.valores.items() if k in propios},
            "listas": listas,
            "notificaciones": {
                "personas": [r for r in datos.notificaciones.personas if r in refs],
                "otras": [o.model_dump() for o in datos.notificaciones.otras],
            },
            "fijos": self._fijos(proceso),
        }
        return guardado, principal

    def _completar_perfiles(self, proceso: Proceso, guardado: dict) -> None:
        """Lo que el perfil de un cliente no tenía y se escribió en el contrato queda también en su perfil."""
        del_proceso = {v.cliente_id: v.cliente for v in proceso.clientes if v.cliente}
        for personas in guardado["listas"].values():
            for persona in personas:
                cliente = del_proceso.get(persona.get("cliente_id"))
                if cliente is None:
                    continue
                for columna, valor in (("numero_documento", persona["cedula"]), ("domicilio", persona["ciudad"]),
                                       ("direccion", persona["direccion"])):
                    if valor and not (getattr(cliente, columna) or "").strip():
                        setattr(cliente, columna, valor[:{"numero_documento": 40, "domicilio": 120, "direccion": 300}[columna]])
                if persona["genero"] and not _genero(cliente.genero):
                    cliente.genero = "FEMENINO" if persona["genero"] == "f" else "MASCULINO"

    @staticmethod
    def _respaldo(principal: Usuario | None, guardado: dict) -> dict:
        if principal is not None:
            return {"id": principal.id, "nombre": principal.nombre_completo, "email": principal.email}
        primera = next((p for personas in guardado["listas"].values() for p in personas), None)
        return {"nombre": primera["nombre"], "email": primera["correo"]} if primera else {}

    def crear_con_plantilla(self, usuario: Usuario, proceso_id: int, entrada: NuevoContratoPlantilla) -> ContratoDetalle:
        proceso = self._proceso(usuario, proceso_id)
        self._para_cambiar(usuario, proceso)
        origen = self._plantilla(entrada.plantilla_id)
        copia = PlantillaContratoEntrada.model_validate(
            {"nombre": origen.nombre, "descripcion": origen.descripcion, "cuerpo": origen.cuerpo, "campos": origen.campos, "firmas": origen.firmas},
        ).model_dump(mode="json")
        guardado, principal = self._datos(proceso, copia, entrada.datos)
        respaldo = self._respaldo(principal, guardado)
        contrato = ContratoServicio(
            proceso_id=proceso.id, cliente_id=principal.id if principal else None, abogado_id=proceso.abogado_id, estado="BORRADOR",
            version_actual=1, contenido_actual="", campos_actual=guardado, parte_cliente_snapshot=respaldo, creado_por_id=usuario.id,
            plantilla_id=origen.id, plantilla_copia=copia,
        )
        self._db.add(contrato)
        self._completar_perfiles(proceso, guardado)
        self._db.flush()
        self._version(usuario, contrato, "BORRADOR", respaldo)
        return self._guardar(usuario, contrato, "contrato.crear", {"proceso_id": proceso.id, "plantilla_id": origen.id})

    def editar_datos(self, usuario: Usuario, contrato_id: int, cambios: CambiosDatosContrato) -> ContratoDetalle:
        contrato = self._contrato(usuario, contrato_id, para_cambiar=True)
        if not _es_con_plantilla(contrato):
            raise Conflicto("Este contrato es de campos fijos; edítelo con su formulario.", codigo="contrato_sin_plantilla")
        if contrato.estado != "BORRADOR":
            raise Conflicto("Solo se edita un contrato en borrador.", codigo="contrato_no_editable")
        guardado, principal = self._datos(contrato.proceso, contrato.plantilla_copia, cambios.datos)
        contrato.campos_actual = guardado
        contrato.cliente_id = principal.id if principal else None
        contrato.parte_cliente_snapshot = self._respaldo(principal, guardado)
        self._completar_perfiles(contrato.proceso, guardado)
        self._version(usuario, contrato, "BORRADOR")
        return self._guardar(usuario, contrato, "contrato.actualizar", {"version": contrato.version_actual})

    def vista_previa_plantilla(self, usuario: Usuario, proceso_id: int, entrada: NuevoContratoPlantilla) -> bytes:
        """El PDF de un contrato sin guardar; lo que falta sale resaltado."""
        proceso = self._proceso(usuario, proceso_id)
        origen = self._plantilla(entrada.plantilla_id)
        copia = {"nombre": origen.nombre, "cuerpo": origen.cuerpo, "campos": origen.campos, "firmas": origen.firmas}
        guardado, _ = self._datos(proceso, copia, entrada.datos)
        return render_pdf_plantilla(copia, guardado)

    def crear(self, usuario: Usuario, proceso_id: int, datos: NuevoContrato) -> ContratoDetalle:
        proceso = self._proceso(usuario, proceso_id)
        self._para_cambiar(usuario, proceso)
        cliente = self._repo.cliente_del_proceso(proceso.id, datos.cliente_id)
        if cliente is None:
            raise DatosInvalidos("Elija un cliente del proceso.", campos={"cliente_id": "Debe ser cliente del proceso."})
        respaldo = {"id": cliente.id, "nombre": cliente.nombre_completo, "email": cliente.email}
        contrato = ContratoServicio(
            proceso_id=proceso.id, cliente_id=cliente.id, abogado_id=proceso.abogado_id, estado="BORRADOR", version_actual=1,
            contenido_actual="", campos_actual=_validados(datos.campos), parte_cliente_snapshot=respaldo, creado_por_id=usuario.id,
        )
        self._db.add(contrato)
        self._db.flush()
        self._version(usuario, contrato, "BORRADOR", respaldo)
        return self._guardar(usuario, contrato, "contrato.crear", {"proceso_id": proceso.id, "cliente_id": cliente.id})

    def detalle(self, usuario: Usuario, contrato_id: int) -> ContratoDetalle:
        return self._detalle(usuario, self._contrato(usuario, contrato_id))

    def editar(self, usuario: Usuario, contrato_id: int, datos: CambiosContrato) -> ContratoDetalle:
        contrato = self._contrato(usuario, contrato_id, para_cambiar=True)
        if _es_con_plantilla(contrato):
            raise Conflicto("Este contrato se hizo con una plantilla; edítelo con su formulario.", codigo="contrato_con_plantilla")
        if contrato.estado != "BORRADOR":
            raise Conflicto("Solo se edita un contrato en borrador.", codigo="contrato_no_editable")
        contrato.campos_actual = _validados(datos.campos)
        self._version(usuario, contrato, "BORRADOR")
        return self._guardar(usuario, contrato, "contrato.actualizar", {"version": contrato.version_actual})

    def vista_previa(self, usuario: Usuario, proceso_id: int, datos: NuevoContrato) -> bytes:
        proceso = self._proceso(usuario, proceso_id)
        if self._repo.cliente_del_proceso(proceso.id, datos.cliente_id) is None:
            raise DatosInvalidos("Elija un cliente del proceso.", campos={"cliente_id": "Debe ser cliente del proceso."})
        return self._pdf(_validados(datos.campos, completos=True))

    def pdf(self, usuario: Usuario, contrato_id: int) -> bytes:
        contrato = self._contrato(usuario, contrato_id)
        if _es_con_plantilla(contrato):
            # El borrador también se ve en PDF, para revisarlo; lo que falta sale resaltado.
            if contrato.estado == "ANULADO":
                raise Conflicto("Un contrato anulado ya no se imprime.", codigo="contrato_sin_pdf")
            return render_pdf_plantilla(contrato.plantilla_copia, contrato.campos_actual or {})
        if contrato.estado in {"BORRADOR", "ANULADO"}:
            raise Conflicto("El PDF para imprimir sale cuando el contrato está listo para firmar.", codigo="contrato_sin_pdf")
        return self._pdf(contrato.campos_actual or {})

    @staticmethod
    def _pdf(campos: dict[str, str]) -> bytes:
        try:
            return render_contract_pdf(campos)
        except (ValueError, FileNotFoundError) as exc:
            raise DatosInvalidos(str(exc), codigo="pdf_contrato") from exc

    def marcar_listo(self, usuario: Usuario, contrato_id: int) -> ContratoDetalle:
        contrato = self._contrato(usuario, contrato_id, para_cambiar=True)
        if contrato.estado != "BORRADOR":
            raise Conflicto("Solo un borrador pasa a listo para firmar.", codigo="transicion_no_permitida")
        if _es_con_plantilla(contrato):
            # La fecha y los datos del abogado quedan los del día en que se deja listo.
            contrato.campos_actual = {**(contrato.campos_actual or {}), "fijos": self._fijos(contrato.proceso)}
            faltan = motor.faltantes(contrato.plantilla_copia, contrato.campos_actual)
            if faltan:
                raise DatosInvalidos(" ".join(faltan), codigo="contrato_incompleto")
        else:
            _validados(contrato.campos_actual or {}, completos=True)
        contrato.estado, contrato.emitido_en = "LISTO_PARA_FIRMA", utc_ahora()
        self._version(usuario, contrato, contrato.estado)
        return self._guardar(usuario, contrato, "contrato.estado", {"estado": contrato.estado})

    def anular(self, usuario: Usuario, contrato_id: int, datos: MotivoContrato) -> ContratoDetalle:
        contrato = self._contrato(usuario, contrato_id, para_cambiar=True)
        if contrato.estado not in {"BORRADOR", "LISTO_PARA_FIRMA", "EN_FIRMA"}:
            raise Conflicto("Un contrato firmado no se anula: se termina.", codigo="transicion_no_permitida")
        contrato.estado, contrato.anulado_en, contrato.motivo_anulacion = "ANULADO", utc_ahora(), datos.motivo
        for evento in self._repo.firmas([contrato.id], para_cambiar=True)[contrato.id]:
            evento.estado = "CANCELADO"
        self._version(usuario, contrato, contrato.estado)
        return self._guardar(usuario, contrato, "contrato.estado", {"estado": contrato.estado, "motivo": datos.motivo})

    def terminar(self, usuario: Usuario, contrato_id: int, datos: MotivoContrato) -> ContratoDetalle:
        contrato = self._contrato(usuario, contrato_id, para_cambiar=True)
        if contrato.estado != "FIRMADO":
            raise Conflicto("Solo se termina un contrato firmado.", codigo="transicion_no_permitida")
        contrato.estado, contrato.terminado_en, contrato.motivo_terminacion = "TERMINADO", utc_ahora(), datos.motivo
        self._version(usuario, contrato, contrato.estado)
        return self._guardar(usuario, contrato, "contrato.estado", {"estado": contrato.estado, "motivo": datos.motivo})

    def reabrir_firma(self, usuario: Usuario, contrato_id: int) -> ContratoDetalle:
        contrato = self._contrato(usuario, contrato_id, para_cambiar=True)
        if contrato.estado != "FIRMADO":
            raise Conflicto("Solo se reabre la firma de un contrato firmado.", codigo="transicion_no_permitida")
        firmas = self._repo.firmas([contrato.id], para_cambiar=True)[contrato.id]
        if not firmas:
            raise Conflicto("No hay una cita de firma para reabrir.", codigo="sin_firma")
        for evento in firmas:
            evento.estado = "PROGRAMADO"
        contrato.estado, contrato.firmado_en = "EN_FIRMA", None
        self._version(usuario, contrato, contrato.estado)
        return self._guardar(usuario, contrato, "contrato.estado", {"estado": contrato.estado})

    def agendar_firma(self, usuario: Usuario, contrato_id: int, datos: CitaDeFirma) -> ContratoDetalle:
        """Crea la cita de firma con el cliente del contrato, le avisa y deja el contrato en firma."""
        contrato = self._contrato(usuario, contrato_id, para_cambiar=True)
        if contrato.estado not in {"LISTO_PARA_FIRMA", "EN_FIRMA"}:
            raise Conflicto("La firma se agenda cuando el contrato está listo para firmar.", codigo="contrato_no_listo")
        if self._repo.firmas([contrato.id], para_cambiar=True)[contrato.id]:
            raise Conflicto("La firma ya está agendada; muévala desde la agenda del proceso.", codigo="firma_agendada")
        cliente = contrato.cliente
        if cliente is None:
            mensaje = ("Agregue al contrato un cliente registrado para agendarle la firma." if _es_con_plantilla(contrato)
                       else "El cliente de este contrato ya no tiene cuenta.")
            raise Conflicto(mensaje, codigo="sin_cliente")
        evento = models.EventoAgenda(
            titulo=f"Firma del contrato de servicios · {cliente.nombre_completo}", descripcion=datos.lugar, tipo="FIRMA_CONTRATO",
            estado="PROGRAMADO", fecha_inicio=_utc(datos.inicio), fecha_fin=_utc(datos.fin), responsable_id=usuario.id,
            proceso_id=contrato.proceso_id, cliente_id=cliente.id, contrato_id=contrato.id, creado_por_id=usuario.id,
        )
        self._db.add(evento)
        if contrato.estado == "LISTO_PARA_FIRMA":
            contrato.estado = "EN_FIRMA"
            self._version(usuario, contrato, contrato.estado)
        self._db.flush()
        detalle = self._guardar(usuario, contrato, "contrato.firma.agendar", {"evento_id": evento.id})
        self._db.refresh(evento)
        notificar_evento(self._db, contrato.proceso, evento, usuario, "programó", cliente)
        return detalle

    def subir_firmado(self, usuario: Usuario, contrato_id: int, *, nombre: str, tipo: str | None, contenido: bytes) -> ContratoCargado:
        contrato = self._contrato(usuario, contrato_id, para_cambiar=True)
        reemplazo = contrato.estado == "FIRMADO"
        if contrato.estado not in {"EN_FIRMA", "FIRMADO"}:
            raise Conflicto("Agende primero la firma; el escaneado se sube después de firmar.", codigo="contrato_no_en_firma")
        firmas = self._repo.firmas([contrato.id], para_cambiar=True)[contrato.id]
        if not firmas:
            raise Conflicto("Agende primero la firma del contrato.", codigo="sin_firma")
        if tipo != "application/pdf":
            raise DatosInvalidos("El contrato firmado se sube en PDF.", codigo="tipo_no_permitido", campos={"archivo": "Solo PDF."})
        if not contenido or len(contenido) > MAX_DOCUMENT_BYTES:
            raise DatosInvalidos("El escaneado debe pesar máximo 15 MB.", codigo="tamano_no_permitido", campos={"archivo": "Máximo 15 MB."})
        if not document_content_matches_type(tipo, contenido):
            raise DatosInvalidos("El archivo parece dañado o no es un PDF.", codigo="contenido_no_coincide", campos={"archivo": "Revise el archivo."})
        limpio = re.sub(r"[^\w.-]+", "_", os.path.basename(nombre or "contrato-firmado.pdf"), flags=re.UNICODE)[:180]
        clave = f"procesos/{contrato.proceso_id}/contratos/{contrato.id}/{uuid.uuid4().hex}.pdf"
        r2, cubeta = storage.get_r2_client(), storage.get_r2_bucket()
        try:
            r2.put_object(Bucket=cubeta, Key=clave, Body=contenido, ContentType=tipo)
        except (BotoCoreError, ClientError) as exc:
            raise AlmacenamientoNoDisponible("No pudimos guardar el escaneado. Inténtelo de nuevo en unos minutos.") from exc
        try:
            documento = DocumentoProceso(
                proceso_id=contrato.proceso_id, cliente_id=contrato.cliente_id, contrato_id=contrato.id, nombre_archivo=limpio,
                ruta_archivo=clave, mime_type=tipo, estado_revision="APROBADO",
            )
            self._db.add(documento)
            contrato.estado, contrato.firmado_en = "FIRMADO", utc_ahora()
            for evento in firmas:
                evento.estado = "COMPLETADO"
            self._version(usuario, contrato, contrato.estado)
            self._db.flush()
            registrar_evento_auditoria(self._db, usuario, "contrato.firmado.cargar", "contrato_servicio", contrato.id,
                                       {"documento_id": documento.id, "version": contrato.version_actual})
            self._db.commit()
        except Exception:
            self._db.rollback()
            try:
                r2.delete_object(Bucket=cubeta, Key=clave)
            except Exception:
                logger.exception("No se pudo limpiar el escaneado %s tras fallar la carga.", clave)
            raise
        entrega = self._enviar_copia(usuario, contrato, documento)
        mensaje = ("Escaneado reemplazado." if reemplazo else "Contrato firmado.") + (
            " Le enviamos la copia al cliente." if entrega.estado == "ENVIADO" else " No se pudo enviar la copia al cliente; reinténtelo desde el contrato."
        )
        return ContratoCargado(contrato=self._detalle(usuario, contrato), entrega=entrega, mensaje=mensaje)

    def reenviar_copia(self, usuario: Usuario, contrato_id: int) -> ContratoDetalle:
        contrato = self._contrato(usuario, contrato_id)
        if not puede_administrar(usuario, contrato.proceso):
            raise SinPermiso(SOLO_RESPONSABLE)
        if contrato.estado != "FIRMADO":
            raise Conflicto("Solo se envía la copia de un contrato firmado.", codigo="contrato_no_firmado")
        documento = self._repo.firmados([contrato.id]).get(contrato.id)
        if documento is None:
            raise NoEncontrado("Este contrato no tiene el escaneado firmado.")
        self._enviar_copia(usuario, contrato, documento)
        return self._detalle(usuario, contrato)

    def _enviar_copia(self, usuario: Usuario, contrato: ContratoServicio, documento: DocumentoProceso) -> EntregaCopia:
        """Envía el escaneado al correo del cliente. El resultado queda registrado aunque falle."""
        cliente = contrato.cliente
        destinatario = cliente.email if cliente else (contrato.parte_cliente_snapshot or {}).get("email", "")
        entrega = models.EntregaCorreoContrato(
            contrato_id=contrato.id, documento_id=documento.id, version=contrato.version_actual,
            destinatario=destinatario or "", estado="ERROR", creado_por_id=usuario.id,
        )
        self._db.add(entrega)
        try:
            if not destinatario:
                raise ValueError("El cliente no tiene correo registrado.")
            objeto = storage.get_r2_client().get_object(Bucket=storage.get_r2_bucket(), Key=documento.ruta_archivo)
            contenido = objeto["Body"].read(MAX_DOCUMENT_BYTES + 1)
            if len(contenido) > MAX_DOCUMENT_BYTES:
                raise ValueError("El archivo supera el límite para adjuntarlo al correo.")
            asunto, cuerpo = render_direct_message(
                self._db, "CONTRATO_FIRMADO",
                {"nombre": (contrato.parte_cliente_snapshot or {}).get("nombre", "cliente"), "proceso": contrato.proceso.nombre},
                link_label="Ver expediente",
                link_url=user_portal_url(cliente or "CLIENTE", f"/gestion-procesos/cliente/procesos/{contrato.proceso_id}#documentos"),
            )
            if not enviar_correo(destinatario, asunto, cuerpo, adjunto=(documento.nombre_archivo, contenido, documento.mime_type)):
                raise RuntimeError("El servidor de correo no está configurado.")
            entrega.estado, entrega.error = "ENVIADO", None
        except Exception as exc:
            entrega.estado, entrega.error = "ERROR", str(exc)[:1000]
            logger.exception("No se pudo enviar la copia del contrato %s", contrato.id)
        self._db.flush()
        registrar_evento_auditoria(self._db, usuario, "contrato.copia_correo", "contrato_servicio", contrato.id,
                                   {"estado": entrega.estado, "destinatario": entrega.destinatario})
        self._db.commit()
        return EntregaCopia(estado=entrega.estado, destinatario=entrega.destinatario, enviado_en=entrega.created_at, error=entrega.error)

    def eliminar(self, usuario: Usuario, contrato_id: int) -> None:
        """Borra un contrato anulado. Los archivos y la agenda quedan en el expediente, sin el vínculo."""
        contrato = self._contrato(usuario, contrato_id, para_cambiar=True)
        if contrato.estado != "ANULADO":
            raise Conflicto("Solo se eliminan contratos anulados.", codigo="contrato_no_anulado")
        documentos = self._db.query(DocumentoProceso).filter_by(contrato_id=contrato.id).all()
        for documento in documentos:
            documento.contrato_id = None
        for evento in self._db.query(models.EventoAgenda).filter_by(contrato_id=contrato.id).all():
            if evento.tipo == "FIRMA_CONTRATO" and evento.estado != "CANCELADO":
                evento.estado = "CANCELADO"
            evento.contrato_id = None
        entregas = self._db.query(models.EntregaCorreoContrato).filter_by(contrato_id=contrato.id).all()
        for entrega in entregas:
            self._db.delete(entrega)
        registrar_evento_auditoria(self._db, usuario, "contrato.eliminar", "contrato_servicio", contrato.id, {
            "proceso_id": contrato.proceso_id, "cliente_id": contrato.cliente_id,
            "documentos_conservados": len(documentos), "entregas_correo_eliminadas": len(entregas),
        })
        self._db.delete(contrato)
        self._db.commit()
