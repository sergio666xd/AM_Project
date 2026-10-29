"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

import { AlDia, FilasCargando, TituloCliente } from "@/components/portal-cliente/piezas";
import { HechosRecientes, TarjetaPendiente } from "@/components/portal-cliente/pendientes";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { api, mensajeDeError } from "@/lib/api-v2/cliente";
import { anclaPendiente, cuantasCosas, type PendientesCliente } from "@/lib/portalCliente";
import { useLoadEffect } from "@/lib/useLoadEffect";

export default function PendientesClientePage() {
  const [datos, setDatos] = useState<PendientesCliente | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ancla, setAncla] = useState<string | null>(null);
  const primeraCarga = useRef(true);

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/cliente/pendientes");
    if (!data) {
      setError(mensajeDeError(fallo));
      return;
    }
    setDatos(data);
    // Un aviso o el inicio traen el ancla de una tarjeta: se lleva hasta ella y se resalta un momento.
    const id = window.location.hash.slice(1);
    if (primeraCarga.current && data.pendientes.some((p) => anclaPendiente(p.clave) === id)) setAncla(id);
    primeraCarga.current = false;
  }, []);
  useLoadEffect(cargar);

  useEffect(() => {
    if (!ancla) return;
    document.getElementById(ancla)?.scrollIntoView({ block: "start" });
    const temporizador = window.setTimeout(() => setAncla(null), 2400);
    return () => window.clearTimeout(temporizador);
  }, [ancla]);

  const procesos = new Set([...(datos?.pendientes ?? []), ...(datos?.recientes ?? [])].map((p) => p.proceso.id));
  const conProceso = procesos.size > 1;
  const cuantos = datos?.pendientes.length ?? 0;

  return (
    <div>
      <TituloCliente
        sub={datos && cuantos > 0 ? `Necesitamos ${cuantasCosas(cuantos)} de usted para avanzar.` : "Lo que necesitamos de usted para avanzar en su proceso."}
      >
        Pendientes
      </TituloCliente>

      {error && !datos ? (
        <Sheet className="flex flex-col items-center gap-4 px-6 py-12 text-center">
          <p role="alert" className="text-bad">{error}</p>
          <Button variant="secondary" size="lg" icon={<RefreshCw aria-hidden="true" size={16} />} onClick={() => void cargar()}>
            Intentar de nuevo
          </Button>
        </Sheet>
      ) : !datos ? (
        <div aria-busy="true" className="space-y-4">
          <Sheet><FilasCargando filas={2} /></Sheet>
          <Sheet><FilasCargando filas={2} /></Sheet>
        </div>
      ) : (
        <div className="space-y-10">
          {datos.pendientes.length > 0 ? (
            <ul className="space-y-4">
              {datos.pendientes.map((pendiente) => (
                <TarjetaPendiente
                  key={pendiente.clave}
                  pendiente={pendiente}
                  conProceso={conProceso}
                  resaltado={ancla === anclaPendiente(pendiente.clave)}
                  onCambio={() => void cargar()}
                />
              ))}
            </ul>
          ) : (
            <AlDia />
          )}
          {datos.recientes.length > 0 && <HechosRecientes hechos={datos.recientes} conProceso={conProceso} />}
        </div>
      )}
    </div>
  );
}
