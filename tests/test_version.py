"""La versión de la aplicación es una sola: VERSION y sus copias coinciden."""

import re
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


def test_version_es_semver_y_las_copias_coinciden():
    version = (RAIZ / "VERSION").read_text(encoding="utf-8").strip()
    assert re.fullmatch(r"\d+\.\d+\.\d+", version)
    resultado = subprocess.run(
        [sys.executable, str(RAIZ / "scripts" / "version.py"), "--check"],
        capture_output=True,
        text=True,
    )
    assert resultado.returncode == 0, resultado.stderr


def test_changelog_tiene_la_version_actual():
    version = (RAIZ / "VERSION").read_text(encoding="utf-8").strip()
    assert f"## {version} " in (RAIZ / "CHANGELOG.md").read_text(encoding="utf-8")
