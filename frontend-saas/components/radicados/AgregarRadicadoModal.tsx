"use client";

import { useCallback, useId, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";

import { CAMPO, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { iniciarWorkflowConsultaRadicado } from "@/lib/api";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { useLoadEffect } from "@/lib/useLoadEffect";

export type RadicadoAgregado = Esquemas["RadicadoAgregado"];

/**
 * Agrega un radicado a un proceso y lanza su primera consulta. Con `procesoId` el proceso ya está
 * elegido (desde el expediente); sin él, se elige entre los procesos activos.
 */
export function AgregarRadicadoModal({ procesoId, onClose, onListo }: {
  procesoId?: number;
  onClose: () => void;
  onListo: (agregado: RadicadoAgregado, aviso: string) => void;
}) {
  const id = useId();
  const [numero, setNumero] = useState("");
  const [proceso, setProceso] = useState(procesoId ? String(procesoId) : "");
  const [procesos, setProcesos] = useState<{ id: number; nombre: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const digitos = numero.replace(/\D/g, "");

  const cargarProcesos = useCallback(async () => {
    if (procesoId) return;
    const { data, error: fallo } = await api.GET("/api/v2/procesos", { params: { query: { archivados: false, limite: 100 } } });
    if (data) setProcesos(data.items.map((p) => ({ id: p.id, nombre: p.nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
    else setError(mensajeDeError(fallo));
  }, [procesoId]);
  useLoadEffect(cargarProcesos);

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    if (!proceso) {
      setError("Elija el proceso al que pertenece el radicado.");
      return;
    }
    if (digitos.length !== 23) {
      setError(`El radicado tiene 23 dígitos; lleva ${digitos.length}.`);
      return;
    }
    setGuardando(true);
    const { data, error: fallo } = await api.POST("/api/v2/procesos/{proceso_id}/radicados", {
      params: { path: { proceso_id: Number(proceso) } }, body: { numero: digitos },
    });
    if (!data) {
      setGuardando(false);
      setError(mensajeDeError(fallo));
      return;
    }
    let aviso = data.mensaje;
    if (data.consulta_id) {
      try {
        await iniciarWorkflowConsultaRadicado({ tipo: "AUTOMATICA_NUEVO", radicado_id: data.radicado_id, consulta_id: data.consulta_id });
        aviso = "Lo estamos consultando en la Rama Judicial; las actuaciones aparecen en unos minutos.";
      } catch {
        aviso = "No se pudo iniciar la consulta en la Rama Judicial. La consulta programada lo revisará.";
      }
    }
    setGuardando(false);
    onListo(data, aviso);
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="Agregar un radicado" description="Si la firma ya lo sigue en otro proceso, se reutiliza con sus actuaciones.">
      <form onSubmit={guardar} noValidate className="space-y-4">
        {!procesoId && (
          <div>
            <label htmlFor={`${id}-proceso`} className={ETIQUETA}>Proceso</label>
            <select
              id={`${id}-proceso`}
              value={proceso}
              disabled={!procesos}
              onChange={(e) => { setProceso(e.target.value); setError(null); }}
              className={CAMPO}
            >
              <option value="">{procesos ? "Elija el proceso" : "Cargando procesos…"}</option>
              {procesos?.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
        )}
        <div>
          <label htmlFor={`${id}-numero`} className={ETIQUETA}>Número de radicado</label>
          <input
            id={`${id}-numero`}
            value={numero}
            inputMode="numeric"
            autoComplete="off"
            maxLength={40}
            onChange={(e) => { setNumero(e.target.value); setError(null); }}
            placeholder="05001 31 10 012 2025 00356 00"
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-ayuda`}
            className={cx(CAMPO, "font-mono tabular-nums")}
          />
          <p id={`${id}-ayuda`} className="mt-1.5 text-[13px] text-ink-3">
            Los 23 dígitos, con o sin espacios. <span className="tabular-nums">{digitos.length}</span>/23
          </p>
        </div>
        {error && <p role="alert" className="text-[13px] text-bad">{error}</p>}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={guardando} icon={<Plus size={16} />}>Agregar</Button>
        </div>
      </form>
    </Modal>
  );
}
