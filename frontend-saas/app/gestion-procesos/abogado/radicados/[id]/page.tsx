"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, ChevronRight, RefreshCw, Search } from "lucide-react";

import { CAMPO } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { Radicado } from "@/components/ui/Radicado";
import { Tag } from "@/components/ui/Tag";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { diaCorto, fechaConHora } from "@/lib/fechas";
import { lanzarConsulta } from "@/lib/operacion";
import { RUTA_RADICADOS, TONO_CONSULTA, textoNovedades } from "@/lib/radicados";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Detalle = Esquemas["RadicadoDetalle"];
type Actuacion = Detalle["actuaciones"][number];
const RUTA_PROCESOS = "/gestion-procesos/abogado/procesos";
const ZONA = "America/Bogota";
const mes = new Intl.DateTimeFormat("es-CO", { timeZone: ZONA, month: "short" });
const anio = new Intl.DateTimeFormat("es-CO", { timeZone: ZONA, year: "numeric" });

const AVISO: Partial<Record<Detalle["consulta"]["estado"], string>> = {
  no_encontrado: "La Rama Judicial no devuelve este número. Revise que esté bien escrito; si lo está, puede que el despacho aún no lo haya publicado.",
  privado: "Es un proceso privado: la Rama Judicial no publica sus actuaciones, así que no llegan avisos automáticos.",
  error: "La última consulta a la Rama Judicial falló. La consulta programada lo intentará de nuevo.",
};

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function RadicadoPage() {
  const { id } = useParams<{ id: string }>();
  const radicadoId = Number(id);
  const { toast } = useToast();
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [consultando, setConsultando] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/radicados/{radicado_id}", { params: { path: { radicado_id: radicadoId } } });
    if (!data) {
      setError(mensajeDeError(fallo));
      return;
    }
    setDetalle(data);
    // Las marcas de "Nueva" se quedan en pantalla; la próxima visita ya no las trae.
    if (data.novedades > 0) void api.POST("/api/v2/radicados/{radicado_id}/revisado", { params: { path: { radicado_id: radicadoId } } });
  }, [radicadoId]);
  useLoadEffect(cargar);

  async function consultarAhora() {
    setConsultando(true);
    const fallo = await lanzarConsulta([radicadoId]);
    setConsultando(false);
    if (fallo) {
      toast({ title: fallo, tone: "error" });
      return;
    }
    toast({ title: "Consulta iniciada", description: "Las actuaciones nuevas aparecen aquí en unos minutos.", tone: "success" });
    setDetalle((d) => d && { ...d, consulta: { ...d.consulta, estado: "consultando", etiqueta: "Consultando", detalle: null } });
  }

  if (error) {
    return (
      <div>
        <Volver />
        <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] bg-bad-soft px-4 py-3 text-bad">
          <p className="flex-1 text-[14px]">{error}</p>
          <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
        </div>
      </div>
    );
  }

  if (!detalle) {
    return (
      <div aria-label="Cargando el radicado" aria-busy="true">
        <Volver />
        <div className="mt-4 h-20 animate-pulse rounded-[var(--radius-lg)] bg-manila" />
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="h-80 animate-pulse rounded-[var(--radius-lg)] bg-manila" />
          <div className="h-60 animate-pulse rounded-[var(--radius-lg)] bg-manila" />
        </div>
      </div>
    );
  }

  const { consulta } = detalle;
  const aviso = AVISO[consulta.estado];
  const filtro = normalizar(busqueda.trim());
  const actuaciones = filtro
    ? detalle.actuaciones.filter((a) => normalizar(`${a.actuacion} ${a.anotacion ?? ""}`).includes(filtro))
    : detalle.actuaciones;

  return (
    <div>
      <Volver />
      <header className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="leading-tight">
            <Radicado numero={detalle.numero} grande className="font-medium" />
          </h1>
          <p className="mt-1 text-[14.5px] text-pretty text-ink-2">{detalle.despacho ?? "Despacho aún sin consultar"}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[13.5px] text-ink-2">
            <Tag tone={TONO_CONSULTA[consulta.estado]}>{consulta.etiqueta}</Tag>
            {consulta.consultado_en && <span>Última consulta: {fechaConHora(consulta.consultado_en)}</span>}
            {detalle.novedades > 0 && <Tag tone="gold">{textoNovedades(detalle.novedades)} desde su última visita</Tag>}
          </div>
        </div>
        {detalle.puede_consultar && (
          <Button variant="secondary" className="shrink-0" icon={<RefreshCw size={16} />} loading={consultando} disabled={consulta.estado === "consultando"} onClick={() => void consultarAhora()}>
            Consultar ahora
          </Button>
        )}
      </header>

      {aviso && (
        <div role="status" className={cx("mt-5 flex items-start gap-3 rounded-[var(--radius-lg)] px-4 py-3 sm:px-5", consulta.estado === "error" ? "bg-bad-soft" : "bg-warn-soft")}>
          <AlertTriangle aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-ink-2" />
          <p className="min-w-0 text-[14px] text-pretty text-ink">
            {aviso}
            {consulta.detalle && <span className="mt-1 block font-mono text-[12.5px] text-ink-2">{consulta.detalle}</span>}
          </p>
        </div>
      )}

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Seccion
          titulo="Actuaciones"
          cuenta={detalle.total_actuaciones}
          accion={detalle.actuaciones.length > 6 ? (
            <label className="relative block w-full sm:w-64">
              <span className="sr-only">Buscar en las actuaciones</span>
              <Search aria-hidden="true" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar en las actuaciones" className={cx(CAMPO, "mt-0 h-9 pl-9 text-[14px]")} />
            </label>
          ) : undefined}
        >
          {detalle.actuaciones.length === 0 ? (
            <Vacio>
              {consulta.estado === "sin_consultar" || consulta.estado === "consultando"
                ? "Todavía no lo hemos consultado. Las actuaciones aparecen aquí después de la primera consulta."
                : "La Rama Judicial no reporta actuaciones para este radicado."}
            </Vacio>
          ) : actuaciones.length === 0 ? (
            <Vacio>Ninguna actuación menciona «{busqueda.trim()}».</Vacio>
          ) : (
            <ol className="divide-y divide-line">
              {actuaciones.map((a) => <FilaActuacion key={a.id} actuacion={a} />)}
            </ol>
          )}
        </Seccion>

        <aside className="space-y-5">
          <Seccion titulo={detalle.procesos.length === 1 ? "Proceso" : "Procesos"}>
            {detalle.procesos.length ? (
              <ul className="divide-y divide-line">
                {detalle.procesos.map((p) => (
                  <li key={p.id}>
                    <Link href={`${RUTA_PROCESOS}/${p.id}`} className="group flex min-h-12 items-center gap-3 px-4 py-3 transition-colors hover:bg-manila/60 sm:px-5">
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-pretty text-ink">{p.nombre}</span>
                        {p.archivado && <span className="block text-[13px] text-ink-3">Archivado</span>}
                      </span>
                      <ChevronRight aria-hidden="true" size={16} className="shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Vacio>No está en ningún proceso, así que ningún cliente lo ve. Agréguelo desde el proceso que corresponda.</Vacio>
            )}
          </Seccion>

          <Seccion titulo="Partes">
            <dl className="py-1.5 text-[14px]">
              <Dato nombre="Demandante">{detalle.demandante}</Dato>
              <Dato nombre="Demandado">{detalle.demandado}</Dato>
            </dl>
          </Seccion>
        </aside>
      </div>
    </div>
  );
}

function FilaActuacion({ actuacion: a }: { actuacion: Actuacion }) {
  const fecha = a.fecha ? new Date(`${a.fecha}T12:00:00-05:00`) : null;
  const termino = a.inicia_termino && a.finaliza_termino
    ? `Término del ${diaCorto(a.inicia_termino)} al ${diaCorto(a.finaliza_termino)}`
    : a.finaliza_termino ? `Término hasta el ${diaCorto(a.finaliza_termino)}` : null;
  return (
    <li id={`actuacion-${a.id}`} className={cx("flex items-start gap-3 px-4 py-3.5 sm:px-5", a.nueva && "bg-gold-soft/40")}>
      <div className="w-12 shrink-0 pt-0.5 text-center">
        {fecha ? (
          <>
            <span className="block text-[12px] font-semibold uppercase tracking-wide text-ink-3">{mes.format(fecha).replace(".", "")}</span>
            <span className="block font-display text-[22px] leading-none tabular-nums text-ink">{fecha.getDate()}</span>
            <span className="mt-0.5 block text-[11.5px] tabular-nums text-ink-3">{anio.format(fecha)}</span>
          </>
        ) : <span className="text-[12px] text-ink-3">Sin fecha</span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[14.5px] font-semibold text-pretty text-ink">{a.actuacion}</span>
          {a.nueva && <Tag tone="gold" className="h-5">Nueva</Tag>}
          {a.fijacion && <Tag className="h-5">Por estado</Tag>}
        </p>
        {a.anotacion && <p className="mt-1 whitespace-pre-wrap text-[14px] text-pretty text-ink-2">{a.anotacion}</p>}
        {(termino || (a.registrada && a.registrada !== a.fecha)) && (
          <p className="mt-1.5 text-[12.5px] text-ink-3">
            {[termino, a.registrada && a.registrada !== a.fecha ? `Registrada el ${diaCorto(a.registrada)}` : null].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
    </li>
  );
}

function Volver() {
  return (
    <Link href={RUTA_RADICADOS} className="inline-flex min-h-10 items-center gap-1.5 text-[14px] text-ink-2 hover:text-ink">
      <ArrowLeft aria-hidden="true" size={16} /> Radicados
    </Link>
  );
}

function Seccion({ titulo, cuenta, accion, children }: { titulo: string; cuenta?: number; accion?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] bg-sheet shadow-[0_0_0_1px_var(--line),0_1px_2px_rgb(24_32_58/0.05)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <h2 className="font-semibold text-ink">
          {titulo}
          {cuenta !== undefined && cuenta > 0 && <span className="ml-2 text-[13px] font-normal tabular-nums text-ink-3">{cuenta}</span>}
        </h2>
        {accion}
      </header>
      {children}
    </section>
  );
}

function Vacio({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-[14px] text-pretty text-ink-3 sm:px-5">{children}</p>;
}

function Dato({ nombre, children }: { nombre: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 px-4 py-2 sm:px-5">
      <dt className="text-ink-3">{nombre}</dt>
      <dd className="min-w-0 text-pretty text-ink">{children ?? <span className="text-ink-3">Sin registrar</span>}</dd>
    </div>
  );
}
