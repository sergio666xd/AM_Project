# Diseño: Expediente foliado

Sistema visual de la reconstrucción de la app (Fase 0, aprobado por Sergio el 27 de octubre de 2026).

- [`../PRODUCT.md`](../PRODUCT.md): quién usa la app, para qué y con qué restricciones de marca.
- [`../DESIGN.md`](../DESIGN.md): tokens, tipografía, componentes y reglas. Es la referencia para las fases 2 a 7.
- [`contrato-de-direccion.md`](contrato-de-direccion.md): la tesis visual elegida.
- [`prototipo/`](prototipo/): prototipo clicable en React + Tailwind con datos de ejemplo. Ningún nombre ni radicado es real.

## Ver el prototipo

Abre `prototipo/prototipo.html` en el navegador. El botón **Prototipo** (abajo a la derecha) cambia entre abogada, cliente y administración, y entre los estados con datos, cargando y vacío.

## Recompilar

```bash
cd diseno/prototipo
npm install
npm run build   # genera prototipo.html
```

Los componentes de `prototipo/src/ui.jsx` y los tokens de `prototipo/src/styles.css` son el punto de partida de la Fase 2 en `frontend-saas`.
