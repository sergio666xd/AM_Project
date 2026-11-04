"use client";

import { useEffect } from "react";

import { useSession } from "@/context/SessionContext";

const ROLES = new Set(["CLIENTE", "ABOGADO_ADMIN", "ADMIN"]);
const CADA_MS = 30_000;
const CLAVE = "am:presencia-sesion";

function sesionDePestana(): string | null {
  try {
    let sesion = window.sessionStorage.getItem(CLAVE);
    if (!sesion) {
      sesion = crypto.randomUUID();
      window.sessionStorage.setItem(CLAVE, sesion);
    }
    return sesion;
  } catch {
    return null;
  }
}

/**
 * Le dice al servidor que el panel está abierto y a la vista, para no mandar
 * notificaciones del navegador de lo que la persona ya está viendo.
 */
export function PresenciaPanel() {
  const { user } = useSession();

  useEffect(() => {
    if (!user || !ROLES.has(user.rol)) return;
    const sesion = sesionDePestana();
    if (!sesion) return;

    let cerrada = false;
    // fetch directo con keepalive: el cierre debe salir aunque la pestaña se esté yendo.
    const enviar = (ruta: "presencia" | "presencia/cierre", keepalive = false) =>
      fetch(`/api/v2/push/${ruta}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-AM-Solicitud": "1" },
        body: JSON.stringify({ sesion }),
        keepalive,
      }).catch(() => undefined);

    const latido = () => {
      if (!cerrada && document.visibilityState === "visible") void enviar("presencia");
    };
    const reanudar = () => {
      cerrada = false;
      latido();
    };
    const cerrar = () => {
      if (cerrada) return;
      cerrada = true;
      void enviar("presencia/cierre", true);
    };
    const visibilidad = () => (document.visibilityState === "visible" ? reanudar() : cerrar());

    latido();
    const intervalo = window.setInterval(latido, CADA_MS);
    document.addEventListener("visibilitychange", visibilidad);
    window.addEventListener("pagehide", cerrar);
    window.addEventListener("pageshow", reanudar);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", visibilidad);
      window.removeEventListener("pagehide", cerrar);
      window.removeEventListener("pageshow", reanudar);
      cerrar();
    };
  }, [user]);

  return null;
}
