from sqlalchemy.orm import Session

from app import security
from app.audit import registrar_evento_auditoria
from app.modulos.identidad.modelos import EstadoUsuario, Usuario
from app.modulos.identidad.repositorio import RepositorioUsuarios
from app.nucleo.errores import DatosInvalidos, DemasiadosIntentos, NoAutenticado, SinPermiso
from app.nucleo.zona_horaria import ahora_utc, utc_ahora
from app.password_reset import password_reset_url
from app.rate_limit import VENTANA_INTENTOS, VENTANA_LOGIN, clave_intento, limite_excedido, registrar_intentos

# Topes del inicio de sesión; la recuperación de contraseña usa los suyos.
MAX_INTENTOS_POR_CORREO = 10
MAX_INTENTOS_POR_IP = 50

# Se responde lo mismo exista o no la cuenta, para no revelar qué correos están registrados.
MENSAJE_RECUPERACION = "Si existe una cuenta activa con ese correo, le enviamos un enlace para restablecer la contraseña."
ENLACE_INVALIDO = "El enlace para restablecer la contraseña no es válido o ya venció. Pida uno nuevo."

MENSAJES_ESTADO = {
    EstadoUsuario.PENDIENTE_APROBACION: ("cuenta_pendiente", "Tu cuenta aún no ha sido aprobada."),
    EstadoUsuario.SUSPENDIDO: ("cuenta_suspendida", "Tu cuenta está suspendida. Comunícate con la firma."),
    EstadoUsuario.RECHAZADO: ("cuenta_rechazada", "Tu solicitud de cuenta fue rechazada."),
}


class ServicioSesion:
    def __init__(self, db: Session, usuarios: RepositorioUsuarios):
        self._db = db
        self._usuarios = usuarios

    def iniciar(self, email: str, password: str, *, ip: str) -> Usuario:
        claves = [clave_intento("login:email", email), clave_intento("login:ip", ip)]
        topes = list(zip(claves, (MAX_INTENTOS_POR_CORREO, MAX_INTENTOS_POR_IP)))
        if limite_excedido(self._db, topes, VENTANA_LOGIN):
            raise DemasiadosIntentos("Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.")

        usuario = self._usuarios.por_email(email)
        if usuario is None or not security.verify_password(password, usuario.password_hash):
            registrar_intentos(self._db, claves)
            raise NoAutenticado("Correo o contraseña incorrectos.", codigo="credenciales_invalidas")

        if usuario.estado in MENSAJES_ESTADO:
            codigo, mensaje = MENSAJES_ESTADO[usuario.estado]
            raise SinPermiso(mensaje, codigo=codigo)

        usuario.ultimo_acceso = utc_ahora()
        self._db.commit()
        return usuario

    @staticmethod
    def emitir_token(usuario: Usuario, *, persistente: bool) -> str:
        return security.create_access_token({"sub": str(usuario.id)}, persistent=persistente)

    def cerrar_todas(self, usuario: Usuario) -> None:
        """Invalida todos los tokens emitidos hasta ahora, en cualquier dispositivo."""
        usuario.sesiones_cerradas_en = ahora_utc()
        registrar_evento_auditoria(self._db, usuario, "sesion.cerrar_todas", "usuario", usuario.id)
        self._db.commit()

    def cambiar_contrasena_temporal(self, usuario: Usuario, actual: str, nueva: str) -> Usuario:
        """La primera contraseña propia, en lugar de la temporal que se le envió."""
        if not usuario.debe_cambiar_password:
            raise SinPermiso("Para cambiar la contraseña, use «Acceso y seguridad» en su cuenta.", codigo="sin_contrasena_temporal")
        if not security.verify_password(actual, usuario.password_hash):
            raise DatosInvalidos("La contraseña temporal no es correcta.", campos={"contrasena_actual": "No coincide."})
        if security.verify_password(nueva, usuario.password_hash):
            raise DatosInvalidos("La nueva contraseña debe ser distinta de la temporal.", campos={"contrasena_nueva": "Use otra."})
        usuario.password_hash = security.hash_password(nueva)
        usuario.debe_cambiar_password = False
        usuario.ultimo_acceso = utc_ahora()
        registrar_evento_auditoria(self._db, usuario, "auth.password.cambiar", "usuario", usuario.id)
        self._db.commit()
        return usuario

    def pedir_recuperacion(self, email: str, *, ip: str) -> str | None:
        """Devuelve el enlace de recuperación si hay que enviarlo; None si no."""
        claves = [clave_intento("recuperar:ip", ip), clave_intento("recuperar:email", email)]
        if limite_excedido(self._db, list(zip(claves, (8, 3))), VENTANA_INTENTOS):
            return None
        registrar_intentos(self._db, claves)
        usuario = self._usuarios.por_email(email)
        if usuario is None or usuario.estado != EstadoUsuario.ACTIVO:
            return None
        token = security.create_password_reset_token(usuario.id, usuario.password_hash)
        return password_reset_url(token, usuario.rol)

    def restablecer(self, token: str, nueva: str) -> None:
        usuario_id = security.password_reset_token_user_id(token)
        usuario = self._db.get(Usuario, usuario_id) if usuario_id is not None else None
        if usuario is None or security.verify_password_reset_token(token, usuario.password_hash) != usuario.id:
            raise DatosInvalidos(ENLACE_INVALIDO, codigo="enlace_invalido")
        usuario.password_hash = security.hash_password(nueva)
        usuario.debe_cambiar_password = False
        registrar_evento_auditoria(self._db, usuario, "auth.password.restablecer", "usuario", usuario.id)
        self._db.commit()
