"use client";

import { useCallback, useId, useState, type FormEvent } from "react";
import { CalendarPlus } from "lucide-react";

import { CAMPO, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastProvider";
import { apiRequest } from "@/lib/api";
import { api, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { diaCorto, hoyISO } from "@/lib/fechas";
import { useLoadEffect } from "@/lib/useLoadEffect";

const TIPOS = [
  { id: "AUDIENCIA", nombre: "Audiencia" },
  { id: "REUNION", nombre: "Reunión" },
  { id: "EVENTO", nombre: "Otro" },
] as const;

/**
 * Agenda una audiencia, reunión u otro evento de un proceso. Lo guarda la API v1,
 * que avisa al cliente si se elige; las firmas de contrato se agendan desde el contrato.
 */
export function NuevoEventoModal({ open, onClose, onCreado, diaInicial }: {
  open: boolean;
  onClose: () => void;
  onCreado: () => void;
  diaInicial?: string;
}) {
  const id = useId();
  const { toast } = useToast();
  const [procesos, setProcesos] = useState<Esquemas["ProcesoResumen"][] | null>(null);
  const [procesoId, setProcesoId] = useState("");
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]["id"]>("AUDIENCIA");
  const [titulo, setTitulo] = useState("");
  const [dia, setDia] = useState(diaInicial ?? hoyISO());
  const [inicio, setInicio] = useState("09:00");
  const [fin, setFin] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (!open || procesos) return;
    const { data } = await api.GET("/api/v2/procesos", { params: { query: { limite: 100 } } });
    setProcesos(data?.items ?? []);
  }, [open, procesos]);
  useLoadEffect(cargar);

  function cerrar() {
    setTitulo("");
    setFin("");
    setDescripcion("");
    setErrores({});
    onClose();
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    const faltan: Record<string, string> = {};
    if (!procesoId) faltan.proceso = "Elige el proceso.";
    if (!titulo.trim()) faltan.titulo = "Escribe de qué se trata.";
    if (!dia || !inicio) faltan.dia = "Indica el día y la hora.";
    if (fin && fin <= inicio) faltan.fin = "La hora final va después del inicio.";
    if (Object.keys(faltan).length) {
      setErrores(faltan);
      return;
    }
    setGuardando(true);
    setErrores({});
    try {
      await apiRequest("/api/expedientes/agenda/eventos", {
        method: "POST",
        body: JSON.stringify({
          proceso_id: Number(procesoId),
          tipo,
          titulo: titulo.trim(),
          descripcion: descripcion.trim() || null,
          fecha_inicio: `${dia}T${inicio}:00-05:00`,
          fecha_fin: fin ? `${dia}T${fin}:00-05:00` : null,
          estado: "PROGRAMADO",
        }),
      });
      toast({ title: "Evento agendado", description: `${diaCorto(dia)}, ${inicio}.`, tone: "success" });
      onCreado();
      cerrar();
    } catch (causa) {
      setErrores({ general: causa instanceof Error ? causa.message : "No se pudo agendar el evento." });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal open={open} onClose={cerrar} title="Agendar evento" description="Queda en la agenda del proceso y en los calendarios suscritos.">
      <form onSubmit={guardar} noValidate>
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

        <label htmlFor={`${id}-proceso`} className={cx(ETIQUETA, "mt-4")}>Proceso</label>
        <select id={`${id}-proceso`} value={procesoId} onChange={(e) => setProcesoId(e.target.value)} disabled={!procesos} aria-invalid={errores.proceso ? true : undefined} className={CAMPO}>
          <option value="">{procesos ? "Elige un proceso" : "Cargando procesos…"}</option>
          {procesos?.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        {errores.proceso && <p className="mt-1.5 text-[13px] text-bad">{errores.proceso}</p>}

        <label htmlFor={`${id}-titulo`} className={cx(ETIQUETA, "mt-4")}>Título</label>
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
        {(errores.dia || errores.fin) && <p className="mt-1.5 text-[13px] text-bad">{errores.dia ?? errores.fin}</p>}

        <label htmlFor={`${id}-descripcion`} className={cx(ETIQUETA, "mt-4")}>Detalles <span className="font-normal text-ink-3">(opcional)</span></label>
        <textarea id={`${id}-descripcion`} rows={2} maxLength={4000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Lugar, enlace de la audiencia virtual, qué llevar…" className={cx(CAMPO, "resize-y py-2.5")} />

        {errores.general && <p role="alert" className="mt-3 text-[13px] text-bad">{errores.general}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={cerrar}>Cancelar</Button>
          <Button type="submit" loading={guardando} icon={<CalendarPlus size={16} />}>Agendar</Button>
        </div>
      </form>
    </Modal>
  );
}
