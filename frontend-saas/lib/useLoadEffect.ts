"use client";

import { useEffect } from "react";

/**
 * Ejecuta `load` al montar el componente y cada vez que cambia su identidad,
 * es decir, cuando cambian las dependencias del `useCallback` que lo define.
 *
 * Es el patrón de carga de los paneles: `load` pide datos a la API y guarda el
 * resultado en el estado tras cada `await`. La regla react-hooks/set-state-in-effect
 * no distingue ese setState asíncrono de uno síncrono cuando la función se define
 * fuera del efecto, así que el patrón vive aquí en lugar de repetirse en cada página.
 */
export function useLoadEffect(load: () => unknown) {
  useEffect(() => {
    void load();
  }, [load]);
}
