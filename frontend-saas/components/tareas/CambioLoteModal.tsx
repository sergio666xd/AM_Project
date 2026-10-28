"use client";

import { useId, useState, type FormEvent } from "react";

import { CampoFechaLimite, SelectorPrioridad } from "@/components/tareas/CamposTarea";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { PrioridadTarea, Tarea } from "@/lib/tareas";

export type CambioLote = { fecha_limite: string | null } | { prioridad: PrioridadTarea };

/** Reprogramar o cambiar la prioridad de varias tareas a la vez. */
export function CambioLoteModal({
  tipo,
  tareas,
  onClose,
  onAplicar,
}: {
  tipo: "fecha" | "prioridad" | null;
  tareas: Tarea[];
  onClose: () => void;
  onAplicar: (cambio: CambioLote) => Promise<string | null>;
}) {
  const id = useId();
  const [fecha, setFecha] = useState("");
  const [prioridad, setPrioridad] = useState<PrioridadTarea>("ALTA");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const cuantas = tareas.length === 1 ? "1 tarea" : `${tareas.length} tareas`;

  function cerrar() {
    setFecha("");
    setError(null);
    onClose();
  }

  async function aplicar(evento: FormEvent, cambio?: CambioLote) {
    evento.preventDefault();
    setGuardando(true);
    const fallo = await onAplicar(cambio ?? (tipo === "fecha" ? { fecha_limite: fecha || null } : { prioridad }));
    setGuardando(false);
    if (fallo) setError(fallo);
    else cerrar();
  }

  return (
    <Modal
      open={tipo !== null}
      onClose={cerrar}
      size="sm"
      title={tipo === "fecha" ? `Reprogramar ${cuantas}` : `Cambiar la prioridad de ${cuantas}`}
      description={tipo === "fecha" ? "Todas quedan con la misma fecha límite y sus recordatorios se mueven con ella." : undefined}
    >
      <form onSubmit={aplicar} noValidate>
        {tipo === "fecha" ? (
          <CampoFechaLimite id={`${id}-fecha`} opcional={false} fecha={fecha} onFecha={(f) => setFecha(f)} />
        ) : (
          <SelectorPrioridad nombre={`${id}-prioridad`} valor={prioridad} onCambio={setPrioridad} />
        )}
        {error && <p role="alert" className="mt-3 text-[13px] text-bad">{error}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          {tipo === "fecha" && (
            <Button type="button" variant="ghost" className="sm:mr-auto" onClick={(e) => void aplicar(e, { fecha_limite: null })}>Quitar la fecha</Button>
          )}
          <Button type="button" variant="ghost" onClick={cerrar}>Cancelar</Button>
          <Button type="submit" loading={guardando} disabled={tipo === "fecha" && !fecha}>Aplicar</Button>
        </div>
      </form>
    </Modal>
  );
}
