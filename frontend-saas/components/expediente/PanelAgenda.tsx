"use client";

import { useCallback, useState } from "react";
import { CalendarCheck, CalendarDays, CalendarPlus, CalendarX, Pencil, Trash2 } from "lucide-react";

import { NuevoEventoModal, type EventoDelProceso } from "@/components/agenda/NuevoEventoModal";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { RowActionsMenu, type RowAction } from "@/components/ui/RowActionsMenu";
import { SheetHeader } from "@/components/ui/Sheet";
import { Tag } from "@/components/ui/Tag";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { fechaLarga, horaDe } from "@/lib/fechas";
import { useLoadEffect } from "@/lib/useLoadEffect";
import { useNow } from "@/lib/useNow";

const ESTADO = { PROGRAMADO: null, COMPLETADO: { texto: "Realizado", tono: "ok" }, CANCELADO: { texto: "Cancelado", tono: "neutral" } } as const;

/** Audiencias, reuniones y firmas del proceso: lo que viene y lo que ya pasó. */
export function PanelAgenda({ procesoId, clientes, archivado }: {
  procesoId: number;
  clientes: { id: number; nombre: string }[];
  archivado: boolean;
}) {
  const { toast } = useToast();
  const [eventos, setEventos] = useState<EventoDelProceso[] | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [modal, setModal] = useState<{ evento?: EventoDelProceso } | null>(null);
  const [eliminar, setEliminar] = useState<EventoDelProceso | null>(null);

  const cargar = useCallback(async () => {
    const { data, error } = await api.GET("/api/v2/agenda/eventos", { params: { query: { proceso_id: procesoId } } });
    if (data) {
      setEventos(data.items);
      setFallo(null);
    } else {
      setFallo(mensajeDeError(error));
    }
  }, [procesoId]);
  useLoadEffect(cargar);

  async function cambiarEstado(evento: EventoDelProceso, estado: "COMPLETADO" | "CANCELADO" | "PROGRAMADO") {
    const { error } = await api.PATCH("/api/v2/agenda/eventos/{evento_id}", { params: { path: { evento_id: evento.id } }, body: { estado } });
    if (error) {
      toast({ title: mensajeDeError(error), tone: "error" });
      return;
    }
    toast({ title: estado === "COMPLETADO" ? "Marcado como realizado" : estado === "CANCELADO" ? "Evento cancelado; le avisamos al cliente" : "Evento programado de nuevo", tone: "success" });
    void cargar();
  }

  async function confirmarEliminar() {
    if (!eliminar) return;
    const { error } = await api.DELETE("/api/v2/agenda/eventos/{evento_id}", { params: { path: { evento_id: eliminar.id } } });
    if (error) throw new Error(mensajeDeError(error));
    toast({ title: "Evento eliminado", tone: "success" });
    void cargar();
  }

  const ahora = useNow();
  const proximos = (eventos ?? []).filter((e) => new Date(e.inicio).getTime() >= ahora);
  const pasados = (eventos ?? []).filter((e) => new Date(e.inicio).getTime() < ahora);
  const acciones: RowAction<EventoDelProceso>[] = [
    { label: "Cambiar", icon: <Pencil size={16} />, onSelect: (e) => setModal({ evento: e }) },
    { label: "Marcar como realizado", icon: <CalendarCheck size={16} />, hidden: (e) => e.estado !== "PROGRAMADO", onSelect: (e) => void cambiarEstado(e, "COMPLETADO") },
    { label: "Cancelar el evento", icon: <CalendarX size={16} />, hidden: (e) => e.estado !== "PROGRAMADO" || e.contrato_id != null, onSelect: (e) => void cambiarEstado(e, "CANCELADO") },
    { label: "Volver a programar", icon: <CalendarDays size={16} />, hidden: (e) => e.estado === "PROGRAMADO", onSelect: (e) => void cambiarEstado(e, "PROGRAMADO") },
    { label: "Eliminar", icon: <Trash2 size={16} />, tone: "danger", separated: true, hidden: (e) => e.contrato_id != null, onSelect: (e) => setEliminar(e) },
  ];

  function lista(items: EventoDelProceso[]) {
    return (
      <ul className="divide-y divide-line">
        {items.map((e) => {
          const estado = ESTADO[e.estado];
          return (
            <li key={e.id} id={`evento-${e.id}`} className="flex items-start gap-3 px-4 py-3 sm:px-5">
              <div className="w-14 shrink-0 pt-0.5 text-center">
                <span className="block text-[12px] font-semibold uppercase tracking-wide text-ink-3">{new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", month: "short" }).format(new Date(e.inicio)).replace(".", "")}</span>
                <span className="block font-display text-[24px] leading-none tabular-nums text-ink">{new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric" }).format(new Date(e.inicio))}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className={cx("text-[14.5px] font-semibold text-pretty", e.estado === "CANCELADO" ? "text-ink-3 line-through decoration-ink-3/60" : "text-ink")}>{e.titulo}</p>
                <p className="mt-0.5 text-[13px] text-ink-2">
                  {e.etiqueta} · <span className="first-letter:uppercase">{fechaLarga(e.inicio)}</span>, {horaDe(e.inicio)}{e.fin ? ` a ${horaDe(e.fin)}` : ""}
                </p>
                {e.descripcion && <p className="mt-1 whitespace-pre-wrap text-[13.5px] text-ink-2">{e.descripcion}</p>}
                <p className="mt-1 text-[12.5px] text-ink-3">
                  {[e.responsable?.nombre, e.cliente ? `Aviso a ${e.cliente.nombre}` : clientes.length ? "Aviso a los clientes del proceso" : null].filter(Boolean).join(" · ")}
                </p>
              </div>
              {estado && <Tag tone={estado.tono} className="mt-0.5 shrink-0">{estado.texto}</Tag>}
              {!archivado && <RowActionsMenu row={e} actions={acciones} label={`Acciones para ${e.titulo}`} />}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div>
      <SheetHeader
        title="Lo que viene"
        count={eventos ? proximos.length : undefined}
        action={!archivado ? <Button size="sm" icon={<CalendarPlus size={15} />} onClick={() => setModal({})}>Agendar</Button> : undefined}
      />
      {fallo ? (
        <p role="alert" className="px-5 py-6 text-[14px] text-bad">{fallo}</p>
      ) : !eventos ? (
        <div className="space-y-2 p-5" aria-busy="true">{[0, 1].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-manila" />)}</div>
      ) : proximos.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Nada agendado" description="Agende audiencias y reuniones: el cliente recibe el aviso y quedan en los calendarios suscritos." />
      ) : lista(proximos)}

      {pasados.length > 0 && (
        <>
          <SheetHeader title="Ya pasaron" count={pasados.length} className="border-t" />
          {lista(pasados)}
        </>
      )}

      {modal && (
        <NuevoEventoModal
          key={modal.evento?.id ?? "nuevo"}
          open
          onClose={() => setModal(null)}
          onCreado={() => void cargar()}
          procesoId={procesoId}
          clientes={clientes}
          evento={modal.evento}
        />
      )}
      <ConfirmDialog
        open={eliminar !== null}
        onClose={() => setEliminar(null)}
        onConfirm={confirmarEliminar}
        destructive
        title="¿Eliminar el evento?"
        description={eliminar && eliminar.estado === "PROGRAMADO" && new Date(eliminar.inicio).getTime() >= ahora
          ? "Sale de la agenda y de los calendarios suscritos, y le avisamos al cliente que se canceló."
          : "Sale de la agenda del proceso. No se avisa a nadie."}
        confirmLabel="Eliminar"
      />
    </div>
  );
}
