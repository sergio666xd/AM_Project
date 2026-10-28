"use client";

import { useCallback, useId, useState } from "react";
import { CalendarPlus, Check, Copy, ExternalLink } from "lucide-react";

import { CAMPO, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { fechaCorta, fechaRelativa } from "@/lib/fechas";
import { useLoadEffect } from "@/lib/useLoadEffect";

const PASOS = [
  { app: "Google Calendar", texto: "En «Otros calendarios», pulsa + y elige «Desde URL». Pega el enlace." },
  { app: "Outlook", texto: "En «Agregar calendario», elige «Suscribirse desde la web» y pega el enlace." },
  { app: "Calendario de Apple", texto: "Pulsa «Abrir en tu calendario» o, en Archivo, «Nueva suscripción a calendario»." },
];

/**
 * El enlace .ics de la agenda. Se muestra una sola vez, al crearlo: la base solo
 * guarda su hash. Si se pierde, se genera otro y el anterior deja de funcionar.
 */
export function SuscripcionCalendario({ open, onClose }: { open: boolean; onClose: () => void }) {
  const id = useId();
  const { toast } = useToast();
  const [estado, setEstado] = useState<Esquemas["Suscripcion"] | null>(null);
  const [enlace, setEnlace] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [trabajando, setTrabajando] = useState<"crear" | "quitar" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!open) return;
    const { data, error: fallo } = await api.GET("/api/v2/agenda/suscripcion");
    if (fallo || !data) setError(mensajeDeError(fallo));
    else setEstado(data);
  }, [open]);
  useLoadEffect(cargar);

  function cerrar() {
    setEnlace(null);
    setCopiado(false);
    setError(null);
    onClose();
  }

  async function crear() {
    setTrabajando("crear");
    setError(null);
    const { data, error: fallo } = await api.POST("/api/v2/agenda/suscripcion");
    setTrabajando(null);
    if (fallo || !data) {
      setError(mensajeDeError(fallo));
      return;
    }
    setEnlace(`${window.location.origin}${data.ruta}`);
    setEstado({ activa: true, creada_en: data.creada_en, ultimo_uso: null });
  }

  async function quitar() {
    setTrabajando("quitar");
    const { error: fallo } = await api.DELETE("/api/v2/agenda/suscripcion");
    setTrabajando(null);
    if (fallo) {
      setError(mensajeDeError(fallo));
      return;
    }
    setEnlace(null);
    setEstado({ activa: false, creada_en: null, ultimo_uso: null });
    toast({ title: "Enlace desactivado", description: "Los calendarios suscritos dejarán de actualizarse.", tone: "success" });
  }

  async function copiar() {
    if (!enlace) return;
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      document.getElementById(`${id}-enlace`)?.focus();
    }
  }

  return (
    <Modal open={open} onClose={cerrar} title="Ver la agenda en tu calendario" description="Audiencias, reuniones y vencimientos de tareas en Google Calendar, Outlook o Apple. Se actualiza solo, más o menos cada hora.">
      {estado === null && !error ? (
        <p className="text-[14px] text-ink-3">Cargando…</p>
      ) : enlace ? (
        <div>
          <label htmlFor={`${id}-enlace`} className={ETIQUETA}>Tu enlace</label>
          <div className="flex gap-2">
            <input id={`${id}-enlace`} readOnly value={enlace} onFocus={(e) => e.currentTarget.select()} className={`${CAMPO} font-mono text-[12.5px]`} />
            <Button variant="secondary" icon={copiado ? <Check size={16} /> : <Copy size={16} />} onClick={() => void copiar()}>{copiado ? "Copiado" : "Copiar"}</Button>
          </div>
          <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">Cópialo ahora: por seguridad no lo volvemos a mostrar. Quien lo tenga puede ver tu agenda.</p>
          <ul className="mt-4 space-y-2.5">
            {PASOS.map((p) => (
              <li key={p.app} className="text-[13.5px] text-ink-2"><span className="font-semibold text-ink">{p.app}.</span> {p.texto}</li>
            ))}
          </ul>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={cerrar}>Listo</Button>
            <a href={enlace.replace(/^https?:/, "webcal:")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-navy px-3.5 sm:min-h-10 text-[14px] font-semibold text-on-navy shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_1px_2px_rgb(0_20_60/0.25)] hover:bg-navy-hover">
              <ExternalLink aria-hidden="true" size={16} />
              Abrir en tu calendario
            </a>
          </div>
        </div>
      ) : estado?.activa ? (
        <div>
          <div className="rounded-xl bg-manila/70 px-3.5 py-3 text-[14px] text-ink-2">
            <p><span className="font-semibold text-ink">Tienes un enlace activo</span> desde el {estado.creada_en ? fechaCorta(estado.creada_en) : "—"}.</p>
            <p className="mt-0.5 text-[13px] text-ink-3">{estado.ultimo_uso ? `Tu calendario lo leyó por última vez: ${fechaRelativa(estado.ultimo_uso).toLowerCase()}.` : "Ningún calendario lo ha leído todavía."}</p>
          </div>
          <p className="mt-3 text-[13.5px] text-ink-2">Si perdiste el enlace o crees que alguien más lo tiene, genera uno nuevo. El anterior deja de funcionar enseguida.</p>
          {error && <p role="alert" className="mt-3 text-[13px] text-bad">{error}</p>}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" className="sm:mr-auto" loading={trabajando === "quitar"} onClick={() => void quitar()}>Desactivar</Button>
            <Button variant="ghost" onClick={cerrar}>Cancelar</Button>
            <Button loading={trabajando === "crear"} onClick={() => void crear()}>Generar un enlace nuevo</Button>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-[14px] text-ink-2">Crea un enlace privado y agrégalo a tu calendario una sola vez. Lo que se agende o cambie aquí aparecerá allá.</p>
          {error && <p role="alert" className="mt-3 text-[13px] text-bad">{error}</p>}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={cerrar}>Cancelar</Button>
            <Button loading={trabajando === "crear"} icon={<CalendarPlus size={16} />} onClick={() => void crear()}>Crear enlace</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
