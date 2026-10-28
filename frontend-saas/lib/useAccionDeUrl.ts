"use client";

import { useEffect } from "react";

/**
 * Corre `accion` una vez si la URL trae `?parametro=1` y quita el parámetro, para que
 * recargar la página no la repita. Lo usan las acciones rápidas de «Hoy»
 * (`/tareas?nuevo=1` abre el formulario de tarea nueva).
 *
 * `accion` debe ser estable (un `useCallback`).
 */
export function useAccionDeUrl(parametro: string, accion: () => void) {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get(parametro) !== "1") return;
    url.searchParams.delete(parametro);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    accion();
  }, [parametro, accion]);
}
