"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlarmClock,
  ArrowRight,
  Calculator,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FolderPlus,
  Plus,
  RefreshCw,
} from "lucide-react";

import { CalculadoraTermino } from "@/components/expediente/CalculadoraTermino";
import { FoliosNuevosHoy } from "@/components/expediente/FoliosNuevosHoy";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { Modal } from "@/components/ui/Modal";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Bandeja = Esquemas["Bandeja"];
type Pendiente = Esquemas["Pendiente"];
type Tone = "danger" | "warning" | "info" | "brand";

const BASE = "/gestion-procesos/abogado";
const TIME_ZONE = "America/Bogota";

const ACCIONES = [
  { label: "Nuevo proceso", href: `${BASE}/procesos?nuevo=1` },
  { label: "Nuevo cliente", href: `${BASE}/clientes?nuevo=1` },
  { label: "Agregar radicado", href: `${BASE}/radicados?nuevo=1` },
  { label: "Crear tarea", href: `${BASE}/tareas?nuevo=1` },
  { label: "Solicitar documento", href: `${BASE}/documentos?nuevo=1` },
  { label: "Agendar evento", href: `${BASE}/agenda?nuevo=1` },
];

const toneClasses: Record<Tone, string> = {
  danger: "bg-danger-light text-danger",
  warning: "bg-warning-light text-warning",
  info: "bg-info-light text-info",
  brand: "bg-primary-light text-primary",
};

/** Cómo se presenta cada pendiente de la bandeja. */
function presentacion(item: Pendiente): { kind: string; icon: LucideIcon; tone: Tone; action: string; primary: boolean } {
  if (item.tipo === "documento") return { kind: "Documento por revisar", icon: FileCheck2, tone: "info", action: "Revisar documento", primary: false };
  if (item.tipo === "evento") return { kind: item.detalle ?? "Agenda", icon: CalendarDays, tone: "brand", action: "Ver en agenda", primary: false };
  if (item.urgencia === "vencida") return { kind: "Tarea vencida", icon: AlarmClock, tone: "danger", action: "Abrir tarea", primary: true };
  return { kind: item.urgencia === "hoy" ? "Vence hoy" : "Vence pronto", icon: AlarmClock, tone: "warning", action: "Abrir tarea", primary: item.urgencia === "hoy" };
}

function dayKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(value);
}

/** «Hoy», «Mañana», «Hace 3 días», «En 4 días» o la fecha corta. */
function relativeDay(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const days = Math.round((Date.parse(dayKey(date)) - Date.parse(dayKey(new Date()))) / 86_400_000);
  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  if (days === -1) return "Ayer";
  if (days < 0) return `Hace ${-days} días`;
  if (days < 7) return `En ${days} días`;
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: TIME_ZONE }).format(date);
}

function hourOf(value: string) {
  return new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: TIME_ZONE }).format(new Date(value));
}

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: TIME_ZONE }).format(new Date()));
  return hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
}

export function HoyPanel({ firstName }: { firstName: string }) {
  const [bandeja, setBandeja] = useState<Bandeja | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calculando, setCalculando] = useState(false);
  // Al actualizar se vuelven a pedir también los folios nuevos.
  const [version, setVersion] = useState(0);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/bandeja");
    if (fallo || !data) setError(mensajeDeError(fallo));
    else setBandeja(data);
    setLoading(false);
  }, []);
  useLoadEffect(cargar);

  const today = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: TIME_ZONE }).format(new Date());
  const resumen = bandeja?.resumen;
  const pendientes = bandeja?.pendientes ?? [];
  const stats = resumen
    ? [
        { label: "Procesos activos", value: resumen.procesos_activos, href: `${BASE}/procesos`, tone: "text-foreground" },
        { label: resumen.tareas_vencidas === 1 ? "Tarea vencida" : "Tareas vencidas", value: resumen.tareas_vencidas, href: `${BASE}/tareas`, tone: resumen.tareas_vencidas ? "text-danger" : "text-foreground" },
        { label: "Vencen esta semana", value: resumen.vencen_esta_semana, href: `${BASE}/agenda`, tone: resumen.vencen_esta_semana ? "text-warning" : "text-foreground" },
        { label: "Documentos por revisar", value: resumen.documentos_por_revisar, href: `${BASE}/documentos`, tone: resumen.documentos_por_revisar ? "text-info" : "text-foreground" },
      ]
    : [];

  return (
    <div className="motion-swap mx-auto max-w-6xl">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-gold-600 first-letter:uppercase dark:text-gold-400">{today}</p>
          <h1 className="font-display text-[30px] font-medium leading-tight tracking-[-0.01em] text-foreground sm:text-[36px]">
            {greeting()}{firstName ? `, ${firstName}` : ""}
          </h1>
          {bandeja && (
            <p className="mt-1 text-[15px] text-foreground-secondary">
              {pendientes.length
                ? `Tienes ${pendientes.length} ${pendientes.length === 1 ? "pendiente" : "pendientes"}. Empieza por lo vencido.`
                : "No hay nada urgente. Buen momento para avanzar en tus procesos."}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setVersion((v) => v + 1); void cargar(); }}
          disabled={loading}
          icon={<RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />}
        >
          Actualizar
        </Button>
      </header>

      {error && (
        <div role="alert" className="mb-6 flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] bg-bad-soft px-4 py-3 text-bad">
          <p className="flex-1 text-[14px]">{error}</p>
          <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
        </div>
      )}

      {resumen && resumen.procesos_activos === 0 ? (
        <section className="motion-rise-in rounded-[var(--radius-lg)] bg-sheet px-6 py-10 text-center shadow-sheet" aria-labelledby="hoy-bienvenida">
          <span className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-manila text-ink-2"><FolderPlus aria-hidden="true" className="size-6" /></span>
          <h2 id="hoy-bienvenida" className="text-[17px] font-semibold text-ink">Tu espacio de trabajo está listo</h2>
          <p className="mx-auto mt-1 max-w-[52ch] text-[14.5px] text-ink-2">Crea el primer expediente. Desde su ficha vinculas al cliente, registras radicados y organizas tareas y documentos; aquí verás lo urgente de cada día.</p>
          <Link href={`${BASE}/procesos?nuevo=1`} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-navy px-4 text-[14px] font-semibold text-on-navy hover:bg-navy-hover">
            Crear proceso <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </section>
      ) : (
        <>
          {/* Indicadores compactos: informan sin competir con la bandeja. */}
          <div className="no-scrollbar -mx-4 mb-7 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-3 sm:px-0">
            {resumen
              ? stats.map((stat) => (
                  <Link key={stat.label} href={stat.href} className="motion-hover-lift min-w-[148px] shrink-0 rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3 hover:border-border-strong">
                    <p className={`font-display text-[28px] font-medium leading-none tabular-nums ${stat.tone}`}><AnimatedNumber value={stat.value} /></p>
                    <p className="mt-1.5 text-[13px] text-foreground-secondary">{stat.label}</p>
                  </Link>
                ))
              : Array.from({ length: 4 }, (_, i) => <div key={i} className="h-[76px] min-w-[148px] shrink-0 animate-pulse rounded-[var(--radius-lg)] bg-manila" />)}
          </div>

          <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0">
              <FoliosNuevosHoy key={version} />
              <section aria-labelledby="bandeja-titulo">
                <div className="mb-3">
                  <h2 id="bandeja-titulo" className="text-[17px] font-semibold text-foreground">Requiere tu atención</h2>
                  <p className="text-sm text-foreground-muted">Ordenado por urgencia</p>
                </div>
                {!bandeja && loading ? (
                  <LoadingState label="Cargando pendientes" rows={3} />
                ) : pendientes.length === 0 ? (
                  <div className="motion-rise-in flex flex-col items-center rounded-[var(--radius-lg)] border border-dashed border-border-strong px-6 py-10 text-center">
                    <span className="motion-pop mb-3 grid size-12 place-items-center rounded-full bg-success-light text-success [animation-delay:100ms]"><CheckCircle2 aria-hidden="true" className="size-6" /></span>
                    <p className="font-semibold text-foreground">Todo al día</p>
                    <p className="mt-1 max-w-[42ch] text-sm text-foreground-secondary">No hay tareas vencidas ni documentos por revisar. Lo que venza en los próximos siete días aparecerá aquí.</p>
                  </div>
                ) : (
                  <ul className="motion-stagger flex flex-col gap-3">
                    {pendientes.map((item) => {
                      const { kind, icon: Icon, tone, action, primary } = presentacion(item);
                      const when = relativeDay(item.fecha);
                      return (
                        <li key={item.clave} className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 sm:p-5">
                          <div className="flex gap-3.5">
                            <span className={`relative mt-0.5 grid size-10 shrink-0 place-items-center rounded-[var(--radius-md)] ${toneClasses[tone]}`}>
                              <Icon aria-hidden="true" className="size-[19px]" />
                              {/* Lo vencido llama la atención con una onda suave. */}
                              {tone === "danger" && <span aria-hidden="true" className="motion-attention absolute -right-1 -top-1 size-2.5 rounded-full bg-danger ring-2 ring-surface" />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-foreground-muted">{kind}</p>
                                {when && (
                                  <span className="inline-flex items-center gap-1 text-xs text-foreground-muted">
                                    <Clock3 aria-hidden="true" className="size-3" />
                                    {item.tipo === "evento" && item.fecha ? `${when}, ${hourOf(item.fecha)}` : when}
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 font-semibold text-pretty text-foreground">{item.titulo}</p>
                              <p className="mt-0.5 text-sm text-foreground-secondary">
                                {[item.proceso?.nombre, item.tipo === "documento" ? item.detalle : null].filter(Boolean).join(" · ") || "Tarea general"}
                              </p>
                              <Link
                                href={item.enlace}
                                className={`mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-md)] px-3 text-[13px] font-semibold transition-colors ${
                                  primary ? "bg-brand-900 !text-white hover:bg-brand-800" : "border border-border bg-surface text-foreground hover:bg-surface-hover"
                                }`}
                              >
                                {action}
                                <ArrowRight aria-hidden="true" className="size-3.5" />
                              </Link>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>

            <aside className="flex flex-col gap-7">
              <section>
                <h2 className="mb-3 text-[17px] font-semibold text-foreground">Acciones rápidas</h2>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setCalculando(true)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-surface px-3 text-sm font-medium text-foreground hover:bg-surface-hover"
                  >
                    <Calculator aria-hidden="true" className="size-4 text-foreground-muted" />
                    Calcular un término
                  </button>
                  {ACCIONES.map((accion) => (
                    <Link key={accion.label} href={accion.href} className="inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-surface px-3 text-sm font-medium text-foreground hover:bg-surface-hover">
                      <Plus aria-hidden="true" className="size-4 text-foreground-muted" />
                      {accion.label}
                    </Link>
                  ))}
                </div>
              </section>
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-[17px] font-semibold text-foreground">Esta semana</h2>
                  <Link href={`${BASE}/agenda`} className="text-sm font-semibold text-primary hover:underline">Ver agenda</Link>
                </div>
                {bandeja?.agenda.length ? (
                  <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
                    {bandeja.agenda.map((evento) => (
                      <li key={evento.clave}>
                        <Link href={evento.enlace} className="flex gap-3 px-4 py-3 hover:bg-surface-hover">
                          <span className="w-16 shrink-0 text-[12.5px] leading-tight text-foreground-muted">
                            <span className="block font-semibold text-foreground">{relativeDay(evento.fecha)}</span>
                            {evento.fecha && hourOf(evento.fecha)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-foreground">{evento.titulo}</span>
                            <span className="block truncate text-xs text-foreground-muted">{[evento.detalle, evento.proceso?.nombre].filter(Boolean).join(" · ")}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-6 text-center text-sm text-foreground-muted">
                    {bandeja ? "Sin audiencias ni eventos en los próximos siete días." : "Cargando agenda…"}
                  </p>
                )}
              </section>
            </aside>
          </div>
        </>
      )}

      <Modal open={calculando} onClose={() => setCalculando(false)} title="Calcular un término" description="Días hábiles desde el día siguiente a la notificación, sin festivos ni vacancia judicial.">
        <CalculadoraTermino />
      </Modal>
    </div>
  );
}
