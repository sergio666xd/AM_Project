"use client";

import { PortalErrorState } from "@/components/ui/PortalErrorState";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PortalErrorState error={error} reset={reset} title="Ocurrió un error en la aplicación" homeHref="/" homeLabel="Volver al inicio" />;
}
