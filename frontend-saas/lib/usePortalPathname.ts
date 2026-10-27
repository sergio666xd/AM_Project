"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { useSession } from "@/context/SessionContext";
import { ADMIN_PORTAL_HOST, USER_PORTAL_HOST } from "@/lib/portalHosts";

const subscribe = () => () => {};
const getHostname = () => window.location.hostname.toLowerCase();
const getServerHostname = () => "";

function areaForRole(role: string | undefined) {
  if (role === "ABOGADO_ADMIN") return "abogado";
  if (role === "ABOGADO") return "dashboard";
  return "cliente";
}

/**
 * Ruta interna (/gestion-procesos/...) de la página actual.
 *
 * En los subdominios de producción la barra muestra rutas cortas (/alertas en
 * admin.*, /procesos en panel.*) que el proxy reescribe. Los menús comparan con
 * las rutas internas, así que aquí se traduce la ruta corta a la interna.
 */
export function usePortalPathname() {
  const pathname = usePathname() || "/";
  const hostname = useSyncExternalStore(subscribe, getHostname, getServerHostname);
  const { user } = useSession();
  if (pathname.startsWith("/gestion-procesos")) return pathname;

  const adminHost = hostname === ADMIN_PORTAL_HOST || hostname === "admin.localhost";
  const userHost = hostname === USER_PORTAL_HOST || hostname === "panel.localhost";
  if (!adminHost && !userHost) return pathname;

  const area = adminHost ? "admin" : areaForRole(user?.rol);
  const suffix = pathname === "/" ? "" : pathname.replace(/\/+$/, "");
  if (area === "cliente" && suffix === "/agenda") return "/gestion-procesos/cliente/calendario";
  return `/gestion-procesos/${area}${suffix}`;
}
