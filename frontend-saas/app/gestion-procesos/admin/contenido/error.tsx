"use client";

import { useEffect } from "react";

export default function ContenidoPublicoError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Error al renderizar el administrador de contenido público:", error);
  }, [error]);

  return (
    <main className="motion-swap mx-auto max-w-3xl space-y-4 px-6 py-12">
      <h1 className="text-2xl font-semibold text-foreground">No se pudo mostrar Contenido público</h1>
      <p className="text-sm text-foreground-secondary">
        La página detectó un error al renderizarse. Intenta cargarla de nuevo; el código de diagnóstico ayuda a encontrar la causa.
      </p>
      {error.digest && <p className="rounded border border-border p-3 font-mono text-xs">Diagnóstico: {error.digest}</p>}
      <button type="button" onClick={() => reset()} className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">
        Reintentar
      </button>
    </main>
  );
}
