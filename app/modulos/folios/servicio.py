"""Casos de uso de los folios del expediente.

Foliar es perezoso e idempotente: cada consulta numera lo que aún no tiene
folio, en orden de fecha, a continuación del último número. La primera vez que
se folia un proceso todo lo que ya existía entra revisado; desde ahí, lo que
llega de fuera (actuaciones de la Rama Judicial, documentos y mensajes del
cliente) entra como nuevo hasta que alguien de la firma lo marca revisado.
"""

from collections import defaultdict
from datetime import datetime, time, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, notification_service
from app.audit import registrar_evento_auditoria
from app.modulos.expedientes import politicas
from app.modulos.expedientes.repositorio import RepositorioProcesos
from app.modulos.folios.esquemas import (
    ArchivoFolio,
    AvisarCliente,
    ClientesAvisados,
    Folio,
    FolioNuevo,
    FoliosNuevos,
    FoliosRevisados,
    PaginaFolios,
    ProcesoDelFolio,
    TareaCreada,
    TareaDesdeFolio,
)
from app.modulos.folios.repositorio import GRUPOS, ORDEN_TIPOS, Contenido, RepositorioFolios
from app.modulos.identidad.modelos import Usuario
from app.nucleo.errores import Conflicto, ErrorDominio, NoEncontrado, SinPermiso
from app.nucleo.paginacion import ParametrosPagina, codificar_cursor
from app.timezone import COLOMBIA, utc_ahora
from app.workflow_service import user_portal_url

NO_ENCONTRADO = "No encontramos el proceso, o no tienes acceso a él."
FOLIO_NO_ENCONTRADO = "No encontramos ese folio en el expediente."
SOLO_FIRMA = "Los folios del expediente son para el equipo de la firma."

ETIQUETAS = {
    "actuacion": "Actuación",
    "documento": "Documento",
    "solicitud": "Solicitud",
    "contrato": "Contrato",
    "mensaje": "Mensaje",
    "comunicacion": "Comunicación",
    "aviso": "Aviso al cliente",
    "tarea": "Tarea",
    "evento": "Agenda",
    "etapa": "Etapa",
}


def _folio(folio: models.FolioExpediente, contenido: Contenido | None) -> dict:
    datos = {
        "numero": folio.numero,
        "tipo": folio.tipo,
        "etiqueta": ETIQUETAS.get(folio.tipo, folio.tipo),
        "fecha": folio.fecha,
        "nuevo": folio.revisado_en is None,
    }
    if contenido is None:
        return {**datos, "titulo": "Registro retirado del expediente", "con_hora": True, "retirado": True,
                "detalle": "El registro original se borró; el folio conserva su número."}
    return {
        **datos,
        "titulo": contenido.titulo,
        "detalle": contenido.detalle,
        "con_hora": contenido.con_hora,
        "autor": contenido.autor,
        "estado": contenido.estado,
        "archivo": ArchivoFolio(nombre=contenido.archivo[0], url=contenido.archivo[1]) if contenido.archivo else None,
    }


class ServicioFolios:
    def __init__(self, db: Session, folios: RepositorioFolios, procesos: RepositorioProcesos):
        self._db = db
        self._folios = folios
        self._procesos = procesos

    def foliar(self, proceso_ids: list[int]) -> None:
        primera_vez = self._folios.sin_foliar(proceso_ids)
        registros = self._folios.registros(proceso_ids)
        estado = self._folios.estado_foliacion(proceso_ids)
        por_proceso = defaultdict(list)
        for registro in registros:
            por_proceso[registro.proceso_id].append(registro)

        ahora = utc_ahora()
        nuevos: list[models.FolioExpediente] = []
        for proceso_id, lista in por_proceso.items():
            ultimo, foliados = estado[proceso_id]
            faltan = sorted(
                (r for r in lista if (r.tipo, r.origen_id) not in foliados),
                key=lambda r: (r.fecha, ORDEN_TIPOS.index(r.tipo), r.origen_id),
            )
            inicial = proceso_id in primera_vez
            for numero, registro in enumerate(faltan, start=ultimo + 1):
                nuevos.append(models.FolioExpediente(
                    proceso_id=proceso_id,
                    numero=numero,
                    tipo=registro.tipo,
                    origen_id=registro.origen_id,
                    fecha=registro.fecha,
                    creado_en=ahora,
                    revisado_en=None if registro.externo and not inicial else ahora,
                ))
        if not nuevos and not primera_vez:
            return
        self._folios.agregar(nuevos)
        self._folios.marcar_foliados(primera_vez, ahora)
        try:
            self._db.commit()
        except IntegrityError:
            # Otra petición foliaba los mismos registros a la vez; sus números valen.
            self._db.rollback()

    def listar(self, usuario: Usuario, proceso_id: int, *, grupo: str | None, descendente: bool,
               desde: int | None, pagina: ParametrosPagina) -> PaginaFolios:
        self._proceso_de_firma(usuario, proceso_id)
        self.foliar([proceso_id])
        tipos = GRUPOS.get(grupo) if grupo else None
        if pagina.cursor is not None:
            ultimo_visto = int(pagina.cursor.get("n", 0))
            desde = ultimo_visto - 1 if descendente else ultimo_visto + 1
        filas = self._folios.listar(proceso_id, tipos, descendente=descendente, desde=desde, limite=pagina.limite + 1)
        hay_mas = len(filas) > pagina.limite
        filas = filas[: pagina.limite]
        contenidos = self._folios.contenidos(filas)
        return PaginaFolios(
            items=[Folio(**_folio(f, contenidos.get((f.tipo, f.origen_id)))) for f in filas],
            total=self._folios.contar(proceso_id, tipos),
            siguiente=codificar_cursor({"n": filas[-1].numero}) if hay_mas else None,
            ultimo=self._folios.ultimo(proceso_id),
            nuevos=self._folios.contar(proceso_id, solo_nuevos=True),
        )

    def nuevos(self, usuario: Usuario, limite: int) -> FoliosNuevos:
        if politicas.es_cliente(usuario):
            raise SinPermiso(SOLO_FIRMA)
        procesos = dict(self._db.execute(
            select(models.Proceso.id, models.Proceso.nombre)
            .where(politicas.filtro_procesos_visibles(usuario), models.Proceso.archivado_en.is_(None))
        ).all())
        if not procesos:
            return FoliosNuevos(items=[], total=0)
        self.foliar(list(procesos))
        filas, total = self._folios.nuevos(list(procesos), limite)
        contenidos = self._folios.contenidos(filas)
        return FoliosNuevos(
            items=[
                FolioNuevo(
                    **_folio(f, contenidos.get((f.tipo, f.origen_id))),
                    proceso=ProcesoDelFolio(id=f.proceso_id, nombre=procesos[f.proceso_id]),
                )
                for f in filas
            ],
            total=total,
        )

    def revisar(self, usuario: Usuario, proceso_id: int, numeros: list[int] | None) -> FoliosRevisados:
        self._proceso_de_firma(usuario, proceso_id)
        revisados = self._folios.marcar_revisados(proceso_id, numeros, usuario.id, utc_ahora())
        if revisados:
            registrar_evento_auditoria(
                self._db, usuario, "folios.revisar", "proceso", proceso_id,
                {"folios": numeros if numeros is not None else "todos", "revisados": revisados},
            )
        self._db.commit()
        return FoliosRevisados(revisados=revisados)

    def avisar(self, usuario: Usuario, proceso_id: int, numero: int, datos: AvisarCliente) -> ClientesAvisados:
        """Avisa a los clientes de una actuación del folio y lo deja revisado."""
        proceso = self._proceso_de_firma(usuario, proceso_id)
        folio = self._folio(proceso_id, numero)
        if folio.tipo != "actuacion":
            raise ErrorDominio("Solo se avisa al cliente de las actuaciones judiciales.", codigo="folio_no_avisable")
        actuacion = self._db.get(models.Actuacion, folio.origen_id)
        if actuacion is None:
            raise Conflicto("La actuación de este folio se retiró del expediente.", codigo="folio_retirado")
        vinculados = {
            vinculo.cliente.id: vinculo.cliente
            for vinculo in proceso.clientes
            if vinculo.cliente and vinculo.cliente.estado == models.EstadoUsuario.ACTIVO
        }
        if not vinculados:
            raise Conflicto("El proceso no tiene clientes activos a los que avisar.", codigo="sin_clientes")
        ids = datos.cliente_ids or list(vinculados)
        ajenos = [i for i in ids if i not in vinculados]
        if ajenos:
            raise ErrorDominio("Elige clientes vinculados al proceso.", codigo="cliente_ajeno",
                               campos={"cliente_ids": "Hay clientes que no están vinculados al proceso."})
        comentarios = datos.comentarios.strip()
        radicado = actuacion.radicado_rel.numero if actuacion.radicado_rel else ""
        asunto = f"Actualización del proceso {proceso.nombre}"
        avisados = []
        for cliente_id in dict.fromkeys(ids):
            cliente = vinculados[cliente_id]
            enlace = user_portal_url(cliente, f"/gestion-procesos/cliente/procesos/{proceso.id}#actuacion-{actuacion.id}")
            cuerpo = (
                f"Hola {cliente.nombre_completo},\n\n{usuario.nombre_completo} le notifica una actuación del proceso "
                f"{proceso.nombre}.\n\nRadicado: {radicado}\nFecha: {actuacion.fecha_actuacion or 'No informada'}\n"
                f"Actuación: {actuacion.actuacion}\nAnotación: {actuacion.anotacion or 'Sin anotación'}\n"
                f"Comentarios del abogado: {comentarios}"
            )
            notification_service.emitir_notificacion_workflow(
                self._db, cliente, "ACTUACIONES", f"NOTIFICACION_ACTUACION:{actuacion.id}:{cliente.id}", asunto, cuerpo,
                emisor=usuario, incluir_email=True, plantilla_clave="ACTUACION_NOTIFICADA",
                variables={"nombre": cliente.nombre_completo, "actor": usuario.nombre_completo, "proceso": proceso.nombre,
                           "radicado": radicado, "fecha": actuacion.fecha_actuacion or "No informada",
                           "actuacion": actuacion.actuacion, "anotacion": actuacion.anotacion or "Sin anotación",
                           "comentarios": comentarios},
                enlace_texto="Ver actuación", enlace_url=enlace,
            )
            self._db.add(models.NotificacionProceso(
                abogado_id=usuario.id, proceso_id=proceso.id, cliente_id=cliente.id, actuacion_id=actuacion.id,
                comentarios=comentarios, asunto=asunto, cuerpo=cuerpo,
            ))
            avisados.append(ProcesoDelFolio(id=cliente.id, nombre=cliente.nombre_completo))
        self._folios.marcar_revisados(proceso_id, [numero], usuario.id, utc_ahora())
        registrar_evento_auditoria(self._db, usuario, "proceso.notificacion.enviar", "proceso", proceso.id,
                                   {"folio": numero, "clientes": [c.id for c in avisados]})
        self._db.commit()
        return ClientesAvisados(clientes=avisados)

    def crear_tarea(self, usuario: Usuario, proceso_id: int, numero: int, datos: TareaDesdeFolio) -> TareaCreada:
        """Crea una tarea del proceso a partir de un folio y lo deja revisado."""
        # Los recordatorios de las tareas viven en la API v1 hasta la Fase 4.
        from app.routers.tareas import _crear_recordatorios_sistema, _lanzar_recordatorios_pendientes

        proceso = self._proceso_de_firma(usuario, proceso_id)
        folio = self._folio(proceso_id, numero)
        actuacion = self._db.get(models.Actuacion, folio.origen_id) if folio.tipo == "actuacion" else None
        fecha_limite = None
        if datos.fecha_limite is not None:
            # Vence al final del día en Colombia; la base guarda UTC sin zona.
            fin = datetime.combine(datos.fecha_limite, time(23, 59), COLOMBIA)
            fecha_limite = fin.astimezone(timezone.utc).replace(tzinfo=None)
            if fecha_limite <= utc_ahora():
                raise ErrorDominio("La fecha límite ya pasó.", codigo="fecha_pasada",
                                   campos={"fecha_limite": "Elige hoy o una fecha futura."})
        descripcion = (datos.descripcion or "").strip()
        referencia = f"Creada desde el folio {numero} del expediente."
        tarea = models.Tarea(
            usuario_id=usuario.id if usuario.id in {proceso.abogado_id, *self._colaboradores(proceso)} else proceso.abogado_id,
            proceso_id=proceso.id,
            radicado_id=actuacion.radicado_id if actuacion else None,
            actuacion_id=actuacion.id if actuacion else None,
            titulo=datos.titulo.strip(),
            descripcion=f"{descripcion}\n\n{referencia}" if descripcion else referencia,
            prioridad=models.PrioridadTarea(datos.prioridad),
            fecha_limite=fecha_limite,
        )
        self._db.add(tarea)
        self._db.flush()
        recordatorios = _crear_recordatorios_sistema(self._db, tarea)
        self._folios.marcar_revisados(proceso_id, [numero], usuario.id, utc_ahora())
        registrar_evento_auditoria(self._db, usuario, "tarea.crear", "tarea", tarea.id, {"folio": numero})
        self._db.commit()
        _lanzar_recordatorios_pendientes(self._db, tarea, recordatorios)
        return TareaCreada(id=tarea.id, titulo=tarea.titulo, fecha_limite=tarea.fecha_limite)

    @staticmethod
    def _colaboradores(proceso: models.Proceso) -> set[int]:
        return {vinculo.abogado_id for vinculo in proceso.colaboradores}

    def _folio(self, proceso_id: int, numero: int) -> models.FolioExpediente:
        self.foliar([proceso_id])
        folio = self._db.scalar(
            select(models.FolioExpediente).where(
                models.FolioExpediente.proceso_id == proceso_id, models.FolioExpediente.numero == numero,
            )
        )
        if folio is None:
            raise NoEncontrado(FOLIO_NO_ENCONTRADO)
        return folio

    def _proceso_de_firma(self, usuario: Usuario, proceso_id: int) -> models.Proceso:
        if politicas.es_cliente(usuario):
            raise SinPermiso(SOLO_FIRMA)
        proceso = self._procesos.obtener(proceso_id, politicas.filtro_procesos_visibles(usuario))
        if proceso is None:
            raise NoEncontrado(NO_ENCONTRADO)
        return proceso
