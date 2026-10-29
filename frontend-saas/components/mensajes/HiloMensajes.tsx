"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type UIEvent } from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeft, CalendarDays, Check, CheckCheck, ClipboardList, FileText, Gavel, Link2, Loader2, RefreshCw, Send, UserRound, Users, X } from "lucide-react";

import { renderMessageMarkdown } from "@/components/mensajes/textoMensaje";
import { SelectorReferencia } from "@/components/mensajes/SelectorReferencia";
import { Button } from "@/components/ui/Button";
import { Folio } from "@/components/ui/Folio";
import { Initials } from "@/components/ui/Initials";
import { api, mensajeDeError } from "@/lib/api-v2/cliente";
import { RUTA_CLIENTES } from "@/lib/clientes";
import { primerNombre, rutaProceso } from "@/lib/portalCliente";
import { cx } from "@/lib/cx";
import { diaDe, fechaLarga, horaDe, hoyISO, sumarDias } from "@/lib/fechas";
import { TIPO_REFERENCIA, textoEntrega, tituloReferencia, type Conversacion, type MensajeChat, type OpcionReferencia } from "@/lib/mensajes";

const PAGINA = 30;
const CINCO_MINUTOS = 5 * 60 * 1000;

const ICONO_REFERENCIA: Record<OpcionReferencia["tipo"], typeof Gavel> = {
  RADICADO: Gavel,
  ACTUACION: Gavel,
  TAREA: ClipboardList,
  SUBTAREA: ClipboardList,
  EVENTO: CalendarDays,
  DOCUMENTO: FileText,
};

function etiquetaDia(iso: string): string {
  const dia = diaDe(iso);
  const hoy = hoyISO();
  if (dia === hoy) return "Hoy";
  if (dia === sumarDias(hoy, -1)) return "Ayer";
  const texto = fechaLarga(iso);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function mismoGrupo(a: MensajeChat | undefined, b: MensajeChat | undefined): boolean {
  if (!a || !b) return false;
  return a.autor?.id === b.autor?.id && diaDe(a.enviado_en) === diaDe(b.enviado_en)
    && Math.abs(new Date(b.enviado_en).getTime() - new Date(a.enviado_en).getTime()) <= CINCO_MINUTOS;
}

function fusionar(actuales: MensajeChat[], nuevos: MensajeChat[]): MensajeChat[] {
  const porId = new Map(actuales.map((m) => [m.id, m]));
  for (const m of nuevos) porId.set(m.id, m);
  return [...porId.values()].sort((a, b) => a.id - b.id);
}

/** Una conversación: mensajes por día, estado de entrega, folio de cada mensaje y el redactor. */
export function HiloMensajes({ conversacion, onVolver, onActividad, variante = "firma" }: {
  conversacion: Conversacion;
  onVolver: () => void;
  /** Se envió o se leyó algo: la lista se refresca. */
  onActividad: (cambio: { leido?: boolean }) => void;
  /** En el portal del cliente: trato de usted, letra más grande y sin enlazar del expediente. */
  variante?: "firma" | "cliente";
}) {
  const id = conversacion.id;
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [cargandoAnteriores, setCargandoAnteriores] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [borrador, setBorrador] = useState("");
  const [referencia, setReferencia] = useState<OpcionReferencia | null>(null);
  const [selector, setSelector] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [nuevosDesde, setNuevosDesde] = useState<number | null>(null);
  const [irAlFinal, setIrAlFinal] = useState(false);
  const [anuncio, setAnuncio] = useState("");
  const listaRef = useRef<HTMLDivElement>(null);
  const finalRef = useRef<HTMLDivElement>(null);
  const nuevosRef = useRef<HTMLLIElement>(null);
  const redactorRef = useRef<HTMLTextAreaElement>(null);
  const ultimoRef = useRef(0);
  const siguiendoRef = useRef(true);
  const restaurarRef = useRef<number | null>(null);
  const leidoRef = useRef(0);
  const primeraCargaRef = useRef(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/conversaciones/{conversacion_id}", {
      params: { path: { conversacion_id: id }, query: { limite: PAGINA } },
    });
    if (!data) {
      setError(mensajeDeError(fallo));
      setCargando(false);
      return;
    }
    setMensajes(data.mensajes);
    setHayMas(data.hay_mas);
    setNuevosDesde(data.conversacion.primer_sin_leer_id ?? null);
    ultimoRef.current = data.mensajes.at(-1)?.id ?? 0;
    primeraCargaRef.current = true;
    setCargando(false);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reinicia el hilo al cambiar de conversación; los datos llegan tras el await.
    void cargar();
    leidoRef.current = 0;
    siguiendoRef.current = true;
    setBorrador("");
    setReferencia(null);
    setErrorEnvio(null);
    setIrAlFinal(false);
  }, [cargar]);

  // Sondeo: mensajes nuevos y el estado de entrega de los propios.
  useEffect(() => {
    if (cargando || error) return;
    const refrescar = async () => {
      if (document.visibilityState !== "visible") return;
      const { data } = await api.GET("/api/v2/conversaciones/{conversacion_id}", {
        params: { path: { conversacion_id: id }, query: { despues_de: ultimoRef.current } },
      });
      if (!data) return;
      const entregas = new Map(data.entregas.map((e) => [e.id, e.entrega]));
      const llegados = data.mensajes.filter((m) => m.id > ultimoRef.current);
      const deOtros = llegados.filter((m) => !m.es_mio);
      if (deOtros.length) {
        const ultimo = deOtros.at(-1)!;
        setAnuncio(`Nuevo mensaje de ${ultimo.autor?.nombre ?? "otra persona"}: ${ultimo.texto}`);
        setNuevosDesde((actual) => actual ?? deOtros[0].id);
      }
      ultimoRef.current = Math.max(ultimoRef.current, data.mensajes.at(-1)?.id ?? 0);
      setMensajes((actuales) => {
        let cambio = llegados.length > 0;
        const conEstado = actuales.map((m) => {
          const entrega = entregas.get(m.id);
          if (!entrega || !m.entrega || (m.entrega.estado === entrega.estado && m.entrega.leidos === entrega.leidos && m.entrega.entregados === entrega.entregados)) return m;
          cambio = true;
          return { ...m, entrega };
        });
        return cambio ? fusionar(conEstado, llegados) : actuales;
      });
    };
    const temporizador = window.setInterval(() => void refrescar(), 5000);
    document.addEventListener("visibilitychange", refrescar);
    return () => {
      window.clearInterval(temporizador);
      document.removeEventListener("visibilitychange", refrescar);
    };
  }, [cargando, error, id]);

  // Al llegar al final se marca como leído.
  const ultimoId = mensajes.at(-1)?.id ?? 0;
  useEffect(() => {
    if (!ultimoId || ultimoId <= leidoRef.current || document.visibilityState !== "visible") return;
    const recibido = mensajes.some((m) => !m.es_mio && m.id > leidoRef.current);
    leidoRef.current = ultimoId;
    if (!recibido) return;
    void api.POST("/api/v2/conversaciones/{conversacion_id}/leido", {
      params: { path: { conversacion_id: id } },
      body: { hasta: ultimoId },
    }).then(({ error: fallo }) => {
      if (!fallo) onActividad({ leido: true });
    });
  }, [id, mensajes, onActividad, ultimoId]);

  // Primera carga: al primer mensaje sin leer o al final. Después, solo si el usuario está al final.
  useLayoutEffect(() => {
    const lista = listaRef.current;
    if (!lista || cargando) return;
    if (restaurarRef.current !== null) {
      lista.scrollTop = lista.scrollHeight - restaurarRef.current;
      restaurarRef.current = null;
      return;
    }
    if (primeraCargaRef.current) {
      primeraCargaRef.current = false;
      if (nuevosRef.current) nuevosRef.current.scrollIntoView({ block: "center" });
      else lista.scrollTop = lista.scrollHeight;
      return;
    }
    if (siguiendoRef.current) finalRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    else setIrAlFinal(true);
  }, [cargando, ultimoId]);

  async function cargarAnteriores() {
    const primero = mensajes[0]?.id;
    if (!primero || !hayMas || cargandoAnteriores) return;
    setCargandoAnteriores(true);
    const { data } = await api.GET("/api/v2/conversaciones/{conversacion_id}", {
      params: { path: { conversacion_id: id }, query: { antes_de: primero, limite: PAGINA } },
    });
    if (data) {
      const lista = listaRef.current;
      restaurarRef.current = lista ? lista.scrollHeight - lista.scrollTop : null;
      setMensajes((actuales) => fusionar(actuales, data.mensajes));
      setHayMas(data.hay_mas);
    }
    setCargandoAnteriores(false);
  }

  function alDesplazar(evento: UIEvent<HTMLDivElement>) {
    const lista = evento.currentTarget;
    const alFinal = lista.scrollHeight - lista.scrollTop - lista.clientHeight < 80;
    siguiendoRef.current = alFinal;
    if (alFinal) setIrAlFinal(false);
    if (lista.scrollTop < 120) void cargarAnteriores();
  }

  // El redactor crece hasta seis líneas.
  useLayoutEffect(() => {
    const campo = redactorRef.current;
    if (!campo) return;
    campo.style.height = "auto";
    const estilo = window.getComputedStyle(campo);
    const linea = Number.parseFloat(estilo.lineHeight) || 20;
    const maximo = linea * 6 + Number.parseFloat(estilo.paddingTop) + Number.parseFloat(estilo.paddingBottom);
    campo.style.height = `${Math.min(campo.scrollHeight, maximo)}px`;
    campo.style.overflowY = campo.scrollHeight > maximo ? "auto" : "hidden";
  }, [borrador]);

  async function enviar(evento?: FormEvent) {
    evento?.preventDefault();
    const texto = borrador.trim();
    if (!texto || enviando) return;
    setEnviando(true);
    setErrorEnvio(null);
    const { data, error: fallo } = await api.POST("/api/v2/conversaciones/{conversacion_id}/mensajes", {
      params: { path: { conversacion_id: id } },
      body: { texto, referencia: referencia ? { tipo: referencia.tipo, id: referencia.id } : null },
    });
    setEnviando(false);
    if (!data) {
      setErrorEnvio(mensajeDeError(fallo));
      return;
    }
    setBorrador("");
    setReferencia(null);
    setNuevosDesde(null);
    siguiendoRef.current = true;
    ultimoRef.current = Math.max(ultimoRef.current, data.id);
    setMensajes((actuales) => fusionar(actuales, [data]));
    onActividad({});
    requestAnimationFrame(() => redactorRef.current?.focus({ preventScroll: true }));
  }

  function alTeclear(evento: KeyboardEvent<HTMLTextAreaElement>) {
    if (evento.key === "Enter" && !evento.shiftKey && !evento.nativeEvent.isComposing) {
      evento.preventDefault();
      void enviar();
    }
  }

  const cliente = variante === "cliente";
  const deGrupo = conversacion.tipo === "colaboradores";
  const puedeEnlazar = !cliente && Boolean(conversacion.proceso);
  const presencia = deGrupo
    ? (conversacion.en_linea ? `${conversacion.en_linea} en línea` : null)
    : (conversacion.en_linea ? "En línea" : null);

  return (
    <section aria-label={`Conversación con ${conversacion.titulo}`} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-line px-3 py-2 sm:px-4">
        <button type="button" onClick={onVolver} aria-label="Volver a las conversaciones" className="-ml-1 grid size-10 shrink-0 place-items-center rounded-lg text-ink-2 hover:bg-manila hover:text-ink md:hidden">
          <ArrowLeft aria-hidden="true" size={20} />
        </button>
        {deGrupo
          ? <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-manila text-ink-2"><Users size={17} /></span>
          : <Initials name={conversacion.titulo} size={36} />}
        <div className="min-w-0 flex-1">
          <h2 className={cx("truncate font-semibold text-ink", cliente ? "text-[17px]" : "text-[15px]")}>{conversacion.titulo}</h2>
          <p className={cx("flex min-w-0 items-center gap-1.5 text-ink-3", cliente ? "text-[14px]" : "text-[12.5px]")}>
            {presencia && <><span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-ok" /><span className="shrink-0">{presencia}</span>{conversacion.proceso && <span aria-hidden="true">·</span>}</>}
            {conversacion.proceso
              ? <Link href={cliente ? rutaProceso(conversacion.proceso.id) : `/gestion-procesos/abogado/procesos/${conversacion.proceso.id}`} className="truncate font-semibold text-navy-ink hover:underline">{conversacion.proceso.nombre}</Link>
              : !presencia && <span>{conversacion.tipo === "equipo" ? "Equipo de la firma" : ""}</span>}
          </p>
        </div>
        {!cliente && conversacion.tipo === "cliente" && conversacion.contacto && (
          <Link href={`${RUTA_CLIENTES}/${conversacion.contacto.id}`} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-ink-2 hover:bg-manila hover:text-ink">
            <UserRound aria-hidden="true" size={16} /><span className="hidden sm:inline">Ficha del cliente</span>
            <span className="sr-only sm:hidden">Ficha del cliente</span>
          </Link>
        )}
      </header>

      <p className="sr-only" aria-live="polite" aria-atomic="true">{anuncio}</p>

      <div className="relative min-h-0 flex-1">
        <div ref={listaRef} onScroll={alDesplazar} className="h-full overflow-y-auto bg-sheet-2 px-3 py-4 sm:px-6">
          {cargando ? (
            <div className="grid h-full place-items-center"><Loader2 aria-label="Cargando mensajes" className="animate-spin text-ink-3" size={22} /></div>
          ) : error ? (
            <div role="alert" className="grid h-full place-items-center text-center">
              <div className="space-y-3">
                <p className="text-[14px] text-bad">{error}</p>
                <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
              </div>
            </div>
          ) : mensajes.length === 0 ? (
            <div className="grid h-full place-items-center text-center">
              <div className="max-w-xs">
                {cliente ? (
                  <>
                    <p className="font-display text-[22px] text-ink">Escríbale a {primerNombre(conversacion.titulo)}</p>
                    <p className="mt-1.5 text-[16px] text-ink-2">Le responde en horario de oficina, de lunes a viernes. Su mensaje queda en el expediente del proceso.</p>
                  </>
                ) : (
                  <>
                    <p className="font-display text-[19px] text-ink">Escribe el primer mensaje</p>
                    <p className="mt-1.5 text-[13.5px] text-ink-3">
                      {conversacion.proceso ? "Cada mensaje queda en el expediente como un folio." : "Solo lo ven ustedes dos."}
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <ol className="mx-auto flex max-w-3xl flex-col">
              <li className="mb-3 flex justify-center">
                {hayMas ? (
                  <button type="button" onClick={() => void cargarAnteriores()} disabled={cargandoAnteriores} className="inline-flex min-h-9 items-center gap-2 rounded-full bg-sheet px-3 text-[12.5px] font-semibold text-ink-2 shadow-sheet hover:text-ink disabled:opacity-60">
                    {cargandoAnteriores && <Loader2 aria-hidden="true" size={13} className="animate-spin" />}
                    {cargandoAnteriores ? "Cargando…" : "Ver mensajes anteriores"}
                  </button>
                ) : <span className="text-[12px] text-ink-3">Inicio de la conversación</span>}
              </li>
              {mensajes.map((m, i) => {
                const anterior = mensajes[i - 1];
                const siguiente = mensajes[i + 1];
                const nuevoDia = !anterior || diaDe(anterior.enviado_en) !== diaDe(m.enviado_en);
                const conAnterior = !nuevoDia && mismoGrupo(anterior, m) && m.id !== nuevosDesde;
                const conSiguiente = mismoGrupo(m, siguiente) && siguiente?.id !== nuevosDesde;
                return (
                  <Fragment key={m.id}>
                    {nuevoDia && (
                      <li className="my-3 flex justify-center">
                        <span className="rounded-full bg-sheet px-3 py-1 text-[12px] font-semibold text-ink-2 shadow-sheet">{etiquetaDia(m.enviado_en)}</span>
                      </li>
                    )}
                    {m.id === nuevosDesde && (
                      <li ref={nuevosRef} className="my-3 flex items-center gap-3 text-[12px] font-semibold text-gold-ink">
                        <span aria-hidden="true" className="h-px flex-1 bg-gold/60" />Mensajes nuevos<span aria-hidden="true" className="h-px flex-1 bg-gold/60" />
                      </li>
                    )}
                    <Burbuja mensaje={m} conAnterior={conAnterior} conSiguiente={conSiguiente} mostrarAutor={deGrupo && !m.es_mio && !conAnterior} grande={cliente} />
                  </Fragment>
                );
              })}
            </ol>
          )}
          <div ref={finalRef} />
        </div>
        {irAlFinal && (
          <button
            type="button"
            onClick={() => { siguiendoRef.current = true; setIrAlFinal(false); finalRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }}
            className="motion-lift-in absolute bottom-3 left-1/2 inline-flex min-h-10 -translate-x-1/2 items-center gap-1.5 rounded-full bg-navy px-4 text-[13px] font-semibold text-on-navy shadow-pop"
          >
            <ArrowDown aria-hidden="true" size={15} />Mensajes nuevos
          </button>
        )}
      </div>

      <form onSubmit={(e) => void enviar(e)} className="shrink-0 border-t border-line bg-sheet p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:p-3">
        {errorEnvio && <p role="alert" className="mx-auto mb-2 max-w-3xl px-1 text-[13px] text-bad">{errorEnvio}</p>}
        {referencia && (
          <div className="mx-auto mb-2 flex max-w-3xl items-center gap-2 rounded-lg bg-navy-soft py-1 pl-3 pr-1 text-[13px] text-navy-ink">
            <Link2 aria-hidden="true" size={14} className="shrink-0" />
            <span className="shrink-0 font-semibold">{TIPO_REFERENCIA[referencia.tipo]}:</span>
            <span className="min-w-0 flex-1 truncate">{tituloReferencia(referencia.titulo)}</span>
            <button type="button" onClick={() => setReferencia(null)} aria-label="Quitar el enlace" className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-sheet/60"><X aria-hidden="true" size={14} /></button>
          </div>
        )}
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          {puedeEnlazar && (
            <button type="button" onClick={() => setSelector(true)} aria-label="Enlazar un radicado, tarea, evento o documento" title="Enlazar del expediente" className="grid size-11 shrink-0 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-manila hover:text-ink sm:size-10">
              <Link2 aria-hidden="true" size={18} />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <textarea
              aria-label="Mensaje"
              ref={redactorRef}
              value={borrador}
              onChange={(e) => setBorrador(e.target.value)}
              onKeyDown={alTeclear}
              rows={1}
              maxLength={12000}
              placeholder={cliente ? "Escriba su mensaje" : "Escribe un mensaje"}
              className={cx(
                "block w-full resize-none rounded-lg border border-line-strong bg-sheet px-3 text-ink placeholder:text-ink-3 focus:border-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/25",
                cliente ? "min-h-12 py-3 text-[17px] leading-6" : "min-h-11 py-2.5 text-[15px] leading-5 sm:min-h-10 sm:py-2 sm:text-[14px]",
              )}
            />
          </div>
          <Button type="submit" size={cliente ? "lg" : "md"} loading={enviando} disabled={!borrador.trim()} icon={<Send size={16} />} aria-label="Enviar" className={cx("shrink-0", !cliente && "min-h-11 sm:min-h-10")}>
            <span className="hidden sm:inline">Enviar</span>
          </Button>
        </div>
        <p className={cx("mx-auto mt-1.5 hidden max-w-3xl px-1 text-ink-3 sm:block", cliente ? "text-[13px]" : "text-[12px]")}>Enter envía · Mayús + Enter, nueva línea</p>
      </form>

      {puedeEnlazar && <SelectorReferencia conversacionId={id} open={selector} onClose={() => setSelector(false)} onElegir={setReferencia} />}
    </section>
  );
}

function Burbuja({ mensaje, conAnterior, conSiguiente, mostrarAutor, grande = false }: {
  mensaje: MensajeChat;
  conAnterior: boolean;
  conSiguiente: boolean;
  mostrarAutor: boolean;
  grande?: boolean;
}) {
  const mio = mensaje.es_mio;
  const Icono = mensaje.referencia ? ICONO_REFERENCIA[mensaje.referencia.tipo] : null;
  return (
    <li className={cx("flex items-start gap-2", mio ? "flex-row-reverse" : "flex-row", conAnterior ? "mt-1" : "mt-3")}>
      <div className={cx("flex min-w-0 max-w-[85%] flex-col sm:max-w-[72%]", mio ? "items-end" : "items-start")}>
        {mostrarAutor && <p className="mb-1 px-1 text-[12px] font-semibold text-ink-2">{mensaje.autor?.nombre ?? "Usuario eliminado"}</p>}
        <div
          className={cx(
            "motion-message-in rounded-2xl px-3.5 py-2 [overflow-wrap:anywhere]",
            grande ? "text-[16.5px] leading-[1.5]" : "text-[14.5px] leading-[1.45]",
            mio ? "origin-bottom-right bg-navy text-on-navy" : "origin-bottom-left bg-sheet text-ink shadow-sheet",
            mio ? (conSiguiente ? "rounded-br-md" : "rounded-br-sm") : (conSiguiente ? "rounded-bl-md" : "rounded-bl-sm"),
            conAnterior && (mio ? "rounded-tr-md" : "rounded-tl-md"),
          )}
        >
          {mensaje.referencia && Icono && (
            mensaje.referencia.enlace ? (
              <Link
                href={mensaje.referencia.enlace}
                className={cx(
                  "mb-1.5 flex items-start gap-2 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
                  mio ? "bg-on-navy/10 hover:bg-on-navy/15" : "bg-sheet-2 shadow-[inset_2px_0_0_var(--navy)] hover:bg-manila",
                )}
              >
                <Icono aria-hidden="true" size={15} className="mt-0.5 shrink-0 opacity-80" />
                <span className="min-w-0">
                  <span className={cx("block text-[11.5px] font-semibold uppercase tracking-[0.04em]", mio ? "opacity-75" : "text-ink-3")}>{TIPO_REFERENCIA[mensaje.referencia.tipo]}</span>
                  <span className={cx("block", mensaje.referencia.tipo === "RADICADO" && "font-mono")}>{tituloReferencia(mensaje.referencia.titulo)}</span>
                </span>
              </Link>
            ) : null
          )}
          {renderMessageMarkdown(mensaje.texto)}
        </div>
        {!conSiguiente && (
          <p className={cx("mt-1 flex items-center gap-1 px-1 text-ink-3 tabular-nums", grande ? "text-[13px]" : "text-[11.5px]")}>
            <time dateTime={mensaje.enviado_en}>{horaDe(mensaje.enviado_en)}</time>
            {mio && mensaje.entrega && (
              <span className={cx("inline-flex items-center gap-1", mensaje.entrega.estado === "leido" && "text-navy-ink")}>
                <span aria-hidden="true">·</span>
                {mensaje.entrega.estado === "enviado" ? <Check aria-hidden="true" size={13} /> : <CheckCheck aria-hidden="true" size={13} />}
                {textoEntrega(mensaje.entrega)}
              </span>
            )}
          </p>
        )}
      </div>
      {mensaje.folio != null && <Folio n={mensaje.folio} size="sm" className={mostrarAutor ? "mt-[30px]" : "mt-2"} />}
    </li>
  );
}
