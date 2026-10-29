"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MessageSquare, RefreshCw } from "lucide-react";

import { HiloMensajes } from "@/components/mensajes/HiloMensajes";
import { Button } from "@/components/ui/Button";
import { Initials } from "@/components/ui/Initials";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { diaDe, fechaRelativa, horaDe, hoyISO } from "@/lib/fechas";
import { RUTA_MENSAJES_CLIENTE, claveDeRuta, partesDeRuta, rutaDe, vistaPrevia, type Conversacion } from "@/lib/mensajes";
import { useLoadEffect } from "@/lib/useLoadEffect";

function cuando(iso: string): string {
  return diaDe(iso) === hoyISO() ? horaDe(iso) : fechaRelativa(iso);
}

/**
 * Mensajes del cliente con quienes llevan sus procesos. Las mismas conversaciones
 * de la firma (API v2), contadas con trato de usted: primero las que tienen
 * mensajes y después las personas a las que aún no les ha escrito.
 */
export function MensajesCliente() {
  const pathname = usePathname();
  const router = useRouter();
  const partes = useMemo(() => partesDeRuta(pathname), [pathname]);
  const clave = claveDeRuta(partes);

  const [lista, setLista] = useState<Esquemas["ListaConversaciones"] | null>(null);
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const [responsables, setResponsables] = useState<Map<number, number>>(new Map());
  const [resuelta, setResuelta] = useState<{ clave: string; conversacion: Conversacion | null; error?: string } | null>(null);
  const primeraRef = useRef(true);

  const cargarLista = useCallback(async () => {
    const sincronizar = primeraRef.current;
    const { data, error } = await api.GET("/api/v2/conversaciones", { params: { query: { sincronizar } } });
    if (data) {
      primeraRef.current = false;
      setLista(data);
      setErrorLista(null);
    } else if (!lista) setErrorLista(mensajeDeError(error));
  }, [lista]);

  const cargarRef = useRef(cargarLista);
  useEffect(() => {
    cargarRef.current = cargarLista;
  }, [cargarLista]);

  useEffect(() => {
    void cargarRef.current();
    const refrescar = () => { if (document.visibilityState === "visible") void cargarRef.current(); };
    const temporizador = window.setInterval(refrescar, 10_000);
    document.addEventListener("visibilitychange", refrescar);
    return () => {
      window.clearInterval(temporizador);
      document.removeEventListener("visibilitychange", refrescar);
    };
  }, []);

  // Quién lleva cada proceso, para distinguirlo del resto del equipo.
  const cargarResponsables = useCallback(async () => {
    const { data } = await api.GET("/api/v2/cliente/inicio");
    if (data) setResponsables(new Map(data.procesos.map((p) => [p.id, p.abogado.id])));
  }, []);
  useLoadEffect(cargarResponsables);

  const enLista = clave ? lista?.items.find((c) => c.clave === clave) ?? null : null;
  const resolver = useCallback(async () => {
    if (!clave || enLista || !lista || resuelta?.clave === clave) return;
    const { data, error } = await api.GET("/api/v2/conversaciones/resolver", { params: { query: { clave } } });
    setResuelta({ clave, conversacion: data ?? null, error: data ? undefined : mensajeDeError(error) });
    if (data) void cargarRef.current();
  }, [clave, enLista, lista, resuelta?.clave]);
  useLoadEffect(resolver);

  const activa = enLista ?? (resuelta?.clave === clave ? resuelta.conversacion : null);
  const activaActual = activa ? lista?.items.find((c) => c.id === activa.id) ?? activa : null;

  const alActividad = useCallback(({ leido }: { leido?: boolean }) => {
    if (leido && activa) {
      setLista((actual) => actual && {
        ...actual,
        items: actual.items.map((c) => (c.id === activa.id ? { ...c, sin_leer: 0, primer_sin_leer_id: null } : c)),
      });
    }
    void cargarRef.current();
  }, [activa]);

  const items = lista?.items ?? [];
  const conMensajes = items.filter((c) => c.ultimo);
  const sinMensajes = items
    .filter((c) => !c.ultimo)
    .sort((a, b) => Number(esResponsable(b, responsables)) - Number(esResponsable(a, responsables)) || a.titulo.localeCompare(b.titulo, "es"));
  const variosProcesos = new Set(items.map((c) => c.proceso?.id)).size > 1;
  const abierta = Boolean(clave);
  const abrir = (c: Conversacion) => router.push(rutaDe(c, RUTA_MENSAJES_CLIENTE));

  return (
    <div className="flex h-full min-h-0 flex-col lg:px-6 lg:pb-6 lg:pt-8">
      <div className="hidden pb-5 lg:block">
        <h1 className="font-display text-[36px] leading-tight text-ink">Mensajes</h1>
        <p className="mt-1 text-ink-2">Escríbale a quien lleva su caso. Cada mensaje queda en el expediente del proceso.</p>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden bg-sheet lg:rounded-2xl lg:shadow-sheet">
        <aside aria-label="Conversaciones" className={cx("min-h-0 w-full shrink-0 flex-col border-line md:flex md:w-[340px] md:border-r lg:w-[380px]", abierta ? "hidden" : "flex")}>
          <div className="border-b border-line px-4 pb-4 pt-5 lg:hidden">
            <h1 className="font-display text-[30px] leading-tight text-ink">Mensajes</h1>
            <p className="mt-1 text-[16px] text-ink-2">Escríbale a quien lleva su caso.</p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pb-28 lg:pb-0">
            {errorLista ? (
              <div role="alert" className="space-y-4 px-5 py-12 text-center">
                <p className="text-bad">{errorLista}</p>
                <Button variant="secondary" size="lg" icon={<RefreshCw aria-hidden="true" size={16} />} onClick={() => void cargarLista()}>Intentar de nuevo</Button>
              </div>
            ) : !lista ? (
              <ul aria-hidden="true" className="divide-y divide-line">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="flex gap-3 px-5 py-4">
                    <span className="size-11 shrink-0 animate-pulse rounded-full bg-manila" />
                    <span className="flex-1 space-y-2 py-1"><span className="block h-3.5 w-1/2 animate-pulse rounded bg-manila" /><span className="block h-3.5 w-4/5 animate-pulse rounded bg-manila" /></span>
                  </li>
                ))}
              </ul>
            ) : items.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="font-display text-[22px] text-ink">Aún no tiene con quién conversar</p>
                <p className="mx-auto mt-2 max-w-xs text-[16px] text-ink-2">Cuando la firma abra su proceso, aquí podrá escribirle a quien lo lleva.</p>
              </div>
            ) : (
              <>
                {conMensajes.length > 0 && (
                  <ul className="divide-y divide-line">
                    {conMensajes.map((c) => (
                      <FilaConversacion key={c.id} conversacion={c} activa={c.id === activaActual?.id} rol={rol(c, responsables)} conProceso={variosProcesos} onAbrir={() => abrir(c)} />
                    ))}
                  </ul>
                )}
                {sinMensajes.length > 0 && (
                  <section aria-labelledby="escribir-a" className={cx(conMensajes.length > 0 && "border-t border-line")}>
                    <h2 id="escribir-a" className="px-5 pb-1 pt-5 text-[14px] font-semibold text-ink-3">
                      {conMensajes.length > 0 ? "También puede escribirle a" : "Puede escribirle a"}
                    </h2>
                    <ul className="divide-y divide-line">
                      {sinMensajes.map((c) => (
                        <FilaConversacion key={c.id} conversacion={c} activa={c.id === activaActual?.id} rol={rol(c, responsables)} conProceso={variosProcesos} onAbrir={() => abrir(c)} />
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}
          </div>
        </aside>

        <div className={cx("min-h-0 min-w-0 flex-1 flex-col", abierta ? "flex" : "hidden md:flex")}>
          {activaActual ? (
            <HiloMensajes key={activaActual.id} conversacion={activaActual} variante="cliente" onVolver={() => router.push(RUTA_MENSAJES_CLIENTE)} onActividad={alActividad} />
          ) : abierta && resuelta?.clave === clave && resuelta.error ? (
            <div role="alert" className="grid flex-1 place-items-center p-8 text-center">
              <div className="max-w-sm space-y-4">
                <p className="font-display text-[22px] text-ink">No pudimos abrir la conversación</p>
                <p className="text-ink-2">{resuelta.error}</p>
                <Button variant="secondary" size="lg" onClick={() => router.push(RUTA_MENSAJES_CLIENTE)}>Ver sus conversaciones</Button>
              </div>
            </div>
          ) : abierta ? (
            <div className="grid flex-1 place-items-center text-ink-3">Abriendo la conversación…</div>
          ) : (
            <div className="grid flex-1 place-items-center bg-sheet-2 p-8 text-center">
              <div className="max-w-xs">
                <MessageSquare aria-hidden="true" size={30} strokeWidth={1.5} className="mx-auto text-ink-3" />
                <p className="mt-3 font-display text-[22px] text-ink">Elija una conversación</p>
                <p className="mt-1.5 text-[16px] text-ink-2">Le responden en horario de oficina, de lunes a viernes.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function esResponsable(c: Conversacion, responsables: Map<number, number>): boolean {
  return Boolean(c.proceso && c.contacto && responsables.get(c.proceso.id) === c.contacto.id);
}

function rol(c: Conversacion, responsables: Map<number, number>): string {
  if (c.tipo === "colaboradores") return "Equipo del proceso";
  return esResponsable(c, responsables) ? "Lleva su caso" : "Equipo de la firma";
}

function FilaConversacion({ conversacion: c, activa, rol, conProceso, onAbrir }: {
  conversacion: Conversacion;
  activa: boolean;
  rol: string;
  conProceso: boolean;
  onAbrir: () => void;
}) {
  const ultimo = c.ultimo;
  return (
    <li>
      <button
        type="button"
        onClick={onAbrir}
        aria-current={activa ? "true" : undefined}
        className={cx("relative flex w-full gap-3 px-5 py-4 text-left transition-colors", activa ? "bg-navy-soft" : "hover:bg-sheet-2")}
      >
        <span className="relative size-11 shrink-0">
          <Initials name={c.titulo} size={44} />
          {c.en_linea > 0 && <span aria-label="En línea" className="absolute bottom-0 right-0 size-3 rounded-full bg-ok ring-2 ring-sheet" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cx("truncate text-ink", c.sin_leer ? "font-bold" : "font-semibold")}>{c.titulo}</span>
            {ultimo && (
              <time dateTime={ultimo.enviado_en} className={cx("shrink-0 text-[13px] tabular-nums", c.sin_leer ? "font-semibold text-gold-ink" : "text-ink-3")}>
                {cuando(ultimo.enviado_en)}
              </time>
            )}
          </span>
          <span className="block truncate text-[14px] text-ink-3">{conProceso && c.proceso ? `${rol} · ${c.proceso.nombre}` : rol}</span>
          {ultimo ? (
            <span className="mt-0.5 flex items-center gap-2">
              <span className={cx("line-clamp-1 min-w-0 flex-1 text-[15px]", c.sin_leer ? "text-ink" : "text-ink-2")}>
                {ultimo.es_mio ? "Usted: " : ""}{vistaPrevia(ultimo.texto)}
              </span>
              {c.sin_leer > 0 && (
                <span key={c.sin_leer} className="motion-pop grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-gold px-1.5 text-[12px] font-bold text-ink tabular-nums" aria-label={`${c.sin_leer} sin leer`}>
                  {c.sin_leer > 99 ? "99+" : c.sin_leer}
                </span>
              )}
            </span>
          ) : (
            <span className="mt-0.5 block text-[15px] font-semibold text-navy-ink">Escribirle</span>
          )}
        </span>
      </button>
    </li>
  );
}
