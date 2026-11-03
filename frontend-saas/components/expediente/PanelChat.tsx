"use client";

import Link from "next/link";
import { MessageCircle, Users } from "lucide-react";

import { SheetHeader } from "@/components/ui/Sheet";

const BASE = "/gestion-procesos/abogado/chat";

/** Accesos a las conversaciones del proceso. El historial de lo que se dijo queda en los folios. */
export function PanelChat({ procesoId, clientes }: { procesoId: number; clientes: { id: number; nombre: string }[] }) {
  return (
    <div>
      <SheetHeader title="Conversaciones del proceso" />
      <ul className="divide-y divide-line">
        {clientes.map((c) => (
          <li key={c.id}>
            <Link href={`${BASE}/${procesoId}/${c.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-sheet-2 sm:px-5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-manila text-ink-2"><MessageCircle aria-hidden="true" size={17} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-semibold text-ink">{c.nombre}</span>
                <span className="block text-[13px] text-ink-3">Cliente · lo que escriba le llega a su portal</span>
              </span>
            </Link>
          </li>
        ))}
        <li>
          <Link href={`${BASE}/${procesoId}/colaboradores`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-sheet-2 sm:px-5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-manila text-ink-2"><Users aria-hidden="true" size={17} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-semibold text-ink">Equipo del proceso</span>
              <span className="block text-[13px] text-ink-3">Solo la firma; el cliente no lo ve</span>
            </span>
          </Link>
        </li>
      </ul>
      {clientes.length === 0 && (
        <p className="border-t border-line px-4 py-4 text-[13.5px] text-ink-3 sm:px-5">Cuando un cliente tenga acceso al proceso, su conversación aparece aquí.</p>
      )}
    </div>
  );
}
