"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowUpDown,
  CalendarDays,
  Check,
  CheckCheck,
  ClipboardList,
  Eye,
  FileSignature,
  FileText,
  Filter,
  Gavel,
  ListChecks,
  ListPlus,
  Mail,
  MessageSquare,
  Milestone,
  RefreshCw,
  ScrollText,
  Send,
  type LucideIcon,
} from "lucide-react";

import { AvisarClienteModal, TareaFolioModal } from "@/components/expediente/AccionesFolio";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Folio } from "@/components/ui/Folio";
import { LoadingState } from "@/components/ui/LoadingState";
import { Tag } from "@/components/ui/Tag";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { fechaConHora, fechaCorta } from "@/lib/fechas";
import { useLoadEffect } from "@/lib/useLoadEffect";

type FolioApi = Esquemas["Folio"];
type Grupo = "actuaciones" | "documentos" | "mensajes" | "tareas";
type Orden = "recientes" | "antiguos";

const PAGINA = 20;

const GRUPOS: { id: Grupo | null; label: string }[] = [
  { id: null, label: "Todo" },
  { id: "actuaciones", label: "Actuaciones" },
  { id: "documentos", label: "Documentos" },
  { id: "mensajes", label: "Mensajes" },
  { id: "tareas", label: "Tareas" },
];

export const ICONO_FOLIO: Record<FolioApi["tipo"], LucideIcon> = {
  actuacion: Gavel,
  documento: FileText,
  solicitud: ClipboardList,
  contrato: FileSignature,
  mensaje: MessageSquare,
  comunicacion: Mail,
  aviso: Send,
  tarea: ListChecks,
  evento: CalendarDays,
  etapa: Milestone,
};

/** Fecha del folio: solo el día cuando el origen no trae hora (las actuaciones). */
export function fechaDeFolio(folio: Pick<FolioApi, "fecha" | "con_hora">) {
  return folio.con_hora ? fechaConHora(folio.fecha) : fechaCorta(folio.fecha);
}

type Consulta = { grupo: Grupo | null; orden: Orden; desde: number | null };

export function FoliosExpediente({ procesoId, folioInicial }: { procesoId: number; folioInicial?: number }) {
  const { toast } = useToast();
  const [consulta, setConsulta] = useState<Consulta>({ grupo: null, orden: "recientes", desde: folioInicial ?? null });
  const [items, setItems] = useState<FolioApi[]>([]);
  const [siguiente, setSiguiente] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [ultimo, setUltimo] = useState(0);
  const [nuevos, setNuevos] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [salto, setSalto] = useState("");
  const [errorSalto, setErrorSalto] = useState<string | null>(null);
  const [resaltado, setResaltado] = useState<number | null>(folioInicial ?? null);
  const [revisando, setRevisando] = useState<Set<number>>(new Set());
  const [avisando, setAvisando] = useState<FolioApi | null>(null);
  const [creandoTarea, setCreandoTarea] = useState<FolioApi | null>(null);
  const pedido = useRef(0);

  const pedir = useCallback(
    async (c: Consulta, cursor?: string) => {
      const { data, error: fallo } = await api.GET("/api/v2/procesos/{proceso_id}/folios", {
        params: {
          path: { proceso_id: procesoId },
          query: { grupo: c.grupo ?? undefined, orden: c.orden, desde: c.desde ?? undefined, limite: PAGINA, cursor },
        },
      });
      if (fallo || !data) throw new Error(mensajeDeError(fallo));
      return data;
    },
    [procesoId],
  );

  const cargar = useCallback(
    async (c: Consulta) => {
      const turno = ++pedido.current;
      setCargando(true);
      setError(null);
      try {
        const data = await pedir(c);
        if (turno !== pedido.current) return;
        setItems(data.items);
        setSiguiente(data.siguiente);
        setTotal(data.total);
        setUltimo(data.ultimo);
        setNuevos(data.nuevos);
      } catch (e) {
        if (turno === pedido.current) setError(e instanceof Error ? e.message : mensajeDeError(e));
      } finally {
        if (turno === pedido.current) setCargando(false);
      }
    },
    [pedir],
  );

  const cargarConsulta = useCallback(() => cargar(consulta), [cargar, consulta]);
  useLoadEffect(cargarConsulta);

  // El folio al que se saltó se ilumina un momento y queda centrado.
  useEffect(() => {
    if (resaltado === null || cargando) return;
    document.getElementById(`folio-${resaltado}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = window.setTimeout(() => setResaltado(null), 2400);
    return () => window.clearTimeout(t);
  }, [resaltado, cargando]);

  async function verMas() {
    if (!siguiente) return;
    setCargandoMas(true);
    try {
      const data = await pedir(consulta, siguiente);
      setItems((actuales) => [...actuales, ...data.items]);
      setSiguiente(data.siguiente);
    } catch (e) {
      toast({ title: "No se pudieron cargar más folios", description: e instanceof Error ? e.message : mensajeDeError(e), tone: "error" });
    } finally {
      setCargandoMas(false);
    }
  }

  function irAlFolio(evento: FormEvent) {
    evento.preventDefault();
    const n = Number(salto);
    if (!Number.isInteger(n) || n < 1 || n > ultimo) {
      setErrorSalto(ultimo ? `El expediente tiene folios del 1 al ${ultimo}.` : "El expediente aún no tiene folios.");
      return;
    }
    setErrorSalto(null);
    setResaltado(n);
    setConsulta({ grupo: null, orden: "recientes", desde: n });
  }

  async function revisar(numeros: number[] | null) {
    const marcados = numeros ?? items.filter((f) => f.nuevo).map((f) => f.numero);
    setRevisando((actual) => new Set([...actual, ...marcados]));
    const { data, error: fallo } = await api.POST("/api/v2/procesos/{proceso_id}/folios/revisar", {
      params: { path: { proceso_id: procesoId } },
      body: numeros ? { numeros } : {},
    });
    setRevisando((actual) => new Set([...actual].filter((n) => !marcados.includes(n))));
    if (fallo || !data) {
      toast({ title: "No se pudo marcar como revisado", description: mensajeDeError(fallo), tone: "error" });
      return;
    }
    setItems((actuales) => actuales.map((f) => (numeros === null || numeros.includes(f.numero) ? { ...f, nuevo: false } : f)));
    setNuevos((n) => (numeros === null ? 0 : Math.max(0, n - data.revisados)));
  }

  const filtrado = consulta.grupo !== null;
  const saltado = consulta.desde !== null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3 border-b border-line px-4 py-3 sm:px-6">
        <div role="group" aria-label="Tipo de folio" className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 py-0.5">
          {GRUPOS.map((g) => {
            const activo = consulta.grupo === g.id;
            return (
              <button
                key={g.label}
                type="button"
                aria-pressed={activo}
                onClick={() => setConsulta((c) => ({ ...c, grupo: g.id, desde: null }))}
                className={cx(
                  "h-9 shrink-0 rounded-full px-3.5 text-[13px] font-semibold transition-colors sm:h-8",
                  activo ? "bg-navy text-on-navy" : "bg-manila text-ink-2 hover:text-ink",
                )}
              >
                {g.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setConsulta((c) => ({ ...c, orden: c.orden === "recientes" ? "antiguos" : "recientes", desde: null }))}
          className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold text-ink-2 hover:bg-manila hover:text-ink sm:h-8"
        >
          <ArrowUpDown aria-hidden="true" size={14} />
          {consulta.orden === "recientes" ? "Más recientes primero" : "Más antiguos primero"}
        </button>
        <form onSubmit={irAlFolio} className="ml-auto flex items-center gap-2" noValidate>
          <label htmlFor={`ir-folio-${procesoId}`} className="text-[13px] text-ink-2">
            Ir al folio
          </label>
          <input
            id={`ir-folio-${procesoId}`}
            inputMode="numeric"
            autoComplete="off"
            value={salto}
            onChange={(e) => {
              setSalto(e.target.value.replace(/\D/g, ""));
              setErrorSalto(null);
            }}
            placeholder={ultimo ? `1 a ${ultimo}` : "—"}
            aria-invalid={errorSalto ? true : undefined}
            aria-describedby={errorSalto ? `ir-folio-error-${procesoId}` : undefined}
            className="h-9 w-24 rounded-md border border-line-strong bg-sheet px-2.5 text-[14px] tabular-nums text-ink placeholder:text-ink-3 focus:border-navy focus:outline-none sm:h-8"
          />
          <Button type="submit" size="sm" variant="secondary" disabled={!salto}>
            Ir
          </Button>
        </form>
      </div>

      {errorSalto && (
        <p id={`ir-folio-error-${procesoId}`} role="alert" className="border-b border-line bg-warn-soft px-4 py-2 text-[13px] text-warn sm:px-6">
          {errorSalto}
        </p>
      )}

      {nuevos > 0 && !cargando && !error && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-gold-soft/60 px-4 py-2.5 sm:px-6">
          <p className="text-[13.5px] text-ink">
            <span className="font-semibold tabular-nums">{nuevos}</span> {nuevos === 1 ? "folio nuevo sin revisar" : "folios nuevos sin revisar"}
          </p>
          <Button size="sm" variant="ghost" icon={<CheckCheck size={15} />} onClick={() => void revisar(null)}>
            Marcar todo revisado
          </Button>
        </div>
      )}

      {cargando ? (
        <div className="p-4 sm:p-6">
          <LoadingState label="Cargando folios" rows={4} />
        </div>
      ) : error ? (
        <div className="m-4 flex flex-wrap items-center gap-3 rounded-lg bg-bad-soft px-4 py-3 text-bad sm:m-6" role="alert">
          <p className="flex-1 text-[14px]">{error}</p>
          <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar(consulta)}>
            Reintentar
          </Button>
        </div>
      ) : items.length === 0 ? (
        filtrado ? (
          <EmptyState
            icon={Filter}
            title="No hay folios de este tipo"
            action={<Button variant="secondary" onClick={() => setConsulta((c) => ({ ...c, grupo: null }))}>Ver todos los folios</Button>}
          />
        ) : (
          <EmptyState
            icon={ScrollText}
            title="El expediente aún no tiene folios"
            description="Cada actuación, documento, mensaje o tarea de este proceso se numera aquí como un folio."
          />
        )
      ) : (
        <ol className="divide-y divide-line">
          {items.map((folio) => (
            <FilaFolio
              key={folio.numero}
              folio={folio}
              resaltado={resaltado === folio.numero}
              revisando={revisando.has(folio.numero)}
              onRevisar={() => void revisar([folio.numero])}
              onAvisar={() => setAvisando(folio)}
              onCrearTarea={() => setCreandoTarea(folio)}
            />
          ))}
        </ol>
      )}

      {!cargando && !error && items.length > 0 && (siguiente || saltado) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-6">
          <span className="text-[13px] tabular-nums text-ink-3">
            {saltado ? `Desde el folio ${consulta.desde}` : `Mostrando ${items.length} de ${total} folios`}
          </span>
          <div className="flex flex-wrap gap-2">
            {saltado && (
              <Button size="sm" variant="ghost" onClick={() => setConsulta((c) => ({ ...c, desde: null }))}>
                Volver a los más recientes
              </Button>
            )}
            {siguiente && (
              <Button size="sm" variant="secondary" loading={cargandoMas} onClick={() => void verMas()}>
                {consulta.orden === "recientes" ? "Ver folios anteriores" : "Ver folios siguientes"}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Avisar o crear tarea deja el folio revisado y añade uno nuevo (el aviso o la tarea). */}
      <AvisarClienteModal procesoId={procesoId} folio={avisando} onClose={() => setAvisando(null)} onHecho={() => void cargar(consulta)} />
      <TareaFolioModal procesoId={procesoId} folio={creandoTarea} onClose={() => setCreandoTarea(null)} onHecho={() => void cargar(consulta)} />
    </div>
  );
}

function FilaFolio({
  folio,
  resaltado,
  revisando,
  onRevisar,
  onAvisar,
  onCrearTarea,
}: {
  folio: FolioApi;
  resaltado: boolean;
  revisando: boolean;
  onRevisar: () => void;
  onAvisar: () => void;
  onCrearTarea: () => void;
}) {
  const Icono = ICONO_FOLIO[folio.tipo] ?? FileText;
  const fecha = fechaDeFolio(folio);
  // Las actuaciones siempre traen sus acciones; el resto, mientras esté sin revisar.
  const actuacion = folio.tipo === "actuacion" && !folio.retirado;
  const conAcciones = !folio.retirado && (actuacion || folio.nuevo);
  return (
    <li
      id={`folio-${folio.numero}`}
      className={cx(
        "flex scroll-mt-24 gap-4 px-4 py-4 transition-[background-color] duration-700 ease-out sm:px-6",
        folio.nuevo && "bg-[color-mix(in_oklab,var(--gold-soft)_60%,transparent)]",
        resaltado && "bg-gold-soft",
      )}
    >
      <div className="hidden w-[84px] shrink-0 pt-0.5 text-[13px] tabular-nums text-ink-3 sm:block">{fecha}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-3">
            <Icono aria-hidden="true" size={14} strokeWidth={2} />
            {folio.etiqueta}
          </span>
          <span className="text-[12.5px] text-ink-3 sm:hidden">· {fecha}</span>
          {folio.estado && <Tag tone={folio.estado === "pendiente" || folio.estado === "en curso" ? "warn" : "neutral"}>{folio.estado}</Tag>}
        </div>
        <p className={cx("mt-1 text-[15px] font-semibold text-pretty", folio.retirado ? "text-ink-3" : "text-ink")}>{folio.titulo}</p>
        {folio.detalle && <p className="mt-1 max-w-[72ch] text-[14px] leading-relaxed text-pretty text-ink-2">{folio.detalle}</p>}
        {(folio.archivo || conAcciones) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-2">
            {folio.archivo && (
              <a
                href={folio.archivo.url}
                target="_blank"
                rel="noopener"
                className="mr-2 inline-flex min-h-9 items-center gap-1.5 text-[13px] font-semibold text-navy-ink hover:underline"
              >
                <Eye aria-hidden="true" size={14} />
                <span className="break-all">{folio.archivo.nombre}</span>
              </a>
            )}
            {actuacion && (
              <Button size="sm" variant={folio.nuevo ? "primary" : "secondary"} icon={<Send size={14} />} onClick={onAvisar}>
                Avisar al cliente
              </Button>
            )}
            {conAcciones && (
              <Button size="sm" variant="secondary" icon={<ListPlus size={14} />} onClick={onCrearTarea}>
                Crear tarea
              </Button>
            )}
            {folio.nuevo && (
              <Button size="sm" variant="ghost" icon={<Check size={14} />} loading={revisando} onClick={onRevisar}>
                Marcar revisado
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Folio n={folio.numero} nuevo={folio.nuevo} />
        {folio.autor && <span className="max-w-[16ch] text-right text-[12px] leading-snug text-ink-3">{folio.autor}</span>}
      </div>
    </li>
  );
}
