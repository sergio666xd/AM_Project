"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

const CLAVE = "theme";
const EVENTO = "themechange";

function suscribir(avisar: () => void) {
  window.addEventListener("storage", avisar);
  window.addEventListener(EVENTO, avisar);
  return () => {
    window.removeEventListener("storage", avisar);
    window.removeEventListener(EVENTO, avisar);
  };
}

function leer(): boolean {
  try {
    return localStorage.getItem(CLAVE) === "dark";
  } catch {
    return false;
  }
}

/**
 * Tema claro u oscuro elegido en la app (clase `.dark` en <html>). El script
 * de app/gestion-procesos/layout.tsx lo aplica antes de pintar para que no
 * parpadee; este hook lo mantiene sincronizado entre pestañas.
 */
export function useTema() {
  const oscuro = useSyncExternalStore(suscribir, leer, () => false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", oscuro);
  }, [oscuro]);

  const alternar = useCallback(() => {
    try {
      localStorage.setItem(CLAVE, leer() ? "light" : "dark");
    } catch {
      document.documentElement.classList.toggle("dark");
    }
    window.dispatchEvent(new Event(EVENTO));
  }, []);

  return { oscuro, alternar };
}
