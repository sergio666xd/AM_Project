# Reglas del repositorio

## Versión de la app

Todo PR que cambie la aplicación (backend, frontend, plantillas o migraciones) sube la versión antes de pedir revisión:

```
python scripts/version.py patch|minor|major -m "Nota corta del cambio"
```

- **patch**: arreglos y ajustes pequeños.
- **minor**: funciones nuevas.
- **major**: cambios que rompen algo (se retira una API o cambia un flujo completo).

El script actualiza `VERSION`, `frontend-saas/package.json`, `frontend-saas/package-lock.json` y `pyproject.toml`, y añade la entrada en `CHANGELOG.md`; revisa que la nota quede clara. Los PR que solo tocan documentación, CI o herramientas no suben la versión. Si al fusionar `main` hay conflicto en esos archivos, quédate con la versión mayor y vuelve a subirla con el script. `pytest tests/test_version.py` comprueba que todo coincida. Al fusionar, `.github/workflows/release.yml` crea la etiqueta `vX.Y.Z` y la release de GitHub con la sección del changelog, así que no hace falta crearlas a mano.
