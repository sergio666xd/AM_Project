"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useSession } from "@/context/SessionContext";
import { api } from "@/lib/api-v2/cliente";
import { activarNotificaciones, estadoDelNavegador, suscribirEsteNavegador } from "@/lib/push";

const TEXTOS = {
  usted: {
    titulo: "¿Le avisamos en este dispositivo?",
    cuerpo: "Le mostraremos un aviso cuando le escriban o haya novedades en sus procesos, aunque no tenga el portal abierto.",
    bloqueado: "El navegador tiene bloqueados los avisos de este sitio. Puede permitirlos desde la configuración del navegador.",
    fallo: "No pudimos activar los avisos en este dispositivo. Puede intentarlo más tarde desde su perfil.",
  },
  tu: {
    titulo: "¿Te avisamos en este dispositivo?",
    cuerpo: "Verás un aviso cuando te escriban o lleguen actuaciones nuevas, aunque no tengas el panel abierto.",
    bloqueado: "El navegador tiene bloqueados los avisos de este sitio. Puedes permitirlos desde la configuración del navegador.",
    fallo: "No pudimos activar los avisos en este dispositivo. Puedes intentarlo más tarde desde Configuración.",
  },
} as const;

function claveDescarte(usuarioId: number) {
  return `am:avisos-push-descartado:${usuarioId}`;
}

function descartado(usuarioId: number): boolean {
  try {
    return window.sessionStorage.getItem(claveDescarte(usuarioId)) === "1";
  } catch {
    return false;
  }
}

/**
 * Ofrece una vez por sesión activar las notificaciones del navegador y, si ya
 * están permitidas, mantiene al día la suscripción de este dispositivo.
 */
export function AvisoNotificaciones() {
  const { user } = useSession();
  const [abierto, setAbierto] = useState(false);
  const [activando, setActivando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textos = user?.rol === "ABOGADO_ADMIN" ? TEXTOS.tu : TEXTOS.usted;

  useEffect(() => {
    if (!user) return;
    const estado = estadoDelNavegador();
    if (estado === "granted") {
      suscribirEsteNavegador().catch(() => undefined);
      return;
    }
    if (estado !== "default" || descartado(user.id)) return;
    let vigente = true;
    // Solo se ofrece si el servidor puede enviar notificaciones.
    void api.GET("/api/v2/push/clave-publica").then(({ data }) => {
      if (vigente && data) setAbierto(true);
    });
    return () => { vigente = false; };
  }, [user]);

  function cerrar() {
    if (user) {
      try {
        window.sessionStorage.setItem(claveDescarte(user.id), "1");
      } catch {
        // Sin almacenamiento de sesión se vuelve a ofrecer en la próxima carga.
      }
    }
    setAbierto(false);
  }

  async function activar() {
    setActivando(true);
    setError(null);
    try {
      const permiso = await activarNotificaciones();
      if (permiso === "granted") setAbierto(false);
      else if (permiso === "denied") setError(textos.bloqueado);
      else cerrar();
    } catch {
      setError(textos.fallo);
    } finally {
      setActivando(false);
    }
  }

  return (
    <Modal open={abierto} onClose={cerrar} title={textos.titulo} size="sm">
      <div className="flex gap-4">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-manila text-navy-ink">
          <BellRing size={20} />
        </span>
        <p className="text-pretty text-[15px] leading-relaxed text-ink-2">{textos.cuerpo}</p>
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg bg-bad-soft px-3.5 py-2.5 text-[14px] text-bad">{error}</p>}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={cerrar}>Ahora no</Button>
        <Button icon={<BellRing size={16} />} loading={activando} onClick={() => void activar()}>Activar avisos</Button>
      </div>
    </Modal>
  );
}
