"use client";

import { useCallback, useId, useState, type FormEvent } from "react";
import { Plus, RefreshCw, Search } from "lucide-react";

import { Campo } from "@/components/clientes/ClienteFormModal";
import { CAMPO } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { LoadingState } from "@/components/ui/LoadingState";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { RowActionsMenu } from "@/components/ui/RowActionsMenu";
import { Sheet } from "@/components/ui/Sheet";
import { Tag } from "@/components/ui/Tag";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { fechaRelativa } from "@/lib/fechas";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Termino = Esquemas["TerminoDelGlosario"];

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function FormularioTermino({ termino, abierto, onCerrar, onGuardado }: {
  termino: Termino | null;
  abierto: boolean;
  onCerrar: () => void;
  onGuardado: (t: Termino, nuevo: boolean) => void;
}) {
  const id = useId();
  const [patron, setPatron] = useState(termino?.patron ?? "");
  const [explicacion, setExplicacion] = useState(termino?.explicacion ?? "");
  const [activo, setActivo] = useState(termino?.activo ?? true);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setErrores({});
    const body = { patron, explicacion, activo };
    const { data, error } = termino
      ? await api.PUT("/api/v2/glosario/{termino_id}", { params: { path: { termino_id: termino.id } }, body })
      : await api.POST("/api/v2/glosario", { body });
    setGuardando(false);
    if (error || !data) {
      const campos = error?.campos ?? {};
      setErrores({ ...campos, general: Object.keys(campos).length ? "" : mensajeDeError(error) });
      return;
    }
    onGuardado(data, !termino);
  }

  return (
    <Modal open={abierto} onClose={onCerrar} title={termino ? "Corregir el término" : "Agregar un término"}
      description="Cuando una actuación del juzgado contiene este texto, el cliente lee la explicación en lugar del texto del juzgado.">
      <form onSubmit={guardar} noValidate className="space-y-4">
        <Campo id={`${id}-p`} etiqueta="Texto del juzgado" error={errores.patron} ayuda="Un fragmento que aparece en la actuación, por ejemplo «auto admite demanda». No importan tildes ni mayúsculas.">
          <input id={`${id}-p`} value={patron} onChange={(e) => setPatron(e.target.value)} maxLength={160} className={cx(CAMPO, "font-mono")} autoFocus />
        </Campo>
        <Campo id={`${id}-e`} etiqueta="Lo que lee el cliente" error={errores.explicacion} ayuda="Una o dos frases claras, tratando al cliente de usted.">
          <textarea id={`${id}-e`} rows={4} value={explicacion} onChange={(e) => setExplicacion(e.target.value)} maxLength={600} className={cx(CAMPO, "py-2.5")} />
        </Campo>
        <label className="flex min-h-11 items-center gap-2.5 text-[14px] text-ink">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="size-4 accent-[var(--navy)]" />
          En uso: los clientes ven esta explicación
        </label>
        {errores.general && <p role="alert" className="text-[13px] text-bad">{errores.general}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" loading={guardando}>{termino ? "Guardar" : "Agregar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

export function PanelGlosario() {
  const { toast } = useToast();
  const [items, setItems] = useState<Termino[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [editando, setEditando] = useState<Termino | "nuevo" | null>(null);
  const [quitando, setQuitando] = useState<Termino | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/glosario");
    if (fallo || !data) setError(mensajeDeError(fallo));
    else setItems(data.items);
  }, []);
  useLoadEffect(cargar);

  function guardado(t: Termino, nuevo: boolean) {
    setItems((xs) => (nuevo ? [t, ...(xs ?? [])] : (xs ?? []).map((x) => (x.id === t.id ? t : x))));
    setEditando(null);
    toast({ title: nuevo ? "Término agregado" : "Término guardado", tone: "success" });
  }

  async function quitar() {
    if (!quitando) return;
    const { error: fallo } = await api.DELETE("/api/v2/glosario/{termino_id}", { params: { path: { termino_id: quitando.id } } });
    if (fallo) throw new Error(mensajeDeError(fallo));
    setItems((xs) => (xs ?? []).filter((x) => x.id !== quitando.id));
    toast({ title: "Término quitado", tone: "success" });
    setQuitando(null);
  }

  const termino = sinTildes(q.trim());
  const visibles = (items ?? []).filter((t) => !termino || sinTildes(`${t.patron} ${t.explicacion}`).includes(termino));

  return (
    <div>
      <PageHeader
        title="Glosario"
        description="Cómo se le explica al cliente cada tipo de actuación judicial. Si la abogada escribe su propia explicación al avisar, esa tiene prioridad."
        action={<Button icon={<Plus size={16} />} onClick={() => setEditando("nuevo")}>Agregar un término</Button>}
      />
      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-bad-soft px-4 py-3 text-bad">
          <p className="flex-1 text-[14px]">{error}</p>
          <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
        </div>
      ) : !items ? (
        <LoadingState label="Cargando el glosario" rows={6} />
      ) : (
        <>
          <label className="relative mb-4 block max-w-md">
            <span className="sr-only">Buscar en el glosario</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar un texto o una explicación" className={cx(CAMPO, "h-10 pl-9 sm:min-h-10")} />
          </label>
          <Sheet aria-label="Términos del glosario">
            {visibles.length ? (
              <ul className="divide-y divide-line">
                {visibles.map((t) => (
                  <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono text-[13px] text-ink-2">{t.patron}</p>
                        {!t.activo && <Tag tone="neutral">Sin usar</Tag>}
                      </div>
                      <p className={cx("mt-1 text-[14.5px] [text-wrap:pretty]", t.activo ? "text-ink" : "text-ink-2")}>{t.explicacion}</p>
                      {t.actualizado_por && (
                        <p className="mt-1 text-[12.5px] text-ink-3">Corregido {fechaRelativa(t.actualizado_en)} por {t.actualizado_por}</p>
                      )}
                    </div>
                    <RowActionsMenu
                      row={t}
                      label={`Acciones para «${t.patron}»`}
                      actions={[
                        { label: "Corregir", onSelect: () => setEditando(t) },
                        { label: "Quitar del glosario", onSelect: () => setQuitando(t), tone: "danger", separated: true },
                      ]}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-[14px] text-ink-2">
                {items.length ? "Ningún término coincide con la búsqueda." : "El glosario está vacío. Agregue el primer término para que los clientes entiendan sus actuaciones."}
              </p>
            )}
          </Sheet>
          {items.length > 0 && <p className="mt-2 text-[13px] tabular-nums text-ink-2">{items.length === 1 ? "1 término" : `${items.length} términos`}</p>}
        </>
      )}

      {editando && (
        <FormularioTermino
          key={editando === "nuevo" ? "nuevo" : editando.id}
          abierto
          termino={editando === "nuevo" ? null : editando}
          onCerrar={() => setEditando(null)}
          onGuardado={guardado}
        />
      )}
      <ConfirmDialog
        open={quitando !== null}
        onClose={() => setQuitando(null)}
        onConfirm={quitar}
        title="Quitar este término"
        description={quitando ? `Las actuaciones con «${quitando.patron}» volverán a mostrarse con el texto del juzgado. Si solo quiere dejar de usarlo por un tiempo, corríjalo y desmarque «En uso».` : ""}
        confirmLabel="Quitar"
        destructive
      />
    </div>
  );
}
