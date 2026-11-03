"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Maximize2, MessageCircle, X } from "lucide-react";

import { HiloMensajes } from "@/components/mensajes/HiloMensajes";
import { FilaConversacion } from "@/components/mensajes/MensajesWorkspace";
import { useSession } from "@/context/SessionContext";
import { api, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { RUTA_MENSAJES, RUTA_MENSAJES_CLIENTE, type Conversacion } from "@/lib/mensajes";

const CERRADO_MS = 30_000;
const ABIERTO_MS = 10_000;

/**
 * El chat al alcance desde cualquier pantalla: un botón con los mensajes sin leer
 * que abre la lista de conversaciones y la conversación elegida.
 */
export function MensajesFlotante() {
  const { user } = useSession();
  const pathname = usePathname();
  const cliente = user?.rol === "CLIENTE";
  const base = cliente ? RUTA_MENSAJES_CLIENTE : user?.rol === "ADMIN" ? "/gestion-procesos/admin/chat" : RUTA_MENSAJES;
  const [abierto, setAbierto] = useState(false);
  const [lista, setLista] = useState<Esquemas["ListaConversaciones"] | null>(null);
  const [activaId, setActivaId] = useState<number | null>(null);
  const sincronizado = useRef(false);
  const boton = useRef<HTMLButtonElement>(null);

  const cargar = useCallback(async () => {
    const sincronizar = !sincronizado.current;
    const { data } = await api.GET("/api/v2/conversaciones", { params: { query: { sincronizar } } });
    if (data) {
      sincronizado.current = sincronizado.current || sincronizar;
      setLista(data);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const primera = window.setTimeout(() => void cargar(), 0);
    const refrescar = () => { if (document.visibilityState === "visible") void cargar(); };
    const intervalo = window.setInterval(refrescar, abierto ? ABIERTO_MS : CERRADO_MS);
    document.addEventListener("visibilitychange", refrescar);
    return () => {
      window.clearTimeout(primera);
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", refrescar);
    };
  }, [abierto, cargar, user]);

  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAbierto(false);
        boton.current?.focus();
      }
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [abierto]);

  const alActividad = useCallback(({ leido }: { leido?: boolean }) => {
    if (leido && activaId) {
      setLista((actual) => actual && {
        ...actual,
        items: actual.items.map((c) => (c.id === activaId ? { ...c, sin_leer: 0, primer_sin_leer_id: null } : c)),
      });
    }
    void cargar();
  }, [activaId, cargar]);

  if (!user || pathname.split("/").includes("chat")) return null;

  const items = (lista?.items ?? []).filter((c) => c.ultimo || c.id === activaId);
  const activa: Conversacion | null = activaId ? lista?.items.find((c) => c.id === activaId) ?? null : null;
  const sinLeer = (lista?.items ?? []).filter((c) => c.sin_leer > 0).length;

  return (
    <>
      {abierto && (
        <section
          aria-label="Mensajes"
          className="motion-lift-in fixed inset-0 z-[80] flex origin-bottom-right flex-col overflow-hidden bg-sheet sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[min(640px,calc(100dvh-8rem))] sm:w-[400px] sm:rounded-2xl sm:shadow-pop"
        >
          {activa ? (
            <HiloMensajes
              key={activa.id}
              conversacion={activa}
              variante={cliente ? "cliente" : "firma"}
              volverSiempre
              onVolver={() => setActivaId(null)}
              onActividad={alActividad}
            />
          ) : (
            <>
              <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-line px-4 pt-[env(safe-area-inset-top)]">
                <h2 className="flex-1 text-[15px] font-semibold text-ink">Mensajes</h2>
                <Link
                  href={base}
                  onClick={() => setAbierto(false)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-navy-ink hover:bg-manila"
                >
                  <Maximize2 aria-hidden size={14} /> Abrir completo
                </Link>
                <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar los mensajes" className="grid size-10 place-items-center rounded-lg text-ink-2 hover:bg-manila hover:text-ink">
                  <X aria-hidden size={18} />
                </button>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {!lista ? (
                  <div className="space-y-4 px-4 py-5" aria-label="Cargando conversaciones">
                    {[0, 1, 2].map((i) => <div key={i} className="skeleton h-12 rounded-lg" />)}
                  </div>
                ) : items.length === 0 ? (
                  <div className="px-6 py-14 text-center">
                    <p className="font-semibold text-ink">Aún no hay mensajes</p>
                    <p className="mt-1 text-pretty text-[14px] text-ink-3">
                      {cliente ? "Cuando usted o la firma escriban, la conversación aparecerá aquí." : "Las conversaciones con clientes y colegas aparecerán aquí."}
                    </p>
                    <Link href={base} onClick={() => setAbierto(false)} className="mt-3 inline-flex min-h-10 items-center text-[14px] font-semibold text-navy-ink underline underline-offset-2">
                      {cliente ? "Escribirle a la firma" : "Escribir un mensaje"}
                    </Link>
                  </div>
                ) : (
                  <ul className="divide-y divide-line">
                    {items.map((c) => (
                      <FilaConversacion
                        key={c.id}
                        conversacion={c}
                        activa={false}
                        prefijoMio={cliente || user.rol === "ADMIN" ? "Usted: " : "Tú: "}
                        onAbrir={() => setActivaId(c.id)}
                      />
                    ))}
                  </ul>
                )}
              </div>
              {items.length > 0 && (
                <p className="shrink-0 border-t border-line bg-sheet-2 px-4 py-2 text-[12.5px] text-ink-3">
                  Para buscar o empezar una conversación, <Link href={base} onClick={() => setAbierto(false)} className="font-semibold text-navy-ink underline underline-offset-2">abra Mensajes</Link>.
                </p>
              )}
            </>
          )}
        </section>
      )}
      <button
        ref={boton}
        type="button"
        onClick={() => { setAbierto((v) => !v); if (!abierto) setActivaId(null); }}
        aria-expanded={abierto}
        aria-label={abierto ? "Cerrar los mensajes" : `Mensajes${sinLeer ? `, ${sinLeer} ${sinLeer === 1 ? "conversación" : "conversaciones"} sin leer` : ""}`}
        className={cx(
          "fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-[80] grid size-14 place-items-center rounded-full bg-navy text-on-navy shadow-pop transition-transform active:scale-[0.96] md:bottom-6 md:right-6",
          abierto && "max-sm:hidden",
        )}
      >
        {abierto ? <X aria-hidden size={22} /> : <MessageCircle aria-hidden size={24} />}
        {!abierto && sinLeer > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-6 min-w-6 place-items-center rounded-full bg-bad px-1.5 text-[12px] font-bold text-white tabular-nums ring-2 ring-ground">
            {sinLeer > 99 ? "99+" : sinLeer}
          </span>
        )}
      </button>
    </>
  );
}

