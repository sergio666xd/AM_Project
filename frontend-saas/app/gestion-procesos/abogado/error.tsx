"use client";

import { PortalErrorState } from "@/components/ui/PortalErrorState";

export default function LawyerError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PortalErrorState error={error} reset={reset} title="No pudimos cargar el panel del despacho" homeHref="/gestion-procesos/abogado" homeLabel="Volver al despacho" />;
}
