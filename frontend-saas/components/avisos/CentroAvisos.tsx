"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, RefreshCw, Search } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { TituloCliente } from "@/components/portal-cliente/piezas";
import { PageHeader } from "@/components/ui/PageHeader";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { fechaConHora, fechaRelativa } from "@/lib/fechas";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Aviso = Esquemas["Aviso"];

const CATEGORIAS: Record<string, string> = {
  proceso: "Procesos",
  tarea: "Tareas",
  documento: "Documentos",
  solicitud: "Solicitudes",
  radicado: "Radicados",
  evento: "Agenda",
  mensaje: "Mensajes",
  cliente: "Clientes",
  sistema: "Otros",
};

/**
 * Todos los avisos de la cuenta, con filtros por tipo y por leídos.
 * Es la página a la que lleva "Ver todos los avisos" de la campana.
 */
export function CentroAvisos({ descripcion, variante = "firma" }: { descripcion: string; variante?: "firma" | "cliente" }) {
  const router = useRouter();
  const { toast } = useToast();
  const [datos, setDatos] = useState<Esquemas["Avisos"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [soloSinLeer, setSoloSinLeer] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [marcando, setMarcando] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error: fallo } = await api.GET("/api/v2/avisos", { params: { query: { limite: 200 } } });
    if (data) {
      setDatos(data);
      setError(null);
    } else {
      setError(mensajeDeError(fallo));
    }
  }, []);
  useLoadEffect(cargar);

  const items = useMemo(() => datos?.items ?? [], [datos]);
  const presentes = useMemo(() => Object.keys(CATEGORIAS).filter((c) => items.some((a) => a.categoria === c)), [items]);
  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase("es");
    return items.filter((a) => (!categoria || a.categoria === categoria)
      && (!soloSinLeer || !a.leido)
      && (!texto || [a.titulo, a.detalle, a.proceso].filter(Boolean).join(" ").toLocaleLowerCase("es").includes(texto)));
  }, [items, categoria, soloSinLeer, busqueda]);
  const sinLeer = datos?.sin_leer ?? 0;

  function marcarLocal(ids: Set<string> | null) {
    setDatos((actual) => {
      if (!actual) return actual;
      const nuevos = actual.items.map((a) => (ids === null || ids.has(a.id) ? { ...a, leido: true } : a));
      const marcados = actual.items.filter((a) => !a.leido && (ids === null || ids.has(a.id))).length;
      return { items: nuevos, sin_leer: ids === null ? 0 : Math.max(0, actual.sin_leer - marcados) };
    });
  }

  function abrir(aviso: Aviso) {
    if (!aviso.leido) {
      marcarLocal(new Set([aviso.id]));
      void api.POST("/api/v2/avisos/leer", { body: { ids: [aviso.id] } });
    }
    router.push(aviso.href);
  }

  async function leerTodos() {
    setMarcando(true);
    const { error: fallo } = await api.POST("/api/v2/avisos/leer-todos");
    setMarcando(false);
    if (fallo) {
      toast({ title: "No se pudieron marcar", description: mensajeDeError(fallo), tone: "error" });
      return;
    }
    marcarLocal(null);
  }

  const filtros = (
    <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:px-5">
      {presentes.length > 1 && (
        <div role="group" aria-label="Filtrar por tipo" className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {[null, ...presentes].map((c) => (
            <button
              key={c ?? "todas"}
              type="button"
              aria-pressed={categoria === c}
              onClick={() => setCategoria(c)}
              className={cx(
                "inline-flex min-h-9 shrink-0 items-center rounded-lg px-3 text-[13px] font-semibold transition-colors",
                categoria === c ? "bg-navy text-on-navy" : "text-ink-2 hover:bg-manila hover:text-ink",
              )}
            >
              {c ? CATEGORIAS[c] : "Todos"}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1 basis-56">
          <span className="sr-only">Buscar en los avisos</span>
          <Search aria-hidden size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por asunto o proceso"
            className="h-10 w-full rounded-lg bg-sheet-2 pl-9 pr-3 text-[14px] text-ink shadow-[0_0_0_1px_var(--line)] placeholder:text-ink-3 focus:outline-none focus:shadow-[0_0_0_2px_var(--navy)]"
          />
        </label>
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-[14px] text-ink-2">
          <input type="checkbox" checked={soloSinLeer} onChange={(e) => setSoloSinLeer(e.target.checked)} className="size-4 accent-[var(--navy)]" />
          Solo sin leer
        </label>
      </div>
    </div>
  );

  const acciones = (
    <div className="flex flex-wrap gap-2">
      <Button variant="ghost" icon={<RefreshCw size={16} />} onClick={() => void cargar()}>Actualizar</Button>
      {sinLeer > 0 && (
        <Button variant="secondary" icon={<CheckCheck size={16} />} loading={marcando} onClick={() => void leerTodos()}>Marcar todo como leído</Button>
      )}
    </div>
  );

  return (
    <div className={cx(variante === "firma" && "max-w-4xl")}>
      {variante === "cliente" ? (
        <>
          <TituloCliente sub={descripcion}>Avisos</TituloCliente>
          <div className="-mt-2 mb-4">{acciones}</div>
        </>
      ) : (
        <PageHeader title="Avisos" description={descripcion} action={acciones} />
      )}

      <Sheet className="overflow-hidden">
        {error && !datos ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 px-5 py-6 text-bad">
            <p className="flex-1 text-[14px]">{error}</p>
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
          </div>
        ) : !datos ? (
          <div className="space-y-4 px-5 py-6" aria-label="Cargando avisos">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <div className="skeleton h-3.5 w-3/5 rounded-md" />
                <div className="skeleton h-3 w-4/5 rounded-md" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-semibold text-ink">Todo al día</p>
            <p className="mt-1 text-[14px] text-ink-3">Cuando algo necesite su atención aparecerá aquí.</p>
          </div>
        ) : (
          <>
            {filtros}
            <p className="px-4 pt-3 text-[13px] text-ink-3 sm:px-5" aria-live="polite">
              {sinLeer > 0 ? `${sinLeer} sin leer · ` : ""}{visibles.length === items.length ? `${items.length} avisos` : `${visibles.length} de ${items.length} avisos`}
            </p>
            {visibles.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="font-semibold text-ink">Ningún aviso coincide</p>
                <button type="button" onClick={() => { setCategoria(null); setSoloSinLeer(false); setBusqueda(""); }} className="mt-1 text-[14px] text-navy-ink underline underline-offset-2">
                  Quitar los filtros
                </button>
              </div>
            ) : (
              <ul className="mt-2 divide-y divide-line border-t border-line">
                {visibles.map((aviso) => (
                  <li key={aviso.id}>
                    <button
                      type="button"
                      onClick={() => abrir(aviso)}
                      className={cx("flex w-full gap-3 px-4 py-3.5 text-left transition-colors hover:bg-sheet-2 sm:px-5", !aviso.leido && "bg-gold-soft/45")}
                    >
                      <span aria-hidden className={cx("mt-1.5 size-2 shrink-0 rounded-full", aviso.leido ? "bg-transparent" : "bg-gold")} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-pretty text-[14.5px] font-semibold text-ink">
                          {!aviso.leido && <span className="sr-only">Sin leer: </span>}
                          {aviso.titulo}
                        </span>
                        {aviso.detalle && <span className="mt-0.5 block text-pretty text-[13.5px] text-ink-2">{aviso.detalle}</span>}
                        <span className="mt-1 block text-[12.5px] text-ink-3">
                          {[CATEGORIAS[aviso.categoria], aviso.proceso].filter(Boolean).join(" · ")}
                          {aviso.fecha && <> · <time dateTime={aviso.fecha} title={fechaConHora(aviso.fecha)}>{fechaRelativa(aviso.fecha)}</time></>}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Sheet>
    </div>
  );
}
