"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ListChecks, Play, RefreshCw, Search } from "lucide-react";

import { CAMPO } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Interruptor } from "@/components/ui/Interruptor";
import { LoadingState } from "@/components/ui/LoadingState";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Sheet, SheetHeader } from "@/components/ui/Sheet";
import { Tag } from "@/components/ui/Tag";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { fechaConHora, fechaRelativa } from "@/lib/fechas";
import { useLoadEffect } from "@/lib/useLoadEffect";
import { DIAS_SEMANA, ESTADO_EJECUCION, ESTADO_RESULTADO, horaColombia, lanzarConsulta, momentoColombia, type Ejecucion } from "@/lib/operacion";

type Panel = Esquemas["PanelConsultas"];
type Detalle = Esquemas["DetalleEjecucion"];

const ADMIN = "/gestion-procesos/admin";

function resumenEjecucion(e: Ejecucion) {
  const partes = [`${e.procesados} de ${e.total} ${e.total === 1 ? "radicado" : "radicados"}`];
  if (e.actuaciones_nuevas) partes.push(`${e.actuaciones_nuevas} ${e.actuaciones_nuevas === 1 ? "actuación nueva" : "actuaciones nuevas"}`);
  if (e.errores) partes.push(`${e.errores} con error`);
  return partes.join(" · ");
}

function Programacion({ panel, onGuardada }: { panel: Panel; onGuardada: (c: Panel["configuracion"]) => void }) {
  const { toast } = useToast();
  const [activa, setActiva] = useState(panel.configuracion.activa);
  const [dias, setDias] = useState<number[]>(panel.configuracion.dias);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cambio = activa !== panel.configuracion.activa || dias.join() !== panel.configuracion.dias.join();
  const horas = panel.configuracion.horas.map(horaColombia).join(" y ");

  async function guardar() {
    setGuardando(true);
    setError(null);
    const { data, error: fallo } = await api.PUT("/api/v2/admin/consultas/programacion", { body: { activa, dias } });
    setGuardando(false);
    if (fallo || !data) {
      setError(fallo?.campos?.dias ?? mensajeDeError(fallo));
      return;
    }
    toast({ title: data.activa ? "Consultas automáticas programadas" : "Consultas automáticas apagadas", tone: "success" });
    onGuardada(data);
  }

  return (
    <Sheet aria-labelledby="consultas-programacion">
      <SheetHeader title={<span id="consultas-programacion">Consultas automáticas</span>} />
      <div className="space-y-4 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[14px] font-semibold text-ink">{activa ? "Encendidas" : "Apagadas"}</p>
            <p className="text-[13px] text-ink-2">A las {horas}, hora de Colombia.</p>
          </div>
          <Interruptor activo={activa} onCambio={setActiva} etiqueta="Consultas automáticas" />
        </div>
        <fieldset disabled={!activa} className="disabled:opacity-50">
          <legend className="mb-2 text-[13px] font-semibold text-ink-2">Días</legend>
          <div className="flex gap-1.5">
            {DIAS_SEMANA.map((dia) => {
              const elegido = dias.includes(dia.valor);
              return (
                <button
                  key={dia.valor}
                  type="button"
                  aria-pressed={elegido}
                  aria-label={dia.nombre}
                  title={dia.nombre}
                  onClick={() => setDias((actuales) => (elegido ? actuales.filter((d) => d !== dia.valor) : [...actuales, dia.valor].sort()))}
                  className={cx(
                    "grid size-10 place-items-center rounded-lg text-[14px] font-semibold transition-colors",
                    elegido ? "bg-navy text-on-navy" : "bg-sheet text-ink-2 shadow-[0_0_0_1px_var(--line-strong)] hover:text-ink",
                  )}
                >
                  {dia.corto}
                </button>
              );
            })}
          </div>
        </fieldset>
        {panel.configuracion.proxima && !cambio && (
          <p className="text-[13px] text-ink-2">
            Próxima: <span className="font-semibold text-ink">{momentoColombia(panel.configuracion.proxima)}</span>
          </p>
        )}
        {error && <p role="alert" className="text-[13px] text-bad">{error}</p>}
        <Button size="sm" onClick={() => void guardar()} loading={guardando} disabled={!cambio}>Guardar</Button>
      </div>
    </Sheet>
  );
}

function ElegirRadicados({ open, onClose, onLanzar }: { open: boolean; onClose: () => void; onLanzar: (ids: number[]) => Promise<void> }) {
  const [q, setQ] = useState("");
  const [opciones, setOpciones] = useState<Esquemas["RadicadoConsultable"][] | null>(null);
  const [elegidos, setElegidos] = useState<Map<number, string>>(new Map());
  const [lanzando, setLanzando] = useState(false);

  useEffect(() => {
    if (!open) return;
    const temporizador = window.setTimeout(async () => {
      const { data } = await api.GET("/api/v2/admin/consultas/radicados", { params: { query: { q: q || undefined } } });
      setOpciones(data ?? []);
    }, 250);
    return () => window.clearTimeout(temporizador);
  }, [open, q]);

  function alternar(id: number, numero: string) {
    setElegidos((actual) => {
      const nuevo = new Map(actual);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.set(id, numero);
      return nuevo;
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Elegir radicados" description="Se consultan ahora en la Rama Judicial; las actuaciones nuevas se avisan como siempre.">
      <label className="relative block">
        <span className="sr-only">Buscar por número o proceso</span>
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Número del radicado o nombre del proceso" className={cx(CAMPO, "pl-9")} />
      </label>
      <ul className="mt-3 max-h-80 divide-y divide-line overflow-y-auto rounded-lg border border-line">
        {opciones === null ? (
          <li className="px-3 py-4 text-[14px] text-ink-2">Buscando…</li>
        ) : opciones.length === 0 ? (
          <li className="px-3 py-4 text-[14px] text-ink-2">Ningún radicado coincide.</li>
        ) : opciones.map((r) => (
          <li key={r.id}>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-sheet-2">
              <input type="checkbox" checked={elegidos.has(r.id)} onChange={() => alternar(r.id, r.numero)} className="size-4 accent-[var(--navy)]" />
              <span className="min-w-0">
                <span className="block font-mono text-[13.5px] text-ink">{r.numero}</span>
                {r.proceso && <span className="block truncate text-[13px] text-ink-2">{r.proceso}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button
          icon={<Play size={16} />}
          disabled={!elegidos.size}
          loading={lanzando}
          onClick={async () => {
            setLanzando(true);
            await onLanzar([...elegidos.keys()]);
            setLanzando(false);
            setElegidos(new Map());
          }}
        >
          {elegidos.size ? `Consultar ${elegidos.size} ${elegidos.size === 1 ? "radicado" : "radicados"}` : "Consultar"}
        </Button>
      </div>
    </Modal>
  );
}

export function PanelConsultas() {
  const { toast } = useToast();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [ejecuciones, setEjecuciones] = useState<Ejecucion[] | null>(null);
  const [siguiente, setSiguiente] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [eligiendo, setEligiendo] = useState(false);
  const [lanzando, setLanzando] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Detalle | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const [p, e] = await Promise.all([
      api.GET("/api/v2/admin/consultas"),
      api.GET("/api/v2/admin/consultas/ejecuciones", { params: { query: { limite: 15 } } }),
    ]);
    if (p.error || e.error || !p.data || !e.data) setError(mensajeDeError(p.error ?? e.error));
    else {
      setPanel(p.data);
      setEjecuciones(e.data.items);
      setSiguiente(e.data.siguiente);
    }
    setCargando(false);
  }, []);
  useLoadEffect(cargar);

  const cargarDetalle = useCallback(async () => {
    if (!abierta) return;
    setDetalle(null);
    const { data } = await api.GET("/api/v2/admin/consultas/ejecuciones/{ejecucion_id}", { params: { path: { ejecucion_id: abierta } } });
    setDetalle(data ?? null);
  }, [abierta]);
  useLoadEffect(cargarDetalle);

  async function verMas() {
    if (!siguiente) return;
    const { data } = await api.GET("/api/v2/admin/consultas/ejecuciones", { params: { query: { limite: 15, cursor: siguiente } } });
    if (data) {
      setEjecuciones((actuales) => [...(actuales ?? []), ...data.items]);
      setSiguiente(data.siguiente);
    }
  }

  async function lanzar(ids?: number[]) {
    setLanzando(true);
    const fallo = await lanzarConsulta(ids);
    setLanzando(false);
    if (fallo) {
      toast({ title: "No se inició la consulta", description: fallo, tone: "error" });
      return;
    }
    setEligiendo(false);
    toast({
      title: "Consulta iniciada",
      description: ids?.length ? `Se consultan ${ids.length} ${ids.length === 1 ? "radicado" : "radicados"}. Tarda unos minutos.` : "Se consultan todos los radicados activos. Tarda unos minutos.",
      tone: "success",
    });
    window.setTimeout(() => void cargar(), 1500);
  }

  if (!panel) {
    return (
      <div>
        <PageHeader title="Consultas judiciales" />
        {cargando ? <LoadingState label="Cargando las consultas" rows={4} /> : (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-bad-soft px-4 py-3 text-bad">
            <p className="flex-1 text-[14px]">{error}</p>
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Consultas judiciales"
        description="La firma revisa cada radicado en la Rama Judicial y avisa las actuaciones nuevas."
        action={(
          <>
            <Button variant="secondary" icon={<ListChecks size={16} />} onClick={() => setEligiendo(true)}>Elegir radicados</Button>
            <Button icon={<Play size={16} />} loading={lanzando && !eligiendo} onClick={() => void lanzar()}>Consultar todos ahora</Button>
          </>
        )}
      />

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
          <Sheet aria-labelledby="consultas-error" className="order-1 lg:order-none">
            <SheetHeader title={<span id="consultas-error">Radicados con error</span>} count={panel.con_error.length || undefined} />
            {panel.con_error.length ? (
              <ul className="divide-y divide-line">
                {panel.con_error.map((r) => (
                  <li key={r.radicado_id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[13.5px] text-ink">{r.numero}</p>
                      <Link href={`${ADMIN}/procesos/${r.proceso_id}`} className="text-[14px] font-semibold text-ink hover:underline">{r.proceso}</Link>
                      {r.error && <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-2">{r.error}</p>}
                      {r.fecha && <p className="mt-0.5 text-[12.5px] text-ink-3">Última vez: {fechaRelativa(r.fecha)}</p>}
                    </div>
                    <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} disabled={lanzando} onClick={() => void lanzar([r.radicado_id])}>
                      Consultar de nuevo
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-start gap-3 px-4 py-4">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 text-ok" />
                <p className="text-[14px] text-ink-2">La última consulta de cada radicado activo salió bien.</p>
              </div>
            )}
          </Sheet>

          <Sheet aria-labelledby="consultas-historial" className="order-3 lg:order-none">
            <SheetHeader title={<span id="consultas-historial">Consultas realizadas</span>} />
            {ejecuciones?.length ? (
              <>
                <ul className="divide-y divide-line">
                  {ejecuciones.map((e) => {
                    const estado = ESTADO_EJECUCION[e.estado];
                    return (
                      <li key={e.id}>
                        <button type="button" onClick={() => setAbierta(e.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-sheet-2">
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-x-2 text-[14px] font-semibold text-ink">
                              {fechaConHora(e.inicio)}
                              <span className="text-[13px] font-normal text-ink-2">{e.manual ? "Manual" : "Automática"}</span>
                            </span>
                            <span className="block text-[13px] tabular-nums text-ink-2">{resumenEjecucion(e)}</span>
                          </span>
                          <Tag tone={estado.tono}>{estado.nombre}</Tag>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {siguiente && (
                  <div className="border-t border-line px-4 py-2">
                    <Button size="sm" variant="ghost" onClick={() => void verMas()}>Ver anteriores</Button>
                  </div>
                )}
              </>
            ) : (
              <p className="px-4 py-5 text-[14px] text-ink-2">Aún no se ha hecho ninguna consulta.</p>
            )}
          </Sheet>
        </div>
        <aside className="order-2 lg:order-none">
          <Programacion key={`${panel.configuracion.activa}-${panel.configuracion.dias.join()}`} panel={panel} onGuardada={(configuracion) => setPanel({ ...panel, configuracion })} />
        </aside>
      </div>

      <ElegirRadicados open={eligiendo} onClose={() => setEligiendo(false)} onLanzar={lanzar} />
      <Drawer
        open={abierta !== null}
        onClose={() => setAbierta(null)}
        title={detalle ? `Consulta del ${fechaConHora(detalle.inicio)}` : "Consulta"}
        subtitle={detalle ? resumenEjecucion(detalle) : undefined}
      >
        {!detalle ? <LoadingState label="Cargando el resultado" rows={3} /> : detalle.radicados.length ? (
          <ul className="divide-y divide-line">
            {detalle.radicados.map((r) => {
              const estado = ESTADO_RESULTADO[r.estado];
              return (
                <li key={r.radicado_id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-[13.5px] text-ink">{r.numero}</span>
                    <Tag tone={estado.tono}>{estado.nombre}</Tag>
                  </div>
                  {r.actuaciones_nuevas > 0 && <p className="mt-0.5 text-[13px] text-ink-2">{r.actuaciones_nuevas} {r.actuaciones_nuevas === 1 ? "actuación nueva" : "actuaciones nuevas"}</p>}
                  {r.error && <p className="mt-0.5 text-[13px] text-bad">{r.error}</p>}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[14px] text-ink-2">Esta consulta no tiene radicados registrados.</p>
        )}
      </Drawer>
    </div>
  );
}
