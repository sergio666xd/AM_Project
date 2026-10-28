"""Exporta el contrato OpenAPI de la API v2 para generar los tipos del frontend.

Uso (desde la raíz del repositorio):

    python scripts/exportar_openapi.py
    cd frontend-saas && npm run api:tipos

Solo incluye las rutas `/api/v2` y los esquemas que usan. CI falla si el
archivo committeado no coincide con el que genera el código.
"""

import json
import os
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
DESTINO = RAIZ / "frontend-saas" / "lib" / "api-v2" / "openapi.json"

sys.path.insert(0, str(RAIZ))
# Importar la app no abre conexiones, pero app.security exige una clave.
os.environ.setdefault("JWT_SECRET_KEY", "solo-para-exportar-el-contrato")


def _referencias(nodo, encontradas: set[str]) -> None:
    if isinstance(nodo, dict):
        ref = nodo.get("$ref")
        if isinstance(ref, str) and ref.startswith("#/components/schemas/"):
            encontradas.add(ref.rsplit("/", 1)[-1])
        for valor in nodo.values():
            _referencias(valor, encontradas)
    elif isinstance(nodo, list):
        for valor in nodo:
            _referencias(valor, encontradas)


def contrato_v2() -> dict:
    from app.main import _fastapi_app
    from app.nucleo.errores import PREFIJO_V2

    completo = _fastapi_app.openapi()
    rutas = {ruta: datos for ruta, datos in completo["paths"].items() if ruta.startswith(PREFIJO_V2)}
    esquemas = completo.get("components", {}).get("schemas", {})

    usados: set[str] = set()
    _referencias(rutas, usados)
    pendientes = list(usados)
    while pendientes:
        nombre = pendientes.pop()
        nuevos: set[str] = set()
        _referencias(esquemas.get(nombre, {}), nuevos)
        for extra in nuevos - usados:
            usados.add(extra)
            pendientes.append(extra)

    return {
        "openapi": completo["openapi"],
        "info": {**completo["info"], "title": f"{completo['info']['title']} · API v2"},
        "paths": rutas,
        "components": {"schemas": {nombre: esquemas[nombre] for nombre in sorted(usados)}},
    }


def main() -> None:
    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    DESTINO.write_text(json.dumps(contrato_v2(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Contrato escrito en {DESTINO.relative_to(RAIZ)}")


if __name__ == "__main__":
    main()
