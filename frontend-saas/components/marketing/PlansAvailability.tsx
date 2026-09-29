"use client";

import { useEffect, useState } from "react";
import { InterestForm } from "./InterestForm";

type Plan = {
  id: number; nombre: string; limite_radicados: number; precio_mensual: number;
  limite_ultimas_actuaciones: number | null;
  notificaciones_whatsapp_procesos: boolean; notificaciones_whatsapp_tareas: boolean;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function PlansAvailability() {
  const [mostrarPlanes, setMostrarPlanes] = useState(false);
  const [planes, setPlanes] = useState<Plan[]>([]);

  useEffect(() => {
    async function cargarOferta() {
      try {
        const configuracion = await fetch(`${API_URL}/api/configuracion-publica`).then((response) => response.json());
        if (!configuracion.mostrar_planes) return;
        const disponibles = await fetch(`${API_URL}/api/planes-publicos`).then((response) => response.ok ? response.json() : []);
        setMostrarPlanes(true); setPlanes(disponibles);
      } catch { /* Si la API no responde se conserva la lista de espera. */ }
    }
    cargarOferta();
  }, []);

  if (!mostrarPlanes) return <InterestForm />;

  return <div id="planes" className="mt-8 grid gap-4 sm:grid-cols-2">
    {planes.map((plan) => <article key={plan.id} className="rounded-2xl border border-[#ccb56b]/60 bg-white/10 p-5">
      <h2 className="text-xl font-semibold">{plan.nombre}</h2>
      <p className="mt-1 text-sm text-white/80">{plan.precio_mensual === 0 ? "Gratis" : `$${plan.precio_mensual.toLocaleString("es-CO")} / mes`}</p>
      <ul className="mt-4 space-y-1 text-sm text-white/85">
        <li>{plan.limite_radicados} procesos</li>
        <li>{plan.limite_ultimas_actuaciones === null ? "Todas las actuaciones" : `${plan.limite_ultimas_actuaciones} últimas actuaciones`}</li>
        <li>WhatsApp procesos: {plan.notificaciones_whatsapp_procesos ? "incluido" : "no incluido"}</li>
        <li>WhatsApp tareas: {plan.notificaciones_whatsapp_tareas ? "incluido" : "no incluido"}</li>
      </ul>
      <a href={`/gestion-procesos/auth/registro?plan_id=${plan.id}`} className="mt-5 inline-block font-semibold underline decoration-[#ccb56b] decoration-2 underline-offset-4">Elegir este plan →</a>
    </article>)}
  </div>;
}
