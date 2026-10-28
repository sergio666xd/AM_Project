"use client";

import Link from "next/link";
import { useState, type DragEvent } from "react";
import { ArrowRight, Check, CircleDashed, Clock, RotateCcw } from "lucide-react";

import { RowActionsMenu } from "@/components/ui/RowActionsMenu";
import { Tag } from "@/components/ui/Tag";
import { cx } from "@/lib/cx";
import { fechaCorta } from "@/lib/fechas";
import { RUTA_TAREA, nombreEstado, prioridad, type EstadoTarea, type Tarea } from "@/lib/tareas";

const COLUMNAS: { estado: EstadoTarea; vacio: string }[] = [
  { estado: "PENDIENTE", vacio: "Nada pendiente." },
  { estado: "EN_CURSO", vacio: "Arrastra aquí lo que estás haciendo." },
  { estado: "COMPLETADA", vacio: "Lo que completes en los últimos 14 días aparece aquí." },
];

/**
 * Tablero por estado. Se mueve una tarea arrastrándola a otra columna o, sin
 * ratón, con su menú «Mover a…».
 */
export function TableroTareas({ tareas, onMover }: { tareas: Tarea[]; onMover: (tarea: Tarea, estado: EstadoTarea) => void }) {
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<EstadoTarea | null>(null);

  function soltar(evento: DragEvent, estado: EstadoTarea) {
    evento.preventDefault();
    const id = Number(evento.dataTransfer.getData("text/plain"));
    const tarea = tareas.find((t) => t.id === id);
    setArrastrando(null);
    setSobre(null);
    if (tarea && tarea.estado !== estado) onMover(tarea, estado);
  }

  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0">
      {COLUMNAS.map(({ estado, vacio }) => {
        const propias = tareas.filter((t) => t.estado === estado);
        return (
          <section
            key={estado}
            aria-label={`${nombreEstado(estado)}: ${propias.length}`}
            onDragOver={(e) => { e.preventDefault(); setSobre(estado); }}
            onDragLeave={() => setSobre((s) => (s === estado ? null : s))}
            onDrop={(e) => soltar(e, estado)}
            className={cx(
              "flex w-[85vw] max-w-sm shrink-0 snap-start flex-col rounded-[var(--radius-lg)] bg-manila/70 p-2.5 transition-shadow lg:w-auto lg:max-w-none",
              sobre === estado && arrastrando !== null && "shadow-[0_0_0_2px_var(--gold)]",
            )}
          >
            <h2 className="flex items-center justify-between px-1.5 pb-2.5 pt-1 text-[14px] font-semibold text-ink">
              {nombreEstado(estado)}
              <span className="rounded-full bg-sheet px-2 py-0.5 text-[12px] tabular-nums text-ink-2">{propias.length}</span>
            </h2>
            <ul className="flex min-h-24 flex-col gap-2">
              {propias.map((tarea) => (
                <li
                  key={tarea.id}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(tarea.id)); e.dataTransfer.effectAllowed = "move"; setArrastrando(tarea.id); }}
                  onDragEnd={() => { setArrastrando(null); setSobre(null); }}
                  className={cx(
                    "group relative cursor-grab rounded-lg bg-sheet p-3 shadow-[0_0_0_1px_var(--line),0_1px_2px_rgb(24_32_58/0.06)] active:cursor-grabbing",
                    tarea.vencida && "shadow-[inset_3px_0_0_var(--bad),0_0_0_1px_var(--line)]",
                    arrastrando === tarea.id && "opacity-50",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <Link href={RUTA_TAREA(tarea.id)} draggable={false} className={cx("min-w-0 flex-1 font-semibold leading-snug text-pretty text-ink after:absolute after:inset-0 hover:underline", tarea.estado === "COMPLETADA" && "text-ink-2 line-through decoration-ink-3/60")}>
                      {tarea.titulo}
                    </Link>
                    <div className="relative z-10 -mr-1 -mt-1">
                      <RowActionsMenu
                        row={tarea}
                        label={`Mover «${tarea.titulo}»`}
                        actions={[
                          ...COLUMNAS.filter((c) => c.estado !== tarea.estado).map((c) => ({
                            label: `Mover a ${nombreEstado(c.estado).toLowerCase()}`,
                            icon: c.estado === "COMPLETADA" ? <Check size={16} /> : c.estado === "EN_CURSO" ? <ArrowRight size={16} /> : tarea.estado === "COMPLETADA" ? <RotateCcw size={16} /> : <CircleDashed size={16} />,
                            onSelect: () => onMover(tarea, c.estado),
                          })),
                        ]}
                      />
                    </div>
                  </div>
                  {tarea.proceso && <p className="mt-0.5 truncate text-[13px] text-ink-3">{tarea.proceso.nombre}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Tag tone={prioridad(tarea.prioridad).tono}>{prioridad(tarea.prioridad).nombre}</Tag>
                    {tarea.fecha_limite && (
                      <span className={cx("inline-flex items-center gap-1 text-[12.5px] tabular-nums", tarea.vencida ? "font-semibold text-bad" : "text-ink-2")}>
                        <Clock aria-hidden="true" size={13} />
                        {tarea.vencida ? "Venció " : ""}{fechaCorta(tarea.fecha_limite)}
                      </span>
                    )}
                    {tarea.subtareas.total > 0 && (
                      <span className="text-[12.5px] tabular-nums text-ink-3">{tarea.subtareas.hechas}/{tarea.subtareas.total}</span>
                    )}
                  </div>
                </li>
              ))}
              {propias.length === 0 && <li className="px-2 py-6 text-center text-[13px] text-ink-3">{vacio}</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
