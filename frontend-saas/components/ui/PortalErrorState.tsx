"use client";

import Link from "next/link";
import { useId } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "./Button";

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
      <section className="w-full max-w-xl rounded-xl bg-sheet p-6 text-center shadow-sheet sm:p-8" aria-labelledby="portal-error-title">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-bad-soft text-bad">
          <AlertTriangle aria-hidden="true" className="size-6" />
        </span>
        <h1 id="portal-error-title" className="mt-4 font-display text-[24px] leading-tight text-ink">{title}</h1>
        <p className="mt-2 text-[14px] text-ink-3">Ocurrió un problema inesperado. Puedes intentar cargarla de nuevo o regresar al portal.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button variant="primary" onClick={reset} icon={<RefreshCw aria-hidden="true" className="size-4" />}>
            Intentar de nuevo
          </Button>
          <Link href={homeHref} className="inline-flex min-h-11 items-center rounded-lg bg-sheet px-3.5 text-[14px] font-semibold text-ink shadow-[0_0_0_1px_var(--line-strong)] hover:bg-sheet-2 sm:min-h-10">
            {homeLabel}
          </Link>
        </div>
        <p className="mt-5 text-[12px] text-ink-3">Referencia de diagnóstico: <code className="font-mono">{error.digest || diagnosticId}</code></p>
      </section>
    </main>
  );
}
