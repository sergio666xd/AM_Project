"use client";

import { PortalErrorState } from "@/components/ui/PortalErrorState";

export default function ClientError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PortalErrorState error={error} reset={reset} title="No pudimos cargar tu portal" homeHref="/gestion-procesos/cliente" homeLabel="Volver a mis procesos" />;
}
