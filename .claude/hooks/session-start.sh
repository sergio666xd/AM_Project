#!/bin/bash
# Instala graphify y construye el grafo en sesiones de Claude Code en la nube.
set -euo pipefail

# Solo en la nube; en local graphify ya está instalado.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"
export PATH="$HOME/.local/bin:$PATH"

if ! command -v graphify >/dev/null 2>&1; then
  if command -v uv >/dev/null 2>&1; then
    uv tool install 'graphifyy[sql,pdf]' >&2
  else
    python3 -m pip install --user 'graphifyy[sql,pdf]' >&2
  fi
fi

# Deja graphify en el PATH del resto de la sesión.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PATH=\"$HOME/.local/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

# graphify-out/ está en .gitignore, así que hay que construir el grafo (solo AST, sin API).
graphify update . >&2
