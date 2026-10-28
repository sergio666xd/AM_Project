"use client";

import { useCallback, useId, useState, type FormEvent } from "react";
import { Calculator, ChevronDown, LayoutTemplate, ListPlus, Send } from "lucide-react";

import { CAMPO, CalculadoraTermino, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { AplicarPlantillaModal } from "@/components/tareas/AplicarPlantillaModal";
import { Button } from "@/components/ui/Button";
import { Folio } from "@/components/ui/Folio";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { diaCorto, hoyISO } from "@/lib/fechas";
import { useLoadEffect } from "@/lib/useLoadEffect";

/** Lo que las acciones necesitan de un folio, venga del expediente o de Hoy. */
export type FolioAccionable = Pick<Esquemas["Folio"], "numero" | "tipo" | "titulo" | "detalle" | "fecha" | "etiqueta">;

type Prioridad = Esquemas["TareaDesdeFolio"]["prioridad"];

const PRIORIDADES: { id: NonNullable<Prioridad>; label: string }[] = [
  { id: "BAJA", label: "Baja" },
  { id: "MEDIA", label: "Media" },
  { id: "ALTA", label: "Alta" },
  { id: "URGENTE", label: "Urgente" },
];

function ReferenciaFolio({ folio }: { folio: FolioAccionable }) {
  return (
    <div className="mb-5 flex items-start gap-3 rounded-xl bg-manila px-3.5 py-3">
      <Folio n={folio.numero} className="mt-0.5" />
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold text-ink-3">{folio.etiqueta}</p>
        <p className="text-[14.5px] font-semibold text-pretty text-ink">{folio.titulo}</p>
        {folio.detalle && <p className="mt-0.5 line-clamp-3 text-[13px] text-ink-2">{folio.detalle}</p>}
      </div>
    </div>
  );
}

/** Avisar a los clientes del proceso de una actuación, con un comentario de la firma. */
export function AvisarClienteModal({
  procesoId,
  folio,
  onClose,
  onHecho,
}: {
  procesoId: number;
  folio: FolioAccionable | null;
  onClose: () => void;
  onHecho: (numero: number) => void;
}) {
  const id = useId();
  const { toast } = useToast();
  const [clientes, setClientes] = useState<Esquemas["PersonaBreve"][] | null>(null);
  const [elegidos, setElegidos] = useState<Set<number>>(new Set());
  const [comentarios, setComentarios] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const abierto = folio !== null;

  const cargarClientes = useCallback(async () => {
    if (!abierto) return;
    const { data, error: fallo } = await api.GET("/api/v2/procesos/{proceso_id}", { params: { path: { proceso_id: procesoId } } });
    if (fallo || !data) {
      setError(mensajeDeError(fallo));
      return;
    }
    setClientes(data.clientes);
    setElegidos(new Set(data.clientes.map((c) => c.id)));
  }, [abierto, procesoId]);
  useLoadEffect(cargarClientes);

  function cerrar() {
    setComentarios("");
    setError(null);
    onClose();
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!folio) return;
    if (!comentarios.trim()) {
      setError("Escribe qué significa la actuación para el cliente.");
      return;
    }
    if (clientes && elegidos.size === 0) {
      setError("Elige al menos un cliente.");
      return;
    }
    setEnviando(true);
    setError(null);
    const { data, error: fallo } = await api.POST("/api/v2/procesos/{proceso_id}/folios/{numero}/avisar", {
      params: { path: { proceso_id: procesoId, numero: folio.numero } },
      body: { comentarios: comentarios.trim(), cliente_ids: [...elegidos] },
    });
    setEnviando(false);
    if (fallo || !data) {
      setError(mensajeDeError(fallo));
      return;
    }
    const nombres = data.clientes.map((c) => c.nombre.split(" ")[0]).join(", ");
    toast({ title: "Aviso enviado", description: `Le llegará a ${nombres} por los canales que tenga activos.`, tone: "success" });
    onHecho(folio.numero);
    cerrar();
  }

  return (
    <Modal open={abierto} onClose={cerrar} title="Avisar al cliente" description="Le llega por correo, WhatsApp o push, según sus preferencias.">
      {folio && (
        <form onSubmit={enviar} noValidate>
          <ReferenciaFolio folio={folio} />
          {clientes === null && !error ? (
            <p className="mb-4 text-[13px] text-ink-3">Cargando clientes del proceso…</p>
          ) : clientes && clientes.length === 0 ? (
            <p className="mb-4 rounded-lg bg-warn-soft px-3 py-2.5 text-[13.5px] text-warn">Este proceso no tiene clientes vinculados. Vincula uno desde «Clientes y radicados».</p>
          ) : clientes && clientes.length > 1 ? (
            <fieldset className="mb-4">
              <legend className={ETIQUETA}>Clientes</legend>
              <div className="flex flex-wrap gap-2">
                {clientes.map((c) => (
                  <label key={c.id} className={cx("inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-3 text-[14px] shadow-[0_0_0_1px_var(--line-strong)]", elegidos.has(c.id) ? "bg-navy-soft text-ink" : "bg-sheet text-ink-2")}>
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--navy)]"
                      checked={elegidos.has(c.id)}
                      onChange={(e) => setElegidos((actual) => {
                        const siguiente = new Set(actual);
                        if (e.target.checked) siguiente.add(c.id);
                        else siguiente.delete(c.id);
                        return siguiente;
                      })}
                    />
                    {c.nombre}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : clientes ? (
            <p className="mb-4 text-[13.5px] text-ink-2">Para <strong className="font-semibold text-ink">{clientes[0].nombre}</strong></p>
          ) : null}
          <label htmlFor={`${id}-comentarios`} className={ETIQUETA}>Qué significa para el cliente</label>
          <textarea
            id={`${id}-comentarios`}
            rows={4}
            maxLength={2000}
            value={comentarios}
            onChange={(e) => setComentarios(e.target.value)}
            placeholder="Ej.: El juzgado fijó la audiencia para el 12 de noviembre a las 9:00 a. m. Te llamaremos antes para prepararla."
            className={cx(CAMPO, "min-h-28 resize-y py-2.5 leading-relaxed")}
          />
          {error && <p role="alert" className="mt-3 text-[13px] text-bad">{error}</p>}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={cerrar}>Cancelar</Button>
            <Button type="submit" loading={enviando} disabled={clientes?.length === 0} icon={<Send size={16} />}>Enviar aviso</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** Crear una tarea del proceso desde un folio, con la calculadora de términos a mano. */
export function TareaFolioModal({
  procesoId,
  folio,
  onClose,
  onHecho,
}: {
  procesoId: number;
  folio: FolioAccionable | null;
  onClose: () => void;
  onHecho: (numero: number) => void;
}) {
  const id = useId();
  const { toast } = useToast();
  const [titulo, setTitulo] = useState("");
  const [fecha, setFecha] = useState("");
  const [prioridad, setPrioridad] = useState<NonNullable<Prioridad>>("MEDIA");
  const [descripcion, setDescripcion] = useState("");
  const [conCalculadora, setConCalculadora] = useState(false);
  const [explicacion, setExplicacion] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [sugerida, setSugerida] = useState<Esquemas["Plantilla"] | null>(null);
  const [conPlantilla, setConPlantilla] = useState(false);
  const textoFolio = folio ? [folio.titulo, folio.detalle].filter(Boolean).join(" ") : "";

  const buscarPlantilla = useCallback(async () => {
    setSugerida(null);
    if (!textoFolio) return;
    const { data } = await api.GET("/api/v2/tareas/plantillas", { params: { query: { para: textoFolio.slice(0, 2000) } } });
    setSugerida(data?.items.find((p) => p.coincide) ?? null);
  }, [textoFolio]);
  useLoadEffect(buscarPlantilla);

  async function plantillaAplicada() {
    if (!folio) return;
    // Las tareas ya quedaron creadas: el folio pasa a revisado como con «Crear tarea».
    await api.POST("/api/v2/procesos/{proceso_id}/folios/revisar", { params: { path: { proceso_id: procesoId } }, body: { numeros: [folio.numero] } });
    onHecho(folio.numero);
    cerrar();
  }

  function cerrar() {
    setConPlantilla(false);
    setTitulo("");
    setFecha("");
    setPrioridad("MEDIA");
    setDescripcion("");
    setConCalculadora(false);
    setExplicacion(null);
    setErrores({});
    onClose();
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    if (!folio) return;
    if (!titulo.trim()) {
      setErrores({ titulo: "Escribe qué hay que hacer." });
      return;
    }
    setGuardando(true);
    setErrores({});
    const { data, error: fallo } = await api.POST("/api/v2/procesos/{proceso_id}/folios/{numero}/tarea", {
      params: { path: { proceso_id: procesoId, numero: folio.numero } },
      body: {
        titulo: titulo.trim(),
        fecha_limite: fecha || null,
        prioridad,
        descripcion: [descripcion.trim(), explicacion].filter(Boolean).join("\n\n") || null,
      },
    });
    setGuardando(false);
    if (fallo || !data) {
      setErrores({ ...(fallo?.campos ?? {}), general: mensajeDeError(fallo) });
      return;
    }
    toast({ title: "Tarea creada", description: data.fecha_limite ? `Vence el ${diaCorto(fecha)}.` : "Sin fecha límite.", tone: "success" });
    onHecho(folio.numero);
    cerrar();
  }

  const notificacion = folio ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(folio.fecha)) : undefined;

  return (
    <>
    <Modal open={folio !== null && !conPlantilla} onClose={cerrar} title="Crear tarea" description="Queda en el proceso y el folio pasa a revisado.">
      {folio && (
        <form onSubmit={guardar} noValidate>
          <ReferenciaFolio folio={folio} />
          {sugerida && (
            <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3.5 py-3 shadow-[0_0_0_1px_var(--gold)]">
              <LayoutTemplate aria-hidden="true" size={18} className="shrink-0 text-gold-ink" />
              <p className="min-w-0 flex-1 text-[13.5px] text-ink-2">
                <span className="font-semibold text-ink">Plantilla «{sugerida.nombre}»</span>: crea {sugerida.pasos.length === 1 ? "1 tarea" : `${sugerida.pasos.length} tareas`} con sus fechas.
              </p>
              <Button type="button" size="sm" variant="secondary" onClick={() => setConPlantilla(true)}>Usar la plantilla</Button>
            </div>
          )}
          <label htmlFor={`${id}-titulo`} className={ETIQUETA}>Qué hay que hacer</label>
          <input
            id={`${id}-titulo`}
            value={titulo}
            maxLength={255}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder={folio.tipo === "actuacion" ? "Ej.: Descorrer el traslado de excepciones" : "Ej.: Revisar el documento con el cliente"}
            aria-invalid={errores.titulo ? true : undefined}
            aria-describedby={errores.titulo ? `${id}-titulo-error` : undefined}
            className={CAMPO}
          />
          {errores.titulo && <p id={`${id}-titulo-error`} className="mt-1.5 text-[13px] text-bad">{errores.titulo}</p>}

          <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <label htmlFor={`${id}-fecha`} className={ETIQUETA}>Fecha límite</label>
              <input
                id={`${id}-fecha`}
                type="date"
                min={hoyISO()}
                value={fecha}
                onChange={(e) => { setFecha(e.target.value); setExplicacion(null); }}
                aria-invalid={errores.fecha_limite ? true : undefined}
                className={CAMPO}
              />
              {errores.fecha_limite && <p className="mt-1.5 text-[13px] text-bad">{errores.fecha_limite}</p>}
              {explicacion && <p className="mt-1.5 text-[12.5px] text-ink-3">{explicacion}</p>}
            </div>
            <fieldset>
              <legend className={ETIQUETA}>Prioridad</legend>
              <div className="flex gap-1 rounded-lg bg-manila p-0.5">
                {PRIORIDADES.map((p) => (
                  <label key={p.id} className={cx("inline-flex min-h-10 flex-1 cursor-pointer items-center justify-center rounded-md px-2.5 text-[13px] font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-navy/30 sm:min-h-9", prioridad === p.id ? "bg-sheet text-ink shadow-[0_1px_2px_rgb(24_32_58/0.12)]" : "text-ink-2 hover:text-ink")}>
                    <input type="radio" name={`${id}-prioridad`} value={p.id} checked={prioridad === p.id} onChange={() => setPrioridad(p.id)} className="sr-only" />
                    {p.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="mt-4 rounded-xl shadow-[0_0_0_1px_var(--line)]">
            <button
              type="button"
              aria-expanded={conCalculadora}
              onClick={() => setConCalculadora((v) => !v)}
              className="flex min-h-11 w-full items-center gap-2 px-3.5 text-left text-[14px] font-semibold text-ink"
            >
              <Calculator aria-hidden="true" size={16} className="text-ink-3" />
              Calcular la fecha por un término judicial
              <ChevronDown aria-hidden="true" size={16} className={cx("ml-auto text-ink-3 transition-transform", conCalculadora && "rotate-180")} />
            </button>
            {conCalculadora && (
              <div className="border-t border-line px-3.5 pb-3.5 pt-3">
                <CalculadoraTermino
                  compacta
                  notificacionInicial={notificacion}
                  onUsar={(vence, termino) => {
                    setFecha(vence);
                    setExplicacion(`Término de ${termino.dias} ${termino.dias === 1 ? "día hábil" : "días hábiles"} notificado el ${diaCorto(termino.notificacion)}.`);
                    setConCalculadora(false);
                  }}
                />
              </div>
            )}
          </div>

          <label htmlFor={`${id}-descripcion`} className={cx(ETIQUETA, "mt-4")}>Notas <span className="font-normal text-ink-3">(opcional)</span></label>
          <textarea id={`${id}-descripcion`} rows={2} maxLength={2000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={cx(CAMPO, "resize-y py-2.5")} />

          {errores.general && !errores.titulo && !errores.fecha_limite && <p role="alert" className="mt-3 text-[13px] text-bad">{errores.general}</p>}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={cerrar}>Cancelar</Button>
            <Button type="submit" loading={guardando} icon={<ListPlus size={16} />}>Crear tarea</Button>
          </div>
        </form>
      )}
    </Modal>
    <AplicarPlantillaModal
      open={folio !== null && conPlantilla}
      onClose={() => setConPlantilla(false)}
      onCreadas={() => void plantillaAplicada()}
      procesoId={procesoId}
      notificacionInicial={notificacion}
      folio={folio?.numero}
      para={textoFolio.slice(0, 2000)}
    />
    </>
  );
}
