"use client";

import { useCallback, useId, useState, type FormEvent } from "react";
import { CalendarPlus, Save } from "lucide-react";

import { CAMPO, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { diaCorto, diaDe, hoyISO, horaDe } from "@/lib/fechas";
import { useLoadEffect } from "@/lib/useLoadEffect";

export type EventoDelProceso = Esquemas["EventoDelProceso"];

const TIPOS = [
  { id: "AUDIENCIA", nombre: "Audiencia" },
  { id: "REUNION", nombre: "Reunión" },
  { id: "EVENTO", nombre: "Otro" },
] as const;
type Tipo = (typeof TIPOS)[number]["id"];

/** "09:00" en hora de Bogotá, para los campos de hora. */
function hora24(valor: string): string {
  const fecha = new Date(valor);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false }).format(fecha);
}

/**
 * Agenda o cambia una audiencia, reunión u otro evento de un proceso y avisa al cliente.
 * Las firmas de contrato se agendan desde el contrato; aquí solo se mueven de hora.
 */
export function NuevoEventoModal({ open, onClose, onCreado, diaInicial, procesoId, clientes, evento }: {
  open: boolean;
  onClose: () => void;
  onCreado: () => void;
  diaInicial?: string;
  /** Proceso fijo (desde el expediente). */
  procesoId?: number;
  /** Clientes del proceso fijo, para elegir a quién avisar. */
  clientes?: { id: number; nombre: string }[];
  /** Evento a cambiar. */
  evento?: EventoDelProceso;
}) {
  const id = useId();
  const { toast } = useToast();
  const firma = evento?.tipo === "FIRMA_CONTRATO";
  const [procesos, setProcesos] = useState<Esquemas["ProcesoResumen"][] | null>(null);
  const [proceso, setProceso] = useState(procesoId ? String(procesoId) : "");
  const [tipo, setTipo] = useState<Tipo>(evento && !firma ? (evento.tipo as Tipo) : "AUDIENCIA");
  const [titulo, setTitulo] = useState(evento?.titulo ?? "");
  const [dia, setDia] = useState(evento ? diaDe(evento.inicio) : diaInicial ?? hoyISO());
  const [inicio, setInicio] = useState(evento ? hora24(evento.inicio) : "09:00");
  const [fin, setFin] = useState(evento?.fin ? hora24(evento.fin) : "");
  const [descripcion, setDescripcion] = useState(evento?.descripcion ?? "");
  const [cliente, setCliente] = useState(evento?.cliente ? String(evento.cliente.id) : "");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (!open || procesoId || procesos) return;
    const { data } = await api.GET("/api/v2/procesos", { params: { query: { limite: 100 } } });
    setProcesos(data?.items ?? []);
  }, [open, procesoId, procesos]);
  useLoadEffect(cargar);

  function cerrar() {
    if (!evento) {
      setTitulo("");
      setFin("");
      setDescripcion("");
    }
    setErrores({});
    onClose();
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const faltan: Record<string, string> = {};
    if (!proceso) faltan.proceso = "Elija el proceso.";
    if (!titulo.trim()) faltan.titulo = "Escriba de qué se trata.";
    if (!dia || !inicio) faltan.dia = "Indique el día y la hora.";
    if (fin && fin <= inicio) faltan.fin = "La hora final va después del inicio.";
    if (Object.keys(faltan).length) {
      setErrores(faltan);
      return;
    }
    setGuardando(true);
    setErrores({});
    const momentoInicio = `${dia}T${inicio}:00-05:00`;
    const momentoFin = fin ? `${dia}T${fin}:00-05:00` : null;
    const respuesta = evento
      ? await api.PATCH("/api/v2/agenda/eventos/{evento_id}", {
          params: { path: { evento_id: evento.id } },
          body: {
            titulo: titulo.trim(),
            descripcion: descripcion.trim() || null,
            inicio: momentoInicio,
            fin: momentoFin,
            ...(firma ? {} : { tipo, ...(clientes ? { cliente_id: cliente ? Number(cliente) : null } : {}) }),
          },
        })
      : await api.POST("/api/v2/agenda/eventos", {
          body: {
            proceso_id: Number(proceso),
            tipo,
            titulo: titulo.trim(),
            descripcion: descripcion.trim() || null,
            inicio: momentoInicio,
            fin: momentoFin,
            cliente_id: cliente ? Number(cliente) : null,
          },
        });
    setGuardando(false);
    if (!respuesta.data) {
      const campos = (respuesta.error as { campos?: Record<string, string> } | undefined)?.campos ?? {};
      setErrores({ ...campos, general: mensajeDeError(respuesta.error) });
      return;
    }
    toast({ title: evento ? "Evento actualizado" : "Evento agendado", description: `${diaCorto(dia)}, ${horaDe(respuesta.data.inicio)}.`, tone: "success" });
    onCreado();
    cerrar();
  }

  return (
    <Modal
      open={open}
      onClose={cerrar}
      title={evento ? (firma ? "Mover la firma del contrato" : "Cambiar el evento") : "Agendar evento"}
      description={evento ? "Le avisamos al cliente del cambio." : "Queda en la agenda del proceso y en los calendarios suscritos."}
    >
      <form onSubmit={guardar} noValidate>
        {!firma && (
          <fieldset>
            <legend className={ETIQUETA}>Tipo</legend>
            <div className="flex gap-1 rounded-lg bg-manila p-0.5">
              {TIPOS.map((t) => (
                <label key={t.id} className={cx("inline-flex min-h-10 flex-1 cursor-pointer items-center justify-center rounded-md px-2.5 text-[13px] font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-navy/30 sm:min-h-9", tipo === t.id ? "bg-sheet text-ink shadow-[0_1px_2px_rgb(24_32_58/0.12)]" : "text-ink-2 hover:text-ink")}>
                  <input type="radio" name={`${id}-tipo`} value={t.id} checked={tipo === t.id} onChange={() => setTipo(t.id)} className="sr-only" />
                  {t.nombre}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {!procesoId && (
          <>
            <label htmlFor={`${id}-proceso`} className={cx(ETIQUETA, "mt-4")}>Proceso</label>
            <select id={`${id}-proceso`} value={proceso} onChange={(e) => setProceso(e.target.value)} disabled={!procesos} aria-invalid={errores.proceso ? true : undefined} className={CAMPO}>
              <option value="">{procesos ? "Elija un proceso" : "Cargando procesos…"}</option>
              {procesos?.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            {errores.proceso && <p className="mt-1.5 text-[13px] text-bad">{errores.proceso}</p>}
          </>
        )}

        <label htmlFor={`${id}-titulo`} className={cx(ETIQUETA, !firma && "mt-4")}>Título</label>
        <input id={`${id}-titulo`} value={titulo} maxLength={255} onChange={(e) => setTitulo(e.target.value)} placeholder={tipo === "AUDIENCIA" ? "Ej.: Audiencia inicial" : "Ej.: Reunión con el cliente"} aria-invalid={errores.titulo ? true : undefined} className={CAMPO} />
        {errores.titulo && <p className="mt-1.5 text-[13px] text-bad">{errores.titulo}</p>}

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor={`${id}-dia`} className={ETIQUETA}>Día</label>
            <input id={`${id}-dia`} type="date" value={dia} onChange={(e) => setDia(e.target.value)} className={CAMPO} />
          </div>
          <div>
            <label htmlFor={`${id}-inicio`} className={ETIQUETA}>Empieza</label>
            <input id={`${id}-inicio`} type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} className={CAMPO} />
          </div>
          <div>
            <label htmlFor={`${id}-fin`} className={ETIQUETA}>Termina <span className="font-normal text-ink-3">(opc.)</span></label>
            <input id={`${id}-fin`} type="time" value={fin} onChange={(e) => setFin(e.target.value)} aria-invalid={errores.fin ? true : undefined} className={CAMPO} />
          </div>
        </div>
        {(errores.dia || errores.fin || errores.inicio) && <p className="mt-1.5 text-[13px] text-bad">{errores.dia ?? errores.fin ?? errores.inicio}</p>}

        {clientes && clientes.length > 0 && !firma && (
          <>
            <label htmlFor={`${id}-cliente`} className={cx(ETIQUETA, "mt-4")}>Avisar a</label>
            <select id={`${id}-cliente`} value={cliente} onChange={(e) => setCliente(e.target.value)} className={CAMPO}>
              <option value="">{clientes.length === 1 ? clientes[0].nombre : "Todos los clientes del proceso"}</option>
              {clientes.length > 1 && clientes.map((c) => <option key={c.id} value={c.id}>Solo a {c.nombre}</option>)}
            </select>
          </>
        )}

        <label htmlFor={`${id}-descripcion`} className={cx(ETIQUETA, "mt-4")}>Detalles <span className="font-normal text-ink-3">(opcional)</span></label>
        <textarea id={`${id}-descripcion`} rows={2} maxLength={4000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Lugar, enlace de la audiencia virtual, qué llevar…" className={cx(CAMPO, "resize-y py-2.5")} />

        {errores.general && <p role="alert" className="mt-3 text-[13px] text-bad">{errores.general}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={cerrar}>Cancelar</Button>
          <Button type="submit" loading={guardando} icon={evento ? <Save size={16} /> : <CalendarPlus size={16} />}>{evento ? "Guardar" : "Agendar"}</Button>
        </div>
      </form>
    </Modal>
  );
}
