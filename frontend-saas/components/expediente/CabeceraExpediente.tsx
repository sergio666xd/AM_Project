"use client";

import { useCallback, useId, useState, type FormEvent } from "react";
import { Archive, ArchiveRestore, Milestone } from "lucide-react";

import { CAMPO, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Etapas } from "@/components/ui/Etapas";
import { Modal } from "@/components/ui/Modal";
import { Radicado } from "@/components/ui/Radicado";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { ETAPAS, indiceEtapa, nombreEtapa, type Etapa } from "@/lib/etapas";
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
                {proceso.etapa ? nombreEtapa(proceso.etapa) : "Sin etapa definida"}
                {actual && <span className="ml-2 text-[13px] font-normal text-ink-3">desde {fechaRelativa(actual.fecha)}</span>}
              </p>
            </div>
            {!archivado && (
              <Button size="sm" variant="secondary" icon={<Milestone size={15} />} onClick={() => setCambiandoEtapa(true)}>
                {proceso.etapa ? "Cambiar etapa" : "Fijar etapa"}
              </Button>
            )}
          </div>
          <Etapas etapas={ETAPAS.map((e) => e.nombre)} actual={indiceEtapa(proceso.etapa)} />
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
      <ConfirmDialog
        open={confirmando !== null}
        onClose={() => setConfirmando(null)}
        onConfirm={() => archivar(confirmando ?? "archivar")}
        title={confirmando === "reabrir" ? "¿Reabrir el proceso?" : "¿Archivar el proceso?"}
        description={
          confirmando === "reabrir"
            ? "Vuelve a las listas activas y a Hoy."
            : "Sale de las listas activas y de Hoy. No se borra nada y puedes reabrirlo cuando quieras."
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
  const siguiente = ETAPAS[indiceEtapa(proceso.etapa) + 1]?.id ?? null;
  const [etapa, setEtapa] = useState<Etapa | null>(null);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const elegida = etapa ?? siguiente;

  function cerrar() {
    setEtapa(null);
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
      body: { etapa: elegida, nota: nota.trim() || null },
    });
    setGuardando(false);
    if (fallo || !data) {
      setError(mensajeDeError(fallo));
      return;
    }
    toast({ title: `Etapa: ${nombreEtapa(elegida)}`, description: "Quedó en el historial y en los folios del expediente.", tone: "success" });
    onHecho(data);
    cerrar();
  }

  return (
    <Modal open={abierto} onClose={cerrar} title="Etapa del proceso" description="El cliente ve la etapa en su portal; la nota es solo para la firma.">
      <form onSubmit={guardar} noValidate>
        <fieldset>
          <legend className={ETIQUETA}>Nueva etapa</legend>
          <div className="grid gap-1.5">
            {ETAPAS.map((e, i) => {
              const esActual = proceso.etapa === e.id;
              return (
                <label
                  key={e.id}
                  className={cx(
                    "flex min-h-11 items-center gap-3 rounded-lg px-3 text-[14.5px] shadow-[0_0_0_1px_var(--line)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-navy/30",
                    esActual ? "cursor-default text-ink-3" : "cursor-pointer text-ink hover:bg-manila",
                    elegida === e.id && !esActual && "bg-navy-soft shadow-[0_0_0_1.5px_var(--navy)]",
                  )}
                >
                  <input type="radio" name={`${id}-etapa`} value={e.id} disabled={esActual} checked={elegida === e.id} onChange={() => setEtapa(e.id)} className="size-4 accent-[var(--navy)]" />
                  <span className="w-5 text-[12px] tabular-nums text-ink-3">{i + 1}.</span>
                  <span className="font-semibold">{e.nombre}</span>
                  {esActual && <span className="ml-auto text-[12.5px]">Etapa actual</span>}
                </label>
              );
            })}
          </div>
        </fieldset>
        <label htmlFor={`${id}-nota`} className={cx(ETIQUETA, "mt-4")}>Nota interna <span className="font-normal text-ink-3">(opcional)</span></label>
        <textarea id={`${id}-nota`} rows={2} maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: Auto admisorio del 27 de octubre." className={cx(CAMPO, "resize-y py-2.5")} />

        {proceso.etapas.length > 0 && (
          <details className="mt-4 text-[13.5px]">
            <summary className="cursor-pointer font-semibold text-ink-2">Historial ({proceso.etapas.length})</summary>
            <ol className="mt-2 space-y-1.5 border-l-2 border-line pl-3">
              {[...proceso.etapas].reverse().map((c) => (
                <li key={`${c.etapa}-${c.fecha}`} className="text-ink-2">
                  <span className="font-semibold text-ink">{nombreEtapa(c.etapa)}</span> · {fechaRelativa(c.fecha)}
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
