"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CalendarDays, FileText, FolderOpen, RefreshCw } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fetchApi } from "@/lib/api";

type Actuacion = {
  id: number;
  fecha_actuacion?: string | null;
  actuacion?: string | null;
};

type Radicado = {
  id: number;
  numero: string;
  estado_consulta?: string | null;
  actuaciones: Actuacion[];
};

type Proceso = {
  id: number;
  nombre: string;
  descripcion?: string | null;
  responsable?: { id: number; nombre_completo: string };
  colaboradores?: { id: number; nombre_completo: string }[];
  radicados: Radicado[];
};

function cargarProcesos(token: string): Promise<Proceso[]> {
  return fetchApi("/api/expedientes/procesos", { method: "GET", token });
}

export default function ClientePage() {
  const { token, loading: sessionLoading } = useSession();
  const [procesos, setProcesos] = useState<Proceso[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (sessionLoading || !token) return;
    let active = true;
    cargarProcesos(token)
      .then((data) => { if (active) setProcesos(Array.isArray(data) ? data : []); })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "No fue posible cargar tus procesos.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sessionLoading, token]);

  async function actualizar() {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const data = await cargarProcesos(token);
      setProcesos(Array.isArray(data) ? data : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible cargar tus procesos.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-(--foreground-muted)">Portal del cliente</p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">Mis procesos</h1>
          <p className="mt-1 text-sm text-(--foreground-muted)">Procesos y actuaciones que tu abogado ha compartido contigo.</p>
        </div>
        <button type="button" onClick={() => void actualizar()} disabled={loading || sessionLoading} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-hover disabled:opacity-50">
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
        </button>
      </header>

      {error && <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-700"><AlertCircle className="size-4 shrink-0" />{error}</div>}

      {loading || sessionLoading ? (
        <div className="flex min-h-48 items-center justify-center gap-3 text-sm text-(--foreground-muted)"><RefreshCw className="size-5 animate-spin" />Cargando tus procesos...</div>
      ) : procesos.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 text-center">
          <FolderOpen className="size-8 text-(--foreground-muted)" />
          <h2 className="mt-4 font-semibold text-foreground">Todavía no tienes procesos asignados</h2>
          <p className="mt-2 max-w-md text-sm text-(--foreground-muted)">Cuando tu abogado comparta un proceso contigo, aparecerá aquí junto con sus radicados y actuaciones.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {procesos.map((proceso) => (
            <article key={proceso.id} className="rounded-lg border border-border bg-surface">
              <div className="flex flex-wrap items-start justify-between gap-4 p-5">
                <div className="min-w-0">
                  <h2 className="font-semibold text-foreground">{proceso.nombre}</h2>
                  {proceso.descripcion && <p className="mt-1 text-sm text-(--foreground-muted)">{proceso.descripcion}</p>}
                  {proceso.responsable && <p className="mt-2 text-xs text-(--foreground-muted)">Responsable: <span className="font-medium text-foreground">{proceso.responsable.nombre_completo}</span></p>}
                  {!!proceso.colaboradores?.length && <p className="mt-1 text-xs text-(--foreground-muted)">Equipo: {proceso.colaboradores.map((integrante) => integrante.nombre_completo).join(", ")}</p>}
                </div>
                <span className="inline-flex shrink-0 items-center gap-2 rounded-md bg-(--surface-secondary) px-3 py-1.5 text-sm text-(--foreground-secondary)"><FileText className="size-4" />{proceso.radicados.length} radicado{proceso.radicados.length === 1 ? "" : "s"}</span>
              </div>
              {proceso.radicados.length > 0 && <div className="border-t border-border divide-y divide-border">
                {proceso.radicados.map((radicado) => {
                  const ultimasActuaciones = [...radicado.actuaciones].slice(-3).reverse();
                  return (
                    <details key={radicado.id} className="group px-5 py-3">
                      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 text-sm">
                        <span className="font-mono font-medium text-foreground">{radicado.numero}</span>
                        <span className="text-(--foreground-muted)">{radicado.estado_consulta || "Sin estado"}</span>
                      </summary>
                      {ultimasActuaciones.length > 0 ? <ul className="mt-3 space-y-3 border-l-2 border-border pl-4">
                        {ultimasActuaciones.map((actuacion) => <li key={actuacion.id} className="text-sm">
                          <p className="text-foreground">{actuacion.actuacion || "Actuación judicial"}</p>
                          {actuacion.fecha_actuacion && <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-(--foreground-muted)"><CalendarDays className="size-3.5" />{actuacion.fecha_actuacion}</p>}
                        </li>)}
                      </ul> : <p className="mt-3 text-sm text-(--foreground-muted)">No hay actuaciones registradas.</p>}
                    </details>
                  );
                })}
              </div>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
