"use client";

import { useRouter } from "next/navigation";
import { CornerDownLeft, FolderOpen, ListChecks, Search, UserRound, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Radicado } from "@/components/ui/Radicado";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";

type Resultado = Esquemas["Resultado"];

const GRUPOS: { tipo: Resultado["tipo"]; titulo: string; icono: LucideIcon }[] = [
  { tipo: "proceso", titulo: "Procesos", icono: FolderOpen },
  { tipo: "cliente", titulo: "Clientes", icono: UserRound },
  { tipo: "tarea", titulo: "Tareas", icono: ListChecks },
];

/** Evento para abrir la búsqueda desde cualquier botón del encabezado. */
export const ABRIR_BUSQUEDA = "am:abrir-busqueda";

/**
 * Búsqueda global (Ctrl/Cmd+K): procesos, radicados, clientes y tareas dentro
 * de lo que el usuario puede ver. Sin texto muestra los procesos recientes.
 */
export function BusquedaGlobal({ area }: { area: "abogado" | "cliente" | "admin" }) {
  const esCliente = area === "cliente";
  const router = useRouter();
  const listaId = useId();
  const entrada = useRef<HTMLInputElement>(null);
  const focoPrevio = useRef<HTMLElement | null>(null);
  const [abierta, setAbierta] = useState(false);
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [recientes, setRecientes] = useState<Resultado[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [indice, setIndice] = useState(0);

  const abrir = useCallback(() => {
    focoPrevio.current = document.activeElement as HTMLElement | null;
    setAbierta(true);
  }, []);
  const cerrar = useCallback(() => {
    setAbierta(false);
    setTexto("");
    setResultados([]);
    setError(null);
    setIndice(0);
    focoPrevio.current?.focus?.();
  }, []);

  useEffect(() => {
    const tecla = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        abrir();
      }
    };
    window.addEventListener("keydown", tecla);
    window.addEventListener(ABRIR_BUSQUEDA, abrir);
    return () => {
      window.removeEventListener("keydown", tecla);
      window.removeEventListener(ABRIR_BUSQUEDA, abrir);
    };
  }, [abrir]);

  useEffect(() => {
    if (!abierta) return;
    const temporizador = window.setTimeout(() => entrada.current?.focus(), 10);
    const desbordamiento = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (recientes === null) {
      void api.GET("/api/v2/procesos", { params: { query: { limite: 5 } } }).then(({ data }) => {
        setRecientes(
          (data?.items ?? []).map((proceso) => ({
            tipo: "proceso" as const,
            id: proceso.id,
            titulo: proceso.nombre,
            detalle: proceso.clientes.map((cliente) => cliente.nombre).join(", ") || proceso.responsable.nombre,
            radicado: proceso.radicados[0] ?? null,
            href: `/gestion-procesos/${area}/procesos/${proceso.id}`,
          })),
        );
      });
    }
    return () => {
      window.clearTimeout(temporizador);
      document.body.style.overflow = desbordamiento;
    };
  }, [abierta, area, recientes]);

  const consulta = texto.trim();
  useEffect(() => {
    if (!abierta || consulta.length < 2) return;
    let vigente = true;
    const temporizador = window.setTimeout(async () => {
      setCargando(true);
      const { data, error: fallo } = await api.GET("/api/v2/busqueda", { params: { query: { q: consulta } } });
      if (!vigente) return;
      setCargando(false);
      setIndice(0);
      if (data) {
        setResultados(data.items);
        setError(null);
      } else {
        setResultados([]);
        setError(mensajeDeError(fallo));
      }
    }, 200);
    return () => {
      vigente = false;
      window.clearTimeout(temporizador);
    };
  }, [abierta, consulta]);

  const conTexto = consulta.length >= 2;
  const grupos = useMemo(() => {
    if (!conTexto) return recientes?.length ? [{ titulo: "Recientes", icono: FolderOpen, items: recientes }] : [];
    return GRUPOS.map((grupo) => ({ ...grupo, items: resultados.filter((item) => item.tipo === grupo.tipo) })).filter((grupo) => grupo.items.length);
  }, [conTexto, recientes, resultados]);
  const planos = grupos.flatMap((grupo) => grupo.items);

  function elegir(item: Resultado) {
    cerrar();
    router.push(item.href);
  }

  if (!abierta) return null;

  const activo = planos[indice];
  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center px-3 pt-[8vh] sm:pt-[12vh]"
      onKeyDown={(event) => {
        if (event.key === "Escape") cerrar();
        else if (event.key === "ArrowDown") {
          event.preventDefault();
          setIndice((valor) => Math.min(valor + 1, planos.length - 1));
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          setIndice((valor) => Math.max(valor - 1, 0));
        } else if (event.key === "Enter" && activo) {
          event.preventDefault();
          elegir(activo);
        }
      }}
    >
      <div aria-hidden="true" className="motion-fade-in absolute inset-0 bg-scrim" onClick={cerrar} />
      <div role="dialog" aria-modal="true" aria-label="Buscar" className="motion-dialog-in relative w-full max-w-[620px] overflow-hidden rounded-2xl bg-sheet shadow-pop">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search aria-hidden="true" size={18} className="shrink-0 text-ink-3" />
          <input
            ref={entrada}
            value={texto}
            onChange={(event) => {
              setTexto(event.target.value);
              if (event.target.value.trim().length < 2) {
                setResultados([]);
                setCargando(false);
              }
              setIndice(0);
            }}
            role="combobox"
            aria-expanded={planos.length > 0}
            aria-controls={listaId}
            aria-activedescendant={activo ? `${listaId}-${activo.tipo}-${activo.id}` : undefined}
            aria-autocomplete="list"
            placeholder={esCliente ? "Buscar en sus procesos" : "Proceso, radicado, cliente o tarea"}
            className="h-14 min-w-0 flex-1 bg-transparent text-[16px] text-ink placeholder:text-ink-3 focus:outline-none"
          />
          <kbd className="hidden shrink-0 rounded border border-line-strong px-1.5 py-0.5 font-sans text-[11px] text-ink-3 sm:block">Esc</kbd>
        </div>
        <div id={listaId} role="listbox" aria-label="Resultados" className="max-h-[60vh] overflow-y-auto py-2" aria-busy={cargando}>
          {error ? (
            <p role="alert" className="px-5 py-8 text-center text-[14px] text-bad">{error}</p>
          ) : conTexto && cargando && planos.length === 0 ? (
            <p className="px-5 py-8 text-center text-[14px] text-ink-3">Buscando…</p>
          ) : conTexto && planos.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="font-semibold text-ink">Nada coincide con «{consulta}»</p>
              <p className="mt-1 text-[14px] text-ink-3">Pruebe con parte del radicado, el nombre del cliente o el del proceso.</p>
            </div>
          ) : !conTexto && planos.length === 0 ? (
            <p className="px-5 py-8 text-center text-[14px] text-ink-3">Escriba al menos dos letras o números para buscar.</p>
          ) : (
            grupos.map((grupo) => (
              <div key={grupo.titulo} role="group" aria-label={grupo.titulo} className="pb-1">
                <p className="px-4 pb-1 pt-2 text-[12px] font-semibold text-ink-3">{grupo.titulo}</p>
                {grupo.items.map((item) => {
                  const posicion = planos.indexOf(item);
                  const elegido = posicion === indice;
                  const Icono = GRUPOS.find((g) => g.tipo === item.tipo)?.icono ?? FolderOpen;
                  return (
                    <div
                      key={`${item.tipo}-${item.id}`}
                      id={`${listaId}-${item.tipo}-${item.id}`}
                      role="option"
                      aria-selected={elegido}
                      onMouseMove={() => setIndice(posicion)}
                      onClick={() => elegir(item)}
                      className={cx("flex cursor-pointer items-center gap-3 px-4 py-2.5", elegido && "bg-manila")}
                    >
                      <Icono aria-hidden="true" size={16} strokeWidth={1.75} className="shrink-0 text-ink-2" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-ink">{item.titulo}</p>
                        {item.radicado ? (
                          <Radicado numero={item.radicado} copiable={false} className="max-w-full" />
                        ) : (
                          item.detalle && <p className={cx("truncate text-[13px]", elegido ? "text-ink-2" : "text-ink-3")}>{item.detalle}</p>
                        )}
                      </div>
                      {elegido && <CornerDownLeft aria-hidden="true" size={14} className="shrink-0 text-ink-2" />}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
