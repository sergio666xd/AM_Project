"""Sube la versión de la aplicación y anota el cambio en CHANGELOG.md.

Uso (desde la raíz del repositorio):

    python scripts/version.py patch -m "Arreglo del menú en celular"
    python scripts/version.py minor -m "Nueva sección de informes"
    python scripts/version.py major -m "Se retira la API v1"
    python scripts/version.py 2.5.0 -m "..."      # versión exacta
    python scripts/version.py --check             # solo comprueba que todo coincide

`VERSION` es la fuente; el script la copia a frontend-saas/package.json,
frontend-saas/package-lock.json y pyproject.toml.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ARCHIVO_VERSION = RAIZ / "VERSION"
PACKAGE_JSON = RAIZ / "frontend-saas" / "package.json"
PACKAGE_LOCK = RAIZ / "frontend-saas" / "package-lock.json"
PYPROJECT = RAIZ / "pyproject.toml"
CHANGELOG = RAIZ / "CHANGELOG.md"

SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")
VERSION_PYPROJECT = re.compile(r'^version = "[^"]*"$', re.MULTILINE)


def leer_version() -> str:
    version = ARCHIVO_VERSION.read_text(encoding="utf-8").strip()
    if not SEMVER.match(version):
        raise SystemExit(f"VERSION no es semver (X.Y.Z): {version!r}")
    return version


def siguiente(actual: str, parte: str) -> str:
    if SEMVER.match(parte):
        return parte
    mayor, menor, parche = (int(n) for n in SEMVER.match(actual).groups())
    if parte == "major":
        return f"{mayor + 1}.0.0"
    if parte == "minor":
        return f"{mayor}.{menor + 1}.0"
    if parte == "patch":
        return f"{mayor}.{menor}.{parche + 1}"
    raise SystemExit(f"Parte desconocida: {parte!r} (usa patch, minor, major o X.Y.Z)")


def versiones_copiadas() -> dict[str, str]:
    paquete = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))
    lock = json.loads(PACKAGE_LOCK.read_text(encoding="utf-8"))
    pyproject = VERSION_PYPROJECT.search(PYPROJECT.read_text(encoding="utf-8"))
    return {
        "frontend-saas/package.json": paquete.get("version", ""),
        "frontend-saas/package-lock.json": lock.get("version", ""),
        "frontend-saas/package-lock.json (packages)": lock.get("packages", {}).get("", {}).get("version", ""),
        "pyproject.toml": pyproject.group(0).split('"')[1] if pyproject else "",
    }


def escribir_json(ruta: Path, cambiar) -> None:
    datos = json.loads(ruta.read_text(encoding="utf-8"))
    cambiar(datos)
    ruta.write_text(json.dumps(datos, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def aplicar(version: str) -> None:
    ARCHIVO_VERSION.write_text(version + "\n", encoding="utf-8")
    escribir_json(PACKAGE_JSON, lambda d: d.__setitem__("version", version))

    def lock(d: dict) -> None:
        d["version"] = version
        d.setdefault("packages", {}).setdefault("", {})["version"] = version

    escribir_json(PACKAGE_LOCK, lock)
    texto = PYPROJECT.read_text(encoding="utf-8")
    PYPROJECT.write_text(VERSION_PYPROJECT.sub(f'version = "{version}"', texto, count=1), encoding="utf-8")


def anotar(version: str, notas: list[str]) -> None:
    texto = CHANGELOG.read_text(encoding="utf-8")
    hoy = dt.date.today().isoformat()
    entrada = f"## {version} · {hoy}\n\n" + "".join(f"- {nota}\n" for nota in notas) + "\n"
    marca = texto.find("\n## ")
    if marca == -1:
        texto = texto.rstrip("\n") + "\n\n" + entrada
    else:
        texto = texto[: marca + 1] + entrada + texto[marca + 1 :]
    CHANGELOG.write_text(texto, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("parte", nargs="?", help="patch, minor, major o una versión X.Y.Z")
    parser.add_argument("-m", "--nota", action="append", default=[], help="Línea para CHANGELOG.md (se puede repetir)")
    parser.add_argument("--check", action="store_true", help="Solo comprueba que las copias coinciden con VERSION")
    args = parser.parse_args()

    actual = leer_version()
    if args.check or not args.parte:
        distintas = {ruta: v for ruta, v in versiones_copiadas().items() if v != actual}
        for ruta, v in distintas.items():
            print(f"{ruta}: {v!r} no coincide con VERSION {actual!r}", file=sys.stderr)
        if distintas:
            print("Ejecuta 'python scripts/version.py <versión actual>' para sincronizar.", file=sys.stderr)
            return 1
        print(actual)
        return 0

    nueva = siguiente(actual, args.parte)
    aplicar(nueva)
    if args.nota:
        anotar(nueva, args.nota)
    print(f"{actual} → {nueva}")
    if not args.nota:
        print("Recuerda anotar el cambio en CHANGELOG.md.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
