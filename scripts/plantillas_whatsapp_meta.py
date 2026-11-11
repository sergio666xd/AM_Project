"""Plantillas de WhatsApp en Meta: verlas, crearlas para aprobación y probar un envío.

Usa las mismas variables de entorno que el backend (WHATSAPP_TOKEN,
WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_WABA_ID...). Nunca escribas el token en el
código ni en la línea de comandos: déjalo en el entorno o en tu `.env` local.

    python scripts/plantillas_whatsapp_meta.py               # muestra lo que se va a crear (no llama a Meta)
    python scripts/plantillas_whatsapp_meta.py --estado      # estado de aprobación de cada plantilla en Meta
    python scripts/plantillas_whatsapp_meta.py --crear       # crea en Meta las que falten (quedan en revisión)
    python scripts/plantillas_whatsapp_meta.py --probar 3001234567              # envía hello_world
    python scripts/plantillas_whatsapp_meta.py --probar 3001234567 --plantilla PRUEBA_INTEGRACION
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # pragma: no cover - dotenv es opcional para el script
    pass

import requests  # noqa: E402

from app.whatsapp import ErrorWhatsapp, cloud_config, descripcion_error_meta, enviar_plantilla_cloud, graph_url, numero_internacional  # noqa: E402
from app.whatsapp_plantillas import CATALOGO, definicion_meta  # noqa: E402


def _cabeceras(config: dict) -> dict:
    if not config["token"]:
        sys.exit("Falta WHATSAPP_TOKEN en el entorno.")
    return {"Authorization": f"Bearer {config['token']}"}


def _existentes(config: dict) -> dict[tuple[str, str], str]:
    """Estado de cada plantilla en Meta; si fue rechazada, con el motivo que da Meta."""
    if not config["waba_id"]:
        sys.exit("Falta WHATSAPP_WABA_ID en el entorno.")
    estados: dict[tuple[str, str], str] = {}
    url = graph_url(config, f"{config['waba_id']}/message_templates")
    params: dict | None = {"fields": "name,language,status,rejected_reason", "limit": 100}
    while url:
        respuesta = requests.get(url, headers=_cabeceras(config), params=params, timeout=15)
        if not respuesta.ok:
            sys.exit(descripcion_error_meta(respuesta))
        datos = respuesta.json()
        for plantilla in datos.get("data", []):
            motivo = plantilla.get("rejected_reason")
            estado_meta = plantilla["status"]
            if motivo and motivo != "NONE":
                estado_meta = f"{estado_meta} (motivo: {motivo})"
            estados[(plantilla["name"], plantilla["language"])] = estado_meta
        url, params = (datos.get("paging") or {}).get("next"), None
    return estados


def mostrar(config: dict) -> None:
    for plantilla in CATALOGO:
        print(json.dumps(definicion_meta(plantilla, config["idioma"]), ensure_ascii=False, indent=2))


def estado(config: dict) -> None:
    existentes = _existentes(config)
    for plantilla in CATALOGO:
        print(f"{plantilla.nombre:32} {existentes.get((plantilla.nombre, config['idioma']), 'NO CREADA')}")


def crear(config: dict) -> None:
    existentes = _existentes(config)
    for plantilla in CATALOGO:
        if (plantilla.nombre, config["idioma"]) in existentes:
            print(f"{plantilla.nombre:32} ya existe ({existentes[(plantilla.nombre, config['idioma'])]})")
            continue
        respuesta = requests.post(
            graph_url(config, f"{config['waba_id']}/message_templates"),
            headers=_cabeceras(config), json=definicion_meta(plantilla, config["idioma"]), timeout=15,
        )
        if respuesta.ok:
            print(f"{plantilla.nombre:32} creada: {respuesta.json().get('status', 'PENDING')}")
        else:
            print(f"{plantilla.nombre:32} ERROR {descripcion_error_meta(respuesta)} {respuesta.text[:300]}")


def probar(config: dict, numero: str, clave: str | None) -> None:
    if not config["phone_number_id"]:
        sys.exit("Falta WHATSAPP_PHONE_NUMBER_ID en el entorno.")
    if clave:
        try:
            print("Enviado:", enviar_plantilla_cloud(numero, clave, {"nombre": "Prueba"}, config))
        except ErrorWhatsapp as exc:
            sys.exit(str(exc))
        return
    # hello_world viene aprobada en toda cuenta nueva (en inglés).
    respuesta = requests.post(
        graph_url(config, f"{config['phone_number_id']}/messages"), headers=_cabeceras(config), timeout=15,
        json={"messaging_product": "whatsapp", "to": numero_internacional(numero), "type": "template",
              "template": {"name": "hello_world", "language": {"code": "en_US"}}},
    )
    print("Enviado:" if respuesta.ok else "ERROR", respuesta.json() if respuesta.ok else descripcion_error_meta(respuesta))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    grupo = parser.add_mutually_exclusive_group()
    grupo.add_argument("--estado", action="store_true", help="consulta el estado de aprobación en Meta")
    grupo.add_argument("--crear", action="store_true", help="crea en Meta las plantillas que falten")
    grupo.add_argument("--probar", metavar="NUMERO", help="envía un mensaje de prueba a este número")
    parser.add_argument("--plantilla", metavar="CLAVE", help="con --probar: clave del aviso (p. ej. PRUEBA_INTEGRACION)")
    args = parser.parse_args()
    config = cloud_config()
    if args.estado:
        estado(config)
    elif args.crear:
        crear(config)
    elif args.probar:
        probar(config, args.probar, args.plantilla)
    else:
        mostrar(config)


if __name__ == "__main__":
    main()
