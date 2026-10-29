"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { portalHrefForRole, USER_PORTAL_HOST } from "@/lib/portalHosts";

const nada = () => () => {};

/**
 * Enlace al portal de clientes. El portal vive en su propio dominio; en el
 * navegador se ajusta a pruebas y desarrollo local.
 */
export function EnlacePortal({ className, children }: { className?: string; children: ReactNode }) {
  const href = useSyncExternalStore(
    nada,
    () => portalHrefForRole("CLIENTE", "/login"),
    () => `https://${USER_PORTAL_HOST}/login`,
  );
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
