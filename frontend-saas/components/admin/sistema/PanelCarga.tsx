"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Initials } from "@/components/ui/Initials";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Sheet } from "@/components/ui/Sheet";
import { Tag } from "@/components/ui/Tag";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { useLoadEffect } from "@/lib/useLoadEffect";
import { RUTA_USUARIOS } from "@/lib/usuariosAdmin";

type Fila = Esquemas["CargaPersona"];

const COLUMNAS: { clave: keyof Pick<Fila, "procesos" | "tareas_abiertas" | "vencidas" | "proximas">; titulo: string }[] = [
  { clave: "procesos", titulo: "Procesos activos" },
  { clave: "tareas_abiertas", titulo: "Tareas abiertas" },
  { clave: "vencidas", titulo: "Vencidas" },
  { clave: "proximas", titulo: "Vencen en 7 días" },
];

function Cifra({ clave, valor }: { clave: (typeof COLUMNAS)[number]["clave"]; valor: number }) {
  return (
    <span className={cx("tabular-nums", valor === 0 ? "text-ink-3" : clave === "vencidas" ? "font-semibold text-bad" : "text-ink")}>
      {valor}
    </span>
  );
}

/** Procesos y tareas por persona. La ve la administración y, desde su panel, la abogada directora. */
export function PanelCarga({ conFichas = true }: { conFichas?: boolean }) {
  const [panel, setPanel] = useState<Esquemas["PanelCarga"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/admin/carga");
    if (data) setPanel(data);
    else setError(mensajeDeError(fallo));
  }, []);
  useLoadEffect(cargar);

  const nombre = (f: Fila) => (conFichas
    ? <Link href={`${RUTA_USUARIOS}/${f.persona.id}`} className="font-semibold text-ink hover:underline">{f.persona.nombre}</Link>
    : <span className="font-semibold text-ink">{f.persona.nombre}</span>);

  return (
    <div>
      <PageHeader title="Carga de trabajo" description="Procesos activos y tareas abiertas de cada persona del equipo. Primero quien tiene más tareas vencidas." />
      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-bad-soft px-4 py-3 text-bad">
          <p className="flex-1 text-[14px]">{error}</p>
          <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
        </div>
      ) : !panel ? (
        <LoadingState label="Cargando la carga de trabajo" rows={5} />
      ) : !panel.personas.length ? (
        <Sheet className="px-4 py-6 text-[14px] text-ink-2">Aún no hay abogados con cuenta activa.</Sheet>
      ) : (
        <Sheet aria-label="Carga por persona" className="overflow-hidden">
          {/* Escritorio: tabla. */}
          <table className="hidden w-full text-[14px] md:table">
            <thead>
              <tr className="border-b border-line text-left text-[12.5px] text-ink-2">
                <th scope="col" className="px-4 py-2.5 font-semibold">Persona</th>
                {COLUMNAS.map((c) => <th key={c.clave} scope="col" className="w-36 px-4 py-2.5 text-right font-semibold">{c.titulo}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {panel.personas.map((f) => (
                <tr key={f.persona.id}>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-3">
                      <Initials name={f.persona.nombre} size={30} className="shrink-0" />
                      {nombre(f)}
                      {!f.activa && <Tag tone="neutral">Cuenta inactiva</Tag>}
                    </span>
                  </td>
                  {COLUMNAS.map((c) => <td key={c.clave} className="px-4 py-3 text-right"><Cifra clave={c.clave} valor={f[c.clave]} /></td>)}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line-strong bg-sheet-2 text-[13.5px]">
                <th scope="row" className="px-4 py-2.5 text-left font-semibold text-ink-2">Toda la firma</th>
                {COLUMNAS.map((c) => <td key={c.clave} className="px-4 py-2.5 text-right font-semibold"><Cifra clave={c.clave} valor={panel[c.clave]} /></td>)}
              </tr>
            </tfoot>
          </table>

          {/* Móvil: una ficha por persona. */}
          <ul className="divide-y divide-line md:hidden">
            {panel.personas.map((f) => (
              <li key={f.persona.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Initials name={f.persona.nombre} size={30} className="shrink-0" />
                  {nombre(f)}
                  {!f.activa && <Tag tone="neutral">Cuenta inactiva</Tag>}
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[13.5px]">
                  {COLUMNAS.map((c) => (
                    <div key={c.clave} className="flex items-baseline justify-between gap-2">
                      <dt className="text-ink-2">{c.titulo}</dt>
                      <dd><Cifra clave={c.clave} valor={f[c.clave]} /></dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
            <li className="bg-sheet-2 px-4 py-3">
              <p className="text-[13.5px] font-semibold text-ink-2">Toda la firma</p>
              <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-[13.5px]">
                {COLUMNAS.map((c) => (
                  <div key={c.clave} className="flex items-baseline justify-between gap-2">
                    <dt className="text-ink-2">{c.titulo}</dt>
                    <dd className="font-semibold"><Cifra clave={c.clave} valor={panel[c.clave]} /></dd>
                  </div>
                ))}
              </dl>
            </li>
          </ul>
        </Sheet>
      )}
    </div>
  );
}
