"""Vaciar conversaciones del chat.

La lista muestra solo quiénes participan, cuántos mensajes hay y cuándo fue el
último: la administración nunca lee el contenido. Vaciar borra los mensajes y
deja la conversación lista para volver a usarse.
"""

from datetime import datetime

from sqlalchemy.orm import Session

from app import models
from app.audit import registrar_evento_auditoria
from app.modulos.administracion.politicas import exigir_admin
from app.modulos.expedientes.politicas import _rol
from app.modulos.identidad.modelos import RolUsuario, Usuario
from app.modulos.sistema.esquemas import ChatParaLimpiar, ChatVaciado, PaginaChats, TipoChat
from app.modulos.sistema.repositorio import RepositorioSistema
from app.nucleo.errores import DatosInvalidos, NoEncontrado
from app.nucleo.paginacion import ParametrosPagina, codificar_cursor


def _tipo(conversacion: models.ChatConversacion) -> TipoChat:
    if conversacion.tipo == "PROCESO_COLABORADORES":
        return "colaboradores"
    if conversacion.tipo == "PROCESO_DIRECTO":
        con_cliente = any(p.usuario and _rol(p.usuario) == RolUsuario.CLIENTE.value for p in conversacion.participantes)
        return "cliente" if con_cliente else "equipo_proceso"
    return "equipo"


class ServicioLimpiezaChats:
    def __init__(self, db: Session, repositorio: RepositorioSistema):
        self._db = db
        self._repo = repositorio

    def listar(self, admin: Usuario, pagina: ParametrosPagina) -> PaginaChats:
        exigir_admin(admin)
        despues = None
        if pagina.cursor:
            try:
                despues = (datetime.fromisoformat(str(pagina.cursor["c"])), int(pagina.cursor["id"]))
            except (KeyError, TypeError, ValueError) as exc:
                raise DatosInvalidos("El cursor de la página no es válido.", campos={"cursor": "No es válido."}) from exc
        filas = self._repo.chats(despues=despues, limite=pagina.limite + 1)
        hay_mas = len(filas) > pagina.limite
        filas = filas[: pagina.limite]
        items = [
            ChatParaLimpiar(
                id=c.id, tipo=_tipo(c), proceso=c.proceso.nombre if c.proceso else None,
                participantes=sorted(p.usuario.nombre_completo for p in c.participantes if p.usuario),
                mensajes=int(mensajes), ultimo_mensaje=ultimo,
            )
            for c, mensajes, ultimo, _orden in filas
        ]
        siguiente = None
        if hay_mas and filas:
            c, _m, _u, orden = filas[-1]
            siguiente = codificar_cursor({"c": orden.isoformat(), "id": c.id})
        return PaginaChats(items=items, total=self._repo.contar_chats(), siguiente=siguiente)

    def vaciar(self, admin: Usuario, chat_id: int) -> ChatVaciado:
        exigir_admin(admin)
        conversacion = self._repo.chat(chat_id, bloquear=True)
        if conversacion is None:
            raise NoEncontrado("Esa conversación ya no existe.")
        borrados = (
            self._db.query(models.ChatMensaje).filter_by(conversacion_id=chat_id).delete(synchronize_session=False)
        )
        for participante in conversacion.participantes:
            participante.ultimo_leido_en = None
            participante.ultimo_entregado_mensaje_id = 0
            participante.ultimo_leido_mensaje_id = 0
        registrar_evento_auditoria(self._db, admin, "admin.chat.limpiar_conversacion", "chat_conversacion", chat_id,
                                   {"mensajes_eliminados": borrados})
        self._db.commit()
        return ChatVaciado(mensajes_eliminados=borrados)
