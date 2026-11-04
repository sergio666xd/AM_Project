"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ClipboardList, ListChecks, Plus } from "lucide-react";

import { AplicarPlantillaModal } from "@/components/tareas/AplicarPlantillaModal";
import { NuevaTareaModal } from "@/components/tareas/NuevaTareaModal";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Tag } from "@/components/ui/Tag";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { fechaCorta } from "@/lib/fechas";
import { estaAbierta, prioridad, RUTA_TAREA, type Tarea } from "@/lib/tareas";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Grupo = "abiertas" | "completadas" | "todas";

/** Las tareas del proceso, con la casilla para completarlas sin salir del expediente. */
export function PanelTareas({ procesoId }: { procesoId: number }) {
  const { toast } = useToast();
  const [grupo, setGrupo] = useState<Grupo>("abiertas");
  const [lista, setLista] = useState<Esquemas["ListaTareas"] | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const [plantilla, setPlantilla] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error } = await api.GET("/api/v2/tareas", { params: { query: { proceso_id: procesoId, grupo } } });
    if (data) {
      setLista(data);
      setFallo(null);
    } else {
      setFallo(mensajeDeError(error));
    }
  }, [procesoId, grupo]);
  useLoadEffect(cargar);

  async function alternar(tarea: Tarea) {
    const estado = estaAbierta(tarea) ? "COMPLETADA" : "PENDIENTE";
    setLista((actual) => actual && { ...actual, items: actual.items.map((t) => (t.id === tarea.id ? { ...t, estado, vencida: false } : t)) });
    const { error } = await api.PATCH("/api/v2/tareas/{tarea_id}", { params: { path: { tarea_id: tarea.id } }, body: { estado } });
    if (error) toast({ title: mensajeDeError(error), tone: "error" });
    else toast({ title: estado === "COMPLETADA" ? `«${tarea.titulo}» completada` : `«${tarea.titulo}» abierta de nuevo`, tone: "success" });
    void cargar();
  }

  const resumen = lista?.resumen;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5 sm:px-5">
        <SegmentedControl
          label="Qué tareas ver"
          value={grupo}
          onChange={setGrupo}
          options={[
            { value: "abiertas", label: "Abiertas", count: resumen?.abiertas },
            { value: "completadas", label: "Completadas" },
            { value: "todas", label: "Todas" },
          ]}
        />
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" icon={<ClipboardList size={15} />} onClick={() => setPlantilla(true)}>Usar plantilla</Button>
          <Button size="sm" icon={<Plus size={15} />} onClick={() => setNueva(true)}>Nueva tarea</Button>
        </div>
      </div>

      {fallo ? (
        <p role="alert" className="px-5 py-6 text-[14px] text-bad">{fallo}</p>
      ) : !lista ? (
        <div className="space-y-2 p-5" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-manila" />)}</div>
      ) : lista.items.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={grupo === "abiertas" ? "Nada pendiente en este proceso" : "Sin tareas aquí"}
          description={grupo === "abiertas" ? "Cree una tarea o use una plantilla con los pasos de este tipo de proceso." : undefined}
        />
      ) : (
        <ul className="divide-y divide-line">
          {lista.items.map((t) => {
            const abierta = estaAbierta(t);
            const prio = prioridad(t.prioridad);
            return (
              <li key={t.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                <input
                  type="checkbox"
                  checked={t.estado === "COMPLETADA"}
                  disabled={t.estado === "CANCELADA"}
                  onChange={() => void alternar(t)}
                  aria-label={abierta ? `Completar «${t.titulo}»` : `Abrir de nuevo «${t.titulo}»`}
                  className="mt-0.5 size-5 shrink-0 cursor-pointer accent-[var(--navy)] disabled:cursor-default"
                />
                <div className="min-w-0 flex-1">
                  <Link href={RUTA_TAREA(t.id)} className={cx("text-[14.5px] font-semibold text-pretty hover:underline", abierta ? "text-ink" : "text-ink-3 line-through decoration-ink-3/60")}>
                    {t.titulo}
                  </Link>
                  <p className="mt-0.5 text-[13px] text-ink-3">
                    {[t.responsable?.nombre, t.cliente ? `para ${t.cliente.nombre} (cliente)` : null, t.subtareas.total ? `${t.subtareas.hechas} de ${t.subtareas.total} subtareas` : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {t.fecha_limite && (
                    <span className={cx("text-[13px] tabular-nums", t.vencida ? "font-semibold text-bad" : "text-ink-2")}>
                      {t.estado === "COMPLETADA" ? "Completada" : t.vencida ? `Venció ${fechaCorta(t.fecha_limite)}` : `Vence ${fechaCorta(t.fecha_limite)}`}
                    </span>
                  )}
                  {abierta && t.prioridad !== "MEDIA" && <Tag tone={prio.tono}>{prio.nombre}</Tag>}
                  {t.estado === "CANCELADA" && <Tag>Cancelada</Tag>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <NuevaTareaModal open={nueva} onClose={() => setNueva(false)} onCreada={() => void cargar()} procesoInicial={procesoId} />
      <AplicarPlantillaModal open={plantilla} onClose={() => setPlantilla(false)} onCreadas={() => void cargar()} procesoId={procesoId} />
    </div>
  );
}
