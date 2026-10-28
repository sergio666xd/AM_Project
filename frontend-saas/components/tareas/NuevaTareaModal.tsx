"use client";

import { useCallback, useId, useState, type FormEvent } from "react";
import { ListPlus } from "lucide-react";

import { CAMPO, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { CampoFechaLimite, SelectorPrioridad } from "@/components/tareas/CamposTarea";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastProvider";
import { apiRequest } from "@/lib/api";
import { api, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { diaCorto } from "@/lib/fechas";
import type { PrioridadTarea } from "@/lib/tareas";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Proceso = Esquemas["ProcesoResumen"];

/**
 * Tarea nueva, general o de un proceso. La crea la API v1 (que programa los
 * recordatorios y avisa al cliente asignado) mientras se reescribe el detalle.
 */
export function NuevaTareaModal({ open, onClose, onCreada, procesoInicial }: {
  open: boolean;
  onClose: () => void;
  onCreada: () => void;
  procesoInicial?: number;
}) {
  const id = useId();
  const { toast } = useToast();
  const [procesos, setProcesos] = useState<Proceso[] | null>(null);
  const [titulo, setTitulo] = useState("");
  const [procesoId, setProcesoId] = useState<string>(procesoInicial ? String(procesoInicial) : "");
  const [clienteId, setClienteId] = useState("");
  const [fecha, setFecha] = useState("");
  const [explicacion, setExplicacion] = useState<string | null>(null);
  const [prioridad, setPrioridad] = useState<PrioridadTarea>("MEDIA");
  const [descripcion, setDescripcion] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (!open || procesos) return;
    const { data } = await api.GET("/api/v2/procesos", { params: { query: { limite: 100 } } });
    setProcesos(data?.items ?? []);
  }, [open, procesos]);
  useLoadEffect(cargar);

  const proceso = procesos?.find((p) => String(p.id) === procesoId);

  function cerrar() {
    setTitulo("");
    setProcesoId(procesoInicial ? String(procesoInicial) : "");
    setClienteId("");
    setFecha("");
    setExplicacion(null);
    setPrioridad("MEDIA");
    setDescripcion("");
    setErrores({});
    onClose();
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    if (!titulo.trim()) {
      setErrores({ titulo: "Escribe qué hay que hacer." });
      return;
    }
    setGuardando(true);
    setErrores({});
    try {
      await apiRequest("/api/tareas", {
        method: "POST",
        body: JSON.stringify({
          titulo: titulo.trim(),
          descripcion: [descripcion.trim(), explicacion].filter(Boolean).join("\n\n") || null,
          prioridad,
          proceso_id: procesoId ? Number(procesoId) : null,
          cliente_id: clienteId ? Number(clienteId) : null,
          // Vence al final del día en Bogotá, como las tareas que nacen de un folio.
          fecha_limite: fecha ? `${fecha}T23:59:00-05:00` : null,
        }),
      });
      toast({ title: "Tarea creada", description: fecha ? `Vence el ${diaCorto(fecha)}.` : "Sin fecha límite.", tone: "success" });
      onCreada();
      cerrar();
    } catch (causa) {
      setErrores({ general: causa instanceof Error ? causa.message : "No se pudo crear la tarea." });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal open={open} onClose={cerrar} title="Nueva tarea" description="Si es de un proceso, la ve todo su equipo.">
      <form onSubmit={guardar} noValidate>
        <label htmlFor={`${id}-titulo`} className={ETIQUETA}>Qué hay que hacer</label>
        <input
          id={`${id}-titulo`}
          value={titulo}
          maxLength={255}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Ej.: Preparar los alegatos de conclusión"
          aria-invalid={errores.titulo ? true : undefined}
          aria-describedby={errores.titulo ? `${id}-titulo-error` : undefined}
          className={CAMPO}
        />
        {errores.titulo && <p id={`${id}-titulo-error`} className="mt-1.5 text-[13px] text-bad">{errores.titulo}</p>}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-proceso`} className={ETIQUETA}>Proceso</label>
            <select id={`${id}-proceso`} value={procesoId} onChange={(e) => { setProcesoId(e.target.value); setClienteId(""); }} className={CAMPO} disabled={!procesos}>
              <option value="">{procesos ? "Tarea general, sin proceso" : "Cargando procesos…"}</option>
              {procesos?.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-cliente`} className={ETIQUETA}>Asignar al cliente <span className="font-normal text-ink-3">(opcional)</span></label>
            <select id={`${id}-cliente`} value={clienteId} onChange={(e) => setClienteId(e.target.value)} className={CAMPO} disabled={!proceso || proceso.clientes.length === 0}>
              <option value="">{!proceso ? "Elige primero un proceso" : proceso.clientes.length === 0 ? "El proceso no tiene clientes" : "No, es del equipo"}</option>
              {proceso?.clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <SelectorPrioridad nombre={`${id}-prioridad`} valor={prioridad} onCambio={setPrioridad} />
        </div>
        <div className="mt-4">
          <CampoFechaLimite id={`${id}-fecha`} fecha={fecha} onFecha={(f, texto) => { setFecha(f); setExplicacion(texto); }} />
        </div>

        <label htmlFor={`${id}-descripcion`} className={cx(ETIQUETA, "mt-4")}>Notas <span className="font-normal text-ink-3">(opcional)</span></label>
        <textarea id={`${id}-descripcion`} rows={2} maxLength={4000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={cx(CAMPO, "resize-y py-2.5")} />

        {errores.general && <p role="alert" className="mt-3 text-[13px] text-bad">{errores.general}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={cerrar}>Cancelar</Button>
          <Button type="submit" loading={guardando} icon={<ListPlus size={16} />}>Crear tarea</Button>
        </div>
      </form>
    </Modal>
  );
}
