"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, RefreshCw, Search, X } from "lucide-react";

import { CAMPO } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Initials } from "@/components/ui/Initials";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Sheet } from "@/components/ui/Sheet";
import { Tag } from "@/components/ui/Tag";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { diaDe, diaLargo, fechaConHora, horaDe, hoyISO, sumarDias } from "@/lib/fechas";
import { AREAS, type AreaActividad, type Registro } from "@/lib/sistema";
import { useValorDeUrl } from "@/lib/useAccionDeUrl";
import { useLoadEffect } from "@/lib/useLoadEffect";
import { RUTA_USUARIOS } from "@/lib/usuariosAdmin";

type Vista = "actividad" | "auditoria";
type Filtros = { q: string; area: AreaActividad | ""; desde: string; hasta: string; soloErrores: boolean; actorId: number | null };

const FILTRO = "h-10 min-w-0 rounded-lg bg-sheet px-3 text-[14px] text-ink shadow-[0_0_0_1px_var(--line-strong)] focus:outline-none focus:shadow-[0_0_0_2px_var(--navy)]";
const VACIOS: Filtros = { q: "", area: "", desde: "", hasta: "", soloErrores: false, actorId: null };
const TEXTOS: Record<Vista, { titulo: string; descripcion: string }> = {
  actividad: {
    titulo: "Actividad",
    descripcion: "Lo que hizo cada persona en la plataforma, lo más reciente primero. Las descargas y las alertas descartadas se ven en la auditoría técnica.",
  },
  auditoria: {
    titulo: "Auditoría técnica",
    descripcion: "Todos los registros, con el código de cada acción y su detalle técnico. Son la constancia de quién hizo qué y no se pueden borrar.",
  },
};

function consulta(f: Filtros, vista: Vista) {
  return {
    q: f.q.trim() || undefined,
    area: f.area || undefined,
    desde: f.desde || undefined,
    hasta: f.hasta || undefined,
    solo_errores: f.soloErrores || undefined,
    actor_id: f.actorId ?? undefined,
    todo: vista === "auditoria" || undefined,
  };
}

function encabezadoDia(dia: string) {
  const hoy = hoyISO();
  if (dia === hoy) return "Hoy";
  if (dia === sumarDias(hoy, -1)) return "Ayer";
  const texto = diaLargo(dia);
  return dia.slice(0, 4) === hoy.slice(0, 4) ? texto : `${texto} de ${dia.slice(0, 4)}`;
}

function ListaActividad({ items }: { items: Registro[] }) {
  const grupos: { dia: string; items: Registro[] }[] = [];
  for (const r of items) {
    const dia = diaDe(r.fecha);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo?.dia === dia) ultimo.items.push(r);
    else grupos.push({ dia, items: [r] });
  }
  return (
    <div>
      {grupos.map((g) => (
        <section key={g.dia} aria-label={encabezadoDia(g.dia)}>
          <h3 className="border-b border-line bg-sheet-2 px-4 py-1.5 text-[12.5px] font-semibold text-ink-2 first-letter:uppercase">{encabezadoDia(g.dia)}</h3>
          <ul className="divide-y divide-line">
            {g.items.map((r) => (
              <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                <Initials name={r.actor ?? "Plataforma"} size={32} className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] text-ink [text-wrap:pretty]">
                    {r.actor_id ? (
                      <Link href={`${RUTA_USUARIOS}/${r.actor_id}`} className="font-semibold hover:underline">{r.actor}</Link>
                    ) : (
                      <span className="font-semibold">{r.actor ?? "La plataforma"}</span>
                    )}{" "}
                    {r.frase}
                    {r.enlace && (
                      <>
                        {" · "}
                        <Link href={r.enlace} className="font-semibold text-navy underline-offset-2 hover:underline dark:text-navy-ink">Ver</Link>
                      </>
                    )}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-3">
                    <span className="tabular-nums">{horaDe(r.fecha)}</span>
                    <span><span aria-hidden="true">· </span>{AREAS[r.area]}</span>
                  </p>
                </div>
                {r.con_error && <Tag tone="bad">Con error</Tag>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ListaAuditoria({ items, onAbrir }: { items: Registro[]; onAbrir: (id: number) => void }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((r) => (
        <li key={r.id}>
          <button type="button" onClick={() => onAbrir(r.id)} className="grid w-full gap-x-4 gap-y-0.5 px-4 py-2.5 text-left transition-colors hover:bg-sheet-2 sm:grid-cols-[9.5rem_minmax(0,1fr)_auto] sm:items-center">
            <span className="text-[12.5px] tabular-nums text-ink-2">{fechaConHora(r.fecha)}</span>
            <span className="min-w-0">
              <span className="block truncate font-mono text-[13px] text-ink">{r.accion}</span>
              <span className="block truncate text-[13px] text-ink-2">{r.actor ?? "La plataforma"} · {AREAS[r.area]}</span>
            </span>
            <span className="sm:justify-self-end">
              <Tag tone={r.con_error ? "bad" : "neutral"}>{r.con_error ? "Con error" : "Registrado"}</Tag>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function DetalleTecnico({ id, onCerrar }: { id: number | null; onCerrar: () => void }) {
  const [detalle, setDetalle] = useState<Esquemas["DetalleRegistro"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cargar = useCallback(async () => {
    if (id === null) return;
    setDetalle(null);
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/admin/actividad/{registro_id}", { params: { path: { registro_id: id } } });
    if (data) setDetalle(data);
    else setError(mensajeDeError(fallo));
  }, [id]);
  useLoadEffect(cargar);

  return (
    <Drawer open={id !== null} onClose={onCerrar} title={detalle ? <span className="font-mono text-[17px]">{detalle.accion}</span> : "Registro"}
      subtitle={detalle ? `${detalle.actor ?? "La plataforma"} ${detalle.frase}` : undefined}>
      {error ? <p role="alert" className="text-[14px] text-bad">{error}</p> : !detalle ? <LoadingState label="Cargando el registro" rows={4} /> : (
        <div className="space-y-4">
          {detalle.error && (
            <div className="rounded-lg bg-bad-soft px-3 py-2.5 text-[13.5px] text-bad">
              <p className="font-semibold">Error técnico</p>
              <p className="mt-0.5 break-words font-mono text-[12.5px]">{detalle.error}</p>
            </div>
          )}
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[14px]">
            <dt className="text-ink-2">Fecha</dt>
            <dd className="tabular-nums text-ink">{fechaConHora(detalle.fecha)}</dd>
            <dt className="text-ink-2">Área</dt>
            <dd className="text-ink">{AREAS[detalle.area]}</dd>
            <dt className="text-ink-2">Registro</dt>
            <dd className="break-words font-mono text-[13px] text-ink">{detalle.recurso}{detalle.recurso_id ? ` #${detalle.recurso_id}` : ""}</dd>
            <dt className="text-ink-2">Solicitud</dt>
            <dd className="break-words font-mono text-[13px] text-ink">{detalle.metodo || detalle.endpoint ? `${detalle.metodo ?? ""} ${detalle.endpoint ?? ""}`.trim() : "No quedó registrada"}</dd>
          </dl>
          {detalle.enlace && <Link href={detalle.enlace} className="inline-block text-[14px] font-semibold text-navy underline dark:text-navy-ink">Ir a lo que cambió</Link>}
          <div>
            <p className="mb-1.5 text-[13px] font-semibold text-ink-2">Datos guardados</p>
            {detalle.datos == null ? <p className="text-[13.5px] text-ink-3">Este registro no guardó datos adicionales.</p> : (
              <pre className="max-h-80 overflow-auto rounded-lg bg-sheet-2 p-3 font-mono text-[12.5px] leading-relaxed text-ink shadow-[inset_0_0_0_1px_var(--line)]">
                {typeof detalle.datos === "string" ? detalle.datos : JSON.stringify(detalle.datos, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

export function PanelActividad({ vista }: { vista: Vista }) {
  const [filtros, setFiltros] = useState<Filtros>(VACIOS);
  const [texto, setTexto] = useState("");
  const [actorNombre, setActorNombre] = useState<string | null>(null);
  const [pagina, setPagina] = useState<Esquemas["PaginaRegistro"] | null>(null);
  const [items, setItems] = useState<Registro[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<number | null>(null);
  const ultima = useRef(0);

  useValorDeUrl("actor", useCallback((valor: string) => {
    const id = Number(valor);
    if (Number.isInteger(id) && id > 0) setFiltros((f) => ({ ...f, actorId: id }));
  }, []));

  useEffect(() => {
    const t = window.setTimeout(() => setFiltros((f) => (f.q === texto ? f : { ...f, q: texto })), 300);
    return () => window.clearTimeout(t);
  }, [texto]);

  const cargar = useCallback(async (cursor?: string) => {
    const esta = ++ultima.current;
    setCargando(true);
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/admin/actividad", {
      params: { query: { ...consulta(filtros, vista), limite: 50, cursor } },
    });
    if (esta !== ultima.current) return;
    if (fallo || !data) setError(mensajeDeError(fallo));
    else {
      setPagina(data);
      setItems((actuales) => (cursor ? [...actuales, ...data.items] : data.items));
      if (filtros.actorId && !cursor) setActorNombre(data.items.find((r) => r.actor_id === filtros.actorId)?.actor ?? "esta persona");
    }
    setCargando(false);
  }, [filtros, vista]);
  useLoadEffect(cargar);

  const parametrosCsv = new URLSearchParams(
    Object.entries(consulta(filtros, vista)).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]),
  ).toString();
  const hayFiltros = Boolean(filtros.q || filtros.area || filtros.desde || filtros.hasta || filtros.soloErrores || filtros.actorId);

  return (
    <div>
      <PageHeader
        title={TEXTOS[vista].titulo}
        description={TEXTOS[vista].descripcion}
        action={
          <a href={`/api/v2/admin/actividad/csv${parametrosCsv ? `?${parametrosCsv}` : ""}`} download
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-sheet px-4 text-[14px] font-semibold text-ink shadow-[0_0_0_1px_var(--line-strong)] transition-colors hover:bg-sheet-2">
            <Download aria-hidden="true" size={16} /> Descargar CSV
          </a>
        }
      />

      <div className="flex flex-wrap items-end gap-2">
        <label className="relative min-w-0 flex-1 basis-full sm:basis-60">
          <span className="sr-only">Buscar por persona</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Persona" className={cx(CAMPO, "h-10 pl-9 sm:min-h-10")} />
        </label>
        <select aria-label="Área" value={filtros.area} onChange={(e) => setFiltros({ ...filtros, area: e.target.value as AreaActividad | "" })} className={cx(FILTRO, "basis-full sm:basis-auto")}>
          <option value="">Todas las áreas</option>
          {(Object.keys(AREAS) as AreaActividad[]).map((a) => <option key={a} value={a}>{AREAS[a]}</option>)}
        </select>
        <label className="flex min-w-0 flex-1 basis-[calc(50%-4px)] flex-col gap-1 text-[12.5px] font-semibold text-ink-2 sm:basis-auto sm:flex-none">
          Desde
          <input type="date" value={filtros.desde} max={filtros.hasta || hoyISO()} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} className={cx(FILTRO, "font-normal")} />
        </label>
        <label className="flex min-w-0 flex-1 basis-[calc(50%-4px)] flex-col gap-1 text-[12.5px] font-semibold text-ink-2 sm:basis-auto sm:flex-none">
          Hasta
          <input type="date" value={filtros.hasta} min={filtros.desde || undefined} max={hoyISO()} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} className={cx(FILTRO, "font-normal")} />
        </label>
        {vista === "auditoria" && (
          <label className="flex h-10 items-center gap-2 text-[14px] text-ink">
            <input type="checkbox" checked={filtros.soloErrores} onChange={(e) => setFiltros({ ...filtros, soloErrores: e.target.checked })} className="size-4 accent-[var(--navy)]" />
            Solo con error
          </label>
        )}
      </div>
      {(filtros.actorId || hayFiltros) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
          {filtros.actorId && (
            <span className="inline-flex items-center gap-1 rounded-md bg-manila px-2 py-1 text-ink">
              Solo lo que hizo {actorNombre ?? "esta persona"}
              <button type="button" aria-label="Quitar el filtro de persona" onClick={() => setFiltros({ ...filtros, actorId: null })} className="-mr-1 grid size-6 place-items-center rounded hover:bg-sheet-2"><X size={14} aria-hidden="true" /></button>
            </span>
          )}
          {hayFiltros && <button type="button" onClick={() => { setFiltros(VACIOS); setTexto(""); }} className="font-semibold text-navy hover:underline dark:text-navy-ink">Quitar los filtros</button>}
        </div>
      )}

      <div className="mt-4">
        {error ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-bad-soft px-4 py-3 text-bad">
            <p className="flex-1 text-[14px]">{error}</p>
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
          </div>
        ) : !pagina && cargando ? (
          <LoadingState label="Cargando la actividad" rows={6} />
        ) : (
          <Sheet aria-label={TEXTOS[vista].titulo} className="overflow-hidden">
            {items.length ? (
              vista === "actividad" ? <ListaActividad items={items} /> : <ListaAuditoria items={items} onAbrir={setAbierto} />
            ) : (
              <p className="px-4 py-6 text-[14px] text-ink-2">{hayFiltros ? "Ningún registro coincide con los filtros." : "Aún no hay actividad registrada."}</p>
            )}
            {pagina && items.length > 0 && (
              <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2 text-[13px] text-ink-2">
                <span className="tabular-nums">{items.length === pagina.total ? `${pagina.total} ${pagina.total === 1 ? "registro" : "registros"}` : `${items.length} de ${pagina.total}`}</span>
                {pagina.siguiente && <Button size="sm" variant="ghost" loading={cargando} onClick={() => void cargar(pagina.siguiente ?? undefined)}>Ver más</Button>}
              </div>
            )}
          </Sheet>
        )}
      </div>
      {vista === "auditoria" && <DetalleTecnico id={abierto} onCerrar={() => setAbierto(null)} />}
    </div>
  );
}
