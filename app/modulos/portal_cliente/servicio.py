"""Casos de uso del portal del cliente: inicio, proceso en lenguaje claro y su historia.

El cliente ve el mismo expediente que la firma, con los mismos números de
folio, pero solo lo que le corresponde y contado en lenguaje claro: cada
actuación lleva la explicación que la firma le envió o la del glosario, y el
texto del juzgado queda como referencia.
"""

from datetime import datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models
from app.modulos.documentos.servicio import DEVUELTOS, estado_de, fecha_limite_de
from app.modulos.expedientes import politicas
from app.modulos.expedientes.esquemas import ETAPAS, NOMBRES_ETAPA, PersonaBreve
from app.modulos.folios.servicio import ServicioFolios
from app.modulos.glosario.repositorio import RepositorioGlosario
from app.modulos.glosario.servicio import ServicioGlosario, texto_juzgado
from app.modulos.identidad.modelos import Usuario
from app.modulos.portal_cliente.esquemas import (
    ArchivoEntrada,
    DocumentoCliente,
    EntradaHistoria,
    EntradaReciente,
    EtapaCliente,
    FechaProxima,
    InicioCliente,
    PaginaHistoria,
    PendienteCliente,
    ProcesoBreve,
    ProcesoCliente,
    ResumenProcesoCliente,
)
from app.modulos.portal_cliente.repositorio import RepositorioPortal
from app.nucleo.errores import DatosInvalidos, NoEncontrado, SinPermiso
from app.nucleo.paginacion import ParametrosPagina, codificar_cursor
from app.nucleo.zona_horaria import a_colombia
from app.timezone import utc_ahora

SOLO_CLIENTES = "El portal del cliente es para los clientes de la firma."
NO_ENCONTRADO = "No encontramos ese proceso entre los suyos."
# Si el cliente nunca abrió el proceso, se le marca como nuevo lo de estos últimos días.
DIAS_NUEVO_SIN_VISTA = 14
RECIENTES = 3

EXPLICACION_ETAPA = {
    "demanda": "Se prepara y se presenta la demanda o la solicitud ante el juzgado.",
    "admision": "El juzgado revisa la demanda y decide si la acepta; después se le avisa a la otra parte.",
    "pruebas": "Cada parte presenta sus pruebas, como documentos, testigos o peritajes, para demostrar lo que dice.",
    "audiencia": "El juez reúne a las partes para escucharlas, revisar las pruebas y, si se puede, buscar un acuerdo.",
    "sentencia": "El juez decide el caso. Si una parte no está de acuerdo, puede apelar en un plazo corto.",
}
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
        salida = []
        for proceso in procesos:
            evento = proximas.get(proceso.id)
            salida.append(ResumenProcesoCliente(
                id=proceso.id,
                nombre=proceso.nombre,
                descripcion=(proceso.descripcion or "").strip() or None,
                abogado=_persona(proceso.abogado),
                etapa=proceso.etapa,
                etapa_explicacion=EXPLICACION_ETAPA.get(proceso.etapa) if proceso.etapa else None,
                etapas=self._linea_etapas(proceso.etapa, etapas.get(proceso.id, [])),
                proxima_fecha=FechaProxima(
                    id=evento.id, titulo=evento.titulo, tipo=evento.tipo, tipo_legible=TIPOS_EVENTO.get(evento.tipo, "Cita"),
                    inicio=evento.fecha_inicio, fin=evento.fecha_fin, descripcion=(evento.descripcion or "").strip() or None,
                ) if evento else None,
                nuevos=nuevos.get(proceso.id, 0),
                ultima=entradas.get(proceso.id),
            ))
        return salida

    @staticmethod
    def _linea_etapas(actual: str | None, cambios: list[models.EtapaProceso]) -> list[EtapaCliente]:
        indice = ETAPAS.index(actual) if actual in ETAPAS else -1
        fechas = {cambio.etapa: cambio.fecha for cambio in cambios}
        return [
            EtapaCliente(clave=etapa, nombre=NOMBRES_ETAPA[etapa], fecha=fechas.get(etapa) if i <= indice else None)
            for i, etapa in enumerate(ETAPAS)
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
            return {"texto": f"Su proceso pasó a la etapa de {NOMBRES_ETAPA.get(registro.etapa, registro.etapa).lower()}."}
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
        breves = {p.id: ProcesoBreve(id=p.id, nombre=p.nombre) for p in procesos}
        ids = list(breves)
        hoy = a_colombia(utc_ahora()).date()
        items: list[PendienteCliente] = []
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
            items.append(PendienteCliente(clave=f"solicitud:{solicitud.id}", tipo="documento", titulo=solicitud.titulo,
                                   detalle=detalle, proceso=breves[solicitud.proceso_id], vence=vence,
                                   vencido=bool(vence and vence < hoy)))
        for tarea in self._repo.tareas(usuario.id, ids):
            vence = a_colombia(tarea.fecha_limite).date() if tarea.fecha_limite else None
            items.append(PendienteCliente(clave=f"tarea:{tarea.id}", tipo="tarea", titulo=tarea.titulo,
                                   proceso=breves[tarea.proceso_id], vence=vence, vencido=bool(vence and vence < hoy)))
        for subtarea, tarea in self._repo.subtareas(usuario.id, ids):
            vence = a_colombia(tarea.fecha_limite).date() if tarea.fecha_limite else None
            items.append(PendienteCliente(clave=f"subtarea:{subtarea.id}", tipo="tarea", titulo=subtarea.titulo,
                                   detalle=f"Parte de: {tarea.titulo}", proceso=breves[tarea.proceso_id], vence=vence,
                                   vencido=bool(vence and vence < hoy)))
        return sorted(items, key=lambda p: (p.vence is None, p.vence or hoy, p.titulo.casefold()))

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
