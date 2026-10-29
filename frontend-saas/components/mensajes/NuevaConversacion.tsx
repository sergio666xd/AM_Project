"use client";

import { useMemo, useState } from "react";
import { Search, Users } from "lucide-react";

import { CAMPO } from "@/components/expediente/CalculadoraTermino";
import { Initials } from "@/components/ui/Initials";
import { Modal } from "@/components/ui/Modal";
import type { Conversacion } from "@/lib/mensajes";

const SECCIONES: { titulo: string; tipos: Conversacion["tipo"][] }[] = [
  { titulo: "Clientes", tipos: ["cliente"] },
  { titulo: "Equipo de cada proceso", tipos: ["colaboradores", "equipo_proceso"] },
  { titulo: "Firma", tipos: ["equipo"] },
];

/** Elegir a quién escribir: cada cliente por proceso, el equipo de cada proceso y los colegas. */
export function NuevaConversacion({ open, conversaciones, onClose, onElegir }: {
  open: boolean;
  conversaciones: Conversacion[];
  onClose: () => void;
  onElegir: (conversacion: Conversacion) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const texto = busqueda.trim().toLocaleLowerCase("es");
  const secciones = useMemo(() => SECCIONES.map((s) => ({
    ...s,
    items: conversaciones
      .filter((c) => s.tipos.includes(c.tipo))
      .filter((c) => !texto || `${c.titulo} ${c.proceso?.nombre ?? ""}`.toLocaleLowerCase("es").includes(texto))
      .sort((a, b) => a.titulo.localeCompare(b.titulo, "es") || (a.proceso?.nombre ?? "").localeCompare(b.proceso?.nombre ?? "", "es")),
  })).filter((s) => s.items.length), [conversaciones, texto]);

  function cerrar() {
    setBusqueda("");
    onClose();
  }

  return (
    <Modal open={open} onClose={cerrar} title="Escribir a…" description="Con cada cliente hay una conversación por proceso.">
      <div className="space-y-3 px-5 pb-5 pt-4">
        <label className="relative block">
          <span className="sr-only">Buscar por nombre o proceso</span>
          <Search aria-hidden="true" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre o proceso" className={`${CAMPO} pl-9`} />
        </label>
        <div className="max-h-[min(55dvh,26rem)] overflow-y-auto rounded-lg shadow-[0_0_0_1px_var(--line)]">
          {secciones.length === 0 ? (
            <p className="px-4 py-8 text-center text-[14px] text-ink-3">{texto ? "Nadie coincide con la búsqueda." : "Aún no tienes con quién conversar: los clientes aparecen al vincularlos a tus procesos."}</p>
          ) : secciones.map((s) => (
            <section key={s.titulo}>
              <h3 className="sticky top-0 z-[1] border-b border-line bg-sheet-2 px-4 py-2 text-[12px] font-semibold text-ink-2">{s.titulo}</h3>
              <ul className="divide-y divide-line">
                {s.items.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => { onElegir(c); cerrar(); }} className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-manila focus-visible:bg-manila focus-visible:outline-none">
                      {c.tipo === "colaboradores"
                        ? <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-manila text-ink-2"><Users size={15} /></span>
                        : <Initials name={c.titulo} size={32} />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-ink">{c.titulo}</span>
                        {c.proceso && <span className="block truncate text-[12.5px] text-ink-3">{c.proceso.nombre}</span>}
                      </span>
                      {c.ultimo && <span className="hidden shrink-0 text-[12px] text-ink-3 sm:inline">Ya conversan</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </Modal>
  );
}
