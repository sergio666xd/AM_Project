"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ArrowLeft, LayoutTemplate, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";

import { PasosPlantilla } from "@/components/tareas/AplicarPlantillaModal";
import { EditorPlantilla } from "@/components/tareas/EditorPlantilla";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Plantilla = Esquemas["Plantilla"];

export default function PlantillasPage() {
  const { toast } = useToast();
  const [plantillas, setPlantillas] = useState<Plantilla[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<Plantilla | "nueva" | null>(null);
  const [borrando, setBorrando] = useState<Plantilla | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/tareas/plantillas");
    if (fallo || !data) setError(mensajeDeError(fallo));
    else setPlantillas(data.items);
  }, []);
  useLoadEffect(cargar);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/gestion-procesos/abogado/tareas" className="mb-4 inline-flex min-h-10 items-center gap-1.5 text-[14px] text-ink-2 hover:text-ink">
        <ArrowLeft aria-hidden="true" size={16} />
        Tareas
      </Link>
      <PageHeader
        title="Plantillas de tareas"
        description="Los pasos que la firma sigue ante cada tipo de actuación. Al crear tareas desde un folio, la plantilla que coincide aparece sugerida."
        action={<Button icon={<Plus size={16} />} onClick={() => setEditando("nueva")}>Nueva plantilla</Button>}
      />

      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] bg-bad-soft px-4 py-3 text-bad">
          <p className="flex-1 text-[14px]">{error}</p>
          <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
        </div>
      ) : plantillas === null ? (
        <LoadingState label="Cargando plantillas" rows={3} />
      ) : plantillas.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] bg-sheet px-6 py-12 text-center shadow-[0_0_0_1px_var(--line)]">
          <LayoutTemplate aria-hidden="true" className="mx-auto size-7 text-ink-3" />
          <p className="mt-3 font-display text-[19px] text-ink">Sin plantillas todavía</p>
          <p className="mx-auto mt-1 max-w-sm text-[14px] text-ink-3">Crea la primera con los pasos que repites ante un traslado, un auto de pruebas o una audiencia.</p>
          <Button className="mt-4" icon={<Plus size={16} />} onClick={() => setEditando("nueva")}>Nueva plantilla</Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {plantillas.map((p) => (
            <li key={p.id} className="rounded-[var(--radius-lg)] bg-sheet p-4 shadow-[0_0_0_1px_var(--line)] sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-[16px] font-semibold text-ink">{p.nombre}</h2>
                  {p.descripcion && <p className="mt-0.5 text-[14px] text-pretty text-ink-2">{p.descripcion}</p>}
                </div>
                {p.puede_editar && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEditando(p)}>Editar</Button>
                    <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setBorrando(p)} aria-label={`Eliminar ${p.nombre}`} />
                  </div>
                )}
              </div>
              {p.palabras_clave.length > 0 && (
                <p className="mt-2 text-[13px] text-ink-3">
                  Se sugiere si la actuación dice{" "}
                  {p.palabras_clave.map((palabra, i) => (
                    <span key={palabra}>
                      <span className="rounded bg-manila px-1.5 py-0.5 font-medium text-ink-2">{palabra}</span>
                      {i < p.palabras_clave.length - 1 ? (i === p.palabras_clave.length - 2 ? " o " : ", ") : ""}
                    </span>
                  ))}
                </p>
              )}
              <PasosPlantilla plantilla={p} className="mt-3 border-t border-line pt-3" />
            </li>
          ))}
        </ul>
      )}

      {editando !== null && (
        <EditorPlantilla
          abierto
          plantilla={editando === "nueva" ? null : editando}
          onClose={() => setEditando(null)}
          onGuardada={() => {
            toast({ title: editando === "nueva" ? "Plantilla creada" : "Plantilla guardada", tone: "success" });
            void cargar();
          }}
        />
      )}
      <ConfirmDialog
        open={borrando !== null}
        onClose={() => setBorrando(null)}
        destructive
        title="¿Eliminar la plantilla?"
        description={`«${borrando?.nombre ?? ""}» deja de estar disponible. Las tareas que ya se crearon con ella no cambian.`}
        confirmLabel="Eliminar"
        onConfirm={async () => {
          if (!borrando) return;
          const { error: fallo } = await api.DELETE("/api/v2/tareas/plantillas/{plantilla_id}", { params: { path: { plantilla_id: borrando.id } } });
          if (fallo) throw new Error(mensajeDeError(fallo));
          setBorrando(null);
          toast({ title: "Plantilla eliminada", tone: "success" });
          void cargar();
        }}
      />
    </div>
  );
}
