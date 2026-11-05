"use client";

import { useCallback, useId, useState, type FormEvent } from "react";
import { Archive, ArchiveRestore, ListOrdered, Milestone } from "lucide-react";

import { erroresDeEtapas, filaDeEtapa, ListaEtapas, type FilaEtapa } from "@/components/etapas/ListaEtapas";
import { CAMPO, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Drawer } from "@/components/ui/Drawer";
import { Etapas } from "@/components/ui/Etapas";
import { Modal } from "@/components/ui/Modal";
import { Radicado } from "@/components/ui/Radicado";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { indiceEtapa, type PlantillaEtapas } from "@/lib/etapas";
import { fechaCorta, fechaRelativa } from "@/lib/fechas";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Proceso = Esquemas["ProcesoDetalle"];

/**
 * Cabecera del expediente: nombre, radicados, línea de etapas y archivo.
 * Avisa con `onCambio` cuando algo cambia el expediente (un cambio de etapa es un folio nuevo).
 */
export function CabeceraExpediente({ procesoId, nombre, onCambio }: { procesoId: number; nombre: string; onCambio?: () => void }) {
  const { toast } = useToast();
  const [proceso, setProceso] = useState<Proceso | null>(null);
  const [cambiandoEtapa, setCambiandoEtapa] = useState(false);
  const [ajustandoEtapas, setAjustandoEtapas] = useState(false);
  const [confirmando, setConfirmando] = useState<"archivar" | "reabrir" | null>(null);

  const cargar = useCallback(async () => {
    const { data } = await api.GET("/api/v2/procesos/{proceso_id}", { params: { path: { proceso_id: procesoId } } });
    if (data) setProceso(data);
  }, [procesoId]);
  useLoadEffect(cargar);

  async function archivar(accion: "archivar" | "reabrir") {
    const ruta = accion === "archivar" ? "/api/v2/procesos/{proceso_id}/archivar" : "/api/v2/procesos/{proceso_id}/reabrir";
    const { data, error } = await api.POST(ruta, { params: { path: { proceso_id: procesoId } } });
    if (error || !data) {
      toast({ title: accion === "archivar" ? "No se pudo archivar" : "No se pudo reabrir", description: mensajeDeError(error), tone: "error" });
      throw new Error(mensajeDeError(error));
    }
    setProceso(data);
    toast({ title: accion === "archivar" ? "Proceso archivado" : "Proceso reabierto", tone: "success" });
  }

  const actual = proceso?.etapas.at(-1);
  const archivado = Boolean(proceso?.archivado_en);

  return (
    <header className="space-y-4">
      <div className="min-w-0">
        <div className="flex min-h-9 items-center justify-between gap-3">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-gold-ink">Expediente · Proceso #{procesoId}</p>
          {proceso?.puede_administrar && (
            <Button
              variant="ghost"
              size="sm"
              className="-mr-2.5"
              icon={archivado ? <ArchiveRestore size={15} /> : <Archive size={15} />}
              onClick={() => setConfirmando(archivado ? "reabrir" : "archivar")}
            >
              {archivado ? "Reabrir" : "Archivar"}
            </Button>
          )}
        </div>
        <h1 className="font-display text-[28px] leading-tight text-balance text-ink sm:text-[34px]">{proceso?.nombre ?? nombre}</h1>
        {proceso && (proceso.radicados.length > 0 || proceso.clientes.length > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13.5px] text-ink-2">
            {proceso.radicados.map((numero) => <Radicado key={numero} numero={numero} />)}
            {proceso.clientes.length > 0 && <span>{proceso.clientes.map((c) => c.nombre).join(", ")}</span>}
          </div>
        )}
      </div>

      {archivado && proceso?.archivado_en && (
        <p className="rounded-lg bg-manila px-4 py-2.5 text-[13.5px] text-ink-2">
          Archivado el {fechaCorta(proceso.archivado_en)}. No aparece en las listas ni en Hoy; todo su expediente se conserva.
        </p>
      )}

      {proceso && (
        <section aria-label="Etapa del proceso" className="rounded-xl bg-sheet px-4 py-4 shadow-sheet sm:px-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[12.5px] font-semibold text-ink-3">Etapa actual</p>
              <p className="text-[16px] font-semibold text-ink">
                {proceso.etapa ? proceso.etapa.nombre : "Sin etapa definida"}
                {actual && <span className="ml-2 text-[13px] font-normal text-ink-3">desde {fechaRelativa(actual.fecha)}</span>}
              </p>
            </div>
            {!archivado && (
              <Button size="sm" variant="secondary" icon={<Milestone size={15} />} onClick={() => setCambiandoEtapa(true)}>
                {proceso.etapa ? "Cambiar etapa" : "Fijar etapa"}
              </Button>
            )}
          </div>
          <Etapas etapas={proceso.linea_etapas.map((e) => e.nombre)} actual={indiceEtapa(proceso.linea_etapas, proceso.etapa)} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="text-[12.5px] text-ink-3">
              {proceso.etapas_propias ? `Etapas propias de este proceso, a partir de «${proceso.plantilla.nombre}»` : `Plantilla: ${proceso.plantilla.nombre}`}
            </p>
            {!archivado && (
              <Button size="sm" variant="ghost" className="-ml-2.5 sm:ml-0 sm:-mr-2.5" icon={<ListOrdered size={15} />} onClick={() => setAjustandoEtapas(true)}>
                Ajustar etapas
              </Button>
            )}
          </div>
        </section>
      )}

      {proceso && (
        <CambiarEtapaModal
          abierto={cambiandoEtapa}
          proceso={proceso}
          onClose={() => setCambiandoEtapa(false)}
          onHecho={(detalle) => { setProceso(detalle); onCambio?.(); }}
        />
      )}
      {proceso && ajustandoEtapas && (
        <AjustarEtapasDrawer
          proceso={proceso}
          onCerrar={() => setAjustandoEtapas(false)}
          onHecho={(detalle) => { setProceso(detalle); setAjustandoEtapas(false); onCambio?.(); }}
        />
      )}
      <ConfirmDialog
        open={confirmando !== null}
        onClose={() => setConfirmando(null)}
        onConfirm={() => archivar(confirmando ?? "archivar")}
        title={confirmando === "reabrir" ? "¿Reabrir el proceso?" : "¿Archivar el proceso?"}
        description={
          confirmando === "reabrir"
            ? "Vuelve a las listas activas y a Hoy."
            : "Sale de las listas activas y de Hoy. No se borra nada y se puede reabrir en cualquier momento."
        }
        confirmLabel={confirmando === "reabrir" ? "Reabrir" : "Archivar"}
      />
    </header>
  );
}

function CambiarEtapaModal({
  abierto,
  proceso,
  onClose,
  onHecho,
}: {
  abierto: boolean;
  proceso: Proceso;
  onClose: () => void;
  onHecho: (detalle: Proceso) => void;
}) {
  const id = useId();
  const { toast } = useToast();
  const [plantillas, setPlantillas] = useState<PlantillaEtapas[] | null>(null);
  const [plantillaId, setPlantillaId] = useState<number | null>(null);
  const [etapa, setEtapa] = useState<number | null>(null);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (!abierto) return;
    const { data } = await api.GET("/api/v2/plantillas-etapas");
    if (data) setPlantillas(data.items);
  }, [abierto]);
  useLoadEffect(cargar);

  const elegidaPlantilla = plantillaId ?? proceso.plantilla.id;
  const misma = elegidaPlantilla === proceso.plantilla.id;
  const otra = plantillas?.find((p) => p.id === elegidaPlantilla);
  // En la plantilla del proceso se muestra su línea (incluye la etapa actual aunque ya no se use).
  const opciones = misma ? proceso.linea_etapas : (otra?.etapas.filter((e) => e.activa) ?? []);
  // Se pueden elegir las etapas activas; mientras cargan las plantillas, todas las de la línea.
  const activasDe = plantillas?.find((p) => p.id === elegidaPlantilla)?.etapas.filter((e) => e.activa).map((e) => e.id);
  const disponibles = new Set(activasDe ?? opciones.map((e) => e.id));
  const indiceActual = misma ? indiceEtapa(opciones, proceso.etapa) : -1;
  const sugerida = opciones.slice(indiceActual + 1).find((e) => disponibles.has(e.id))?.id ?? null;
  const elegida = etapa ?? sugerida;
  const nombreElegida = opciones.find((e) => e.id === elegida)?.nombre;

  function cerrar() {
    setEtapa(null);
    setPlantillaId(null);
    setNota("");
    setError(null);
    onClose();
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    if (!elegida) return;
    setGuardando(true);
    setError(null);
    const { data, error: fallo } = await api.PATCH("/api/v2/procesos/{proceso_id}/etapa", {
      params: { path: { proceso_id: proceso.id } },
      body: { etapa_id: elegida, nota: nota.trim() || null },
    });
    setGuardando(false);
    if (fallo || !data) {
      setError(mensajeDeError(fallo));
      return;
    }
    toast({ title: `Etapa: ${data.etapa?.nombre ?? nombreElegida}`, description: "Quedó en el historial y en los folios del expediente.", tone: "success" });
    onHecho(data);
    cerrar();
  }

  const activas = plantillas?.filter((p) => p.activa) ?? [];

  return (
    <Modal open={abierto} onClose={cerrar} title="Etapa del proceso" description="El cliente ve la etapa en su portal; la nota es solo para la firma.">
      <form onSubmit={guardar} noValidate>
        {activas.length > (proceso.etapas_propias ? 0 : 1) && (
          <div className="mb-4">
            <label htmlFor={`${id}-plantilla`} className={ETIQUETA}>Plantilla de etapas</label>
            <select
              id={`${id}-plantilla`}
              value={elegidaPlantilla}
              onChange={(e) => { setPlantillaId(Number(e.target.value)); setEtapa(null); }}
              className={CAMPO}
            >
              {proceso.etapas_propias
                ? <option value={proceso.plantilla.id}>Etapas propias de este proceso</option>
                : !activas.some((p) => p.id === proceso.plantilla.id) && <option value={proceso.plantilla.id}>{proceso.plantilla.nombre}</option>}
              {activas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            {!misma && (
              <p className="mt-1.5 text-[13px] text-ink-2">
                {proceso.etapas_propias
                  ? "Al guardar, las etapas propias de este proceso se reemplazan por las de esta plantilla, también en el portal del cliente. El historial se conserva."
                  : "Al guardar, el proceso pasa a seguir esta plantilla y su línea de etapas cambia también en el portal del cliente."}
              </p>
            )}
          </div>
        )}
        <fieldset>
          <legend className={ETIQUETA}>Nueva etapa</legend>
          {plantillas === null && !misma ? (
            <p className="text-[14px] text-ink-3">Cargando las etapas…</p>
          ) : (
            <div className="grid gap-1.5">
              {opciones.map((e, i) => {
                const esActual = proceso.etapa?.id === e.id;
                const bloqueada = esActual || !disponibles.has(e.id);
                return (
                  <label
                    key={e.id}
                    className={cx(
                      "flex min-h-11 items-center gap-3 rounded-lg px-3 text-[14.5px] shadow-[0_0_0_1px_var(--line)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-navy/30",
                      bloqueada ? "cursor-default text-ink-3" : "cursor-pointer text-ink hover:bg-manila",
                      elegida === e.id && !bloqueada && "bg-navy-soft shadow-[0_0_0_1.5px_var(--navy)]",
                    )}
                  >
                    <input type="radio" name={`${id}-etapa`} value={e.id} disabled={bloqueada} checked={elegida === e.id} onChange={() => setEtapa(e.id)} className="size-4 accent-[var(--navy)]" />
                    <span className="w-5 text-[12px] tabular-nums text-ink-3">{i + 1}.</span>
                    <span className="font-semibold">{e.nombre}</span>
                    {esActual ? <span className="ml-auto text-[12.5px]">Etapa actual</span> : bloqueada && <span className="ml-auto text-[12.5px]">Ya no se usa</span>}
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
        <label htmlFor={`${id}-nota`} className={cx(ETIQUETA, "mt-4")}>Nota interna <span className="font-normal text-ink-3">(opcional)</span></label>
        <textarea id={`${id}-nota`} rows={2} maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: Auto admisorio del 27 de octubre." className={cx(CAMPO, "resize-y py-2.5")} />

        {proceso.etapas.length > 0 && (
          <details className="mt-4 text-[13.5px]">
            <summary className="cursor-pointer font-semibold text-ink-2">Historial ({proceso.etapas.length})</summary>
            <ol className="mt-2 space-y-1.5 border-l-2 border-line pl-3">
              {[...proceso.etapas].reverse().map((c) => (
                <li key={`${c.etapa.id}-${c.fecha}`} className="text-ink-2">
                  <span className="font-semibold text-ink">{c.etapa.nombre}</span> · {fechaRelativa(c.fecha)}
                  {c.autor && ` · ${c.autor}`}
                  {c.nota && <span className="block text-ink-3">{c.nota}</span>}
                </li>
              ))}
            </ol>
          </details>
        )}

        {error && <p role="alert" className="mt-3 text-[13px] text-bad">{error}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={cerrar}>Cancelar</Button>
          <Button type="submit" loading={guardando} disabled={!elegida}>Guardar etapa</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Ajusta las etapas de un solo proceso: la plantilla y los demás procesos no cambian. */
function AjustarEtapasDrawer({ proceso, onCerrar, onHecho }: {
  proceso: Proceso;
  onCerrar: () => void;
  onHecho: (detalle: Proceso) => void;
}) {
  const id = useId();
  const { toast } = useToast();
  const [filas, setFilas] = useState<FilaEtapa[]>(() => proceso.linea_etapas.map(filaDeEtapa));
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const esActual = (f: FilaEtapa) => f.id !== null && f.id === proceso.etapa?.id;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const faltan = erroresDeEtapas(filas);
    if (Object.keys(faltan).length) {
      setErrores(faltan);
      return;
    }
    setGuardando(true);
    setErrores({});
    const { data, error } = await api.PUT("/api/v2/procesos/{proceso_id}/etapas", {
      params: { path: { proceso_id: proceso.id } },
      body: {
        etapas: filas.filter((f) => f.activa).map((f) => ({ id: f.id, nombre: f.nombre, explicacion: f.explicacion.trim() || null, activa: true })),
      },
    });
    setGuardando(false);
    if (error || !data) {
      const campos = error?.campos ?? {};
      setErrores({ ...campos, general: campos.etapas ? "" : mensajeDeError(error) });
      return;
    }
    toast({ title: "Etapas guardadas", description: "Solo cambian en este proceso.", tone: "success" });
    onHecho(data);
  }

  return (
    <Drawer
      open
      onClose={onCerrar}
      title="Etapas de este proceso"
      subtitle={
        proceso.etapas_propias
          ? "Estas etapas son solo de este proceso."
          : `Hoy sigue la plantilla «${proceso.plantilla.nombre}». Lo que cambie aquí aplica solo a este proceso; la plantilla y los demás procesos siguen igual.`
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" form={`${id}-form`} loading={guardando}>Guardar etapas</Button>
        </div>
      }
    >
      <form id={`${id}-form`} onSubmit={guardar} noValidate className="space-y-4">
        <fieldset className="min-w-0">
          <legend className={ETIQUETA}>Etapas, en orden</legend>
          <p className="-mt-0.5 mb-3 text-[13px] text-ink-3">El cliente ve esta línea en su portal y lee la explicación de la etapa en que va su proceso.</p>
          <ListaEtapas
            idBase={id}
            filas={filas}
            setFilas={setFilas}
            errores={errores}
            fija={(f) => (esActual(f) ? "es la etapa actual" : null)}
            detalle={(f) => (esActual(f) ? "Etapa actual. Para quitarla, cambie primero el proceso a otra etapa." : null)}
          />
        </fieldset>
        {filas.some((f) => !f.activa) && (
          <p className="text-[13px] text-ink-2">Las etapas que quite dejan de aparecer en la línea; si el proceso ya pasó por ellas, siguen en su historial.</p>
        )}
        {errores.general && <p role="alert" className="text-[13px] text-bad">{errores.general}</p>}
      </form>
    </Drawer>
  );
}
