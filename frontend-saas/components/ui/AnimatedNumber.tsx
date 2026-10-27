"use client";

import { useLayoutEffect, useRef } from "react";

const formatter = new Intl.NumberFormat("es-CO");

/**
 * Número que cuenta hasta su valor al aparecer y al cambiar. Escribe en el DOM
 * directamente para no volver a renderizar en cada cuadro; con movimiento
 * reducido muestra el valor final sin animar.
 */
export function AnimatedNumber({ value, duration = 600 }: { value: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef(0);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const from = previous.current;
    previous.current = value;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || from === value || !Number.isFinite(value)) {
      node.textContent = formatter.format(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      node.textContent = formatter.format(Math.round(from + (value - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    node.textContent = formatter.format(from);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      node.textContent = formatter.format(value);
    };
  }, [duration, value]);

  return <span ref={ref}>{formatter.format(value)}</span>;
}
