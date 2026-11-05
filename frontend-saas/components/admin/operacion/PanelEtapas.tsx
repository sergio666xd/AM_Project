"use client";

import { useCallback, useId, useState, type FormEvent } from "react";
import { ChevronRight, Plus, RefreshCw, RotateCcw } from "lucide-react";

import { Campo } from "@/components/clientes/ClienteFormModal";
import { erroresDeEtapas, filaDeEtapa, ListaEtapas, nuevaFilaEtapa, type FilaEtapa } from "@/components/etapas/ListaEtapas";
import { CAMPO, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Drawer } from "@/components/ui/Drawer";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { RowActionsMenu } from "@/components/ui/RowActionsMenu";
import { Sheet } from "@/components/ui/Sheet";
import { Tag } from "@/components/ui/Tag";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import type { PlantillaEtapas } from "@/lib/etapas";
import { useLoadEffect } from "@/lib/useLoadEffect";

const procesosTexto = (n: number) => (n === 1 ? "1 proceso" : `${n} procesos`);

function EditorPlantilla({ plantilla, abierto, onCerrar, onGuardada }: {
  plantilla: PlantillaEtapas | null;
  abierto: boolean;
  onCerrar: () => void;
  onGuardada: (nueva: boolean) => void;
}) {
  const id = useId();
  const [nombre, setNombre] = useState(plantilla?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(plantilla?.descripcion ?? "");
  const [predeterminada, setPredeterminada] = useState(plantilla?.predeterminada ?? false);
  const [activa, setActiva] = useState(plantilla?.activa ?? true);
  const [filas, setFilas] = useState<FilaEtapa[]>(() =>
    plantilla?.etapas.length ? plantilla.etapas.map(filaDeEtapa) : [nuevaFilaEtapa(), nuevaFilaEtapa()],
  );
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  const enUso = filas.filter((f) => f.activa);
  const guardadas = filas.filter((f) => !f.activa);
  const eraPredeterminada = plantilla?.predeterminada ?? false;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const faltan = { ...(nombre.trim() ? {} : { nombre: "Escriba el nombre de la plantilla." }), ...erroresDeEtapas(filas) };
    if (Object.keys(faltan).length) {
      setErrores(faltan);
      return;
    }
    setGuardando(true);
    setErrores({});
    const body: Esquemas["DatosPlantillaEtapas"] = {
      nombre, descripcion: descripcion.trim() || null, predeterminada, activa: predeterminada || activa,
      etapas: [...enUso, ...guardadas.filter((f) => f.id !== null)].map((f) => ({
        id: f.id, nombre: f.nombre, explicacion: f.explicacion.trim() || null, activa: f.activa,
      })),
    };
    const { data, error } = plantilla
      ? await api.PUT("/api/v2/plantillas-etapas/{plantilla_id}", { params: { path: { plantilla_id: plantilla.id } }, body })
      : await api.POST("/api/v2/plantillas-etapas", { body });
    setGuardando(false);
    if (error || !data) {
      const campos = error?.campos ?? {};
      setErrores({ ...campos, general: campos.nombre || campos.etapas ? "" : mensajeDeError(error) });
      return;
    }
    onGuardada(!plantilla);
  }

  return (
    <Drawer
      open={abierto}
      onClose={onCerrar}
      title={plantilla ? `Editar «${plantilla.nombre}»` : "Nueva plantilla de etapas"}
      subtitle={plantilla?.procesos ? `La usan ${procesosTexto(plantilla.procesos)}. Los cambios se ven de inmediato en sus expedientes.` : undefined}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" form={`${id}-form`} loading={guardando}>{plantilla ? "Guardar" : "Crear plantilla"}</Button>
        </div>
      }
    >
      <form id={`${id}-form`} onSubmit={guardar} noValidate className="space-y-5">
        <Campo id={`${id}-n`} etiqueta="Nombre" error={errores.nombre} ayuda="Por ejemplo «Proceso ejecutivo» o «Sucesión notarial».">
          <input id={`${id}-n`} value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} className={CAMPO} autoFocus={!plantilla} />
        </Campo>
        <Campo id={`${id}-d`} etiqueta="Para qué procesos es" opcional error={errores.descripcion}>
          <input id={`${id}-d`} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={300} className={CAMPO} />
        </Campo>

        <fieldset className="min-w-0">
          <legend className={ETIQUETA}>Etapas, en orden</legend>
          <p className="-mt-0.5 mb-3 text-[13px] text-ink-3">La explicación la lee el cliente en su portal cuando su proceso está en esa etapa. Escríbala de usted y sin términos técnicos.</p>
          <ListaEtapas
            idBase={id}
            filas={filas}
            setFilas={setFilas}
            errores={errores}
            detalle={(f) => (f.procesos > 0 ? `Hoy hay ${procesosTexto(f.procesos)} en esta etapa.` : null)}
          />
        </fieldset>

        {guardadas.length > 0 && (
          <div>
            <p className={ETIQUETA}>Ya no se usan</p>
            <p className="-mt-0.5 mb-2 text-[13px] text-ink-3">No aparecen al elegir etapa. Los procesos que ya estaban en ellas las conservan en su historial.</p>
            <ul className="divide-y divide-line rounded-lg shadow-[inset_0_0_0_1px_var(--line)]">
              {guardadas.map((f) => (
                <li key={f.clave} className="flex items-center gap-3 py-1 pl-3 pr-1">
                  <span className="min-w-0 flex-1 text-[14px] text-ink-2">
                    {f.nombre || "Sin nombre"}
                    {f.procesos > 0 && <span className="text-ink-3"> · {procesosTexto(f.procesos)} en ella</span>}
                  </span>
                  <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={() => setFilas((fs) => [...fs.filter((x) => x.activa), { ...f, activa: true }, ...fs.filter((x) => !x.activa && x.clave !== f.clave)])}>
                    Volver a usar
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-1 border-t border-line pt-4">
          <label className="flex min-h-11 items-center gap-2.5 text-[14px] text-ink">
            <input type="checkbox" checked={predeterminada} disabled={eraPredeterminada} onChange={(e) => setPredeterminada(e.target.checked)} className="size-4 accent-[var(--navy)]" />
            La toman los procesos nuevos (predeterminada)
          </label>
          {eraPredeterminada && <p className="ml-6.5 text-[13px] text-ink-3">Para cambiarla, marque otra plantilla como predeterminada.</p>}
          {!predeterminada && (
            <label className="flex min-h-11 items-center gap-2.5 text-[14px] text-ink">
              <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} className="size-4 accent-[var(--navy)]" />
              Se puede elegir en los expedientes
            </label>
          )}
        </div>
        {errores.general && <p role="alert" className="text-[13px] text-bad">{errores.general}</p>}
      </form>
    </Drawer>
  );
}

/** Plantillas de etapas: por qué etapas pasa cada tipo de proceso. */
export function PanelEtapas() {
  const { toast } = useToast();
  const [items, setItems] = useState<PlantillaEtapas[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<PlantillaEtapas | "nueva" | null>(null);
  const [borrando, setBorrando] = useState<PlantillaEtapas | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/plantillas-etapas", { params: { query: { todas: true } } });
    if (fallo || !data) setError(mensajeDeError(fallo));
    else setItems(data.items);
  }, []);
  useLoadEffect(cargar);

  function guardada(nueva: boolean) {
    setEditando(null);
    toast({ title: nueva ? "Plantilla creada" : "Plantilla guardada", tone: "success" });
    // La predeterminada puede haber pasado de otra plantilla a esta: se recarga la lista.
    void cargar();
  }

  async function predeterminar(p: PlantillaEtapas) {
    const { error: fallo } = await api.PUT("/api/v2/plantillas-etapas/{plantilla_id}", {
      params: { path: { plantilla_id: p.id } },
      body: {
        nombre: p.nombre, descripcion: p.descripcion, activa: true, predeterminada: true,
        etapas: p.etapas.map((e) => ({ id: e.id, nombre: e.nombre, explicacion: e.explicacion, activa: e.activa })),
      },
    });
    if (fallo) {
      toast({ title: "No se pudo cambiar", description: mensajeDeError(fallo), tone: "error" });
      return;
    }
    toast({ title: `«${p.nombre}» es ahora la predeterminada`, tone: "success" });
    void cargar();
  }

  async function borrar() {
    if (!borrando) return;
    const { error: fallo } = await api.DELETE("/api/v2/plantillas-etapas/{plantilla_id}", { params: { path: { plantilla_id: borrando.id } } });
    if (fallo) throw new Error(mensajeDeError(fallo));
    setItems((xs) => (xs ?? []).filter((x) => x.id !== borrando.id));
    toast({ title: "Plantilla borrada", tone: "success" });
    setBorrando(null);
  }

  return (
    <div>
      <PageHeader
        title="Etapas de los procesos"
        description="Las etapas por las que pasa cada tipo de proceso. El cliente ve en su portal la línea de su proceso y qué significa la etapa en que va. Cada expediente puede ajustar además sus propias etapas sin cambiar la plantilla."
        action={<Button icon={<Plus size={16} />} onClick={() => setEditando("nueva")}>Nueva plantilla</Button>}
      />
      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-bad-soft px-4 py-3 text-bad">
          <p className="flex-1 text-[14px]">{error}</p>
          <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
        </div>
      ) : !items ? (
        <LoadingState label="Cargando las plantillas" rows={3} />
      ) : (
        <div className="space-y-4">
          {items.map((p) => {
            const activas = p.etapas.filter((e) => e.activa);
            return (
              <Sheet key={p.id} aria-label={p.nombre} className={cx(!p.activa && "opacity-80")}>
                <div className="flex items-start gap-3 px-4 pb-3 pt-4 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[16px] font-semibold text-ink">{p.nombre}</h2>
                      {p.predeterminada && <Tag tone="navy">Predeterminada</Tag>}
                      {!p.activa && <Tag tone="neutral">No se ofrece</Tag>}
                    </div>
                    <p className="mt-0.5 text-[13.5px] text-ink-2">
                      {p.descripcion ? `${p.descripcion} · ` : ""}{p.procesos ? `La usan ${procesosTexto(p.procesos)}` : "Ningún proceso la usa todavía"}
                    </p>
                  </div>
                  <RowActionsMenu
                    row={p}
                    label={`Acciones para «${p.nombre}»`}
                    actions={[
                      { label: "Editar", onSelect: () => setEditando(p) },
                      ...(!p.predeterminada && p.activa ? [{ label: "Hacerla predeterminada", onSelect: () => void predeterminar(p) }] : []),
                      ...(!p.predeterminada && p.procesos === 0 ? [{ label: "Borrar", onSelect: () => setBorrando(p), tone: "danger" as const, separated: true }] : []),
                    ]}
                  />
                </div>
                <ol className="flex flex-wrap gap-x-1.5 gap-y-2 border-t border-line px-4 py-3 text-[13.5px] sm:px-5">
                  {activas.map((e, i) => (
                    <li key={e.id} className="flex items-center gap-1.5 text-ink">
                      <span className="tabular-nums text-ink-3">{i + 1}.</span>
                      <span title={e.explicacion ?? undefined}>{e.nombre}</span>
                      {i < activas.length - 1 && <ChevronRight aria-hidden="true" size={13} strokeWidth={2} className="text-ink-3" />}
                    </li>
                  ))}
                </ol>
              </Sheet>
            );
          })}
        </div>
      )}

      {editando && (
        <EditorPlantilla
          key={editando === "nueva" ? "nueva" : editando.id}
          abierto
          plantilla={editando === "nueva" ? null : editando}
          onCerrar={() => setEditando(null)}
          onGuardada={guardada}
        />
      )}
      <ConfirmDialog
        open={borrando !== null}
        onClose={() => setBorrando(null)}
        onConfirm={borrar}
        title="¿Borrar esta plantilla?"
        description={borrando ? `«${borrando.nombre}» no la usa ningún proceso. Se borra con sus etapas y no se puede deshacer.` : ""}
        confirmLabel="Borrar"
        destructive
      />
    </div>
  );
}
