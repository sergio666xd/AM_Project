"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { CalendarPlus, CalendarSync, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

import { NuevoEventoModal } from "@/components/agenda/NuevoEventoModal";
import { SuscripcionCalendario } from "@/components/agenda/SuscripcionCalendario";
import { CalendarioMes, type ElementoCalendario } from "@/components/calendario/CalendarioMes";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Tag, type TonoTag } from "@/components/ui/Tag";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { diaCorto, diaDe, diaLargo, horaDe, hoyISO, lunesDe, sumarDias } from "@/lib/fechas";
import { useAccionDeUrl } from "@/lib/useAccionDeUrl";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Elemento = Esquemas["ElementoAgenda"];
type Vista = "semana" | "mes" | "proximos";

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function tono(e: Elemento): TonoTag {
  if (e.estado === "CANCELADO") return "neutral";
  if (e.tipo === "tarea") return e.vencida ? "bad" : "neutral";
  return e.etiqueta === "Audiencia" ? "gold" : "navy";
}

function rango(vista: Vista, ancla: string): [string, string] {
  if (vista === "semana") {
    const lunes = lunesDe(ancla);
    return [lunes, sumarDias(lunes, 6)];
  }
  if (vista === "mes") {
    const inicio = lunesDe(`${ancla.slice(0, 7)}-01`);
    return [inicio, sumarDias(inicio, 41)];
  }
  return [hoyISO(), sumarDias(hoyISO(), 30)];
}

export default function AgendaPage() {
  const [vista, setVista] = useState<Vista>("semana");
  const [ancla, setAncla] = useState(hoyISO());
  const [conTareas, setConTareas] = useState(true);
  const [agenda, setAgenda] = useState<Esquemas["Agenda"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suscripcion, setSuscripcion] = useState(false);
  const [nuevo, setNuevo] = useState(false);
  const [desde, hasta] = rango(vista, ancla);

  useAccionDeUrl("nuevo", useCallback(() => setNuevo(true), []));

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/agenda", { params: { query: { desde, hasta } } });
    if (fallo || !data) setError(mensajeDeError(fallo));
    else setAgenda(data);
  }, [desde, hasta]);
  useLoadEffect(cargar);

  const elementos = useMemo(
    () => (agenda?.items ?? []).filter((e) => conTareas || e.tipo !== "tarea"),
    [agenda, conTareas],
  );
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
    etiqueta: e.estado === "CANCELADO" ? "Cancelado" : e.vencida ? "Vencida" : e.etiqueta,
    tono: tono(e),
    detalle: e.proceso?.nombre,
    href: e.enlace,
    tachado: e.estado === "CANCELADO",
  })), [elementos]);

  const cargando = agenda === null && !error;
  const hoy = hoyISO();

  return (
    <div>
      <PageHeader
        title="Agenda"
        description="Audiencias, reuniones y vencimientos de los procesos que llevas."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<CalendarSync size={16} />} onClick={() => setSuscripcion(true)}>Ver en mi calendario</Button>
            <Button icon={<CalendarPlus size={16} />} onClick={() => setNuevo(true)}>Agendar evento</Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <SegmentedControl<Vista>
          label="Vista de la agenda"
          value={vista}
          onChange={(v) => { setVista(v); setAncla(hoyISO()); }}
          options={[{ value: "semana", label: "Semana" }, { value: "mes", label: "Mes" }, { value: "proximos", label: "Próximos 30 días" }]}
        />
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-[14px] text-ink-2">
          <input type="checkbox" checked={conTareas} onChange={(e) => setConTareas(e.target.checked)} className="size-4 accent-[var(--navy)]" />
          Vencimientos de tareas
        </label>
      </div>

      <div className="mt-4">
        {error ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] bg-bad-soft px-4 py-3 text-bad">
            <p className="flex-1 text-[14px]">{error}</p>
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
          </div>
        ) : cargando ? (
          <LoadingState label="Cargando la agenda" rows={4} />
        ) : vista === "mes" ? (
          <CalendarioMes elementos={delCalendario} mes={ancla} onMes={setAncla} vacio="Nada agendado este día." />
        ) : vista === "semana" ? (
          <section aria-label={`Semana del ${diaCorto(desde)} al ${diaCorto(hasta)}`} className="overflow-hidden rounded-[var(--radius-lg)] bg-sheet shadow-[0_0_0_1px_var(--line)]">
            <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
              <h2 aria-live="polite" className="font-display text-[19px] text-ink">{diaCorto(desde)} – {diaCorto(hasta)}</h2>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setAncla(sumarDias(desde, -7))} aria-label="Semana anterior" className="grid size-10 place-items-center rounded-lg text-ink-2 hover:bg-manila hover:text-ink"><ChevronLeft size={18} aria-hidden="true" /></button>
                <button type="button" onClick={() => setAncla(hoyISO())} className="min-h-10 rounded-lg px-3 text-[13px] font-semibold text-ink-2 hover:bg-manila hover:text-ink">Hoy</button>
                <button type="button" onClick={() => setAncla(sumarDias(desde, 7))} aria-label="Semana siguiente" className="grid size-10 place-items-center rounded-lg text-ink-2 hover:bg-manila hover:text-ink"><ChevronRight size={18} aria-hidden="true" /></button>
              </div>
            </header>
            <ol className="divide-y divide-line lg:grid lg:grid-cols-7 lg:divide-x lg:divide-y-0">
              {Array.from({ length: 7 }, (_, i) => sumarDias(desde, i)).map((dia, i) => {
                const items = porDia.get(dia) ?? [];
                return (
                  <li key={dia} className={cx("min-w-0 lg:min-h-[22rem]", items.length === 0 && dia !== hoy && "max-lg:hidden", dia === hoy && "bg-navy-soft/40")}>
                    <h3 className="flex items-baseline gap-2 px-4 pb-1.5 pt-3 lg:flex-col lg:items-start lg:gap-0 lg:px-3">
                      <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">{DIAS_SEMANA[i]}</span>
                      <span className={cx("text-[15px] font-semibold tabular-nums lg:text-[22px] lg:font-normal lg:font-display", dia === hoy ? "text-navy-ink" : "text-ink")}>
                        <span className="lg:hidden">{diaLargo(dia).replace(/^\S+\s/, "")}</span>
                        <span className="hidden lg:inline">{Number(dia.slice(8))}</span>
                      </span>
                    </h3>
                    <ul className="space-y-1.5 px-3 pb-3">
                      {items.map((e) => <TarjetaElemento key={e.clave} elemento={e} compacta />)}
                      {items.length === 0 && <li className="px-1 py-2 text-[13px] text-ink-3">{dia === hoy ? "Nada agendado hoy." : "Libre."}</li>}
                    </ul>
                  </li>
                );
              })}
            </ol>
            {elementos.length === 0 && (
              <p className="border-t border-line px-5 py-4 text-[14px] text-ink-3 lg:hidden">No hay nada agendado esta semana.</p>
            )}
          </section>
        ) : elementos.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] bg-sheet px-6 py-12 text-center shadow-[0_0_0_1px_var(--line)]">
            <p className="font-display text-[19px] text-ink">Nada en los próximos 30 días</p>
            <p className="mx-auto mt-1 max-w-sm text-[14px] text-ink-3">Cuando agendes una audiencia o una tarea tenga fecha límite, aparecerá aquí.</p>
          </div>
        ) : (
          <ol className="space-y-5">
            {[...porDia.entries()].map(([dia, items]) => (
              <li key={dia}>
                <h3 className="mb-2 text-[14px] font-semibold first-letter:uppercase text-ink">
                  {dia === hoy ? "Hoy, " : dia === sumarDias(hoy, 1) ? "Mañana, " : ""}{diaLargo(dia)}
                </h3>
                <ul className="space-y-2">{items.map((e) => <TarjetaElemento key={e.clave} elemento={e} />)}</ul>
              </li>
            ))}
          </ol>
        )}
      </div>

      <SuscripcionCalendario open={suscripcion} onClose={() => setSuscripcion(false)} />
      <NuevoEventoModal open={nuevo} onClose={() => setNuevo(false)} onCreado={() => void cargar()} />
    </div>
  );
}

function TarjetaElemento({ elemento: e, compacta = false }: { elemento: Elemento; compacta?: boolean }) {
  const cancelado = e.estado === "CANCELADO";
  return (
    <li>
      <Link
        href={e.enlace}
        className={cx(
          "block rounded-lg bg-sheet px-3 py-2.5 shadow-[0_0_0_1px_var(--line)] transition-colors hover:bg-manila/60",
          e.tipo === "evento" && !cancelado && (e.etiqueta === "Audiencia" ? "shadow-[inset_3px_0_0_var(--gold),0_0_0_1px_var(--line)]" : "shadow-[inset_3px_0_0_var(--navy),0_0_0_1px_var(--line)]"),
          e.vencida && "shadow-[inset_3px_0_0_var(--bad),0_0_0_1px_var(--line)]",
          compacta ? "lg:px-2.5 lg:py-2" : "sm:flex sm:items-start sm:gap-4",
        )}
      >
        <span className={cx("block text-[12.5px] tabular-nums text-ink-3", !compacta && "sm:w-24 sm:shrink-0 sm:pt-0.5 sm:text-[13.5px]")}>
          {e.todo_el_dia ? (e.vencida ? "Venció" : "Vence") : horaDe(e.inicio)}
          {!e.todo_el_dia && e.fin && <span className={cx(compacta && "lg:hidden")}> – {horaDe(e.fin)}</span>}
        </span>
        <span className="block min-w-0 flex-1">
          <span className={cx("block font-semibold leading-snug text-pretty text-ink", compacta && "lg:text-[13.5px]", cancelado && "line-through opacity-60")}>{e.titulo}</span>
          {e.proceso && <span className="block truncate text-[12.5px] text-ink-3">{e.proceso.nombre}</span>}
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            <Tag tone={tono(e)}>{cancelado ? "Cancelado" : e.etiqueta}</Tag>
          </span>
        </span>
      </Link>
    </li>
  );
}
