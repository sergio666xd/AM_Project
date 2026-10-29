"""Sitio público y bandeja de mensajes del formulario de contacto.

Lo público no pide sesión. Recibir un mensaje tiene límite de intentos por IP
y por correo, y un campo trampa: si un robot lo llena, se le responde igual
que a una persona pero no se guarda nada.
"""

import json
from datetime import datetime

from sqlalchemy.orm import Session

from app.audit import registrar_evento_auditoria
from app.modulos.administracion.politicas import exigir_admin
from app.modulos.identidad.modelos import Usuario
from app.modulos.sitio import avisos
from app.modulos.sitio.esquemas import (
    CambioMensajeSitio,
    CambioPaginaSitio,
    ConteoMensajesSitio,
    ContactoPublico,
    NuevoMensajeSitio,
    PaginaPublica,
    PaginaMensajesSitio,
    PaginaSitio,
    PaginaSitioDetalle,
    MensajeSitio,
    MensajeSitioRecibido,
)
from app.modulos.sitio.repositorio import RepositorioSitio
from app.nucleo.errores import DatosInvalidos, DemasiadosIntentos, NoEncontrado
from app.nucleo.paginacion import ParametrosPagina, codificar_cursor
from app.rate_limit import VENTANA_INTENTOS, clave_intento, limite_excedido, registrar_intentos
from app.site_content import PUBLIC_CONTENT_PAGES, PUBLIC_PAGE_ROUTES
from app.timezone import utc_ahora
from app import models

MAX_POR_IP = 5
MAX_POR_CORREO = 3
MAX_CONTENIDO = 250_000
RECIBIDO = "Recibimos su mensaje. La firma le responderá por el medio que dejó."
FIRMA = "Alejandra Muñoz | Abogada y Asociados"


def _solicitud(fila, firma: str) -> MensajeSitio:
    s, atendida_por = fila
    return MensajeSitio(
        id=s.id, nombre=s.nombre, telefono=s.telefono, correo=s.correo, area=s.area, mensaje=s.mensaje,
        estado=s.estado.lower(), nota=s.nota, aviso_firma=s.aviso_firma.lower(), aviso_error=s.aviso_error,
        whatsapp_url=avisos.whatsapp_url(s, firma), recibida_en=s.created_at, atendida_en=s.atendida_en,
        atendida_por=atendida_por,
    )


class ServicioSitio:
    def __init__(self, db: Session, repositorio: RepositorioSitio):
        self._db = db
        self._repo = repositorio

    def _firma(self) -> str:
        config = self._repo.configuracion_firma()
        return config.nombre if config and config.nombre else FIRMA

    # ---- Público -----------------------------------------------------------------

    def contacto(self) -> ContactoPublico:
        # Sin fila guardada rigen los valores base del modelo, los mismos que verá la administración.
        config = self._repo.configuracion_firma() or models.ConfiguracionFirma(**{
            columna.name: columna.default.arg for columna in models.ConfiguracionFirma.__table__.columns
            if columna.default is not None and not callable(columna.default.arg)
        })
        if not config.mostrar_contacto_publico:
            return ContactoPublico(nombre=config.nombre, mostrar_contacto=False)
        return ContactoPublico(
            nombre=config.nombre, mostrar_contacto=True, correo_contacto=config.correo_contacto or None,
            correo_pqr=config.correo_pqr or None, telefono=config.telefono or None, whatsapp=config.whatsapp or None,
            direccion=config.direccion or None, ciudad=config.ciudad or None, pais=config.pais or None,
        )

    def pagina(self, slug: str) -> PaginaPublica:
        if slug not in PUBLIC_CONTENT_PAGES:
            raise NoEncontrado("Esa página no existe.", codigo="pagina_no_existe")
        pagina = self._repo.pagina(slug)
        return PaginaPublica(slug=slug, contenido=_contenido(pagina), actualizada_en=pagina.updated_at if pagina else None)

    def recibir(self, datos: NuevoMensajeSitio, *, ip: str) -> tuple[MensajeSitioRecibido, int | None]:
        """Guarda el mensaje y devuelve su id para que los correos salgan en segundo plano."""
        claves = [(clave_intento("contacto:ip", ip), MAX_POR_IP)]
        if datos.correo:
            claves.append((clave_intento("contacto:correo", str(datos.correo)), MAX_POR_CORREO))
        if limite_excedido(self._db, claves, VENTANA_INTENTOS):
            raise DemasiadosIntentos("Ya recibimos varios mensajes desde aquí. Si es urgente, escríbanos por WhatsApp.")
        if datos.website.strip():
            registrar_intentos(self._db, [clave for clave, _ in claves])
            return MensajeSitioRecibido(mensaje=RECIBIDO), None

        campos: dict[str, str] = {}
        if not datos.nombre:
            campos["nombre"] = "Escriba su nombre."
        digitos = "".join(c for c in datos.telefono or "" if c.isdigit())
        if datos.telefono and not 7 <= len(digitos) <= 15:
            campos["telefono"] = "Revise el número: debe tener entre 7 y 15 dígitos."
        if not datos.telefono and not datos.correo:
            campos["telefono"] = "Deje un WhatsApp, un teléfono o un correo para responderle."
        if len(datos.mensaje) < 10:
            campos["mensaje"] = "Cuéntenos en una o dos frases qué necesita."
        if not datos.autorizacion:
            campos["autorizacion"] = "Para responderle necesitamos su autorización para tratar estos datos."
        if campos:
            raise DatosInvalidos("Revise los campos marcados.", campos=campos)

        registrar_intentos(self._db, [clave for clave, _ in claves])
        ahora = utc_ahora()
        solicitud = models.SolicitudContacto(
            nombre=datos.nombre, telefono=datos.telefono, correo=str(datos.correo).lower() if datos.correo else None,
            area=datos.area, mensaje=datos.mensaje, autorizo_datos_en=ahora, estado="NUEVA", aviso_firma="PENDIENTE",
            created_at=ahora, updated_at=ahora,
        )
        self._db.add(solicitud)
        self._db.commit()
        return MensajeSitioRecibido(mensaje=RECIBIDO), solicitud.id

    # ---- Administración ------------------------------------------------------------

    def listar(self, usuario: Usuario, estado: str | None, pagina: ParametrosPagina) -> PaginaMensajesSitio:
        exigir_admin(usuario)
        estado_bd = estado.upper() if estado else None
        despues = None
        if pagina.cursor:
            try:
                despues = (datetime.fromisoformat(pagina.cursor["f"]), int(pagina.cursor["id"]))
            except (KeyError, TypeError, ValueError) as exc:
                raise DatosInvalidos("El cursor de la página no es válido.", campos={"cursor": "No es válido."}) from exc
        filas = self._repo.solicitudes(estado_bd, despues=despues, limite=pagina.limite + 1)
        hay_mas = len(filas) > pagina.limite
        filas = filas[: pagina.limite]
        conteo = self._repo.conteo()
        firma = self._firma()
        siguiente = codificar_cursor({"f": filas[-1][0].created_at.isoformat(), "id": filas[-1][0].id}) if hay_mas else None
        return PaginaMensajesSitio(
            items=[_solicitud(f, firma) for f in filas],
            total=conteo.get(estado_bd, 0) if estado_bd else sum(conteo.values()),
            siguiente=siguiente,
            conteo=ConteoMensajesSitio(nueva=conteo.get("NUEVA", 0), atendida=conteo.get("ATENDIDA", 0),
                                     descartada=conteo.get("DESCARTADA", 0)),
        )

    def detalle(self, usuario: Usuario, solicitud_id: int) -> MensajeSitio:
        exigir_admin(usuario)
        fila = self._repo.solicitud(solicitud_id)
        if fila is None:
            raise NoEncontrado("Ese mensaje no existe.", codigo="mensaje_no_existe")
        return _solicitud(fila, self._firma())

    def cambiar(self, usuario: Usuario, solicitud_id: int, datos: CambioMensajeSitio) -> MensajeSitio:
        exigir_admin(usuario)
        fila = self._repo.solicitud(solicitud_id)
        if fila is None:
            raise NoEncontrado("Ese mensaje no existe.", codigo="mensaje_no_existe")
        solicitud = fila[0]
        cambios = datos.model_dump(exclude_unset=True)
        if "nota" in cambios:
            solicitud.nota = (datos.nota or "").strip() or None
        if datos.estado:
            nuevo = datos.estado.upper()
            if nuevo != solicitud.estado:
                solicitud.estado = nuevo
                solicitud.atendida_en = utc_ahora() if nuevo != "NUEVA" else None
                solicitud.atendida_por_id = usuario.id if nuevo != "NUEVA" else None
                registrar_evento_auditoria(self._db, usuario, f"sitio.mensaje.{datos.estado}", "solicitud_contacto", solicitud.id)
        elif "nota" in cambios:
            registrar_evento_auditoria(self._db, usuario, "sitio.mensaje.nota", "solicitud_contacto", solicitud.id)
        self._db.commit()
        return self.detalle(usuario, solicitud_id)

    # ---- Contenido de las páginas ----------------------------------------------------

    def paginas(self, usuario: Usuario) -> list[PaginaSitio]:
        exigir_admin(usuario)
        editadas = self._repo.paginas_editadas()
        return [_pagina_sitio(slug, *editadas.get(slug, (None, None))) for slug in PUBLIC_CONTENT_PAGES]

    def pagina_admin(self, usuario: Usuario, slug: str) -> PaginaSitioDetalle:
        exigir_admin(usuario)
        if slug not in PUBLIC_CONTENT_PAGES:
            raise NoEncontrado("Esa página no existe.", codigo="pagina_no_existe")
        pagina, nombre = self._repo.paginas_editadas().get(slug, (None, None))
        base = _pagina_sitio(slug, pagina, nombre)
        return PaginaSitioDetalle(**base.model_dump(), contenido=_contenido(pagina))

    def guardar_pagina(self, usuario: Usuario, slug: str, datos: CambioPaginaSitio) -> PaginaSitioDetalle:
        exigir_admin(usuario)
        if slug not in PUBLIC_CONTENT_PAGES:
            raise NoEncontrado("Esa página no existe.", codigo="pagina_no_existe")
        # Las direcciones del sitio son fijas: cada página vive en su archivo de Next.
        contenido = {**datos.contenido, "route": PUBLIC_PAGE_ROUTES[slug]}
        if len(json.dumps(contenido, ensure_ascii=False)) > MAX_CONTENIDO:
            raise DatosInvalidos("La página es demasiado larga para guardarla.",
                                 campos={"contenido": "Acorte los textos más largos e intente de nuevo."})
        pagina = self._repo.pagina(slug)
        if pagina is None:
            pagina = models.ContenidoPagina(slug=slug, contenido=contenido)
            self._db.add(pagina)
        else:
            pagina.contenido = contenido
        pagina.actualizado_por_id = usuario.id
        registrar_evento_auditoria(self._db, usuario, "sitio.pagina.guardada", "pagina_publica", slug)
        self._db.commit()
        return self.pagina_admin(usuario, slug)

    def restaurar_pagina(self, usuario: Usuario, slug: str) -> PaginaSitioDetalle:
        exigir_admin(usuario)
        if slug not in PUBLIC_CONTENT_PAGES:
            raise NoEncontrado("Esa página no existe.", codigo="pagina_no_existe")
        pagina = self._repo.pagina(slug)
        if pagina is not None:
            self._db.delete(pagina)
            registrar_evento_auditoria(self._db, usuario, "sitio.pagina.restaurada", "pagina_publica", slug)
            self._db.commit()
        return self.pagina_admin(usuario, slug)


def _contenido(pagina: models.ContenidoPagina | None) -> dict | None:
    contenido = pagina.contenido if pagina else None
    if isinstance(contenido, str):
        # Filas guardadas como texto JSON en vez de objeto: se leen igual.
        try:
            contenido = json.loads(contenido)
        except ValueError:
            return None
    return contenido if isinstance(contenido, dict) else None


def _pagina_sitio(slug: str, pagina: models.ContenidoPagina | None, nombre: str | None) -> PaginaSitio:
    return PaginaSitio(
        slug=slug, nombre=PUBLIC_CONTENT_PAGES[slug], ruta=PUBLIC_PAGE_ROUTES[slug], editada=pagina is not None,
        actualizada_en=pagina.updated_at if pagina else None, actualizada_por=nombre,
    )
