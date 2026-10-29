"""Estado de las integraciones en un vistazo, a partir de lo que ya quedó registrado.

No hace llamadas de red: la consulta judicial se juzga por el último barrido,
el correo y WhatsApp por sus últimos envíos, y push y almacenamiento por su
configuración. Las pruebas de conexión siguen en Operación > Integraciones.
"""

import os
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models
from app.integration_settings import get_integration_settings
from app.modulos.administracion.esquemas import EstadoIntegracion
from app.timezone import utc_ahora

ADMIN = "/gestion-procesos/admin"
VENTANA_ENVIOS = timedelta(days=7)
# Las consultas corren a las 12:00 y 17:00 los días hábiles: más de dos días sin una es raro.
CONSULTA_ATRASADA = timedelta(hours=52)


def _plural(n: int, singular: str, plural: str) -> str:
    return f"{n} {singular if n == 1 else plural}"


def rama_judicial(db: Session) -> EstadoIntegracion:
    base = {"clave": "rama_judicial", "nombre": "Consulta a la Rama Judicial", "enlace": f"{ADMIN}/operacion/consultas"}
    configuracion = db.get(models.ConfiguracionConsultas, 1)
    ultimo = db.scalars(select(models.EjecucionBarrido).order_by(models.EjecucionBarrido.inicio.desc()).limit(1)).first()
    if ultimo is None:
        return EstadoIntegracion(
            **base, estado="aviso", ultima_vez=None,
            resumen="Aún no se ha hecho ninguna consulta automática.",
            detalle=None if configuracion and configuracion.activa else "Las consultas automáticas están apagadas.",
        )
    cifras = f"{_plural(ultimo.procesados, 'radicado consultado', 'radicados consultados')}, " \
              f"{_plural(ultimo.actuaciones_nuevas, 'actuación nueva', 'actuaciones nuevas')}"
    apagadas = "Las consultas automáticas están apagadas." if configuracion and not configuracion.activa else None
    if ultimo.estado == "EN_PROCESO":
        return EstadoIntegracion(**base, estado="ok", ultima_vez=ultimo.inicio, detalle=apagadas,
                                 resumen=f"Consultando ahora: {ultimo.procesados} de {ultimo.total_radicados} radicados.")
    cuando = ultimo.finalizacion or ultimo.inicio
    if ultimo.estado == "ERROR":
        return EstadoIntegracion(**base, estado="falla", ultima_vez=cuando, detalle=apagadas,
                                 resumen="La última consulta automática no terminó.")
    if ultimo.estado == "COMPLETADA_CON_ERRORES":
        sin_consultar = max(ultimo.errores, ultimo.total_radicados - ultimo.procesados)
        return EstadoIntegracion(**base, estado="aviso", ultima_vez=cuando, detalle=cifras,
                                 resumen=f"{_plural(sin_consultar, 'radicado no se pudo', 'radicados no se pudieron')} consultar.")
    if configuracion and configuracion.activa and utc_ahora() - cuando > CONSULTA_ATRASADA:
        return EstadoIntegracion(**base, estado="aviso", ultima_vez=cuando, detalle=cifras,
                                 resumen="La última consulta automática fue hace más de dos días.")
    return EstadoIntegracion(**base, estado="ok", ultima_vez=cuando, detalle=apagadas, resumen=cifras.capitalize() + ".")


def _envios(db: Session, canal: str, nombre: str, clave: str, configurado: bool, faltante: str) -> EstadoIntegracion:
    base = {"clave": clave, "nombre": nombre, "enlace": f"{ADMIN}/operacion/integraciones"}
    if not configurado:
        return EstadoIntegracion(**base, estado="sin_configurar", resumen=faltante, detalle=None, ultima_vez=None)
    E = models.EntregaNotificacion
    desde = utc_ahora() - VENTANA_ENVIOS
    conteo = dict(db.execute(
        select(E.estado, func.count()).where(E.canal == canal, E.created_at >= desde).group_by(E.estado)
    ).all())
    enviados, fallidos = conteo.get("ENVIADA", 0), conteo.get("ERROR", 0)
    ultimo = db.scalars(
        select(E).where(E.canal == canal, E.estado.in_(("ENVIADA", "ERROR"))).order_by(E.created_at.desc()).limit(1)
    ).first()
    cuando = (ultimo.enviado_en or ultimo.created_at) if ultimo else None
    if ultimo is not None and ultimo.estado == "ERROR":
        return EstadoIntegracion(**base, estado="falla", ultima_vez=cuando, resumen="El último envío no salió.",
                                 detalle=(ultimo.error or "")[:240] or None)
    if fallidos:
        return EstadoIntegracion(**base, estado="aviso", ultima_vez=cuando,
                                 resumen=f"{_plural(fallidos, 'envío falló', 'envíos fallaron')} en los últimos 7 días.",
                                 detalle=f"{_plural(enviados, 'enviado', 'enviados')} sin problema.")
    if not enviados:
        return EstadoIntegracion(**base, estado="ok", ultima_vez=cuando, detalle=None,
                                 resumen="Configurado. No hubo envíos en los últimos 7 días.")
    return EstadoIntegracion(**base, estado="ok", ultima_vez=cuando, detalle=None,
                             resumen=f"{_plural(enviados, 'envío', 'envíos')} en los últimos 7 días, sin fallas.")


def correo(db: Session, ajustes: dict) -> EstadoIntegracion:
    return _envios(db, "EMAIL", "Correo", "correo", bool(ajustes["smtp_host"] and ajustes["smtp_from"]),
                   "Faltan los datos del servidor de correo.")


def whatsapp(db: Session, ajustes: dict) -> EstadoIntegracion:
    url, token = str(ajustes["whatsapp_api_url"] or ""), ajustes["whatsapp_token"]
    configurado = url.startswith(("https://", "http://")) and bool(token) and token != "TU_TOKEN_AQUI"
    return _envios(db, "WHATSAPP", "WhatsApp", "whatsapp", configurado, "Falta la dirección o el token del proveedor.")


def push(db: Session) -> EstadoIntegracion:
    base = {"clave": "push", "nombre": "Avisos en el navegador", "enlace": f"{ADMIN}/operacion/integraciones",
            "detalle": None, "ultima_vez": None}
    if not (os.getenv("WEB_PUSH_VAPID_PUBLIC_KEY", "").strip() and os.getenv("WEB_PUSH_VAPID_PRIVATE_KEY", "").strip()):
        return EstadoIntegracion(**base, estado="sin_configurar", resumen="Faltan las claves VAPID del servidor.")
    dispositivos = db.scalar(select(func.count()).select_from(models.ChatPushSubscription)) or 0
    return EstadoIntegracion(**base, estado="ok", resumen=f"{_plural(dispositivos, 'dispositivo recibe', 'dispositivos reciben')} avisos.")


def almacenamiento() -> EstadoIntegracion:
    base = {"clave": "almacenamiento", "nombre": "Almacenamiento de archivos", "enlace": f"{ADMIN}/almacenamiento",
            "detalle": None, "ultima_vez": None}
    variables = ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME")
    if not all(os.getenv(nombre, "").strip() for nombre in variables):
        return EstadoIntegracion(**base, estado="sin_configurar", resumen="Faltan los datos de acceso a Cloudflare R2.")
    return EstadoIntegracion(**base, estado="ok", resumen="Configurado en Cloudflare R2.")


def estado_integraciones(db: Session) -> list[EstadoIntegracion]:
    ajustes = get_integration_settings(db)
    return [rama_judicial(db), correo(db, ajustes), whatsapp(db, ajustes), push(db), almacenamiento()]
