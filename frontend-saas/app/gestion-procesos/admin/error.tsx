"use client";

import { PortalErrorState } from "@/components/ui/PortalErrorState";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PortalErrorState error={error} reset={reset} title="No pudimos cargar administración" homeHref="/" homeLabel="Volver al panel de administración" />;
}
