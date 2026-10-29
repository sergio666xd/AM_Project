"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { CalendarDays, ChevronRight, FolderOpen, RefreshCw } from "lucide-react";

import { FilasCargando, TituloCliente } from "@/components/portal-cliente/piezas";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Etapas } from "@/components/ui/Etapas";
import { Sheet } from "@/components/ui/Sheet";
import { api, mensajeDeError } from "@/lib/api-v2/cliente";
import { indiceEtapa } from "@/lib/etapas";
import { fechaLarga, horaDe } from "@/lib/fechas";
import { rutaProceso, type ResumenProcesoCliente } from "@/lib/portalCliente";
import { useLoadEffect } from "@/lib/useLoadEffect";

export default function ProcesosClientePage() {
  const [procesos, setProcesos] = useState<ResumenProcesoCliente[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/cliente/inicio");
    if (data) setProcesos(data.procesos);
    else setError(mensajeDeError(fallo));
  }, []);
  useLoadEffect(cargar);

  return (
    <div>
      <TituloCliente sub="Sus procesos activos con la firma.">Mis procesos</TituloCliente>
      <Sheet className="overflow-hidden">
        {error && !procesos ? (
          <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
            <p role="alert" className="text-bad">{error}</p>
            <Button variant="secondary" size="lg" icon={<RefreshCw aria-hidden="true" size={16} />} onClick={() => void cargar()}>Intentar de nuevo</Button>
          </div>
        ) : !procesos ? (
          <div aria-busy="true"><FilasCargando filas={3} /></div>
        ) : procesos.length === 0 ? (
          <EmptyState icon={FolderOpen} title="Aún no tiene procesos activos" description="Cuando la firma abra su proceso, aparecerá aquí." />
        ) : (
          <ul className="divide-y divide-line">
            {procesos.map((proceso) => {
              const indice = indiceEtapa(proceso.etapas, proceso.etapa);
              return (
                <li key={proceso.id}>
                  <Link href={rutaProceso(proceso.id)} className="group flex items-center gap-4 px-5 py-5 transition-colors hover:bg-sheet-2 sm:px-7">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-display text-[21px] leading-snug text-ink">
                        {proceso.nombre}
                        {proceso.nuevos > 0 && (
                          <span className="rounded bg-gold-soft px-1.5 font-sans text-[13px] font-semibold text-gold-ink tabular-nums">
                            {proceso.nuevos} {proceso.nuevos === 1 ? "nuevo" : "nuevos"}
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-[15px] text-ink-2">
                        {proceso.etapa ? `Etapa de ${proceso.etapa.nombre.toLowerCase()}` : "Etapa sin marcar"} · Lleva su caso {proceso.abogado.nombre}
                      </p>
                      {indice >= 0 && <Etapas etapas={proceso.etapas.map((e) => e.nombre)} actual={indice} compacta className="mt-3 max-w-sm" />}
                      {proceso.proxima_fecha && (
                        <p className="mt-3 flex items-start gap-2 text-[15px] text-ink-2">
                          <CalendarDays aria-hidden="true" size={16} strokeWidth={1.75} className="mt-1 shrink-0" />
                          <span>
                            <span className="inline-block first-letter:uppercase">{fechaLarga(proceso.proxima_fecha.inicio)}</span>, {horaDe(proceso.proxima_fecha.inicio)}
                            <span className="text-ink-3"> · {proceso.proxima_fecha.titulo}</span>
                          </span>
                        </p>
                      )}
                    </div>
                    <ChevronRight aria-hidden="true" size={22} className="shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>
    </div>
  );
}
