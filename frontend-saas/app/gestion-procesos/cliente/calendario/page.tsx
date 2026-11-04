"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import { CalendarioMes, type ElementoCalendario } from "@/components/calendario/CalendarioMes";
import { TituloCliente } from "@/components/portal-cliente/piezas";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Tag, type TonoTag } from "@/components/ui/Tag";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { diaDe, diaLargo, horaDe, hoyISO, lunesDe, sumarDias } from "@/lib/fechas";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Elemento = Esquemas["ElementoAgenda"];
type Vista = "proximos" | "mes";

const DIAS_PROXIMOS = 180;

function tono(e: Elemento): TonoTag {
  if (e.tipo === "tarea") return e.vencida ? "bad" : "gold";
  return e.etiqueta === "Audiencia" ? "navy" : "neutral";
}

function etiqueta(e: Elemento): string {
  if (e.tipo === "tarea") return e.vencida ? "Venció lo que le pedimos" : "Le pedimos algo";
  return e.etiqueta;
}

function rango(vista: Vista, ancla: string): [string, string] {
  if (vista === "mes") {
    const inicio = lunesDe(`${ancla.slice(0, 7)}-01`);
    return [inicio, sumarDias(inicio, 41)];
  }
  return [hoyISO(), sumarDias(hoyISO(), DIAS_PROXIMOS)];
}

/** Las citas de los procesos del cliente y las fechas de lo que la firma le pidió. */
export default function CalendarioClientePage() {
  const [vista, setVista] = useState<Vista>("proximos");
  const [ancla, setAncla] = useState(hoyISO());
  const [agenda, setAgenda] = useState<Esquemas["Agenda"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [desde, hasta] = rango(vista, ancla);

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/cliente/agenda", { params: { query: { desde, hasta } } });
    if (fallo || !data) setError(mensajeDeError(fallo));
    else setAgenda(data);
  }, [desde, hasta]);
  useLoadEffect(cargar);

  const elementos = useMemo(() => agenda?.items ?? [], [agenda]);
  const porDia = useMemo(() => {
    const mapa = new Map<string, Elemento[]>();
    for (const e of elementos) {
      const dia = diaDe(e.inicio);
      mapa.set(dia, [...(mapa.get(dia) ?? []), e]);
    }
    return mapa;
  }, [elementos]);
  const delCalendario = useMemo<ElementoCalendario[]>(() => elementos.map((e) => ({
    clave: e.clave,
    titulo: e.titulo,
    dia: diaDe(e.inicio),
    hora: e.todo_el_dia ? undefined : horaDe(e.inicio),
    etiqueta: etiqueta(e),
    tono: tono(e),
    detalle: e.proceso?.nombre,
    href: e.enlace,
  })), [elementos]);

  const hoy = hoyISO();

  return (
    <div>
      <TituloCliente sub="Sus audiencias, reuniones y firmas, y las fechas de lo que la firma le pidió.">Calendario</TituloCliente>

      <SegmentedControl<Vista>
        label="Vista del calendario"
        value={vista}
        onChange={(v) => { setVista(v); setAncla(hoyISO()); }}
        options={[{ value: "proximos", label: "Próximos" }, { value: "mes", label: "Mes" }]}
      />

      <div className="mt-4">
        {error ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] bg-bad-soft px-4 py-3 text-bad">
            <p className="flex-1 text-[14px]">{error}</p>
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
          </div>
        ) : agenda === null ? (
          <LoadingState label="Cargando el calendario" rows={3} />
        ) : vista === "mes" ? (
          <CalendarioMes elementos={delCalendario} mes={ancla} onMes={setAncla} vacio="Nada este día." />
        ) : elementos.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] bg-sheet px-6 py-12 text-center shadow-[0_0_0_1px_var(--line)]">
            <p className="font-display text-[19px] text-ink">Nada agendado por ahora</p>
            <p className="mx-auto mt-1 max-w-sm text-pretty text-[14px] text-ink-3">
              Cuando la firma programe una audiencia o una reunión, o le pida algo con fecha, aparecerá aquí y le avisaremos.
            </p>
          </div>
        ) : (
          <ol className="space-y-5">
            {[...porDia.entries()].map(([dia, items]) => (
              <li key={dia}>
                <h2 className="mb-2 text-[15px] font-semibold first-letter:uppercase text-ink">
                  {dia === hoy ? "Hoy, " : dia === sumarDias(hoy, 1) ? "Mañana, " : ""}{diaLargo(dia)}
                </h2>
                <ul className="space-y-2">{items.map((e) => <Tarjeta key={e.clave} elemento={e} />)}</ul>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function Tarjeta({ elemento: e }: { elemento: Elemento }) {
  return (
    <li>
      <Link
        href={e.enlace}
        className={cx(
          "block rounded-lg bg-sheet px-4 py-3 shadow-[0_0_0_1px_var(--line)] transition-colors hover:bg-manila/60 sm:flex sm:items-start sm:gap-4",
          e.vencida && "shadow-[inset_3px_0_0_var(--bad),0_0_0_1px_var(--line)]",
        )}
      >
        <span className="block text-[13.5px] tabular-nums text-ink-3 sm:w-28 sm:shrink-0 sm:pt-0.5">
          {e.todo_el_dia ? (e.vencida ? "Venció" : "Para este día") : horaDe(e.inicio)}
          {!e.todo_el_dia && e.fin && <> – {horaDe(e.fin)}</>}
        </span>
        <span className="block min-w-0 flex-1">
          <span className="block text-[15px] font-semibold leading-snug text-pretty text-ink">{e.titulo}</span>
          {e.proceso && <span className="block truncate text-[13.5px] text-ink-2">{e.proceso.nombre}</span>}
          {e.detalle && e.tipo === "evento" && <span className="mt-1 block text-pretty text-[13.5px] text-ink-2">{e.detalle}</span>}
          <span className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
            <Tag tone={tono(e)}>{etiqueta(e)}</Tag>
            {e.responsable && <span>Con {e.responsable}</span>}
          </span>
        </span>
      </Link>
    </li>
  );
}
