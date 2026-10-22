"use client";

import { useEffect, useState } from "react";

/**
 * Hora actual que se refresca periódicamente. Evita llamar a `Date.now()`
 * durante el render, para que vencimientos y tiempos relativos sean estables
 * entre renders y se actualicen solos.
 */
export function useNow(refreshMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), refreshMs);
    return () => window.clearInterval(timer);
  }, [refreshMs]);
  return now;
}
