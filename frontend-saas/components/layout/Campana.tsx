"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { fechaRelativa } from "@/lib/fechas";

const CADA_MS = 2 * 60 * 1000;

/**
 * Campana de avisos del encabezado: lo último que el usuario debería mirar,
 * según su rol, con el total sin leer. Se actualiza cada dos minutos y al
 * volver a la pestaña.
 */
export function Campana({ todosHref }: { todosHref: string }) {
  const router = useRouter();
  const panelId = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const [abierta, setAbierta] = useState(false);
  const [datos, setDatos] = useState<Esquemas["Avisos"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error: fallo } = await api.GET("/api/v2/avisos", { params: { query: { limite: 8 } } });
    if (data) {
      setDatos(data);
      setError(null);
    } else {
      setError(mensajeDeError(fallo));
    }
  }, []);

  useEffect(() => {
    const primera = window.setTimeout(() => void cargar(), 0);
    const intervalo = window.setInterval(() => {
      if (document.visibilityState === "visible") void cargar();
    }, CADA_MS);
    const alVolver = () => document.visibilityState === "visible" && void cargar();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      window.clearTimeout(primera);
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [cargar]);

  useEffect(() => {
    if (!abierta) return;
    const fuera = (event: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(event.target as Node)) setAbierta(false);
    };
    const tecla = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAbierta(false);
        boton.current?.focus();
      }
    };
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierta]);

  async function abrirAviso(aviso: Esquemas["Aviso"]) {
    setAbierta(false);
    if (!aviso.leido) {
      setDatos((actual) => actual && {
        sin_leer: Math.max(0, actual.sin_leer - 1),
        items: actual.items.map((item) => (item.id === aviso.id ? { ...item, leido: true } : item)),
      });
      void api.POST("/api/v2/avisos/leer", { body: { ids: [aviso.id] } });
    }
    router.push(aviso.href);
  }

  async function leerTodos() {
    const anterior = datos;
    setDatos((actual) => actual && { sin_leer: 0, items: actual.items.map((item) => ({ ...item, leido: true })) });
    const { error: fallo } = await api.POST("/api/v2/avisos/leer-todos");
    if (fallo) {
      setDatos(anterior);
      setError(mensajeDeError(fallo));
    }
  }

  const sinLeer = datos?.sin_leer ?? 0;

  return (
    <div ref={raiz} className="relative">
      <IconButton
        ref={boton}
        icon={Bell}
        label="Avisos"
        badge={sinLeer}
        aria-expanded={abierta}
        aria-controls={panelId}
        onClick={() => {
          setAbierta((valor) => !valor);
          if (!abierta) void cargar();
        }}
      />
      {abierta && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Avisos"
          className="motion-drop-in fixed inset-x-3 top-[calc(var(--alto-barra,56px)+4px)] z-50 overflow-hidden rounded-xl bg-sheet shadow-pop sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[360px]"
        >
          <div className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-4">
            <p className="text-[14px] font-semibold text-ink">
              Avisos{sinLeer > 0 && <span className="ml-1.5 font-normal text-ink-3 tabular-nums">{sinLeer} sin leer</span>}
            </p>
            {sinLeer > 0 && (
              <button type="button" onClick={() => void leerTodos()} className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold text-navy-ink hover:bg-manila">
                <CheckCheck aria-hidden="true" size={14} />
                Marcar todo como leído
              </button>
            )}
          </div>
          {error && !datos ? (
            <p role="alert" className="px-4 py-6 text-[14px] text-bad">{error}</p>
          ) : !datos ? (
            <div className="space-y-3 px-4 py-4" aria-label="Cargando avisos">
              <div className="skeleton h-3.5 w-3/5 rounded-md" />
              <div className="skeleton h-3 w-4/5 rounded-md" />
            </div>
          ) : datos.items.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="font-semibold text-ink">Todo al día</p>
              <p className="mt-1 text-[14px] text-ink-3">Cuando algo necesite su atención aparecerá aquí.</p>
            </div>
          ) : (
            <ul className="max-h-[min(60vh,420px)] divide-y divide-line overflow-y-auto">
              {datos.items.map((aviso) => (
                <li key={aviso.id}>
                  <button
                    type="button"
                    onClick={() => void abrirAviso(aviso)}
                    className={cx("flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-sheet-2", !aviso.leido && "bg-gold-soft/45")}
                  >
                    <span aria-hidden="true" className={cx("mt-1.5 size-2 shrink-0 rounded-full", aviso.leido ? "bg-transparent" : "bg-gold")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-ink">
                        {!aviso.leido && <span className="sr-only">Sin leer: </span>}
                        {aviso.titulo}
                      </span>
                      {(aviso.detalle || aviso.proceso) && (
                        <span className="block truncate text-[13px] text-ink-2">{[aviso.detalle, aviso.proceso].filter(Boolean).join(" · ")}</span>
                      )}
                      {aviso.fecha && <span className="block text-[12px] text-ink-3">{fechaRelativa(aviso.fecha)}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-line bg-sheet-2 px-4 py-2">
            <Link href={todosHref} onClick={() => setAbierta(false)} className="inline-flex min-h-9 items-center text-[13px] font-semibold text-navy-ink hover:underline">
              Ver todos los avisos
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
