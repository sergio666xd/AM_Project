"""Casos de uso del portal del cliente: inicio, proceso en lenguaje claro y su historia.

El cliente ve el mismo expediente que la firma, con los mismos números de
folio, pero solo lo que le corresponde y contado en lenguaje claro: cada
actuación lleva la explicación que la firma le envió o la del glosario, y el
texto del juzgado queda como referencia.
"""

import logging
import os
from datetime import datetime, timedelta
from uuid import uuid4

from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, storage
from app.audit import registrar_evento_auditoria
from app.document_validation import ALLOWED_DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, document_content_matches_type
from app.modulos.documentos.servicio import DEVUELTOS, EstadoDeSolicitud, estado_de, fecha_limite_de, notificar
from app.modulos.expedientes import politicas
from app.modulos.etapas.esquemas import EtapaBreve
from app.modulos.etapas.linea import linea, plantilla_de, plantilla_predeterminada
from app.modulos.expedientes.esquemas import PersonaBreve
from app.modulos.folios.servicio import ServicioFolios
from app.modulos.glosario.repositorio import RepositorioGlosario
from app.modulos.glosario.servicio import ServicioGlosario, texto_juzgado
from app.modulos.identidad.modelos import Usuario
from app.modulos.portal_cliente.esquemas import (
    ArchivoEntrada,
    DetallePendiente,
    DocumentoCliente,
    EntradaHistoria,
    EntradaReciente,
    EtapaCliente,
    FechaProxima,
    HechoReciente,
    InicioCliente,
    PaginaHistoria,
    PedidoDocumento,
    PendienteCliente,
    PendientesCliente,
    ProcesoBreve,
    ProcesoCliente,
    ResumenProcesoCliente,
)
from app.modulos.portal_cliente.repositorio import RepositorioPortal
from app.nucleo.errores import Conflicto, DatosInvalidos, ErrorDominio, NoEncontrado, SinPermiso
from app.nucleo.paginacion import ParametrosPagina, codificar_cursor
from app.nucleo.zona_horaria import a_colombia
from app.timezone import format_colombia_datetime, utc_ahora
from app.workflow_service import user_portal_url

logger = logging.getLogger(__name__)

SOLO_CLIENTES = "El portal del cliente es para los clientes de la firma."
NO_ENCONTRADO = "No encontramos ese proceso entre los suyos."
# Si el cliente nunca abrió el proceso, se le marca como nuevo lo de estos últimos días.
DIAS_NUEVO_SIN_VISTA = 14
RECIENTES = 3
# Lo entregado o hecho en estos días sigue a la vista en Pendientes, como constancia.
DIAS_HECHOS = 30
HECHOS = 10
ESTADO_PEDIDO = {"FALTANTE": "falta", "REQUIERE_CORRECCION": "por_corregir", "RECHAZADO": "no_aceptado",
                 "RECIBIDO": "en_revision", "EN_REVISION": "en_revision", "APROBADO": "aprobado"}

TIPOS_EVENTO = {"AUDIENCIA": "Audiencia", "REUNION": "Reunión", "FIRMA_CONTRATO": "Firma del contrato", "EVENTO": "Cita"}
ESTADOS_REVISION = {"RECIBIDO": "recibido", "EN_REVISION": "en revisión", "APROBADO": "aprobado",
                    "REQUIERE_CORRECCION": "por corregir", "RECHAZADO": "no aceptado"}
ESTADOS_TAREA = {"PENDIENTE": "pendiente", "EN_CURSO": "en curso", "COMPLETADA": "hecha", "CANCELADA": "cancelada"}
MESES = ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre")
DIAS = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")


def fecha_legible(valor) -> str:
    """«jueves 19 de noviembre a las 9:00 a. m.», en hora de Colombia."""
    local = a_colombia(valor)
    hora = local.hour % 12 or 12
    sufijo = "a. m." if local.hour < 12 else "p. m."
    return f"{DIAS[local.weekday()]} {local.day} de {MESES[local.month - 1]} a las {hora}:{local.minute:02d} {sufijo}"


class AlmacenamientoNoDisponible(ErrorDominio):
    estado = 503
    codigo = "almacenamiento_no_disponible"


def _persona(usuario: Usuario) -> PersonaBreve:
    return PersonaBreve(id=usuario.id, nombre=usuario.nombre_completo)


def _archivo(documento: models.DocumentoProceso) -> ArchivoEntrada:
    return ArchivoEntrada(nombre=documento.nombre_archivo, url=f"/api/expedientes/documentos/{documento.id}/archivo")


class ServicioPortalCliente:
    def __init__(self, db: Session, repositorio: RepositorioPortal, folios: ServicioFolios):
        self._db = db
        self._repo = repositorio
        self._folios = folios
        self._glosario = ServicioGlosario(db, RepositorioGlosario(db))
        self._glosario_repo = RepositorioGlosario(db)

    # ---- Casos de uso ---------------------------------------------------

    def inicio(self, usuario: Usuario) -> InicioCliente:
        self._exigir_cliente(usuario)
        procesos = self._repo.procesos(usuario.id)
        ids = [p.id for p in procesos]
        self._folios.foliar(ids)
        vistas = self._repo.vistas(usuario.id, ids)
        nombres = {p.id: p.nombre for p in procesos}
        recientes = self._repo.recientes(ids, usuario.id, RECIENTES)
        return InicioCliente(
            nombre=(usuario.nombre_completo or "").split()[0] if usuario.nombre_completo else "",
            pendientes=self._pendientes(usuario, procesos),
            procesos=self._resumenes(usuario, procesos, vistas),
            recientes=[
                EntradaReciente(**entrada.model_dump(), proceso=ProcesoBreve(id=folio.proceso_id, nombre=nombres[folio.proceso_id]))
                for folio, entrada in self._entradas(recientes, usuario.id, vistas)
            ],
        )

    def proceso(self, usuario: Usuario, proceso_id: int) -> ProcesoCliente:
        proceso = self._proceso(usuario, proceso_id)
        self._folios.foliar([proceso.id])
        vistas = self._repo.vistas(usuario.id, [proceso.id])
        resumen = self._resumenes(usuario, [proceso], vistas)[0]
        radicados = [v.radicado for v in proceso.radicados if v.radicado]
        despacho = next((r.despacho_departamento.strip() for r in radicados if (r.despacho_departamento or "").strip()), None)
        return ProcesoCliente(
            **resumen.model_dump(),
            despacho=despacho,
            radicados=[r.numero for r in radicados],
            equipo=[_persona(v.abogado) for v in proceso.colaboradores if v.abogado and v.visible_cliente],
            pendientes=self._pendientes(usuario, [proceso]),
            documentos=self._documentos(usuario, proceso),
        )

    def historia(self, usuario: Usuario, proceso_id: int, pagina: ParametrosPagina) -> PaginaHistoria:
        proceso = self._proceso(usuario, proceso_id)
        self._folios.foliar([proceso.id])
        filas = self._repo.folios(proceso.id, usuario.id, antes=self._cursor(pagina), limite=pagina.limite + 1)
        hay_mas = len(filas) > pagina.limite
        filas = filas[: pagina.limite]
        vistas = self._repo.vistas(usuario.id, [proceso.id])
        return PaginaHistoria(
            items=[entrada for _, entrada in self._entradas(filas, usuario.id, vistas)],
            total=self._repo.contar(proceso.id, usuario.id),
            siguiente=codificar_cursor({"f": filas[-1].fecha.isoformat(), "n": filas[-1].numero}) if hay_mas else None,
            nuevos=self._repo.contar_nuevos([proceso.id], usuario.id, vistas, self._desde_nuevo()).get(proceso.id, 0),
        )

    def marcar_visto(self, usuario: Usuario, proceso_id: int) -> None:
        proceso = self._proceso(usuario, proceso_id)
        ultimo = self._repo.ultimo_folio(proceso.id)
        vista = self._repo.vista(usuario.id, proceso.id)
        if vista is None:
            self._repo.agregar(models.VistaProcesoCliente(usuario_id=usuario.id, proceso_id=proceso.id,
                                                          ultimo_folio=ultimo, visto_en=utc_ahora()))
        else:
            vista.ultimo_folio = max(vista.ultimo_folio or 0, ultimo)
            vista.visto_en = utc_ahora()
        try:
            self._db.commit()
        except IntegrityError:
            # Dos pestañas marcaron a la vez; cualquiera de las dos vale.
            self._db.rollback()

    def pendientes(self, usuario: Usuario) -> PendientesCliente:
        self._exigir_cliente(usuario)
        procesos = self._repo.procesos(usuario.id)
        return PendientesCliente(pendientes=self._detalles(usuario, procesos), recientes=self._hechos(usuario, procesos))

    def enviar_documento(self, usuario: Usuario, solicitud_id: int, pedido_id: str, *,
                         nombre: str, tipo: str | None, contenido: bytes) -> PedidoDocumento:
        self._exigir_cliente(usuario)
        ids = [p.id for p in self._repo.procesos(usuario.id)]
        solicitud = self._repo.solicitud(usuario.id, solicitud_id, ids)
        if solicitud is None:
            raise NoEncontrado("No encontramos esa solicitud entre las suyas.")
        estado = estado_de(solicitud)
        pedido = next((p for p in estado.pedidos if p["id"] == pedido_id), None)
        if pedido is None:
            raise NoEncontrado("Ese documento no está en la solicitud.")
        actual = estado.estado_pedido(pedido_id)
        if actual != "FALTANTE" and actual not in DEVUELTOS:
            raise Conflicto("Ya recibimos este documento y lo estamos revisando.", codigo="ya_enviado")
        if tipo not in ALLOWED_DOCUMENT_TYPES:
            raise DatosInvalidos("Puede enviar archivos PDF, JPG, PNG o Word (.docx).", codigo="tipo_no_permitido",
                                 campos={"archivo": "Tipo de archivo no permitido."})
        if not contenido or len(contenido) > MAX_DOCUMENT_BYTES:
            raise DatosInvalidos("El archivo debe pesar máximo 15 MB.", codigo="tamano_no_permitido",
                                 campos={"archivo": "Máximo 15 MB."})
        if not document_content_matches_type(tipo, contenido):
            raise DatosInvalidos("El archivo parece dañado o no es del tipo que dice ser.", codigo="contenido_no_coincide",
                                 campos={"archivo": "Revise el archivo."})

        extension = os.path.splitext(nombre or "")[1].lower()
        clave = f"procesos/{solicitud.proceso_id}/clientes/{usuario.id}/{uuid4().hex}{extension}"
        r2, cubeta = storage.get_r2_client(), storage.get_r2_bucket()
        try:
            r2.put_object(Bucket=cubeta, Key=clave, Body=contenido, ContentType=tipo)
        except (BotoCoreError, ClientError) as exc:
            raise AlmacenamientoNoDisponible("No pudimos guardar el archivo. Inténtelo de nuevo en unos minutos.") from exc
        try:
            documento = models.DocumentoProceso(
                proceso_id=solicitud.proceso_id, cliente_id=usuario.id, solicitud_id=solicitud.id,
                solicitud_item_id=pedido_id, nombre_archivo=nombre or "documento", ruta_archivo=clave, mime_type=tipo,
            )
            self._repo.agregar(documento)
            self._db.flush()
            self._db.refresh(solicitud)
            nuevo_estado = estado_de(solicitud)
            solicitud.atendida_en = utc_ahora() if nuevo_estado.atendida() else None
            registrar_evento_auditoria(self._db, usuario, "documento.cargar", "documento_proceso", documento.id)
            self._db.commit()
        except Exception:
            self._db.rollback()
            try:
                r2.delete_object(Bucket=cubeta, Key=clave)
            except Exception:
                logger.exception("No se pudo limpiar el archivo %s tras fallar la carga.", clave)
            raise
        self._avisar_entrega(usuario, solicitud, pedido["nombre"], documento)
        return self._pedidos(estado_de(solicitud), pedido_id)[0]

    def marcar_tarea_hecha(self, usuario: Usuario, tarea_id: int) -> None:
        from app.routers.tareas import _descartar_recordatorios_tarea, _notificar_cambio_tarea

        self._exigir_cliente(usuario)
        tarea = self._repo.tarea(usuario.id, tarea_id, [p.id for p in self._repo.procesos(usuario.id)])
        if tarea is None:
            raise NoEncontrado("No encontramos esa tarea entre las suyas.")
        if tarea.estado == models.EstadoTarea.COMPLETADA:
            return
        if tarea.estado == models.EstadoTarea.CANCELADA:
            raise Conflicto("La firma canceló esta tarea; ya no hace falta.", codigo="tarea_cancelada")
        tarea.estado = models.EstadoTarea.COMPLETADA
        tarea.completada_en = utc_ahora()
        _descartar_recordatorios_tarea(self._db, tarea)
        registrar_evento_auditoria(self._db, usuario, "tarea.completar", "tarea", tarea.id)
        self._db.commit()
        try:
            _notificar_cambio_tarea(self._db, tarea, usuario, "marcó como hecha la tarea", "El cliente la marcó desde su portal.")
        except Exception:
            self._db.rollback()
            logger.exception("No se pudo avisar que el cliente completó la tarea %s.", tarea.id)

    def marcar_subtarea_hecha(self, usuario: Usuario, subtarea_id: int) -> None:
        from app.routers.tareas import _notificar_cambio_tarea

        self._exigir_cliente(usuario)
        fila = self._repo.subtarea(usuario.id, subtarea_id, [p.id for p in self._repo.procesos(usuario.id)])
        if fila is None:
            raise NoEncontrado("No encontramos esa tarea entre las suyas.")
        subtarea, tarea = fila
        if subtarea.completada:
            return
        if tarea.estado == models.EstadoTarea.CANCELADA:
            raise Conflicto("La firma canceló esta tarea; ya no hace falta.", codigo="tarea_cancelada")
        subtarea.completada = True
        subtarea.completada_en = utc_ahora()
        registrar_evento_auditoria(self._db, usuario, "subtarea.actualizar", "subtarea", subtarea.id)
        self._db.commit()
        try:
            _notificar_cambio_tarea(self._db, tarea, usuario, f"completó «{subtarea.titulo}»",
                                    "Una parte de la tarea que le tocaba al cliente.")
        except Exception:
            self._db.rollback()
            logger.exception("No se pudo avisar que el cliente completó la subtarea %s.", subtarea.id)

    # ---- Resumen de cada proceso ----------------------------------------

    def _resumenes(self, usuario: Usuario, procesos: list[models.Proceso], vistas: dict[int, int]) -> list[ResumenProcesoCliente]:
        ids = [p.id for p in procesos]
        etapas = self._repo.historial_etapas(ids)
        proximas = self._repo.proximas_fechas(ids, usuario.id, utc_ahora())
        nuevos = self._repo.contar_nuevos(ids, usuario.id, vistas, self._desde_nuevo())
        ultimos = self._repo.ultimos(ids, usuario.id)
        entradas = dict(
            (folio.proceso_id, entrada) for folio, entrada in self._entradas(list(ultimos.values()), usuario.id, vistas)
        )
        predeterminada = plantilla_predeterminada(self._db)
        salida = []
        for proceso in procesos:
            evento = proximas.get(proceso.id)
            salida.append(ResumenProcesoCliente(
                id=proceso.id,
                nombre=proceso.nombre,
                descripcion=(proceso.descripcion or "").strip() or None,
                abogado=_persona(proceso.abogado),
                etapa=EtapaBreve(id=proceso.etapa.id, nombre=proceso.etapa.nombre) if proceso.etapa else None,
                etapa_explicacion=(proceso.etapa.explicacion or None) if proceso.etapa else None,
                etapas=self._linea_etapas(proceso, predeterminada, etapas.get(proceso.id, [])),
                proxima_fecha=FechaProxima(
                    id=evento.id, titulo=evento.titulo, tipo=evento.tipo, tipo_legible=TIPOS_EVENTO.get(evento.tipo, "Cita"),
                    inicio=evento.fecha_inicio, fin=evento.fecha_fin, descripcion=(evento.descripcion or "").strip() or None,
                ) if evento else None,
                nuevos=nuevos.get(proceso.id, 0),
                ultima=entradas.get(proceso.id),
            ))
        return salida

    @staticmethod
    def _linea_etapas(proceso: models.Proceso, predeterminada: models.PlantillaEtapas,
                      cambios: list[models.EtapaProceso]) -> list[EtapaCliente]:
        etapas = linea(plantilla_de(proceso, predeterminada), proceso.etapa)
        indice = next((i for i, e in enumerate(etapas) if proceso.etapa and e.id == proceso.etapa.id), -1)
        fechas = {cambio.etapa_id: cambio.fecha for cambio in cambios}
        return [
            EtapaCliente(id=etapa.id, nombre=etapa.nombre, fecha=fechas.get(etapa.id) if i <= indice else None)
            for i, etapa in enumerate(etapas)
        ]

    # ---- Historia en lenguaje claro -------------------------------------

    def _entradas(self, folios: list[models.FolioExpediente], cliente_id: int,
                  vistas: dict[int, int]) -> list[tuple[models.FolioExpediente, EntradaHistoria]]:
        """Cada folio contado al cliente. Los que perdieron su registro de origen se omiten."""
        por_tipo: dict[str, list[int]] = {}
        for folio in folios:
            por_tipo.setdefault(folio.tipo, []).append(folio.origen_id)
        origen = {tipo: self._repo.por_id(self._modelo(tipo), ids) for tipo, ids in por_tipo.items() if self._modelo(tipo)}
        actuaciones = list(origen.get("actuacion", {}).values())
        comentarios = self._glosario_repo.comentarios_de_avisos([a.id for a in actuaciones], cliente_id)
        glosario = self._glosario.glosario() if actuaciones else None
        nuevos = self._repo.numeros_nuevos(folios, cliente_id, vistas, self._desde_nuevo())

        salida = []
        for folio in folios:
            registro = origen.get(folio.tipo, {}).get(folio.origen_id)
            if registro is None:
                continue
            datos = self._contar(folio.tipo, registro, comentarios, glosario)
            if datos is None:
                continue
            salida.append((folio, EntradaHistoria(
                folio=folio.numero, tipo=folio.tipo, fecha=folio.fecha, con_hora=folio.tipo != "actuacion",
                nuevo=(folio.proceso_id, folio.numero) in nuevos, **datos,
            )))
        return salida

    @staticmethod
    def _modelo(tipo: str):
        return {
            "actuacion": models.Actuacion,
            "etapa": models.EtapaProceso,
            "documento": models.DocumentoProceso,
            "solicitud": models.SolicitudDocumento,
            "evento": models.EventoAgenda,
            "tarea": models.Tarea,
        }.get(tipo)

    @staticmethod
    def _contar(tipo: str, registro, comentarios: dict[int, str], glosario) -> dict | None:
        if tipo == "actuacion":
            juzgado = texto_juzgado(registro)
            explicacion = comentarios.get(registro.id)
            if explicacion is None and glosario is not None:
                termino = glosario.termino(registro.actuacion)
                explicacion = termino.explicacion if termino else None
            if explicacion:
                return {"texto": explicacion, "texto_juzgado": juzgado, "actuacion_id": registro.id}
            return {"texto": juzgado, "explicada": False, "actuacion_id": registro.id}
        if tipo == "etapa":
            return {"texto": f"Su proceso pasó a la etapa de {registro.etapa.nombre.lower()}."}
        if tipo == "documento":
            if registro.contrato_id is not None:
                return {"texto": "Se firmó el contrato de prestación de servicios. Puede descargar su copia.",
                        "archivo": _archivo(registro)}
            if registro.solicitud_id is not None:
                devuelto = registro.estado_revision in DEVUELTOS
                return {"texto": f"Usted envió «{registro.nombre_archivo}».",
                        "estado": ESTADOS_REVISION.get(registro.estado_revision),
                        "nota": ((registro.comentario_revision or "").strip() or None) if devuelto else None,
                        "archivo": _archivo(registro)}
            return {"texto": f"La firma compartió con usted el documento «{registro.nombre_archivo}».",
                    "archivo": _archivo(registro)}
        if tipo == "solicitud":
            estado = estado_de(registro)
            nombres = [p["nombre"] for p in estado.pedidos]
            return {"texto": f"Le pedimos {'estos documentos' if len(nombres) > 1 else 'este documento'}: {', '.join(nombres)}.",
                    "estado": "pendiente" if estado.estado == "esperando_cliente" else "entregado"}
        if tipo == "evento":
            if a_colombia(registro.fecha_inicio) < a_colombia(utc_ahora()):
                return {"texto": f"{registro.titulo.strip()}: fue el {fecha_legible(registro.fecha_inicio)}"}
            return {"texto": f"{registro.titulo.strip()}: queda en la agenda el {fecha_legible(registro.fecha_inicio)}"}
        if tipo == "tarea":
            return {"texto": f"Le pedimos: {registro.titulo.strip()}.",
                    "estado": ESTADOS_TAREA.get(getattr(registro.estado, "value", registro.estado))}
        return None

    # ---- Pendientes y documentos ----------------------------------------

    def _pendientes(self, usuario: Usuario, procesos: list[models.Proceso]) -> list[PendienteCliente]:
        campos = set(PendienteCliente.model_fields)
        return [PendienteCliente(**d.model_dump(include=campos)) for d in self._detalles(usuario, procesos)]

    def _detalles(self, usuario: Usuario, procesos: list[models.Proceso]) -> list[DetallePendiente]:
        breves = {p.id: ProcesoBreve(id=p.id, nombre=p.nombre) for p in procesos}
        abogados = {p.id: _persona(p.abogado) for p in procesos}
        ids = list(breves)
        hoy = a_colombia(utc_ahora()).date()
        items: list[DetallePendiente] = []
        for solicitud in self._repo.solicitudes(usuario.id, ids):
            estado = estado_de(solicitud)
            if estado.estado != "esperando_cliente":
                continue
            total = len(estado.pedidos)
            faltan = estado.faltantes
            corregir = sum(1 for p in estado.pedidos if estado.estado_pedido(p["id"]) in DEVUELTOS)
            if total == 1:
                detalle = "Le pedimos corregirlo." if corregir else None
            else:
                detalle = (f"Falta {len(faltan)}" if len(faltan) == 1 else f"Faltan {len(faltan)}") + f" de {total} documentos"
                detalle += f" · {corregir} por corregir" if corregir else ""
            vence = fecha_limite_de(solicitud)
            items.append(DetallePendiente(
                clave=f"solicitud:{solicitud.id}", tipo="documento", titulo=solicitud.titulo, detalle=detalle,
                proceso=breves[solicitud.proceso_id], vence=vence, vencido=bool(vence and vence < hoy),
                instrucciones=(solicitud.instrucciones or "").strip() or None, pedido_por=abogados[solicitud.proceso_id],
                pedidos=self._pedidos(estado),
            ))
        for tarea in self._repo.tareas(usuario.id, ids):
            vence = a_colombia(tarea.fecha_limite).date() if tarea.fecha_limite else None
            items.append(DetallePendiente(
                clave=f"tarea:{tarea.id}", tipo="tarea", titulo=tarea.titulo, proceso=breves[tarea.proceso_id],
                vence=vence, vencido=bool(vence and vence < hoy), instrucciones=(tarea.descripcion or "").strip() or None,
                pedido_por=_persona(tarea.usuario) if tarea.usuario else abogados[tarea.proceso_id],
            ))
        for subtarea, tarea in self._repo.subtareas(usuario.id, ids):
            vence = a_colombia(tarea.fecha_limite).date() if tarea.fecha_limite else None
            items.append(DetallePendiente(
                clave=f"subtarea:{subtarea.id}", tipo="tarea", titulo=subtarea.titulo, detalle=f"Parte de: {tarea.titulo}",
                proceso=breves[tarea.proceso_id], vence=vence, vencido=bool(vence and vence < hoy),
                pedido_por=_persona(tarea.usuario) if tarea.usuario else abogados[tarea.proceso_id], tarea=tarea.titulo,
            ))
        return sorted(items, key=lambda p: (p.vence is None, p.vence or hoy, p.titulo.casefold()))

    @staticmethod
    def _pedidos(estado: EstadoDeSolicitud, solo: str | None = None) -> list[PedidoDocumento]:
        salida = []
        for pedido in estado.pedidos:
            if solo is not None and pedido["id"] != solo:
                continue
            vigente = estado.vigente(pedido["id"])
            clave = vigente.estado_revision if vigente else "FALTANTE"
            devuelto = clave in DEVUELTOS
            salida.append(PedidoDocumento(
                id=pedido["id"], nombre=pedido["nombre"], estado=ESTADO_PEDIDO.get(clave, "en_revision"),
                nota=((vigente.comentario_revision or "").strip() or None) if vigente and devuelto else None,
                archivo=_archivo(vigente) if vigente else None,
                puede_enviar=clave == "FALTANTE" or devuelto,
            ))
        return salida

    def _hechos(self, usuario: Usuario, procesos: list[models.Proceso]) -> list[HechoReciente]:
        breves = {p.id: ProcesoBreve(id=p.id, nombre=p.nombre) for p in procesos}
        ids = list(breves)
        desde = utc_ahora() - timedelta(days=DIAS_HECHOS)
        items: list[HechoReciente] = []
        for solicitud in self._repo.solicitudes(usuario.id, ids):
            estado = estado_de(solicitud)
            vigentes = [v for v in (estado.vigente(p["id"]) for p in estado.pedidos) if v is not None]
            if estado.estado == "esperando_cliente" or not vigentes:
                continue
            if estado.estado == "por_revisar":
                fecha, situacion = max(v.created_at for v in vigentes), "en_revision"
            else:
                fecha, situacion = max(v.revisado_en or v.created_at for v in vigentes), "aprobado"
                if fecha < desde:
                    continue
            items.append(HechoReciente(clave=f"solicitud:{solicitud.id}", tipo="documento", titulo=solicitud.titulo,
                                       proceso=breves[solicitud.proceso_id], fecha=fecha, estado=situacion))
        for tarea in self._repo.tareas_hechas(usuario.id, ids, desde):
            items.append(HechoReciente(clave=f"tarea:{tarea.id}", tipo="tarea", titulo=tarea.titulo,
                                       proceso=breves[tarea.proceso_id], fecha=tarea.completada_en, estado="hecha"))
        for subtarea, tarea in self._repo.subtareas_hechas(usuario.id, ids, desde):
            items.append(HechoReciente(clave=f"subtarea:{subtarea.id}", tipo="tarea", titulo=subtarea.titulo,
                                       proceso=breves[tarea.proceso_id], fecha=subtarea.completada_en, estado="hecha"))
        return sorted(items, key=lambda h: a_colombia(h.fecha), reverse=True)[:HECHOS]

    def _avisar_entrega(self, usuario: Usuario, solicitud: models.SolicitudDocumento, pedido: str,
                        documento: models.DocumentoProceso) -> None:
        proceso = solicitud.proceso
        abogado = proceso.abogado
        enlace = user_portal_url(abogado, f"/gestion-procesos/abogado/procesos/{proceso.id}/documentos")
        recibido = format_colombia_datetime(documento.created_at)
        try:
            notificar(
                self._db, abogado,
                asunto=f"Documentos recibidos: {solicitud.titulo}",
                cuerpo=(f"Hola {abogado.nombre_completo},\n\n{usuario.nombre_completo} cargó un archivo para la solicitud "
                        f"{solicitud.titulo}.\n\nDocumento solicitado: {pedido}\nArchivo recibido: {documento.nombre_archivo}\n"
                        f"Proceso: {proceso.nombre}\nFecha de carga: {recibido}\n\nAbrir enlace: Revisar documentos | {enlace}"),
                tipo="DOCUMENTOS", origen=f"DOCUMENTO_RECIBIDO:{documento.id}", emisor=usuario,
                plantilla_clave="DOCUMENTO_RECIBIDO",
                variables={"nombre": abogado.nombre_completo, "actor": usuario.nombre_completo, "proceso": proceso.nombre,
                           "documento": pedido, "archivo": documento.nombre_archivo, "solicitud": solicitud.titulo,
                           "tipo": documento.mime_type, "fecha": recibido},
                enlace_texto="Revisar documentos", enlace_url=enlace,
            )
        except Exception:
            self._db.rollback()
            logger.exception("No se pudo avisar la entrega del documento %s.", documento.id)

    def _documentos(self, usuario: Usuario, proceso: models.Proceso) -> list[DocumentoCliente]:
        salida = []
        for documento in self._repo.documentos(usuario.id, proceso.id):
            origen = "contrato" if documento.contrato_id else "cliente" if documento.solicitud_id else "firma"
            devuelto = documento.estado_revision in DEVUELTOS
            salida.append(DocumentoCliente(
                id=documento.id,
                nombre=documento.nombre_archivo,
                fecha=documento.created_at,
                origen=origen,
                estado=ESTADOS_REVISION.get(documento.estado_revision) if origen == "cliente" else None,
                nota=((documento.comentario_revision or "").strip() or None) if origen == "cliente" and devuelto else None,
                url=_archivo(documento).url,
            ))
        return salida

    # ---- Apoyo ----------------------------------------------------------

    @staticmethod
    def _exigir_cliente(usuario: Usuario) -> None:
        if not politicas.es_cliente(usuario):
            raise SinPermiso(SOLO_CLIENTES)

    def _proceso(self, usuario: Usuario, proceso_id: int) -> models.Proceso:
        self._exigir_cliente(usuario)
        procesos = self._repo.procesos(usuario.id, proceso_id)
        if not procesos:
            raise NoEncontrado(NO_ENCONTRADO)
        return procesos[0]

    @staticmethod
    def _cursor(pagina: ParametrosPagina) -> tuple[datetime, int] | None:
        if not pagina.cursor:
            return None
        try:
            return datetime.fromisoformat(str(pagina.cursor["f"])), int(pagina.cursor["n"])
        except (KeyError, TypeError, ValueError) as exc:
            raise DatosInvalidos("El cursor de la página no es válido.", campos={"cursor": "No es válido."}) from exc

    @staticmethod
    def _desde_nuevo():
        return utc_ahora() - timedelta(days=DIAS_NUEVO_SIN_VISTA)
