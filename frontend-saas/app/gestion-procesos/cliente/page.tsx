"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ArrowRight, FolderOpen, MessageCircle, RefreshCw } from "lucide-react";

import { AvisoPagos } from "@/components/portal-cliente/AvisoPagos";
import {
  AlDia,
  EnQueVa,
  EntradaCliente,
  FilasCargando,
  PendientesCliente,
  ProximaFecha,
  TituloCliente,
} from "@/components/portal-cliente/piezas";
import { Button, EnlaceBoton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Sheet } from "@/components/ui/Sheet";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { fechaLarga } from "@/lib/fechas";
import {
  primerNombre,
  rutaMensajeAbogado,
  rutaProceso,
  saludo,
  type InicioCliente,
  type ResumenProcesoCliente,
} from "@/lib/portalCliente";
import { useLoadEffect } from "@/lib/useLoadEffect";
import { useNow } from "@/lib/useNow";

export default function InicioClientePage() {
  const [inicio, setInicio] = useState<InicioCliente | null>(null);
  const [cuentas, setCuentas] = useState<Esquemas["EstadoDeCuenta"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    // El estado de cuenta es opcional en el inicio: si falla, solo no se muestra el aviso de pagos.
    const [{ data, error: fallo }, pagos] = await Promise.all([api.GET("/api/v2/cliente/inicio"), api.GET("/api/v2/estado-cuenta")]);
    if (data) setInicio(data);
    else setError(mensajeDeError(fallo));
    setCuentas(pagos.data ?? null);
  }, []);
  useLoadEffect(cargar);

  const ahora = new Date(useNow());
  const variosProcesos = (inicio?.procesos.length ?? 0) > 1;
  return (
    <div>
      <TituloCliente sub={<span className="inline-block first-letter:uppercase" suppressHydrationWarning>{fechaLarga(ahora)}</span>}>
        <span suppressHydrationWarning>{saludo(ahora)}</span>{inicio?.nombre ? `, ${inicio.nombre}` : ""}
      </TituloCliente>

      {error && !inicio ? (
        <Sheet className="flex flex-col items-center gap-4 px-6 py-12 text-center">
          <p role="alert" className="text-bad">{error}</p>
          <Button variant="secondary" size="lg" icon={<RefreshCw aria-hidden="true" size={16} />} onClick={() => void cargar()}>
            Intentar de nuevo
          </Button>
        </Sheet>
      ) : !inicio ? (
        <div aria-busy="true" className="space-y-8">
          <Sheet><FilasCargando filas={2} /></Sheet>
          <Sheet><FilasCargando filas={3} /></Sheet>
        </div>
      ) : (
        <div className="space-y-8">
          {inicio.pendientes.length > 0 ? (
            <PendientesCliente pendientes={inicio.pendientes} conProceso={variosProcesos} />
          ) : inicio.procesos.length > 0 && !(cuentas && cuentas.totales.saldo > 0) ? (
            <AlDia />
          ) : null}

          <AvisoPagos estado={cuentas} />

          {inicio.procesos.length === 0 ? (
            <Sheet>
              <EmptyState
                icon={FolderOpen}
                title="Aún no tiene procesos activos"
                description="Cuando la firma abra su proceso, aquí verá en qué va y lo que necesitamos de usted."
              />
            </Sheet>
          ) : (
            inicio.procesos.map((proceso) => <TarjetaProceso key={proceso.id} proceso={proceso} />)
          )}

          {inicio.recientes.length > 0 && (
            <section aria-labelledby="lo-ultimo">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 id="lo-ultimo" className="font-display text-[22px] text-ink">
                  {variosProcesos ? "Lo último en sus procesos" : "Lo último en su proceso"}
                </h2>
                {!variosProcesos && (
                  <Link
                    href={rutaProceso(inicio.procesos[0].id, "historia")}
                    className="inline-flex min-h-11 items-center gap-1 text-[16px] font-semibold text-navy-ink hover:underline"
                  >
                    Ver toda la historia <ArrowRight aria-hidden="true" size={16} />
                  </Link>
                )}
              </div>
              <Sheet className="overflow-hidden">
                <ul className="divide-y divide-line">
                  {inicio.recientes.map((entrada) => (
                    <EntradaCliente
                      key={`${entrada.proceso.id}:${entrada.folio}`}
                      entrada={entrada}
                      proceso={variosProcesos ? entrada.proceso.nombre : undefined}
                    />
                  ))}
                </ul>
              </Sheet>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function TarjetaProceso({ proceso }: { proceso: ResumenProcesoCliente }) {
  return (
    <Sheet className="overflow-hidden" aria-labelledby={`proceso-${proceso.id}`}>
      <div className="border-b border-line px-5 py-5 sm:px-7">
        <h2 id={`proceso-${proceso.id}`} className="font-display text-[24px] leading-snug text-ink [text-wrap:balance]">{proceso.nombre}</h2>
        {proceso.descripcion && <p className="mt-2 max-w-[62ch] text-ink-2 [text-wrap:pretty]">{proceso.descripcion}</p>}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 px-5 py-6 sm:px-7 md:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          <p className="mb-4 text-[15px] font-semibold text-ink">En qué va</p>
          <EnQueVa proceso={proceso} />
        </div>
        <ProximaFecha fecha={proceso.proxima_fecha} />
      </div>
      <div className="flex flex-col gap-3 border-t border-line bg-sheet-2 px-5 py-4 sm:flex-row sm:flex-wrap sm:px-7">
        <EnlaceBoton size="lg" href={rutaProceso(proceso.id)} icon={<ArrowRight aria-hidden="true" size={18} />}>
          Ver todo el proceso
          {proceso.nuevos > 0 && (
            <span className="ml-1 rounded bg-gold-soft px-1.5 text-[13px] font-semibold text-gold-ink tabular-nums">
              {proceso.nuevos} {proceso.nuevos === 1 ? "nuevo" : "nuevos"}
            </span>
          )}
        </EnlaceBoton>
        <EnlaceBoton size="lg" variant="secondary" href={rutaMensajeAbogado(proceso)} icon={<MessageCircle aria-hidden="true" size={18} />}>
          Escribirle a {primerNombre(proceso.abogado.nombre)}
        </EnlaceBoton>
      </div>
    </Sheet>
  );
}
