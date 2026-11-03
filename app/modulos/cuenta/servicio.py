"""La cuenta propia: datos, canales de aviso y cambios protegidos con un código.

Correo, WhatsApp y contraseña solo cambian después de verificar un código de
seis dígitos que llega por correo o WhatsApp. El código dura tres minutos, se
puede reenviar al minuto y admite cinco intentos.
"""

import hashlib
import hmac
import secrets
from collections.abc import Callable
from datetime import timedelta
from uuid import uuid4

from pydantic import TypeAdapter, ValidationError
from pydantic import EmailStr as CorreoValido
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app import models, security
from app.audit import registrar_evento_auditoria
from app.email_service import enviar_correo
from app.message_templates import render_message
from app.modulos.cuenta.esquemas import (
    AccionSegura,
    CambioAplicado,
    CambioMisAvisos,
    CambioMiCuenta,
    CambioSeguro,
    CanalCodigo,
    CodigoSeguridad,
    MiCuenta,
    NuevoCodigo,
    TipoAviso,
)
from app.modulos.identidad.modelos import RolUsuario, Usuario
from app.nucleo.errores import Conflicto, DatosInvalidos, DemasiadosIntentos, ErrorDominio, NoEncontrado, SinPermiso
from app.security_notifications import send_security_change_confirmation
from app.timezone import utc_ahora

DURACION_CODIGO = timedelta(minutes=3)
ESPERA_REENVIO = timedelta(seconds=60)
INTENTOS_MAXIMOS = 5
VERIFICADO = "__OTP_VERIFICADO__"

TIPOS_AVISO: dict[str, tuple[str, str]] = {
    "ACCESO": ("Acceso y cuenta", "Ingresos nuevos y cambios en los datos de la cuenta."),
    "ACTUACIONES": ("Actuaciones judiciales", "Lo que publican los juzgados en los radicados que se siguen."),
    "TAREAS": ("Tareas asignadas", "Cuando se asigna una tarea o cambia una que está a cargo."),
    "SUBTAREAS": ("Subtareas asignadas", "Cuando se asigna una subtarea."),
    "RECORDATORIOS": ("Recordatorios", "Antes de que venza una tarea o empiece una cita."),
    "DOCUMENTOS": ("Documentos y solicitudes", "Documentos que envían los clientes y respuestas a lo que se les pidió."),
    "RESUMENES": ("Resúmenes", "El resumen periódico de lo pendiente."),
}
CANAL_MODELO = {"correo": "EMAIL", "whatsapp": "WHATSAPP"}
CANAL_V2 = {valor: clave for clave, valor in CANAL_MODELO.items()}
ETIQUETA_CAMBIO = {"email": "correo de acceso", "whatsapp": "número de WhatsApp", "password": "contraseña"}


class CodigoVencido(ErrorDominio):
    estado = 410
    codigo = "codigo_vencido"


class EnvioFallido(ErrorDominio):
    estado = 503
    codigo = "envio_fallido"


def _rol(usuario: Usuario) -> str:
    return usuario.rol.value if hasattr(usuario.rol, "value") else str(usuario.rol)


def _enmascarar(canal: str, usuario: Usuario) -> str:
    if canal == "EMAIL":
        local, _, dominio = (usuario.email or "").partition("@")
        return f"{local[:1]}•••@{dominio}" if dominio else "su correo"
    numero = "".join(c for c in (usuario.whatsapp_numero or "") if c.isdigit())
    return f"••• {numero[-4:]}" if numero else "su WhatsApp"


def _hash(codigo_id: str, usuario_id: int, accion: str, codigo: str) -> str:
    mensaje = f"{codigo_id}:{usuario_id}:{accion}:{codigo}".encode()
    return hmac.new(security.get_jwt_secret().encode(), mensaje, hashlib.sha256).hexdigest()


class ServicioCuenta:
    def __init__(self, db: Session, enviar: Callable[[Usuario, str, str], bool] | None = None):
        self._db = db
        self._enviar = enviar or self._enviar_codigo

    # ── Datos y avisos ──────────────────────────────────────────────────

    def mi_cuenta(self, usuario: Usuario) -> MiCuenta:
        rol = _rol(usuario)
        preferencias = usuario.preferencias_notificacion or {}
        avisos = [] if rol == RolUsuario.CLIENTE.value else [
            TipoAviso(
                clave=clave,
                nombre=nombre,
                descripcion=descripcion,
                correo=bool((preferencias.get(clave) or {}).get("email", True)),
                whatsapp=bool((preferencias.get(clave) or {}).get("whatsapp", False)),
            )
            for clave, (nombre, descripcion) in TIPOS_AVISO.items()
        ]
        genero = (usuario.genero or "").upper()
        return MiCuenta(
            id=usuario.id,
            nombre=usuario.nombre_completo,
            email=usuario.email,
            whatsapp=usuario.whatsapp_numero or "",
            rol=rol,
            genero=genero if genero in {"MASCULINO", "FEMENINO"} else None,
            numero_documento=usuario.numero_documento,
            domicilio=usuario.domicilio,
            tarjeta_profesional=usuario.tarjeta_profesional,
            avisos=avisos,
            silenciar_correo_si_push=bool(usuario.silenciar_email_si_push),
            silenciar_whatsapp_si_push=bool(usuario.silenciar_whatsapp_si_push),
        )

    def cambiar(self, usuario: Usuario, datos: CambioMiCuenta) -> MiCuenta:
        if _rol(usuario) == RolUsuario.CLIENTE.value:
            raise SinPermiso("Sus datos los actualiza la firma: envíe la solicitud desde su perfil.")
        cambios = datos.model_dump(exclude_unset=True)
        if "nombre" in cambios:
            nombre = " ".join((cambios["nombre"] or "").split())
            if not nombre:
                raise DatosInvalidos("Escriba el nombre completo.", campos={"nombre": "Escriba el nombre completo."})
            usuario.nombre_completo = nombre
        if "genero" in cambios:
            usuario.genero = cambios["genero"] or None
        for campo in ("numero_documento", "domicilio", "tarjeta_profesional"):
            if campo in cambios:
                valor = " ".join((cambios[campo] or "").split()).upper()
                if campo != "domicilio":
                    valor = valor.replace(".", "")
                setattr(usuario, campo, valor or None)
        registrar_evento_auditoria(self._db, usuario, "auth.perfil.actualizar", "usuario", usuario.id)
        self._db.commit()
        self._db.refresh(usuario)
        return self.mi_cuenta(usuario)

    def cambiar_avisos(self, usuario: Usuario, datos: CambioMisAvisos) -> MiCuenta:
        if datos.tipos is not None:
            if _rol(usuario) == RolUsuario.CLIENTE.value:
                raise SinPermiso("Elija sus canales de aviso desde su perfil.")
            desconocidos = set(datos.tipos) - set(TIPOS_AVISO)
            if desconocidos:
                raise DatosInvalidos("Hay tipos de aviso que no existen.")
            if any(c.whatsapp for c in datos.tipos.values()) and not (usuario.whatsapp_numero or "").strip():
                raise DatosInvalidos("Registre un número de WhatsApp antes de activar ese canal.")
            actuales = dict(usuario.preferencias_notificacion or {})
            for clave, canales in datos.tipos.items():
                actuales[clave] = {"email": canales.correo, "whatsapp": canales.whatsapp}
            usuario.preferencias_notificacion = {
                clave: {
                    "email": bool((actuales.get(clave) or {}).get("email", True)),
                    "whatsapp": bool((actuales.get(clave) or {}).get("whatsapp", False)),
                }
                for clave in TIPOS_AVISO
            }
            usuario.notificaciones_email = any(c["email"] for c in usuario.preferencias_notificacion.values())
            usuario.notificaciones_whatsapp = any(c["whatsapp"] for c in usuario.preferencias_notificacion.values())
        if datos.silenciar_correo_si_push is not None:
            usuario.silenciar_email_si_push = datos.silenciar_correo_si_push
        if datos.silenciar_whatsapp_si_push is not None:
            usuario.silenciar_whatsapp_si_push = datos.silenciar_whatsapp_si_push
        registrar_evento_auditoria(self._db, usuario, "auth.notificaciones.actualizar", "usuario", usuario.id)
        self._db.commit()
        self._db.refresh(usuario)
        return self.mi_cuenta(usuario)

    # ── Códigos de seguridad ────────────────────────────────────────────

    def _enviar_codigo(self, usuario: Usuario, canal: str, codigo: str) -> bool:
        asunto, mensaje = render_message(self._db, "CODIGO_SEGURIDAD", {"nombre": usuario.nombre_completo, "codigo": codigo}, canal=canal)
        if canal == "EMAIL":
            return enviar_correo(usuario.email, asunto, mensaje)
        from app.whatsapp import enviar_mensaje_whatsapp

        return bool(usuario.whatsapp_numero and enviar_mensaje_whatsapp(usuario.whatsapp_numero, mensaje))

    def _vista(self, usuario: Usuario, codigo: models.CodigoSeguridadUsuario) -> CodigoSeguridad:
        return CodigoSeguridad(
            id=codigo.id,
            accion=codigo.accion,
            canal=CANAL_V2.get(codigo.canal, "correo"),
            destino=_enmascarar(codigo.canal, usuario),
            expira_en=codigo.expira_en,
            reenviar_desde=codigo.reenviar_desde,
            verificado=codigo.valor_pendiente == VERIFICADO,
        )

    def _validar_canal(self, usuario: Usuario, canal: CanalCodigo) -> str:
        if canal == "correo" and not usuario.email:
            raise DatosInvalidos("La cuenta no tiene un correo registrado.")
        if canal == "whatsapp" and not (usuario.whatsapp_numero or "").strip():
            raise DatosInvalidos("La cuenta no tiene un número de WhatsApp registrado.")
        return CANAL_MODELO[canal]

    def _emitir(self, usuario: Usuario, canal: str, accion: str, codigo_id: str) -> str:
        codigo = f"{secrets.randbelow(1_000_000):06d}"
        if not self._enviar(usuario, canal, codigo):
            raise EnvioFallido("No pudimos enviar el código por ese medio. Pruebe con el otro o intente más tarde.")
        return _hash(codigo_id, usuario.id, accion, codigo)

    def _vigente(self, usuario: Usuario, codigo_id: str) -> models.CodigoSeguridadUsuario:
        codigo = self._db.scalars(
            select(models.CodigoSeguridadUsuario)
            .where(
                models.CodigoSeguridadUsuario.id == codigo_id,
                models.CodigoSeguridadUsuario.usuario_id == usuario.id,
                models.CodigoSeguridadUsuario.consumido_en.is_(None),
            )
            .with_for_update()
        ).first()
        if codigo is None or codigo.expira_en <= utc_ahora():
            raise CodigoVencido("El código venció. Pida uno nuevo.")
        return codigo

    def pedir_codigo(self, usuario: Usuario, datos: NuevoCodigo) -> CodigoSeguridad:
        canal = self._validar_canal(usuario, datos.canal)
        ahora = utc_ahora()
        anterior = self._db.scalars(
            select(models.CodigoSeguridadUsuario)
            .where(
                models.CodigoSeguridadUsuario.usuario_id == usuario.id,
                models.CodigoSeguridadUsuario.accion == datos.accion,
                models.CodigoSeguridadUsuario.consumido_en.is_(None),
            )
            .order_by(models.CodigoSeguridadUsuario.creado_en.desc())
        ).first()
        if anterior and anterior.expira_en > ahora and anterior.reenviar_desde > ahora:
            raise DemasiadosIntentos("Ya enviamos un código. Espere un momento para pedir otro.")
        codigo_id = str(uuid4())
        huella = self._emitir(usuario, canal, datos.accion, codigo_id)
        if anterior:
            anterior.consumido_en = ahora
            anterior.valor_pendiente = None
        codigo = models.CodigoSeguridadUsuario(
            id=codigo_id, usuario_id=usuario.id, accion=datos.accion, canal=canal, codigo_hash=huella,
            valor_pendiente=None, expira_en=ahora + DURACION_CODIGO, reenviar_desde=ahora + ESPERA_REENVIO,
        )
        self._db.add(codigo)
        self._db.commit()
        return self._vista(usuario, codigo)

    def codigo_activo(self, usuario: Usuario, accion: AccionSegura) -> CodigoSeguridad | None:
        ahora = utc_ahora()
        self._db.execute(
            update(models.CodigoSeguridadUsuario)
            .where(
                models.CodigoSeguridadUsuario.usuario_id == usuario.id,
                models.CodigoSeguridadUsuario.expira_en <= ahora,
                models.CodigoSeguridadUsuario.consumido_en.is_(None),
            )
            .values(valor_pendiente=None, consumido_en=ahora)
        )
        self._db.commit()
        codigo = self._db.scalars(
            select(models.CodigoSeguridadUsuario)
            .where(
                models.CodigoSeguridadUsuario.usuario_id == usuario.id,
                models.CodigoSeguridadUsuario.accion == accion,
                models.CodigoSeguridadUsuario.consumido_en.is_(None),
            )
            .order_by(models.CodigoSeguridadUsuario.creado_en.desc())
        ).first()
        return self._vista(usuario, codigo) if codigo else None

    def reenviar(self, usuario: Usuario, codigo_id: str, canal_v2: CanalCodigo) -> CodigoSeguridad:
        codigo = self._vigente(usuario, codigo_id)
        ahora = utc_ahora()
        if codigo.reenviar_desde > ahora:
            raise DemasiadosIntentos("Espere un momento antes de reenviar el código.")
        canal = self._validar_canal(usuario, canal_v2)
        codigo.codigo_hash = self._emitir(usuario, canal, codigo.accion, codigo.id)
        codigo.canal = canal
        codigo.expira_en = ahora + DURACION_CODIGO
        codigo.reenviar_desde = ahora + ESPERA_REENVIO
        codigo.intentos = 0
        codigo.valor_pendiente = None
        self._db.commit()
        return self._vista(usuario, codigo)

    def verificar(self, usuario: Usuario, codigo_id: str, ingresado: str) -> CodigoSeguridad:
        codigo = self._vigente(usuario, codigo_id)
        if codigo.intentos >= INTENTOS_MAXIMOS:
            codigo.consumido_en = utc_ahora()
            codigo.valor_pendiente = None
            self._db.commit()
            raise DemasiadosIntentos("Se agotaron los intentos. Pida un código nuevo.")
        if not hmac.compare_digest(_hash(codigo.id, usuario.id, codigo.accion, ingresado), codigo.codigo_hash):
            codigo.intentos += 1
            self._db.commit()
            restantes = INTENTOS_MAXIMOS - codigo.intentos
            detalle = f"Le quedan {restantes} intentos." if restantes > 1 else "Le queda un intento." if restantes == 1 else "Pida un código nuevo."
            raise DatosInvalidos(f"El código no coincide. {detalle}", campos={"codigo": "El código no coincide."})
        codigo.valor_pendiente = VERIFICADO
        self._db.commit()
        return self._vista(usuario, codigo)

    def aplicar(self, usuario: Usuario, codigo_id: str, datos: CambioSeguro) -> tuple[CambioAplicado, Callable[[], None]]:
        """Aplica el cambio y devuelve la confirmación que hay que enviar después de responder."""
        codigo = self._vigente(usuario, codigo_id)
        if codigo.valor_pendiente != VERIFICADO:
            raise SinPermiso("Primero escriba el código que le enviamos.")
        correo_antes, whatsapp_antes = usuario.email, usuario.whatsapp_numero or ""
        if codigo.accion == "email":
            try:
                nuevo = str(TypeAdapter(CorreoValido).validate_python((datos.valor or "").strip())).lower()
            except ValidationError as exc:
                raise DatosInvalidos("Escriba un correo válido.", campos={"valor": "Escriba un correo válido."}) from exc
            if nuevo == (usuario.email or "").lower():
                raise DatosInvalidos("Ese ya es el correo de la cuenta.", campos={"valor": "Ese ya es el correo de la cuenta."})
            ocupado = self._db.scalars(select(Usuario.id).where(Usuario.email == nuevo, Usuario.id != usuario.id)).first()
            if ocupado:
                raise Conflicto("Ese correo ya pertenece a otra cuenta.", campos={"valor": "Ese correo ya pertenece a otra cuenta."})
            usuario.email = nuevo
        elif codigo.accion == "whatsapp":
            numero = "".join(c for c in (datos.valor or "") if c.isdigit())
            if not 10 <= len(numero) <= 15:
                raise DatosInvalidos("Escriba el número completo, con el indicativo del país.", campos={"valor": "Número incompleto."})
            usuario.whatsapp_numero = numero
        else:
            if not datos.contrasena_actual or not security.verify_password(datos.contrasena_actual, usuario.password_hash):
                raise DatosInvalidos("La contraseña actual no es correcta.", campos={"contrasena_actual": "No es correcta."})
            nueva = datos.contrasena_nueva or ""
            if len(nueva) < 8 or len(nueva.encode("utf-8")) > 72:
                raise DatosInvalidos("La contraseña nueva debe tener al menos 8 caracteres.", campos={"contrasena_nueva": "Mínimo 8 caracteres."})
            usuario.password_hash = security.hash_password(nueva)
            usuario.debe_cambiar_password = False

        if _rol(usuario) == RolUsuario.CLIENTE.value and codigo.accion in {"email", "whatsapp"}:
            # Las solicitudes de cambio pendientes no deben devolver el dato anterior.
            for pendiente in self._db.scalars(
                select(models.SolicitudEdicionPerfilCliente).where(
                    models.SolicitudEdicionPerfilCliente.cliente_id == usuario.id,
                    models.SolicitudEdicionPerfilCliente.estado == "PENDIENTE",
                )
            ):
                pendiente.email_solicitado = usuario.email
                pendiente.whatsapp_numero_solicitado = usuario.whatsapp_numero or ""

        codigo.consumido_en = utc_ahora()
        codigo.valor_pendiente = None
        registrar_evento_auditoria(self._db, usuario, f"auth.seguridad.{codigo.accion}", "usuario", usuario.id)
        self._db.commit()
        self._db.refresh(usuario)
        nombre, etiqueta = usuario.nombre_completo, ETIQUETA_CAMBIO[codigo.accion]
        correos, numeros = [correo_antes, usuario.email], [whatsapp_antes, usuario.whatsapp_numero or ""]

        def confirmar() -> None:
            send_security_change_confirmation(nombre, etiqueta, correos, numeros)

        return CambioAplicado(email=usuario.email, whatsapp=usuario.whatsapp_numero or ""), confirmar

    def cancelar(self, usuario: Usuario, codigo_id: str) -> None:
        codigo = self._db.scalars(
            select(models.CodigoSeguridadUsuario).where(
                models.CodigoSeguridadUsuario.id == codigo_id,
                models.CodigoSeguridadUsuario.usuario_id == usuario.id,
                models.CodigoSeguridadUsuario.consumido_en.is_(None),
            )
        ).first()
        if codigo is None:
            raise NoEncontrado("Ese código ya no está activo.")
        codigo.consumido_en = utc_ahora()
        codigo.valor_pendiente = None
        self._db.commit()
