"use client";

import { useState, type ReactNode } from "react";
import { CalendarDays, CheckCircle2, ChevronDown, Download, ListChecks, Upload } from "lucide-react";

import { EnlaceBoton } from "@/components/ui/Button";
import { Etapas } from "@/components/ui/Etapas";
import { Folio } from "@/components/ui/Folio";
import { Tag } from "@/components/ui/Tag";
import { cx } from "@/lib/cx";
import { ETAPAS, indiceEtapa, nombreEtapa } from "@/lib/etapas";
import { diaLargo, fechaLarga, horaDe } from "@/lib/fechas";
import {
  cuantasCosas,
  rutaPendiente,
  textoEstado,
  tonoEstado,
  type EntradaHistoria,
  type Pendiente,
  type ResumenProcesoCliente,
} from "@/lib/portalCliente";

/** Título de página del portal: más grande y con más aire que en el panel de la firma. */
export function TituloCliente({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-[30px] leading-tight text-ink [text-wrap:balance] sm:text-[36px]">{children}</h1>
      {sub && <p className="mt-2 text-ink-2">{sub}</p>}
    </div>
  );
}

export function AlDia({ className }: { className?: string }) {
  return (
    <div role="status" className={cx("flex gap-3 rounded-2xl bg-ok-soft px-5 py-4 text-ok", className)}>
      <CheckCircle2 aria-hidden="true" size={22} className="mt-0.5 shrink-0" />
      <div>
        <p className="font-semibold">Está al día</p>
        <p className="text-[16px] text-ink-2">No necesitamos nada de usted por ahora. Le avisaremos si eso cambia.</p>
      </div>
    </div>
  );
}

function cuandoVence(pendiente: Pendiente): string {
  if (!pendiente.vence) return "Sin fecha límite";
  return pendiente.vencido ? `Venció el ${diaLargo(pendiente.vence)}` : `Antes del ${diaLargo(pendiente.vence)}`;
}

/** Lo que la firma necesita del cliente: una tarjeta y un solo botón por cosa. */
export function PendientesCliente({ pendientes, conProceso = false, titulo }: {
  pendientes: Pendiente[];
  conProceso?: boolean;
  titulo?: string;
}) {
  return (
    <section
      aria-labelledby="pendientes-cliente"
      className="rounded-2xl bg-gold-soft p-4 ring-1 ring-[color-mix(in_oklab,var(--gold)_45%,transparent)] sm:p-6"
    >
      <h2 id="pendientes-cliente" className="px-1 font-display text-[22px] leading-snug text-ink sm:px-0">
        {titulo ?? `Necesitamos ${cuantasCosas(pendientes.length)} de usted`}
      </h2>
      <ul className="mt-4 space-y-3">
        {pendientes.map((pendiente) => (
          <li key={pendiente.clave} className="flex flex-col gap-4 rounded-xl bg-sheet px-4 py-4 shadow-sheet sm:flex-row sm:items-center sm:px-5">
            <div className="min-w-0 sm:flex-1">
              <p className="font-semibold text-ink">{pendiente.titulo}</p>
              <p className={cx("mt-0.5 text-[15px] first-letter:uppercase", pendiente.vencido ? "font-semibold text-bad" : "text-ink-2")}>
                {cuandoVence(pendiente)}
              </p>
              {(pendiente.detalle || conProceso) && (
                <p className="mt-0.5 text-[15px] text-ink-3">
                  {[pendiente.detalle, conProceso ? pendiente.proceso.nombre : null].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <EnlaceBoton
              size="lg"
              href={rutaPendiente(pendiente)}
              className="w-full sm:w-auto"
              icon={pendiente.tipo === "documento" ? <Upload aria-hidden="true" size={18} /> : <ListChecks aria-hidden="true" size={18} />}
            >
              {pendiente.tipo === "documento" ? "Enviar documento" : "Ver qué hacer"}
            </EnlaceBoton>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** La línea de etapas con lo que se hace ahora, en lenguaje claro. */
export function EnQueVa({ proceso }: { proceso: Pick<ResumenProcesoCliente, "etapa" | "etapa_explicacion"> }) {
  const indice = indiceEtapa(proceso.etapa);
  if (indice < 0) {
    return <p className="text-[16px] text-ink-2">La firma todavía no ha marcado en qué etapa va su proceso.</p>;
  }
  const explicacion = proceso.etapa_explicacion ?? "";
  return (
    <>
      <Etapas etapas={ETAPAS.map((e) => e.nombre)} actual={indice} grande />
      <p className="mt-4 text-[16px] text-ink-2">
        Estamos en <b className="font-semibold text-ink">{nombreEtapa(proceso.etapa).toLowerCase()}</b>
        {explicacion && `: ${explicacion.charAt(0).toLowerCase()}${explicacion.slice(1)}`}
      </p>
    </>
  );
}

export function ProximaFecha({ fecha, className }: { fecha: ResumenProcesoCliente["proxima_fecha"]; className?: string }) {
  return (
    <div className={cx("rounded-xl bg-manila px-5 py-4", className)}>
      <p className="flex items-center gap-2 text-[15px] text-ink-2">
        <CalendarDays aria-hidden="true" size={18} strokeWidth={1.75} /> Próxima fecha
      </p>
      {fecha ? (
        <>
          <p className="mt-2 font-display text-[24px] leading-tight text-ink first-letter:uppercase">{fechaLarga(fecha.inicio)}</p>
          <p className="text-[15px] text-ink-2">{horaDe(fecha.inicio)} · {fecha.titulo}</p>
          {fecha.descripcion && <p className="mt-1 text-[14px] text-ink-3">{fecha.descripcion}</p>}
        </>
      ) : (
        <p className="mt-2 text-[16px] text-ink-2">No hay fechas programadas por ahora.</p>
      )}
    </div>
  );
}

/** Un folio del expediente contado al cliente. */
export function EntradaCliente({ entrada, proceso }: { entrada: EntradaHistoria; proceso?: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <li
      id={entrada.actuacion_id ? `actuacion-${entrada.actuacion_id}` : undefined}
      className={cx("flex scroll-mt-24 gap-4 px-5 py-4 sm:px-7", entrada.nuevo && "bg-[color-mix(in_oklab,var(--gold-soft)_60%,transparent)]")}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[15px] text-ink-3">
          <span className="inline-block first-letter:uppercase">{fechaLarga(entrada.fecha)}</span>
          {proceso && <span> · {proceso}</span>}
          {entrada.nuevo && <span className="ml-2 rounded bg-gold-soft px-1.5 py-0.5 text-[13px] font-semibold text-gold-ink">Nuevo</span>}
        </p>
        <p className="mt-1 text-ink">{entrada.texto}</p>
        {entrada.estado && (
          <Tag tone={tonoEstado(entrada.estado)} className="mt-2 h-7 px-2.5 text-[13px]">{textoEstado(entrada.estado)}</Tag>
        )}
        {entrada.nota && <p className="mt-2 rounded-lg bg-manila px-3 py-2 text-[15px] text-ink-2">{entrada.nota}</p>}
        {!entrada.explicada && (
          <p className="mt-1 text-[15px] text-ink-3">Así lo publicó el juzgado. Si tiene dudas, escríbanos.</p>
        )}
        {entrada.texto_juzgado && (
          <>
            <button
              type="button"
              onClick={() => setAbierto((v) => !v)}
              aria-expanded={abierto}
              className="mt-1 inline-flex min-h-10 items-center gap-1 rounded text-left text-[15px] font-semibold text-navy-ink hover:underline"
            >
              {abierto ? "Ocultar" : "Ver"} el texto del juzgado
              <ChevronDown aria-hidden="true" size={16} className={cx("transition-transform duration-200", abierto && "rotate-180")} />
            </button>
            {abierto && (
              <p className="motion-fade-in mt-1 rounded-lg bg-manila px-3 py-2 text-[15px] italic text-ink-2">«{entrada.texto_juzgado}»</p>
            )}
          </>
        )}
        {entrada.archivo && (
          <a
            href={entrada.archivo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex min-h-10 max-w-full items-center gap-1.5 rounded text-[15px] font-semibold text-navy-ink hover:underline"
          >
            <Download aria-hidden="true" size={16} className="shrink-0" />
            <span className="truncate">Descargar {entrada.archivo.nombre}</span>
          </a>
        )}
      </div>
      <Folio n={entrada.folio} nuevo={entrada.nuevo} size="sm" className="mt-0.5" />
    </li>
  );
}

export function FilasCargando({ filas = 3 }: { filas?: number }) {
  return (
    <ul aria-hidden="true" className="divide-y divide-line">
      {Array.from({ length: filas }, (_, i) => (
        <li key={i} className="space-y-2 px-5 py-4 sm:px-7">
          <span className="block h-3.5 w-40 animate-pulse rounded bg-manila" />
          <span className="block h-4 w-3/4 animate-pulse rounded bg-manila" />
        </li>
      ))}
    </ul>
  );
}
