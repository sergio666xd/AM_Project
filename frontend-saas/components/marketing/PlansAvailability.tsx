"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { InterestForm } from "./InterestForm";
import { API_URL } from "@/lib/api";

type Plan = {
  id: number;
  nombre: string;
  limite_radicados: number;
  precio_mensual: number;
  limite_ultimas_actuaciones: number | null;
  notificaciones_whatsapp_procesos: boolean;
  notificaciones_whatsapp_tareas: boolean;
};

type OfferState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "prelaunch" }
  | { status: "launched"; plans: Plan[] };

function isPlan(value: unknown): value is Plan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Record<string, unknown>;
  return typeof plan.id === "number"
    && typeof plan.nombre === "string"
    && typeof plan.limite_radicados === "number"
    && typeof plan.precio_mensual === "number"
    && (typeof plan.limite_ultimas_actuaciones === "number" || plan.limite_ultimas_actuaciones === null)
    && typeof plan.notificaciones_whatsapp_procesos === "boolean"
    && typeof plan.notificaciones_whatsapp_tareas === "boolean";
}

export function PlansAvailability() {
  const [offer, setOffer] = useState<OfferState>({ status: "loading" });

  const loadOffer = useCallback(async () => {
    setOffer({ status: "loading" });
    try {
      const configResponse = await fetch(`${API_URL}/api/configuracion-publica`, { cache: "no-store" });
      if (!configResponse.ok) throw new Error("No fue posible consultar el estado del servicio.");
      const configuration = await configResponse.json() as { mostrar_planes?: boolean };
      if (configuration.mostrar_planes !== true) {
        setOffer({ status: "prelaunch" });
        return;
      }

      const plansResponse = await fetch(`${API_URL}/api/planes-publicos`, { cache: "no-store" });
      if (!plansResponse.ok) throw new Error("Los planes no están disponibles en este momento.");
      const plans: unknown = await plansResponse.json();
      if (!Array.isArray(plans) || !plans.every(isPlan)) throw new Error("La respuesta de planes no tiene el formato esperado.");
      setOffer({ status: "launched", plans });
    } catch (cause) {
      setOffer({ status: "error", message: cause instanceof Error ? cause.message : "No se pudo cargar la oferta SaaS." });
    }
  }, []);

  useEffect(() => { void loadOffer(); }, [loadOffer]);

  if (offer.status === "loading") {
    return <p role="status" aria-live="polite" className="mt-6 text-sm text-white/80">Consultando disponibilidad del servicio…</p>;
  }

  if (offer.status === "error") {
    return <div className="mt-6 space-y-4" role="alert">
      <p className="text-sm text-white">{offer.message}</p>
      <button type="button" onClick={() => void loadOffer()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/70 px-4 py-2 text-sm font-semibold !text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#002060]">
        <RefreshCw className="size-4" aria-hidden="true" />Reintentar
      </button>
    </div>;
  }

  if (offer.status === "prelaunch") {
    return <>
      <h2 className="text-xl font-semibold">Próximamente</h2>
      <p className="mt-2 text-sm leading-6 text-white/85">Estamos preparando los planes y herramientas SaaS para abogados. Déjanos tu correo para recibir novedades de este producto.</p>
      <InterestForm />
    </>;
  }

  if (offer.plans.length === 0) {
    return <>
      <h2 className="text-xl font-semibold">Planes en actualización</h2>
      <p className="mt-2 text-sm leading-6 text-white/85">El servicio está activo, pero no hay planes disponibles para contratar en este momento.</p>
      <Link href="/contacto" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-[#ccb56b] px-4 py-2 text-sm font-bold text-[#002060] hover:bg-[#dcc982] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#002060]">Consultar disponibilidad</Link>
    </>;
  }

  return <>
    <h2 className="text-xl font-semibold">Planes disponibles</h2>
    <p className="mt-2 text-sm leading-6 text-white/85">Elige el plan SaaS según el volumen y las herramientas que necesita tu práctica.</p>
    <div id="planes" className="mt-6 grid gap-4 sm:grid-cols-2">
      {offer.plans.map((plan) => (
        <article key={plan.id} className="flex flex-col rounded-2xl border border-[#ccb56b]/70 bg-white/10 p-5">
          <h3 className="text-xl font-semibold">{plan.nombre}</h3>
          <p className="mt-1 text-sm text-white/85">{plan.precio_mensual === 0 ? "Gratis" : `$${plan.precio_mensual.toLocaleString("es-CO")} / mes`}</p>
          <ul className="mt-4 flex-1 space-y-2 text-sm leading-6 text-white/90">
            <li>Hasta {plan.limite_radicados} procesos</li>
            <li>{plan.limite_ultimas_actuaciones === null ? "Todas las actuaciones disponibles" : `Consulta de las ${plan.limite_ultimas_actuaciones} últimas actuaciones`}</li>
            <li>Notificaciones por WhatsApp para procesos: {plan.notificaciones_whatsapp_procesos ? "incluidas" : "no incluidas"}</li>
            <li>Notificaciones por WhatsApp para tareas: {plan.notificaciones_whatsapp_tareas ? "incluidas" : "no incluidas"}</li>
          </ul>
          <Link href={`/gestion-procesos/auth/registro?plan_id=${plan.id}`} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-[#ccb56b] px-4 py-2 text-center font-bold text-[#002060] hover:bg-[#dcc982] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#002060]">Elegir este plan</Link>
        </article>
      ))}
    </div>
  </>;
}
