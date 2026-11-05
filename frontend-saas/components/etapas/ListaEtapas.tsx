"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { CAMPO } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { cx } from "@/lib/cx";

/** Una etapa mientras se edita. `id` es null en las etapas nuevas; `activa` false = quitada. */
export type FilaEtapa = { clave: string; id: number | null; nombre: string; explicacion: string; activa: boolean; procesos: number };

let siguiente = 0;
export const nuevaFilaEtapa = (): FilaEtapa => ({ clave: `n${++siguiente}`, id: null, nombre: "", explicacion: "", activa: true, procesos: 0 });

export function filaDeEtapa(e: { id: number; nombre: string; explicacion?: string | null; activa?: boolean; procesos?: number }): FilaEtapa {
  return { clave: `e${e.id}`, id: e.id, nombre: e.nombre, explicacion: e.explicacion ?? "", activa: e.activa ?? true, procesos: e.procesos ?? 0 };
}

/** Primer error de una lista de etapas antes de enviarla: una sin nombre o ninguna en uso. */
export function erroresDeEtapas(filas: FilaEtapa[]): Record<string, string> {
  const enUso = filas.filter((f) => f.activa);
  const vacia = enUso.find((f) => !f.nombre.trim());
  return {
    ...(vacia ? { [vacia.clave]: "Escriba el nombre de la etapa o quítela." } : {}),
    ...(!enUso.length ? { etapas: "Deje al menos una etapa." } : {}),
  };
}

/**
 * Lista editable de etapas en orden: nombre, explicación para el cliente, subir, bajar y quitar.
 * Las etapas quitadas que ya existían quedan con `activa: false`; las nuevas se descartan.
 * `fija` devuelve por qué una etapa no se puede quitar (o null si se puede).
 */
export function ListaEtapas({ idBase, filas, setFilas, errores, fija, detalle }: {
  idBase: string;
  filas: FilaEtapa[];
  setFilas: Dispatch<SetStateAction<FilaEtapa[]>>;
  errores: Record<string, string>;
  fija?: (fila: FilaEtapa) => string | null;
  detalle?: (fila: FilaEtapa) => ReactNode;
}) {
  const enUso = filas.filter((f) => f.activa);

  function cambiar(clave: string, cambio: Partial<FilaEtapa>) {
    setFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, ...cambio } : f)));
  }
  function mover(clave: string, paso: -1 | 1) {
    setFilas((fs) => {
      const activas = fs.filter((f) => f.activa);
      const i = activas.findIndex((f) => f.clave === clave);
      const j = i + paso;
      if (j < 0 || j >= activas.length) return fs;
      [activas[i], activas[j]] = [activas[j], activas[i]];
      return [...activas, ...fs.filter((f) => !f.activa)];
    });
  }
  function quitar(fila: FilaEtapa) {
    // Una etapa que ya existía queda como «ya no se usa»; el servidor la borra si nadie la usó.
    if (fila.id === null) setFilas((fs) => fs.filter((f) => f.clave !== fila.clave));
    else cambiar(fila.clave, { activa: false });
  }

  return (
    <>
      <ol className="space-y-3">
        {enUso.map((f, i) => {
          const motivo = fija?.(f) ?? null;
          const extra = detalle?.(f);
          return (
            <li key={f.clave} className="rounded-lg bg-sheet-2 p-3 shadow-[inset_0_0_0_1px_var(--line)]">
              <div className="flex items-center gap-2">
                <span className="w-6 shrink-0 font-display text-[16px] tabular-nums text-ink-2">{i + 1}.</span>
                <label htmlFor={`${idBase}-${f.clave}-n`} className="sr-only">Nombre de la etapa {i + 1}</label>
                <input
                  id={`${idBase}-${f.clave}-n`}
                  value={f.nombre}
                  onChange={(e) => cambiar(f.clave, { nombre: e.target.value })}
                  maxLength={80}
                  placeholder="Nombre de la etapa"
                  aria-invalid={Boolean(errores[f.clave]) || undefined}
                  className={cx(CAMPO, "min-w-0 flex-1 font-semibold", errores[f.clave] && "border-bad")}
                />
                <span className="flex shrink-0">
                  <IconButton icon={ArrowUp} label={`Subir la etapa ${i + 1}`} disabled={i === 0} onClick={() => mover(f.clave, -1)} className="disabled:opacity-30" />
                  <IconButton icon={ArrowDown} label={`Bajar la etapa ${i + 1}`} disabled={i === enUso.length - 1} onClick={() => mover(f.clave, 1)} className="disabled:opacity-30" />
                  <IconButton
                    icon={Trash2}
                    label={motivo ? `No se puede quitar la etapa ${i + 1}: ${motivo}` : `Quitar la etapa ${i + 1}`}
                    disabled={Boolean(motivo)}
                    onClick={() => quitar(f)}
                    className="hover:bg-bad-soft hover:text-bad disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit"
                  />
                </span>
              </div>
              {errores[f.clave] && <p className="ml-8 mt-1.5 text-[13px] text-bad">{errores[f.clave]}</p>}
              <label htmlFor={`${idBase}-${f.clave}-e`} className="sr-only">Explicación para el cliente de la etapa {i + 1}</label>
              <textarea
                id={`${idBase}-${f.clave}-e`}
                value={f.explicacion}
                onChange={(e) => cambiar(f.clave, { explicacion: e.target.value })}
                rows={2}
                maxLength={600}
                placeholder="Qué pasa en esta etapa, en palabras sencillas"
                className={cx(CAMPO, "mt-2 h-auto py-2.5 leading-[1.5] [field-sizing:content] sm:ml-8 sm:w-[calc(100%-2rem)]")}
              />
              {extra && <p className="mt-1.5 text-[12.5px] text-ink-3 sm:ml-8">{extra}</p>}
            </li>
          );
        })}
      </ol>
      {errores.etapas && <p className="mt-2 text-[13px] text-bad">{errores.etapas}</p>}
      <Button size="sm" variant="secondary" icon={<Plus size={14} />} className="mt-3" onClick={() => setFilas((fs) => [...fs.filter((f) => f.activa), nuevaFilaEtapa(), ...fs.filter((f) => !f.activa)])}>
        Agregar etapa
      </Button>
    </>
  );
}
