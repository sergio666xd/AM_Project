"""Mensajes entre la firma y sus clientes, y dentro del equipo.

Las conversaciones existen por proceso (abogado responsable o colaborador
visible con cada cliente; el equipo del proceso entre sí) y entre integrantes
de la firma. Las reglas de quién participa son las de la API v1 (ver
`mensajes.legado`). Cada mensaje de una conversación de proceso queda como un
folio del expediente.
"""

from sqlalchemy.orm import Session

from app import models
from app.modulos.bandeja.esquemas import ProcesoBreve
from app.modulos.expedientes.politicas import _rol, es_cliente
from app.modulos.folios.servicio import ServicioFolios
from app.modulos.identidad.modelos import RolUsuario
from app.modulos.mensajes import legado
from app.modulos.mensajes.esquemas import (
    Autor,
    Contacto,
    Conversacion,
    Entrega,
    EntregaDeMensaje,
    Hilo,
    ListaConversaciones,
    Mensaje,
    NuevoMensaje,
    OpcionReferencia,
    Referencia,
    ResumenMensajes,
    TipoConversacion,
    UltimoMensaje,
)
from app.modulos.mensajes.repositorio import RepositorioMensajes
from app.nucleo.errores import DatosInvalidos, NoEncontrado, SinPermiso
from app.timezone import utc_ahora

ROL_CONTACTO = {RolUsuario.CLIENTE: "cliente", RolUsuario.ADMIN: "administrador"}


def entrega_de(mensaje: models.ChatMensaje, participantes: list[models.ChatParticipante]) -> Entrega:
    destinatarios = [p for p in participantes if p.usuario_id != mensaje.remitente_id]
    entregados = sum(p.ultimo_entregado_mensaje_id >= mensaje.id for p in destinatarios)
    leidos = sum(p.ultimo_leido_mensaje_id >= mensaje.id for p in destinatarios)
    total = len(destinatarios)
    if total and leidos == total:
        estado = "leido"
    elif total and entregados == total:
        estado = "entregado"
    elif entregados:
        estado = "entregado_parcial"
    else:
        estado = "enviado"
    return Entrega(estado=estado, entregados=entregados, leidos=leidos, destinatarios=total)


class ServicioMensajes:
    def __init__(self, db: Session, mensajes: RepositorioMensajes, folios: ServicioFolios):
        self._db = db
        self._mensajes = mensajes
        self._folios = folios

    def listar(self, usuario: models.Usuario, *, sincronizar: bool) -> ListaConversaciones:
        if sincronizar:
            legado.sincronizar(self._db, usuario)
        conversaciones = self._mensajes.conversaciones_de(usuario.id)
        accesibles = legado.procesos_accesibles(
            self._db, usuario, {c.proceso_id for c in conversaciones if c.proceso_id is not None})
        visibles = [c for c in conversaciones if c.proceso_id is None or c.proceso_id in accesibles]
        items = sorted(self._vistas(usuario, visibles), key=lambda c: (c.actualizada_en, c.id), reverse=True)
        return ListaConversaciones(
            items=items,
            resumen=ResumenMensajes(
                sin_leer=sum(1 for c in items if c.sin_leer),
                por_responder=sum(1 for c in items if c.por_responder),
            ),
        )

    def resolver(self, usuario: models.Usuario, clave: str) -> Conversacion:
        conversacion = legado.resolver(self._db, clave, usuario)
        return self._vistas(usuario, [conversacion])[0]

    def hilo(self, usuario: models.Usuario, conversacion_id: int, *, despues_de: int, antes_de: int, limite: int) -> Hilo:
        conversacion = legado.conversacion(self._db, conversacion_id, usuario)
        mensajes, hay_mas = self._mensajes.mensajes(conversacion.id, despues_de=despues_de, antes_de=antes_de, limite=limite)
        propio = self._participante(conversacion, usuario)
        if propio and mensajes and not antes_de:
            propio.ultimo_entregado_mensaje_id = max(propio.ultimo_entregado_mensaje_id, mensajes[-1].id)
            self._db.commit()
        folios = self._folios_de(conversacion, mensajes)
        entregas = [] if antes_de else [
            EntregaDeMensaje(id=m.id, entrega=entrega_de(m, conversacion.participantes))
            for m in self._mensajes.propios_recientes(conversacion.id, usuario.id)
        ]
        return Hilo(
            conversacion=self._vistas(usuario, [conversacion])[0],
            mensajes=[self._mensaje(m, conversacion, usuario, folios) for m in mensajes],
            hay_mas=hay_mas,
            entregas=entregas,
        )

    def enviar(self, usuario: models.Usuario, conversacion_id: int, datos: NuevoMensaje) -> Mensaje:
        if not datos.texto:
            raise DatosInvalidos("Escribe un mensaje antes de enviarlo.", campos={"texto": "Escribe un mensaje."})
        conversacion = legado.conversacion(self._db, conversacion_id, usuario)
        referencia = (datos.referencia.tipo, datos.referencia.id) if datos.referencia else None
        mensaje = legado.enviar(self._db, conversacion, usuario, datos.texto, referencia)
        legado.avisar(self._db, conversacion, mensaje, usuario)
        conversacion = legado.conversacion(self._db, conversacion_id, usuario)
        mensaje = self._mensajes.mensaje(conversacion.id, mensaje.id)
        return self._mensaje(mensaje, conversacion, usuario, self._folios_de(conversacion, [mensaje]))

    def leer(self, usuario: models.Usuario, conversacion_id: int, hasta: int) -> None:
        conversacion = legado.conversacion(self._db, conversacion_id, usuario)
        mensaje = self._mensajes.mensaje(conversacion.id, hasta)
        propio = self._participante(conversacion, usuario)
        if not mensaje or not propio:
            raise NoEncontrado("No encontramos ese mensaje en la conversación.")
        propio.ultimo_entregado_mensaje_id = max(propio.ultimo_entregado_mensaje_id, mensaje.id)
        propio.ultimo_leido_mensaje_id = max(propio.ultimo_leido_mensaje_id, mensaje.id)
        propio.ultimo_leido_en = utc_ahora()
        self._db.commit()

    def referencias(self, usuario: models.Usuario, conversacion_id: int) -> list[OpcionReferencia]:
        if es_cliente(usuario):
            raise SinPermiso("Solo el equipo de la firma adjunta referencias.")
        conversacion = legado.conversacion(self._db, conversacion_id, usuario)
        return [
            OpcionReferencia(
                tipo=r["tipo"], id=r["id"], titulo=r["titulo"], grupo=r.get("grupo"),
                radicado=r.get("radicado_numero") or None, padre_id=r.get("parent_id"), solicitud_id=r.get("request_id"),
            )
            for r in legado.referencias(self._db, conversacion, usuario)
        ]

    # --- Vistas ---------------------------------------------------------------

    @staticmethod
    def _participante(conversacion: models.ChatConversacion, usuario: models.Usuario) -> models.ChatParticipante | None:
        return next((p for p in conversacion.participantes if p.usuario_id == usuario.id), None)

    def _folios_de(self, conversacion: models.ChatConversacion, mensajes: list[models.ChatMensaje]) -> dict[int, int]:
        if conversacion.proceso_id is None or not mensajes:
            return {}
        ids = [m.id for m in mensajes]
        folios = self._mensajes.folios(conversacion.proceso_id, ids)
        if len(folios) < len(ids):
            # Los mensajes recién llegados aún no tienen folio: se folian al verlos.
            self._folios.foliar([conversacion.proceso_id])
            folios = self._mensajes.folios(conversacion.proceso_id, ids)
        return folios

    def _mensaje(self, mensaje: models.ChatMensaje, conversacion: models.ChatConversacion,
                 usuario: models.Usuario, folios: dict[int, int]) -> Mensaje:
        es_mio = mensaje.remitente_id == usuario.id
        return Mensaje(
            id=mensaje.id,
            texto=mensaje.contenido,
            autor=Autor(id=mensaje.remitente.id, nombre=mensaje.remitente.nombre_completo) if mensaje.remitente else None,
            es_mio=es_mio,
            enviado_en=mensaje.created_at,
            entrega=entrega_de(mensaje, conversacion.participantes) if es_mio else None,
            referencia=Referencia(
                tipo=mensaje.referencia_tipo, id=mensaje.referencia_id, titulo=mensaje.referencia_titulo or "",
                enlace=legado.enlace_referencia(self._db, mensaje, conversacion, usuario),
            ) if mensaje.referencia_tipo else None,
            folio=folios.get(mensaje.id),
        )

    def _vistas(self, usuario: models.Usuario, conversaciones: list[models.ChatConversacion]) -> list[Conversacion]:
        ids = [c.id for c in conversaciones]
        ultimos = self._mensajes.ultimos(ids)
        sin_leer = self._mensajes.sin_leer(ids, usuario.id)
        otros = {p.usuario_id for c in conversaciones for p in c.participantes if p.usuario_id != usuario.id}
        en_linea = self._mensajes.en_linea(otros, utc_ahora() - legado.ttl_presencia())
        return [self._vista(c, usuario, ultimos.get(c.id), sin_leer.get(c.id, (0, None)), en_linea) for c in conversaciones]

    @staticmethod
    def _vista(conversacion: models.ChatConversacion, usuario: models.Usuario, ultimo: models.ChatMensaje | None,
               sin_leer: tuple[int, int | None], en_linea: set[int]) -> Conversacion:
        otros = [p.usuario for p in conversacion.participantes if p.usuario_id != usuario.id and p.usuario]
        otro = otros[0] if otros else None
        tipo: TipoConversacion
        if conversacion.tipo == "PROCESO_COLABORADORES":
            tipo, clave = "colaboradores", f"process:{conversacion.proceso_id}:collaborators"
        elif conversacion.tipo == "PROCESO_DIRECTO":
            con_cliente = any(_rol(p.usuario) == RolUsuario.CLIENTE for p in conversacion.participantes if p.usuario)
            tipo = "cliente" if con_cliente else "equipo_proceso"
            clave = f"process:{conversacion.proceso_id}:{otro.id if otro else 0}"
        else:
            tipo, clave = "equipo", f"direct:{otro.id if otro else 0}"
        contacto = None
        if tipo != "colaboradores" and otro:
            contacto = Contacto(id=otro.id, nombre=otro.nombre_completo, rol=ROL_CONTACTO.get(_rol(otro), "abogado"))
        titulo = "Equipo del proceso" if tipo == "colaboradores" else (contacto.nombre if contacto else "Conversación")
        autor = ultimo.remitente if ultimo else None
        por_responder = bool(tipo == "cliente" and autor and _rol(autor) == RolUsuario.CLIENTE)
        return Conversacion(
            id=conversacion.id,
            clave=clave,
            tipo=tipo,
            titulo=titulo,
            proceso=ProcesoBreve(id=conversacion.proceso.id, nombre=conversacion.proceso.nombre) if conversacion.proceso else None,
            contacto=contacto,
            participantes=len(conversacion.participantes),
            en_linea=sum(1 for o in otros if o.id in en_linea),
            sin_leer=sin_leer[0],
            primer_sin_leer_id=sin_leer[1],
            por_responder=por_responder,
            ultimo=UltimoMensaje(
                texto=ultimo.contenido,
                autor=autor.nombre_completo if autor else None,
                es_mio=ultimo.remitente_id == usuario.id,
                enviado_en=ultimo.created_at,
            ) if ultimo else None,
            actualizada_en=ultimo.created_at if ultimo else conversacion.updated_at,
        )
