"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MessageSquare, PenSquare, RefreshCw, Search, Users, X } from "lucide-react";

import { CAMPO } from "@/components/expediente/CalculadoraTermino";
import { HiloMensajes } from "@/components/mensajes/HiloMensajes";
import { NuevaConversacion } from "@/components/mensajes/NuevaConversacion";
import { Button } from "@/components/ui/Button";
import { Initials } from "@/components/ui/Initials";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { diaDe, fechaRelativa, horaDe, hoyISO } from "@/lib/fechas";
import { RUTA_MENSAJES, claveDeRuta, partesDeRuta, procesoDeRuta, rutaDe, vistaPrevia, type Conversacion } from "@/lib/mensajes";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Filtro = "todas" | "sin_leer" | "por_responder" | "equipo";

const VACIOS: Record<Filtro, [string, string]> = {
  todas: ["Aún no hay mensajes", "Escríbele a un cliente o a un colega; cada mensaje de un proceso queda en su expediente como un folio."],
  sin_leer: ["Todo leído", "Los mensajes que aún no abres aparecen aquí."],
  por_responder: ["Nadie espera respuesta", "Cuando un cliente te escribe y aún no le respondes, su conversación aparece aquí."],
  equipo: ["Sin mensajes del equipo", "Las conversaciones con colegas y con el equipo de cada proceso aparecen aquí."],
};

function cuando(iso: string): string {
  return diaDe(iso) === hoyISO() ? horaDe(iso) : fechaRelativa(iso);
}

/** Mensajes del abogado: la lista de conversaciones y la conversación abierta, lado a lado en escritorio. */
export function MensajesWorkspace() {
  const pathname = usePathname();
  const router = useRouter();
  const partes = useMemo(() => partesDeRuta(pathname), [pathname]);
  const clave = claveDeRuta(partes);
  const procesoFiltro = procesoDeRuta(partes);

  const [lista, setLista] = useState<Esquemas["ListaConversaciones"] | null>(null);
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busqueda, setBusqueda] = useState("");
  const [nueva, setNueva] = useState(false);
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

  // La conversación de la ruta: de la lista si ya está; si no, se abre (o se crea) por su clave.
  const enLista = clave ? lista?.items.find((c) => c.clave === clave) ?? null : null;
  const resolver = useCallback(async () => {
    if (!clave || enLista || !lista || resuelta?.clave === clave) return;
    const { data, error } = await api.GET("/api/v2/conversaciones/resolver", { params: { query: { clave } } });
    setResuelta({ clave, conversacion: data ?? null, error: data ? undefined : mensajeDeError(error) });
    if (data) void cargarRef.current();
  }, [clave, enLista, lista, resuelta?.clave]);
  useLoadEffect(resolver);

  const activa = enLista ?? (resuelta?.clave === clave ? resuelta.conversacion : null);
  // Mantiene el hilo con la versión más reciente de la conversación (presencia, sin leer).
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
  const texto = busqueda.trim().toLocaleLowerCase("es");
  const visibles = items.filter((c) => {
    if (!c.ultimo && c.id !== activaActual?.id) return false;
    if (procesoFiltro && c.proceso?.id !== procesoFiltro) return false;
    if (filtro === "sin_leer" && !c.sin_leer) return false;
    if (filtro === "por_responder" && !c.por_responder) return false;
    if (filtro === "equipo" && c.tipo === "cliente") return false;
    return !texto || `${c.titulo} ${c.proceso?.nombre ?? ""} ${c.ultimo?.texto ?? ""}`.toLocaleLowerCase("es").includes(texto);
  });
  const nombreProceso = procesoFiltro ? items.find((c) => c.proceso?.id === procesoFiltro)?.proceso?.nombre : null;
  const [tituloVacio, textoVacio] = VACIOS[filtro];
  const abierta = Boolean(clave);

  return (
    <div className="flex h-full min-h-0 flex-col lg:px-8 lg:pb-6 lg:pt-6">
      <div className="hidden items-end justify-between gap-4 pb-4 lg:flex">
        <div>
          <h1 className="font-display text-[28px] leading-tight text-ink">Mensajes</h1>
          <p className="mt-1 text-[14px] text-ink-2">Con tus clientes y con el equipo. Los de cada proceso quedan en su expediente.</p>
        </div>
        <Button icon={<PenSquare size={16} />} onClick={() => setNueva(true)} disabled={!lista}>Nuevo mensaje</Button>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden bg-sheet lg:rounded-xl lg:shadow-sheet">
        <aside aria-label="Conversaciones" className={cx("min-h-0 w-full shrink-0 flex-col border-line md:flex md:w-[320px] md:border-r lg:w-[400px]", abierta ? "hidden" : "flex")}>
          <div className="space-y-3 border-b border-line px-4 pb-3 pt-4">
            <div className="flex items-center justify-between gap-3 lg:hidden">
              <h1 className="font-display text-[24px] leading-tight text-ink">Mensajes</h1>
              <Button size="sm" icon={<PenSquare size={15} />} onClick={() => setNueva(true)} disabled={!lista}>Nuevo</Button>
            </div>
            <SegmentedControl
              label="Filtrar conversaciones"
              value={filtro}
              onChange={setFiltro}
              options={[
                { value: "todas", label: "Todas" },
                { value: "sin_leer", label: "Sin leer", count: lista?.resumen.sin_leer },
                { value: "por_responder", label: "Por responder", count: lista?.resumen.por_responder },
                { value: "equipo", label: "Equipo" },
              ]}
            />
            <label className="relative block">
              <span className="sr-only">Buscar en los mensajes</span>
              <Search aria-hidden="true" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre o proceso" className={`${CAMPO} pl-9`} />
            </label>
            {procesoFiltro && (
              <p className="flex items-center gap-2 rounded-lg bg-navy-soft py-1 pl-3 pr-1 text-[13px] text-navy-ink">
                <span className="min-w-0 flex-1 truncate">Solo de <strong>{nombreProceso ?? "este proceso"}</strong></span>
                <button type="button" onClick={() => router.push(RUTA_MENSAJES)} aria-label="Ver todas las conversaciones" className="grid size-8 place-items-center rounded-md hover:bg-sheet/60"><X aria-hidden="true" size={14} /></button>
              </p>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pb-24 lg:pb-0">
            {errorLista ? (
              <div role="alert" className="space-y-3 px-4 py-10 text-center">
                <p className="text-[14px] text-bad">{errorLista}</p>
                <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargarLista()}>Reintentar</Button>
              </div>
            ) : !lista ? (
              <ul aria-hidden="true" className="divide-y divide-line">
                {[0, 1, 2, 3, 4].map((i) => (
                  <li key={i} className="flex gap-3 px-4 py-3.5">
                    <span className="size-10 shrink-0 animate-pulse rounded-full bg-manila" />
                    <span className="flex-1 space-y-2 py-1"><span className="block h-3 w-1/2 animate-pulse rounded bg-manila" /><span className="block h-3 w-4/5 animate-pulse rounded bg-manila" /></span>
                  </li>
                ))}
              </ul>
            ) : visibles.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="font-display text-[19px] text-ink">{texto ? "Nada coincide" : tituloVacio}</p>
                <p className="mx-auto mt-1.5 max-w-xs text-[13.5px] text-ink-3">{texto ? "Prueba con otro nombre o proceso." : textoVacio}</p>
                {filtro === "todas" && !texto && <Button className="mt-4" icon={<PenSquare size={16} />} onClick={() => setNueva(true)}>Escribir a alguien</Button>}
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {visibles.map((c) => <FilaConversacion key={c.id} conversacion={c} activa={c.id === activaActual?.id} onAbrir={() => router.push(rutaDe(c))} />)}
              </ul>
            )}
          </div>
        </aside>

        <div className={cx("min-h-0 min-w-0 flex-1 flex-col", abierta ? "flex" : "hidden md:flex")}>
          {activaActual ? (
            <HiloMensajes key={activaActual.id} conversacion={activaActual} onVolver={() => router.push(RUTA_MENSAJES)} onActividad={alActividad} />
          ) : abierta && resuelta?.clave === clave && resuelta.error ? (
            <div role="alert" className="grid flex-1 place-items-center p-8 text-center">
              <div className="max-w-sm space-y-3">
                <p className="font-display text-[19px] text-ink">No pudimos abrir la conversación</p>
                <p className="text-[14px] text-ink-2">{resuelta.error}</p>
                <Button variant="secondary" onClick={() => router.push(RUTA_MENSAJES)}>Ver las conversaciones</Button>
              </div>
            </div>
          ) : abierta ? (
            <div className="grid flex-1 place-items-center text-[14px] text-ink-3">Abriendo la conversación…</div>
          ) : (
            <div className="grid flex-1 place-items-center bg-sheet-2 p-8 text-center">
              <div className="max-w-xs">
                <MessageSquare aria-hidden="true" size={28} strokeWidth={1.5} className="mx-auto text-ink-3" />
                <p className="mt-3 font-display text-[19px] text-ink">Elige una conversación</p>
                <p className="mt-1.5 text-[13.5px] text-ink-3">Cada mensaje con un cliente queda en el expediente del proceso como un folio.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <NuevaConversacion open={nueva} conversaciones={items} onClose={() => setNueva(false)} onElegir={(c) => router.push(rutaDe(c))} />
    </div>
  );
}

function FilaConversacion({ conversacion: c, activa, onAbrir }: { conversacion: Conversacion; activa: boolean; onAbrir: () => void }) {
  const ultimo = c.ultimo;
  const prefijo = ultimo ? (ultimo.es_mio ? "Tú: " : c.tipo === "colaboradores" && ultimo.autor ? `${ultimo.autor.split(" ")[0]}: ` : "") : "";
  return (
    <li>
      <button
        type="button"
        onClick={onAbrir}
        aria-current={activa ? "true" : undefined}
        className={cx(
          "relative flex w-full gap-3 px-4 py-3.5 text-left transition-colors",
          activa ? "bg-navy-soft" : "hover:bg-sheet-2",
        )}
      >
        <span className="relative size-10 shrink-0">
          {c.tipo === "colaboradores"
            ? <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-manila text-ink-2"><Users size={18} /></span>
            : <Initials name={c.titulo} size={40} />}
          {c.en_linea > 0 && c.tipo !== "colaboradores" && <span aria-label="En línea" className="absolute bottom-0 right-0 size-3 rounded-full bg-ok ring-2 ring-sheet" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cx("truncate text-[14.5px] text-ink", c.sin_leer ? "font-bold" : "font-semibold")}>{c.titulo}</span>
            {ultimo && <time dateTime={ultimo.enviado_en} className={cx("shrink-0 text-[12px] tabular-nums", c.sin_leer ? "font-semibold text-gold-ink" : "text-ink-3")}>{cuando(ultimo.enviado_en)}</time>}
          </span>
          {c.proceso && <span className="block truncate text-[12.5px] text-ink-3">{c.proceso.nombre}</span>}
          <span className="mt-0.5 flex items-center gap-2">
            <span className={cx("line-clamp-1 min-w-0 flex-1 text-[13.5px]", c.sin_leer ? "text-ink" : "text-ink-2")}>
              {ultimo ? `${prefijo}${vistaPrevia(ultimo.texto)}` : <span className="text-ink-3">Sin mensajes</span>}
            </span>
            {c.sin_leer > 0 ? (
              <span key={c.sin_leer} className="motion-pop grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-gold px-1.5 text-[11px] font-bold text-ink tabular-nums" aria-label={`${c.sin_leer} sin leer`}>
                {c.sin_leer > 99 ? "99+" : c.sin_leer}
              </span>
            ) : c.por_responder ? (
              <span className="shrink-0 rounded bg-gold-soft px-1.5 text-[11.5px] font-semibold leading-5 text-gold-ink">Por responder</span>
            ) : null}
          </span>
        </span>
      </button>
    </li>
  );
}
