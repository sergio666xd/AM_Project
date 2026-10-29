"use client";

import { useCallback, useEffect } from "react";

/**
 * Corre `accion` una vez con el valor de `?parametro=…` si la URL lo trae, y quita
 * el parámetro para que recargar la página no la repita (`/documentos?documento=12`
 * abre ese documento).
 *
 * `accion` debe ser estable (un `useCallback`).
 */
export function useValorDeUrl(parametro: string, accion: (valor: string) => void) {
  useEffect(() => {
    const url = new URL(window.location.href);
    const valor = url.searchParams.get(parametro);
    if (valor === null) return;
    url.searchParams.delete(parametro);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    accion(valor);
  }, [parametro, accion]);
}

/**
 * Corre `accion` una vez si la URL trae `?parametro=1`. Lo usan las acciones rápidas
 * de «Hoy» (`/tareas?nuevo=1` abre el formulario de tarea nueva).
 *
 * `accion` debe ser estable (un `useCallback`).
 */
export function useAccionDeUrl(parametro: string, accion: () => void) {
  useValorDeUrl(parametro, useCallback((valor: string) => { if (valor === "1") accion(); }, [accion]));
}

/** Corre `accion` con el ancla de la URL (`#solicitud-12` → "solicitud-12"), si la hay. `accion` debe ser estable. */
export function useAnclaDeUrl(accion: (ancla: string) => void) {
  useEffect(() => {
    const ancla = window.location.hash.slice(1);
    if (ancla) accion(ancla);
  }, [accion]);
}
