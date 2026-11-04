"use client";

import { useCallback, useId, useState, type FormEvent } from "react";
import { Save } from "lucide-react";

import { CAMPO, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { CampoFechaLimite, SelectorPrioridad } from "@/components/tareas/CamposTarea";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { api, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { diaCorto, diaDe } from "@/lib/fechas";
import type { PrioridadTarea } from "@/lib/tareas";
import { useLoadEffect } from "@/lib/useLoadEffect";

export type TareaDetalle = Esquemas["TareaDetalle"];
type Cambios = Esquemas["CambiosTarea"];
type Vinculos = Esquemas["VinculosProceso"];

/** Título, prioridad, fecha límite y notas. */
export function EditarTareaModal({ tarea, open, onClose, onGuardar }: {
  tarea: TareaDetalle;
  open: boolean;
  onClose: () => void;
  onGuardar: (cambios: Cambios) => Promise<string | null>;
}) {
  const id = useId();
  const [titulo, setTitulo] = useState(tarea.titulo);
  const [prioridad, setPrioridad] = useState<PrioridadTarea>(tarea.prioridad);
  const [fecha, setFecha] = useState(tarea.fecha_limite ? diaDe(tarea.fecha_limite) : "");
  const [notas, setNotas] = useState(tarea.descripcion ?? "");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    if (!titulo.trim()) {
      setError("Escriba qué hay que hacer.");
      return;
    }
    const cambios: Cambios = {};
    if (titulo.trim() !== tarea.titulo) cambios.titulo = titulo.trim();
    if (prioridad !== tarea.prioridad) cambios.prioridad = prioridad;
    if ((notas.trim() || null) !== (tarea.descripcion ?? null)) cambios.descripcion = notas.trim() || null;
    if (fecha !== (tarea.fecha_limite ? diaDe(tarea.fecha_limite) : "")) cambios.fecha_limite = fecha || null;
    if (Object.keys(cambios).length === 0) {
      onClose();
      return;
    }
    setGuardando(true);
    const fallo = await onGuardar(cambios);
    setGuardando(false);
    if (fallo) setError(fallo);
    else onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Editar la tarea">
      <form onSubmit={guardar} noValidate>
        <label htmlFor={`${id}-titulo`} className={ETIQUETA}>Qué hay que hacer</label>
        <input id={`${id}-titulo`} value={titulo} maxLength={255} onChange={(e) => setTitulo(e.target.value)} className={CAMPO} />
        <div className="mt-4"><SelectorPrioridad nombre={`${id}-prioridad`} valor={prioridad} onCambio={setPrioridad} /></div>
        <div className="mt-4">
          <CampoFechaLimite id={`${id}-fecha`} fecha={fecha} onFecha={(f) => setFecha(f)} />
          {fecha && (
            <button type="button" onClick={() => setFecha("")} className="mt-1.5 text-[13px] font-semibold text-navy-ink underline-offset-2 hover:underline">
              Quitar la fecha límite
            </button>
          )}
        </div>
        <label htmlFor={`${id}-notas`} className={cx(ETIQUETA, "mt-4")}>Notas <span className="font-normal text-ink-3">(opcional)</span></label>
        <textarea id={`${id}-notas`} rows={4} maxLength={4000} value={notas} onChange={(e) => setNotas(e.target.value)} className={cx(CAMPO, "resize-y py-2.5")} />
        {error && <p role="alert" className="mt-3 text-[13px] text-bad">{error}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={guardando} icon={<Save size={16} />}>Guardar</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Proceso, radicado, actuación y cliente. Sin proceso, la tarea es general. */
export function VinculosTareaModal({ tarea, open, onClose, onGuardar }: {
  tarea: TareaDetalle;
  open: boolean;
  onClose: () => void;
  onGuardar: (cambios: Cambios) => Promise<string | null>;
}) {
  const id = useId();
  const [procesos, setProcesos] = useState<Esquemas["ProcesoResumen"][] | null>(null);
  const [procesoId, setProcesoId] = useState(tarea.proceso ? String(tarea.proceso.id) : "");
  const [vinculos, setVinculos] = useState<{ de: string; datos: Vinculos } | null>(null);
  const [radicadoId, setRadicadoId] = useState(tarea.radicado ? String(tarea.radicado.id) : "");
  const [actuacionId, setActuacionId] = useState(tarea.actuacion ? String(tarea.actuacion.id) : "");
  const [clienteId, setClienteId] = useState(tarea.cliente ? String(tarea.cliente.id) : "");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargarProcesos = useCallback(async () => {
    if (!open || procesos) return;
    const { data } = await api.GET("/api/v2/procesos", { params: { query: { limite: 100 } } });
    const lista = data?.items ?? [];
    // El proceso actual puede no estar entre los 100 más recientes.
    if (tarea.proceso && !lista.some((p) => p.id === tarea.proceso?.id)) {
      const { data: actual } = await api.GET("/api/v2/procesos/{proceso_id}", { params: { path: { proceso_id: tarea.proceso.id } } });
      if (actual) lista.unshift(actual);
    }
    setProcesos(lista);
  }, [open, procesos, tarea.proceso]);
  useLoadEffect(cargarProcesos);

  const cargarVinculos = useCallback(async () => {
    if (!open || !procesoId || vinculos?.de === procesoId) return;
    const { data } = await api.GET("/api/v2/procesos/{proceso_id}/vinculos", { params: { path: { proceso_id: Number(procesoId) } } });
    if (data) setVinculos({ de: procesoId, datos: data });
  }, [open, procesoId, vinculos?.de]);
  useLoadEffect(cargarVinculos);

  const datos = vinculos?.de === procesoId ? vinculos.datos : null;
  const radicado = datos?.radicados.find((r) => String(r.id) === radicadoId);

  function elegirProceso(valor: string) {
    setProcesoId(valor);
    setRadicadoId("");
    setActuacionId("");
    setClienteId("");
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    const fallo = await onGuardar({
      proceso_id: procesoId ? Number(procesoId) : null,
      radicado_id: radicadoId ? Number(radicadoId) : null,
      actuacion_id: actuacionId ? Number(actuacionId) : null,
      cliente_id: clienteId ? Number(clienteId) : null,
    });
    setGuardando(false);
    if (fallo) setError(fallo);
    else onClose();
  }

  const cargando = Boolean(procesoId) && !datos;
  return (
    <Modal open={open} onClose={onClose} title="De qué es la tarea" description="Si es de un proceso, la ve todo su equipo.">
      <form onSubmit={guardar} noValidate className="grid gap-4">
        <div>
          <label htmlFor={`${id}-proceso`} className={ETIQUETA}>Proceso</label>
          <select id={`${id}-proceso`} value={procesoId} onChange={(e) => elegirProceso(e.target.value)} disabled={!procesos} className={CAMPO}>
            <option value="">{procesos ? "Tarea general, sin proceso" : "Cargando procesos…"}</option>
            {procesos?.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        {procesoId && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`${id}-radicado`} className={ETIQUETA}>Radicado <span className="font-normal text-ink-3">(opcional)</span></label>
                <select id={`${id}-radicado`} value={radicadoId} onChange={(e) => { setRadicadoId(e.target.value); setActuacionId(""); }} disabled={cargando || !datos?.radicados.length} className={CAMPO}>
                  <option value="">{cargando ? "Cargando…" : datos?.radicados.length ? "Ninguno" : "El proceso no tiene radicados"}</option>
                  {datos?.radicados.map((r) => <option key={r.id} value={r.id}>{r.numero}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor={`${id}-cliente`} className={ETIQUETA}>Asignar al cliente <span className="font-normal text-ink-3">(opcional)</span></label>
                <select id={`${id}-cliente`} value={clienteId} onChange={(e) => setClienteId(e.target.value)} disabled={cargando || !datos?.clientes.length} className={CAMPO}>
                  <option value="">{cargando ? "Cargando…" : datos?.clientes.length ? "No, es del equipo" : "El proceso no tiene clientes"}</option>
                  {datos?.clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            </div>
            {radicado && (
              <div>
                <label htmlFor={`${id}-actuacion`} className={ETIQUETA}>Actuación <span className="font-normal text-ink-3">(opcional)</span></label>
                <select id={`${id}-actuacion`} value={actuacionId} onChange={(e) => setActuacionId(e.target.value)} disabled={!radicado.actuaciones.length} className={CAMPO}>
                  <option value="">{radicado.actuaciones.length ? "Ninguna" : "El radicado aún no tiene actuaciones"}</option>
                  {radicado.actuaciones.map((a) => <option key={a.id} value={a.id}>{a.fecha ? `${diaCorto(a.fecha)} · ` : ""}{a.texto}</option>)}
                </select>
              </div>
            )}
            {clienteId && <p className="text-[13px] text-ink-3">La tarea le llega al cliente en su portal, y la plataforma le recuerda antes de que venza.</p>}
          </>
        )}
        {error && <p role="alert" className="text-[13px] text-bad">{error}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={guardando} disabled={cargando} icon={<Save size={16} />}>Guardar</Button>
        </div>
      </form>
    </Modal>
  );
}
