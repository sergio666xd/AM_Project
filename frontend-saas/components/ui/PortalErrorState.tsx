"use client";

import Link from "next/link";
import { useId } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export function PortalErrorState({
  error,
  reset,
  title = "No pudimos cargar esta página",
  homeHref = "/",
  homeLabel = "Ir al inicio del portal",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  homeHref?: string;
  homeLabel?: string;
}) {
  const reactId = useId();
  const diagnosticId = `ERR-${reactId.replaceAll(":", "")}`;

  return (
    <main className="grid min-h-[60vh] place-items-center px-5 py-12">
      <section className="w-full max-w-xl rounded-2xl border border-border bg-surface p-6 text-center shadow-sm sm:p-8" aria-labelledby="portal-error-title">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-danger/10 text-danger">
          <AlertTriangle aria-hidden="true" className="size-6" />
        </span>
        <h1 id="portal-error-title" className="mt-4 text-xl font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-foreground-muted">Ocurrió un problema inesperado. Puedes intentar cargarla de nuevo o regresar al portal.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold !text-white hover:opacity-90">
            <RefreshCw aria-hidden="true" className="size-4" /> Intentar de nuevo
          </button>
          <Link href={homeHref} className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-surface-hover">{homeLabel}</Link>
        </div>
        <p className="mt-5 text-xs text-foreground-muted">Referencia de diagnóstico: <code>{error.digest || diagnosticId}</code></p>
      </section>
    </main>
  );
}
