"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  RefreshCw,
  RotateCcw,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Initials } from "@/components/ui/Initials";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Sheet, SheetHeader } from "@/components/ui/Sheet";
import { Tag, type TonoTag } from "@/components/ui/Tag";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { fechaRelativa } from "@/lib/fechas";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Resumen = Esquemas["ResumenAdmin"];
type Alerta = Esquemas["Alerta"];
type EstadoSalud = Esquemas["EstadoIntegracion"]["estado"];

const ADMIN = "/gestion-procesos/admin";
const ZONA = "America/Bogota";

const SALUD: Record<EstadoSalud, { tono: TonoTag; texto: string }> = {
  ok: { tono: "ok", texto: "Al día" },
  aviso: { tono: "warn", texto: "Revisar" },
  falla: { tono: "bad", texto: "Falla" },
  sin_configurar: { tono: "neutral", texto: "Sin configurar" },
};

function saludo() {
  const hora = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: ZONA }).format(new Date()));
  return hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
}

function icono(alerta: Alerta): { Icono: LucideIcon; clase: string } {
  return alerta.gravedad === "alta"
    ? { Icono: AlertTriangle, clase: "bg-bad-soft text-bad" }
    : { Icono: CircleAlert, clase: "bg-warn-soft text-warn" };
}

function FilaAlerta({
  alerta,
  ocupada,
  onDecidir,
}: {
  alerta: Alerta;
  ocupada: boolean;
  onDecidir: (alerta: Alerta) => void;
}) {
  const { Icono, clase } = icono(alerta);
  const cuando = fechaRelativa(alerta.fecha);
  return (
    <li className="flex gap-3 px-4 py-3.5">
      <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg ${clase}`}>
        <Icono aria-hidden="true" className="size-[18px]" />
        <span className="sr-only">{alerta.gravedad === "alta" ? "Urgente" : "Pendiente"}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-pretty text-[15px] font-semibold text-ink">{alerta.titulo}</p>
        {alerta.detalle && <p className="mt-0.5 line-clamp-2 text-pretty text-[14px] text-ink-2">{alerta.detalle}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link
            href={alerta.enlace}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-sheet px-3 text-[13px] font-semibold text-ink transition-colors hover:bg-sheet-2"
          >
            {alerta.accion}
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
          {cuando && <span className="text-[13px] text-ink-3">{cuando}</span>}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onDecidir(alerta)}
        disabled={ocupada}
        aria-label={alerta.descartada ? `Volver a mostrar: ${alerta.titulo}` : `Descartar alerta: ${alerta.titulo}`}
        title={alerta.descartada ? "Volver a mostrar" : "Descartar"}
        className="-mr-1.5 -mt-1 grid size-10 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-sheet-2 hover:text-ink disabled:opacity-50"
      >
        {alerta.descartada ? <RotateCcw aria-hidden="true" className="size-4" /> : <X aria-hidden="true" className="size-4" />}
      </button>
    </li>
  );
}

export function AdminResumenPage() {
  const { toast } = useToast();
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [descartadas, setDescartadas] = useState<Alerta[] | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/admin/resumen");
    if (fallo || !data) setError(mensajeDeError(fallo));
    else setResumen(data);
    setCargando(false);
  }, []);
  useLoadEffect(cargar);

  async function verDescartadas() {
    if (descartadas) {
      setDescartadas(null);
      return;
    }
    const { data, error: fallo } = await api.GET("/api/v2/admin/alertas", { params: { query: { descartadas: true } } });
    if (fallo || !data) toast({ title: mensajeDeError(fallo), tone: "error" });
    else setDescartadas(data.items);
  }

  async function decidir(alerta: Alerta) {
    setOcupada(alerta.id);
    const ruta = alerta.descartada
      ? "/api/v2/admin/alertas/{alerta_id}/restaurar"
      : "/api/v2/admin/alertas/{alerta_id}/descartar";
    const { error: fallo } = await api.POST(ruta, { params: { path: { alerta_id: alerta.id } } });
    setOcupada(null);
    if (fallo) {
      toast({ title: mensajeDeError(fallo), tone: "error" });
      void cargar();
      return;
    }
    toast({ title: alerta.descartada ? "La alerta volvió al resumen" : "Alerta descartada", tone: "success" });
    if (alerta.descartada) {
      setDescartadas((lista) => {
        const resto = (lista ?? []).filter((a) => a.id !== alerta.id);
        return resto.length ? resto : null;
      });
    } else if (descartadas) {
      setDescartadas([{ ...alerta, descartada: true }, ...descartadas]);
    }
    void cargar();
  }

  const hoy = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: ZONA }).format(new Date());
  const alertas = resumen?.alertas ?? [];

  if (!resumen && cargando) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Resumen" description={`${saludo()}. Hoy es ${hoy}.`} />
        <LoadingState label="Cargando el resumen" rows={4} />
      </div>
    );
  }

  if (!resumen) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Resumen" />
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-bad-soft px-4 py-3 text-bad">
          <p className="flex-1 text-[14px]">{error ?? "No se pudo cargar el resumen."}</p>
          <Button size="sm" variant="secondary" icon={<RefreshCw className="size-4" />} onClick={() => void cargar()}>Reintentar</Button>
        </div>
      </div>
    );
  }

  const atencion = (
    <Sheet aria-labelledby="resumen-atencion" className="overflow-hidden">
      <SheetHeader
        title={<span id="resumen-atencion">Requiere atención</span>}
        count={alertas.length || undefined}
      />
      {alertas.length ? (
        <ul className="divide-y divide-line">
          {alertas.map((alerta) => (
            <FilaAlerta key={alerta.id} alerta={alerta} ocupada={ocupada === alerta.id} onDecidir={(a) => void decidir(a)} />
          ))}
        </ul>
      ) : (
        <div className="flex items-start gap-3 px-4 py-5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-ok-soft text-ok">
            <CheckCircle2 aria-hidden="true" className="size-[18px]" />
          </span>
          <div>
            <p className="text-[15px] font-semibold text-ink">Nada pendiente</p>
            <p className="mt-0.5 text-[14px] text-ink-2">Las consultas, los envíos y las cuentas están en orden.</p>
          </div>
        </div>
      )}
      {resumen.alertas_descartadas > 0 && (
        <div className="border-t border-line">
          <button
            type="button"
            onClick={() => void verDescartadas()}
            aria-expanded={Boolean(descartadas)}
            className="flex min-h-11 w-full items-center px-4 text-left text-[13px] font-semibold text-navy transition-colors hover:bg-sheet-2 dark:text-navy-ink"
          >
            {descartadas
              ? "Ocultar las descartadas"
              : `${resumen.alertas_descartadas} ${resumen.alertas_descartadas === 1 ? "alerta descartada" : "alertas descartadas"} · Ver`}
          </button>
          {descartadas && (
            <ul className="divide-y divide-line border-t border-line bg-sheet-2">
              {descartadas.map((alerta) => (
                <FilaAlerta key={alerta.id} alerta={alerta} ocupada={ocupada === alerta.id} onDecidir={(a) => void decidir(a)} />
              ))}
            </ul>
          )}
        </div>
      )}
    </Sheet>
  );

  const integraciones = (
    <Sheet aria-labelledby="resumen-integraciones">
      <SheetHeader
        title={<span id="resumen-integraciones">Integraciones</span>}
        action={<Link href={`${ADMIN}/operacion/integraciones`} className="text-[13px] font-semibold text-navy hover:underline dark:text-navy-ink">Configurar</Link>}
      />
      <ul className="divide-y divide-line">
        {resumen.integraciones.map((item) => {
          const salud = SALUD[item.estado];
          const cuando = fechaRelativa(item.ultima_vez);
          return (
            <li key={item.clave}>
              <Link href={item.enlace} className="block px-4 py-3 transition-colors hover:bg-sheet-2">
                <span className="flex items-center justify-between gap-3">
                  <span className="text-[14px] font-semibold text-ink">{item.nombre}</span>
                  <Tag tone={salud.tono}>{salud.texto}</Tag>
                </span>
                <span className="mt-0.5 block text-pretty text-[13px] text-ink-2">{item.resumen}</span>
                {cuando && <span className="mt-0.5 block text-[12.5px] text-ink-3">Última vez: {cuando}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );

  const firma = (
    <Sheet aria-labelledby="resumen-firma">
      <SheetHeader title={<span id="resumen-firma">La firma</span>} />
      <ul className="divide-y divide-line">
        {resumen.firma.map((cifra) => (
          <li key={cifra.clave}>
            <Link href={cifra.enlace} className="flex min-h-11 items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-sheet-2">
              {cifra.atencion
                ? <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-warn" />
                : <span aria-hidden="true" className="size-4 shrink-0" />}
              <span className={`flex-1 text-[14px] tabular-nums ${cifra.atencion ? "font-semibold text-warn" : "text-ink"}`}>{cifra.texto}</span>
              <ArrowRight aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" />
            </Link>
          </li>
        ))}
      </ul>
    </Sheet>
  );

  const actividad = (
    <Sheet aria-labelledby="resumen-actividad">
      <SheetHeader
        title={<span id="resumen-actividad">Actividad reciente</span>}
        action={<Link href={`${ADMIN}/actividad`} className="text-[13px] font-semibold text-navy hover:underline dark:text-navy-ink">Ver toda la actividad</Link>}
      />
      {resumen.actividad.length ? (
        <ol className="divide-y divide-line">
          {resumen.actividad.map((evento) => {
            const contenido = (
              <>
                <Initials name={evento.actor ?? "Sistema"} size={32} className="mt-0.5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-pretty text-[14px] text-ink">
                    <span className="font-semibold">{evento.actor ?? "El sistema"}</span> {evento.frase}
                  </span>
                  <time dateTime={evento.fecha ?? undefined} className="mt-0.5 block text-[12.5px] text-ink-3">{fechaRelativa(evento.fecha)}</time>
                </span>
              </>
            );
            return (
              <li key={evento.id}>
                {evento.enlace ? (
                  <Link href={evento.enlace} className="flex gap-3 px-4 py-3 transition-colors hover:bg-sheet-2">{contenido}</Link>
                ) : (
                  <div className="flex gap-3 px-4 py-3">{contenido}</div>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="px-4 py-5 text-[14px] text-ink-2">Aún no hay movimientos registrados.</p>
      )}
    </Sheet>
  );

  return (
    <div className="motion-swap mx-auto max-w-6xl">
      <PageHeader
        title="Resumen"
        description={`${saludo()}. Hoy es ${hoy}.`}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void cargar()}
            disabled={cargando}
            icon={<RefreshCw className={`size-4 ${cargando ? "animate-spin" : ""}`} />}
          >
            Actualizar
          </Button>
        }
      />
      {error && (
        <div role="alert" className="mb-5 rounded-xl bg-bad-soft px-4 py-3 text-[14px] text-bad">{error}</div>
      )}
      {/* En móvil: atención, integraciones, firma y actividad. En escritorio, dos columnas. */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
          <div className="order-1 lg:order-none">{atencion}</div>
          <div className="order-4 lg:order-none">{actividad}</div>
        </div>
        <aside className="contents lg:flex lg:flex-col lg:gap-5">
          <div className="order-2 lg:order-none">{integraciones}</div>
          <div className="order-3 lg:order-none">{firma}</div>
        </aside>
      </div>
    </div>
  );
}
