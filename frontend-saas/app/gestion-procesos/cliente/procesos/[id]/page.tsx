"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, Download, FileSignature, FileText, MessageCircle, RefreshCw } from "lucide-react";

import {
  EnQueVa,
  EntradaCliente,
  FilasCargando,
  PendientesCliente,
  ProximaFecha,
  TituloCliente,
} from "@/components/portal-cliente/piezas";
import { Button, EnlaceBoton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Radicado } from "@/components/ui/Radicado";
import { Sheet } from "@/components/ui/Sheet";
import { Tag } from "@/components/ui/Tag";
import { api, mensajeDeError } from "@/lib/api-v2/cliente";
import { fechaCorta, fechaLarga, horaDe } from "@/lib/fechas";
import {
  ORIGEN_DOCUMENTO,
  RUTA_CLIENTE,
  primerNombre,
  rutaMensajeAbogado,
  textoEstado,
  tonoEstado,
  type EntradaHistoria,
  type ProcesoCliente,
} from "@/lib/portalCliente";
import { useLoadEffect } from "@/lib/useLoadEffect";

const POR_PAGINA = 20;
// Si el enlace apunta a una actuación antigua, se cargan páginas hasta encontrarla.
const PAGINAS_PARA_ANCLA = 6;

export default function ProcesoClientePage() {
  const { id } = useParams<{ id: string }>();
  const procesoId = Number(id);
  const [proceso, setProceso] = useState<ProcesoCliente | null>(null);
  const [error, setError] = useState<{ mensaje: string; noExiste: boolean } | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: fallo, response } = await api.GET("/api/v2/cliente/procesos/{proceso_id}", {
      params: { path: { proceso_id: procesoId } },
    });
    if (data) setProceso(data);
    else setError({ mensaje: mensajeDeError(fallo), noExiste: response.status === 404 || response.status === 422 });
  }, [procesoId]);
  useLoadEffect(cargar);

  if (error && !proceso) {
    return (
      <div>
        <VolverAlInicio />
        <Sheet>
          {error.noExiste ? (
            <EmptyState title="No encontramos ese proceso" description="Puede que la firma lo haya cerrado o que el enlace esté incompleto." />
          ) : (
            <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
              <p role="alert" className="text-bad">{error.mensaje}</p>
              <Button variant="secondary" size="lg" icon={<RefreshCw aria-hidden="true" size={16} />} onClick={() => void cargar()}>
                Intentar de nuevo
              </Button>
            </div>
          )}
        </Sheet>
      </div>
    );
  }

  if (!proceso) {
    return (
      <div aria-busy="true">
        <VolverAlInicio />
        <span className="mb-8 block h-10 w-2/3 animate-pulse rounded bg-manila" />
        <Sheet className="mb-8"><FilasCargando filas={2} /></Sheet>
        <Sheet><FilasCargando filas={4} /></Sheet>
      </div>
    );
  }

  const abogada = primerNombre(proceso.abogado.nombre);
  const equipo = proceso.equipo.map((p) => p.nombre);
  return (
    <div>
      <VolverAlInicio />
      <TituloCliente
        sub={
          <>
            Lleva su caso {proceso.abogado.nombre}
            {equipo.length > 0 && <>, con {equipo.join(" y ")}</>}
            {proceso.despacho && <> · {proceso.despacho}</>}
          </>
        }
      >
        {proceso.nombre}
      </TituloCliente>

      <Sheet className="mb-8 px-5 py-6 sm:px-7" aria-labelledby="en-que-va">
        <h2 id="en-que-va" className="mb-5 font-display text-[22px] text-ink">En qué va su proceso</h2>
        <EnQueVa proceso={proceso} />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <QueSigue proceso={proceso} />
          <ProximaFecha fecha={proceso.proxima_fecha} />
        </div>
      </Sheet>

      {proceso.pendientes.length > 0 && (
        <div className="mb-8">
          <PendientesCliente pendientes={proceso.pendientes} />
        </div>
      )}

      <Historia procesoId={proceso.id} />

      <section id="documentos" aria-labelledby="documentos-titulo" className="mt-8 scroll-mt-24">
        <h2 id="documentos-titulo" className="mb-3 font-display text-[22px] text-ink">Documentos</h2>
        <Sheet className="overflow-hidden">
          {proceso.documentos.length === 0 ? (
            <EmptyState icon={FileText} title="Aún no hay documentos" description="Aquí quedarán los documentos que usted envíe y los que la firma comparta con usted." />
          ) : (
            <ul className="divide-y divide-line">
              {proceso.documentos.map((documento) => (
                <li key={documento.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 sm:px-7">
                  {documento.origen === "contrato"
                    ? <FileSignature aria-hidden="true" size={22} strokeWidth={1.75} className="shrink-0 text-ink-3" />
                    : <FileText aria-hidden="true" size={22} strokeWidth={1.75} className="shrink-0 text-ink-3" />}
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="break-words font-semibold text-ink">{documento.nombre}</p>
                    <p className="text-[15px] text-ink-3">{ORIGEN_DOCUMENTO[documento.origen]} · {fechaCorta(documento.fecha)}</p>
                    {documento.nota && <p className="mt-2 rounded-lg bg-manila px-3 py-2 text-[15px] text-ink-2">{documento.nota}</p>}
                  </div>
                  {documento.estado && (
                    <Tag tone={tonoEstado(documento.estado)} className="h-7 px-2.5 text-[13px]">{textoEstado(documento.estado)}</Tag>
                  )}
                  <a
                    href={documento.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-sheet px-4 text-[15px] font-semibold text-ink shadow-[0_0_0_1px_var(--line-strong),0_1px_2px_rgb(24_32_58/0.06)] transition-[background-color,scale] duration-150 hover:bg-sheet-2 active:scale-[0.96]"
                  >
                    <Download aria-hidden="true" size={16} /> Descargar<span className="sr-only"> {documento.nombre}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      </section>

      <Sheet className="mt-8 flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:px-7">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[20px] text-ink">¿Tiene dudas?</h2>
          <p className="text-[16px] text-ink-2">Escríbale a {abogada}. Le responde en horario de oficina, de lunes a viernes.</p>
        </div>
        <EnlaceBoton size="lg" href={rutaMensajeAbogado(proceso)} icon={<MessageCircle aria-hidden="true" size={18} />}>
          Escribir un mensaje
        </EnlaceBoton>
      </Sheet>

      {proceso.radicados.length > 0 && (
        <p className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-ink-3">
          {proceso.radicados.length === 1 ? "Radicado en la Rama Judicial:" : "Radicados en la Rama Judicial:"}
          {proceso.radicados.map((numero) => <Radicado key={numero} numero={numero} className="text-[14px] text-ink-2" />)}
        </p>
      )}
    </div>
  );
}

function VolverAlInicio() {
  return (
    <Link href={RUTA_CLIENTE} className="mb-4 inline-flex min-h-11 items-center gap-1 rounded text-[16px] font-semibold text-ink-3 hover:text-ink">
      <ChevronLeft aria-hidden="true" size={20} /> Inicio
    </Link>
  );
}

/** Lo próximo, en una frase: la siguiente fecha y lo que hace falta antes. */
/** Cierra la frase sin duplicar el punto de «a. m.». */
function conPunto(frase: string): string {
  return frase.endsWith(".") ? frase : `${frase}.`;
}

function QueSigue({ proceso }: { proceso: ProcesoCliente }) {
  const fecha = proceso.proxima_fecha;
  const pendiente = proceso.pendientes[0];
  const otros = proceso.pendientes.length - 1;
  return (
    <div className="rounded-xl bg-gold-soft p-4 sm:px-5">
      <p className="font-semibold text-ink">Qué sigue</p>
      <p className="mt-1 text-[16px] text-ink-2">
        {fecha ? `${conPunto(`${fecha.tipo_legible} el ${fechaLarga(fecha.inicio)} a las ${horaDe(fecha.inicio)}`)} ` : "La firma le avisará cuando haya una nueva fecha. "}
        {pendiente
          ? `Mientras tanto necesitamos: ${pendiente.titulo.charAt(0).toLowerCase()}${pendiente.titulo.slice(1)}${otros > 0 ? ` y ${otros === 1 ? "una cosa más" : `${otros} cosas más`}` : ""}.`
          : "Por ahora no necesitamos nada de usted."}
      </p>
    </div>
  );
}

function Historia({ procesoId }: { procesoId: number }) {
  const [items, setItems] = useState<EntradaHistoria[] | null>(null);
  const [siguiente, setSiguiente] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visto = useRef(false);
  const buscandoAncla = useRef(0);

  const pagina = useCallback(async (cursor: string | null) => {
    const { data, error: fallo } = await api.GET("/api/v2/cliente/procesos/{proceso_id}/historia", {
      params: { path: { proceso_id: procesoId }, query: { limite: POR_PAGINA, cursor } },
    });
    if (!data) throw new Error(mensajeDeError(fallo));
    return data;
  }, [procesoId]);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const data = await pagina(null);
      setItems(data.items);
      setSiguiente(data.siguiente);
      setTotal(data.total);
      // Lo que hay ahora deja de ser nuevo la próxima vez; en esta visita sigue resaltado.
      if (!visto.current && data.nuevos > 0) {
        visto.current = true;
        void api.POST("/api/v2/cliente/procesos/{proceso_id}/visto", { params: { path: { proceso_id: procesoId } } });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos cargar la historia.");
    }
  }, [pagina, procesoId]);
  useLoadEffect(cargar);

  const cargarMas = useCallback(async () => {
    if (!siguiente) return;
    setCargandoMas(true);
    try {
      const data = await pagina(siguiente);
      setItems((actuales) => [...(actuales ?? []), ...data.items]);
      setSiguiente(data.siguiente);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos cargar más.");
    } finally {
      setCargandoMas(false);
    }
  }, [pagina, siguiente]);

  // Los avisos enlazan a #actuacion-N y a #actividad: se lleva al cliente hasta ahí.
  useEffect(() => {
    if (!items) return;
    const ancla = window.location.hash.slice(1);
    if (!ancla) return;
    const destino = document.getElementById(ancla === "actividad" || ancla === "comunicacion" ? "historia" : ancla);
    if (destino) {
      destino.scrollIntoView({ block: "start" });
      return;
    }
    if (ancla.startsWith("actuacion-") && siguiente && !cargandoMas && buscandoAncla.current < PAGINAS_PARA_ANCLA) {
      buscandoAncla.current += 1;
      void cargarMas();
    }
  }, [items, siguiente, cargandoMas, cargarMas]);

  return (
    <section id="historia" aria-labelledby="historia-titulo" className="scroll-mt-24">
      <h2 id="historia-titulo" className="mb-3 font-display text-[22px] text-ink">Historia del proceso</h2>
      <Sheet className="overflow-hidden">
        {error && !items ? (
          <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
            <p role="alert" className="text-bad">{error}</p>
            <Button variant="secondary" icon={<RefreshCw aria-hidden="true" size={16} />} onClick={() => void cargar()}>Intentar de nuevo</Button>
          </div>
        ) : !items ? (
          <div aria-busy="true"><FilasCargando filas={4} /></div>
        ) : items.length === 0 ? (
          <EmptyState title="Todavía no hay movimientos" description="Cada cosa que pase en su proceso quedará aquí, explicada y en orden." />
        ) : (
          <>
            <ol className="divide-y divide-line">
              {items.map((entrada) => <EntradaCliente key={entrada.folio} entrada={entrada} />)}
            </ol>
            {(siguiente || error) && (
              <div className="flex flex-col items-center gap-2 border-t border-line bg-sheet-2 px-5 py-4">
                {error && <p role="alert" className="text-[15px] text-bad">{error}</p>}
                {siguiente && (
                  <Button variant="secondary" size="lg" loading={cargandoMas} onClick={() => void cargarMas()}>
                    Ver movimientos anteriores
                    <span className="text-[14px] font-normal text-ink-3 tabular-nums">({items.length} de {total})</span>
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </Sheet>
    </section>
  );
}
