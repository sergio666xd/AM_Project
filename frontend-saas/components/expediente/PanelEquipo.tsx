"use client";

import { useCallback, useId, useState, type FormEvent } from "react";
import { Eye, EyeOff, Trash2, UserPlus, Users } from "lucide-react";

import { ETIQUETA, CAMPO } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { RowActionsMenu, type RowAction } from "@/components/ui/RowActionsMenu";
import { SheetHeader } from "@/components/ui/Sheet";
import { Tag } from "@/components/ui/Tag";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Equipo = Esquemas["EquipoProceso"];
type Miembro = Equipo["miembros"][number];

/** Quién trabaja en el proceso además del responsable, y si el cliente lo ve en su portal. */
export function PanelEquipo({ procesoId, onCambio }: { procesoId: number; onCambio: () => void }) {
  const id = useId();
  const { toast } = useToast();
  const [equipo, setEquipo] = useState<Equipo | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [abogado, setAbogado] = useState("");
  const [visible, setVisible] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [retirar, setRetirar] = useState<Miembro | null>(null);
  const ruta = { params: { path: { proceso_id: procesoId } } };

  const cargar = useCallback(async () => {
    const { data, error } = await api.GET("/api/v2/procesos/{proceso_id}/equipo", { params: { path: { proceso_id: procesoId } } });
    if (data) setEquipo(data);
    else setFallo(mensajeDeError(error));
  }, [procesoId]);
  useLoadEffect(cargar);

  function aplicar(data: Equipo | undefined, error: unknown, exito: string): boolean {
    if (!data) {
      toast({ title: mensajeDeError(error), tone: "error" });
      return false;
    }
    setEquipo(data);
    toast({ title: exito, tone: "success" });
    onCambio();
    return true;
  }

  async function agregar(evento: FormEvent) {
    evento.preventDefault();
    const elegido = equipo?.disponibles.find((d) => String(d.id) === abogado);
    if (!elegido) return;
    setAgregando(true);
    const { data, error } = await api.POST("/api/v2/procesos/{proceso_id}/equipo", { ...ruta, body: { abogado_id: elegido.id, visible_cliente: visible } });
    setAgregando(false);
    if (aplicar(data, error, `${elegido.nombre} entró al equipo; le avisamos`)) {
      setAbogado("");
      setVisible(false);
    }
  }

  async function cambiarVisibilidad(m: Miembro) {
    const { data, error } = await api.PATCH("/api/v2/procesos/{proceso_id}/equipo/{abogado_id}", {
      params: { path: { proceso_id: procesoId, abogado_id: m.id } }, body: { visible_cliente: !m.visible_cliente },
    });
    aplicar(data, error, m.visible_cliente ? `El cliente ya no ve a ${m.nombre}` : `El cliente ahora ve a ${m.nombre}`);
  }

  async function confirmarRetiro() {
    if (!retirar) return;
    const { data, error } = await api.DELETE("/api/v2/procesos/{proceso_id}/equipo/{abogado_id}", {
      params: { path: { proceso_id: procesoId, abogado_id: retirar.id } },
    });
    if (!data) throw new Error(mensajeDeError(error));
    aplicar(data, null, `${retirar.nombre} salió del equipo`);
  }

  if (fallo) return <p role="alert" className="px-5 py-6 text-[14px] text-bad">{fallo}</p>;
  if (!equipo) return <div className="space-y-2 p-5" aria-busy="true">{[0, 1].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-manila" />)}</div>;
  if (!equipo.admite_equipo) {
    return <EmptyState icon={Users} title="Este proceso no admite equipo" description="Solo los procesos de la firma pueden tener colaboradores." />;
  }

  const acciones: RowAction<Miembro>[] = [
    { label: "Que el cliente lo vea", icon: <Eye size={16} />, hidden: (m) => m.visible_cliente, onSelect: (m) => void cambiarVisibilidad(m) },
    { label: "Que el cliente no lo vea", icon: <EyeOff size={16} />, hidden: (m) => !m.visible_cliente, onSelect: (m) => void cambiarVisibilidad(m) },
    { label: "Retirar del equipo", icon: <Trash2 size={16} />, tone: "danger", separated: true, onSelect: (m) => setRetirar(m) },
  ];

  return (
    <div>
      <SheetHeader title="Equipo del proceso" count={equipo.miembros.length + 1} />
      <ul className="divide-y divide-line">
        <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14.5px] font-semibold text-ink">{equipo.responsable.nombre}</p>
            <p className="text-[13px] text-ink-3">Responsable · el cliente lo ve</p>
          </div>
        </li>
        {equipo.miembros.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14.5px] font-semibold text-ink">{m.nombre}</p>
              <p className="text-[13px] text-ink-3">{m.visible_cliente ? "Abogado participante · el cliente lo ve" : "Colaborador interno · el cliente no lo ve"}</p>
            </div>
            {m.visible_cliente && <Tag tone="navy" className="hidden sm:inline-flex">Visible al cliente</Tag>}
            {equipo.puede_gestionar && <RowActionsMenu row={m} actions={acciones} label={`Acciones para ${m.nombre}`} />}
          </li>
        ))}
      </ul>

      {equipo.puede_gestionar && (
        <form onSubmit={agregar} className="border-t border-line bg-sheet-2 px-4 py-4 sm:px-5">
          <p className="text-[14px] font-semibold text-ink">Agregar un abogado</p>
          {equipo.disponibles.length === 0 ? (
            <p className="mt-1 text-[13.5px] text-ink-3">Todos los abogados activos de la firma ya están en el equipo.</p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div>
                <label htmlFor={`${id}-abogado`} className={ETIQUETA}>Abogado de la firma</label>
                <select id={`${id}-abogado`} value={abogado} onChange={(e) => setAbogado(e.target.value)} className={CAMPO}>
                  <option value="">Elija un abogado</option>
                  {equipo.disponibles.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </select>
              </div>
              <Button type="submit" loading={agregando} disabled={!abogado} icon={<UserPlus size={16} />}>Agregar</Button>
              <label className="flex items-start gap-2.5 text-[13.5px] text-ink-2 sm:col-span-2">
                <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="mt-0.5 size-4 accent-[var(--navy)]" />
                <span>El cliente lo ve en su portal como abogado participante</span>
              </label>
            </div>
          )}
        </form>
      )}
      {!equipo.puede_gestionar && (
        <p className="border-t border-line px-4 py-4 text-[13.5px] text-ink-3 sm:px-5">El responsable del proceso o la administración cambian el equipo.</p>
      )}

      <ConfirmDialog
        open={retirar !== null}
        onClose={() => setRetirar(null)}
        onConfirm={confirmarRetiro}
        destructive
        title={`¿Retirar a ${retirar?.nombre ?? ""} del equipo?`}
        description="Deja de ver el proceso y sus tareas. Lo que ya hizo queda en el expediente."
        confirmLabel="Retirar"
      />
    </div>
  );
}
