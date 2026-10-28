"use client";

import Link from "next/link";
import { useCallback, useId, useState, type FormEvent } from "react";
import { LayoutTemplate } from "lucide-react";

import { CAMPO, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Tag } from "@/components/ui/Tag";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { hoyISO } from "@/lib/fechas";
import { prioridad } from "@/lib/tareas";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Plantilla = Esquemas["Plantilla"];

export function plazoDePaso(dias: number | null | undefined) {
  if (dias === null || dias === undefined) return "Sin fecha";
  if (dias === 0) return "El mismo día";
  return `${dias} ${dias === 1 ? "día hábil" : "días hábiles"}`;
}

/** Lista de pasos de una plantilla, con su plazo y prioridad. */
export function PasosPlantilla({ plantilla, className }: { plantilla: Pick<Plantilla, "pasos">; className?: string }) {
  return (
    <ol className={cx("space-y-1.5", className)}>
      {plantilla.pasos.map((paso, i) => (
        <li key={i} className="flex items-baseline gap-2.5 text-[13.5px]">
          <span className="w-4 shrink-0 text-right tabular-nums text-ink-3">{i + 1}.</span>
          <span className="min-w-0 flex-1 text-ink">{paso.titulo}</span>
          <span className="shrink-0 tabular-nums text-ink-3">{plazoDePaso(paso.dias_habiles)}</span>
          <Tag tone={prioridad(paso.prioridad ?? "MEDIA").tono} className="hidden sm:inline-flex">{prioridad(paso.prioridad ?? "MEDIA").nombre}</Tag>
        </li>
      ))}
    </ol>
  );
}

/**
 * Crea de una vez las tareas de una plantilla en un proceso. Las fechas se
 * cuentan en días hábiles desde la notificación, con la calculadora de términos.
 */
export function AplicarPlantillaModal({
  open,
  onClose,
  onCreadas,
  procesoId,
  notificacionInicial,
  folio,
  para,
}: {
  open: boolean;
  onClose: () => void;
  onCreadas: (cantidad: number) => void;
  /** Proceso fijo (desde el expediente); sin él, se elige. */
  procesoId?: number;
  notificacionInicial?: string;
  folio?: number;
  /** Texto de la actuación, para poner primero las plantillas que coinciden. */
  para?: string;
}) {
  const id = useId();
  const { toast } = useToast();
  const [plantillas, setPlantillas] = useState<Plantilla[] | null>(null);
  const [procesos, setProcesos] = useState<Esquemas["ProcesoResumen"][] | null>(null);
  const [elegida, setElegida] = useState<number | null>(null);
  const [proceso, setProceso] = useState(procesoId ? String(procesoId) : "");
  const [notificacion, setNotificacion] = useState(notificacionInicial ?? hoyISO());
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (!open) return;
    // El modal vive montado: al abrirse toma la fecha y el proceso del folio de turno.
    setNotificacion(notificacionInicial ?? hoyISO());
    if (procesoId) setProceso(String(procesoId));
    const [lista, procs] = await Promise.all([
      api.GET("/api/v2/tareas/plantillas", { params: { query: { para: para || undefined } } }),
      procesoId ? Promise.resolve(null) : api.GET("/api/v2/procesos", { params: { query: { limite: 100 } } }),
    ]);
    if (lista.error || !lista.data) {
      setErrores({ general: mensajeDeError(lista.error) });
      return;
    }
    setPlantillas(lista.data.items);
    setElegida((actual) => actual ?? lista.data.items[0]?.id ?? null);
    if (procs) setProcesos(procs.data?.items ?? []);
  }, [open, para, procesoId, notificacionInicial]);
  useLoadEffect(cargar);

  function cerrar() {
    setElegida(null);
    setErrores({});
    setNotificacion(notificacionInicial ?? hoyISO());
    onClose();
  }

  async function aplicar(evento: FormEvent) {
    evento.preventDefault();
    if (!elegida) return;
    if (!proceso) {
      setErrores({ proceso_id: "Elige el proceso." });
      return;
    }
    setGuardando(true);
    setErrores({});
    const { data, error } = await api.POST("/api/v2/tareas/plantillas/{plantilla_id}/aplicar", {
      params: { path: { plantilla_id: elegida } },
      body: { proceso_id: Number(proceso), notificacion, folio: folio ?? null },
    });
    setGuardando(false);
    if (error || !data) {
      setErrores({ ...(error?.campos ?? {}), general: mensajeDeError(error) });
      return;
    }
    toast({ title: data.items.length === 1 ? "1 tarea creada" : `${data.items.length} tareas creadas`, description: "Quedaron en el proceso con sus fechas límite.", tone: "success" });
    onCreadas(data.items.length);
    cerrar();
  }

  const plantilla = plantillas?.find((p) => p.id === elegida);

  return (
    <Modal open={open} onClose={cerrar} size="lg" title="Usar una plantilla" description="Crea una tarea por paso, con la fecha contada en días hábiles desde la notificación.">
      <form onSubmit={aplicar} noValidate>
        {plantillas === null ? (
          <p className="text-[14px] text-ink-3">{errores.general ?? "Cargando plantillas…"}</p>
        ) : plantillas.length === 0 ? (
          <p className="rounded-lg bg-manila px-3.5 py-3 text-[14px] text-ink-2">
            Todavía no hay plantillas. <Link href="/gestion-procesos/abogado/tareas/plantillas" className="font-semibold text-navy-ink underline">Crea la primera</Link>.
          </p>
        ) : (
          <>
            <fieldset>
              <legend className={ETIQUETA}>Plantilla</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {plantillas.map((p) => (
                  <label key={p.id} className={cx("flex cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2.5 shadow-[0_0_0_1px_var(--line-strong)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-navy/30", elegida === p.id ? "bg-navy-soft shadow-[0_0_0_1.5px_var(--navy)]" : "bg-sheet hover:bg-manila/60")}>
                    <input type="radio" name={`${id}-plantilla`} checked={elegida === p.id} onChange={() => setElegida(p.id)} className="mt-1 size-4 accent-[var(--navy)]" />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5 font-semibold text-ink">
                        {p.nombre}
                        {p.coincide && <Tag tone="gold">Sugerida</Tag>}
                      </span>
                      <span className="block text-[13px] text-ink-3">{p.pasos.length === 1 ? "1 paso" : `${p.pasos.length} pasos`}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            {plantilla && (
              <div className="mt-4 rounded-xl bg-manila/70 px-3.5 py-3">
                {plantilla.descripcion && <p className="mb-2 text-[13.5px] text-ink-2">{plantilla.descripcion}</p>}
                <PasosPlantilla plantilla={plantilla} />
              </div>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {!procesoId && (
                <div>
                  <label htmlFor={`${id}-proceso`} className={ETIQUETA}>Proceso</label>
                  <select id={`${id}-proceso`} value={proceso} onChange={(e) => setProceso(e.target.value)} className={CAMPO} aria-invalid={errores.proceso_id ? true : undefined}>
                    <option value="">{procesos ? "Elige un proceso" : "Cargando…"}</option>
                    {procesos?.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                  {errores.proceso_id && <p className="mt-1.5 text-[13px] text-bad">{errores.proceso_id}</p>}
                </div>
              )}
              <div>
                <label htmlFor={`${id}-notificacion`} className={ETIQUETA}>Notificado el</label>
                <input id={`${id}-notificacion`} type="date" value={notificacion} max={hoyISO()} onChange={(e) => setNotificacion(e.target.value)} className={CAMPO} />
              </div>
            </div>
          </>
        )}
        {errores.general && plantillas && <p role="alert" className="mt-3 text-[13px] text-bad">{errores.general}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={cerrar}>Cancelar</Button>
          <Button type="submit" loading={guardando} disabled={!plantilla || !notificacion} icon={<LayoutTemplate size={16} />}>
            {plantilla ? `Crear ${plantilla.pasos.length === 1 ? "1 tarea" : `${plantilla.pasos.length} tareas`}` : "Crear tareas"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
