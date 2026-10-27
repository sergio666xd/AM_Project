"use client";

import { useEffect, useState } from "react";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Mantiene montado un elemento mientras se reproduce su animación de salida.
 * `closing` indica que ya se pidió cerrar y debe aplicarse la clase de salida;
 * pasado `exitMs` (o de inmediato con movimiento reducido) se desmonta.
 */
export function usePresence(open: boolean, exitMs = 160) {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (open || !mounted) return;
    const timer = window.setTimeout(() => setMounted(false), prefersReducedMotion() ? 0 : exitMs);
    return () => window.clearTimeout(timer);
  }, [exitMs, mounted, open]);

  return { mounted: open || mounted, closing: !open && mounted };
}
