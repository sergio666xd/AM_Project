"use client";

import { useEffect, useState } from "react";
import { Check, RefreshCw, X } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fetchApi } from "@/lib/api";

type Request = { id: number; cliente_id: number; cliente_nombre: string; email_actual: string; nombre_completo: string; email: string; whatsapp_numero: string; genero?: string | null; numero_documento?: string | null; domicilio?: string | null; direccion?: string | null; solicitada_en: string };

export default function ClientProfileRequestsReviewPage() {
  const { token } = useSession();
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function reload() {
    if (!token) return;
    setLoading(true);
    setError("");
    try { setRequests(await fetchApi("/api/expedientes/solicitudes-edicion-perfil", { method: "GET", token })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No fue posible cargar solicitudes."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!token) return;
    let active = true;
    fetchApi("/api/expedientes/solicitudes-edicion-perfil", { method: "GET", token })
      .then((items) => { if (active) setRequests(items); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "No fue posible cargar solicitudes."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  async function review(request: Request, decision: "APROBAR" | "RECHAZAR") {
    if (!token) return;
    setWorkingId(request.id);
    setError("");
    setNotice("");
    try {
      const result = await fetchApi(`/api/expedientes/solicitudes-edicion-perfil/${request.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ decision }),
      });
      setNotice(`${request.cliente_nombre}: ${result.mensaje}`);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible revisar la solicitud.");
    } finally {
      setWorkingId(null);
    }
  }

  return <section className="mx-auto max-w-5xl space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-primary">Revisión de clientes</p><h1 className="mt-1 text-2xl font-semibold text-foreground">Solicitudes de edición de perfil</h1><p className="mt-1 text-sm text-(--foreground-muted)">Confirma datos de contacto e identificación antes de aplicar cambios.</p></div><button type="button" onClick={() => void reload()} disabled={loading} aria-label="Actualizar solicitudes" className="grid size-10 place-items-center rounded-lg border border-border bg-surface hover:bg-surface-hover disabled:opacity-50"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /></button></header>
    {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger-light p-3 text-sm text-danger">{error}</p>}{notice && <p role="status" className="rounded-lg border border-success/30 bg-success-light p-3 text-sm text-success">{notice}</p>}
    <div className="overflow-x-auto rounded-lg border border-border bg-surface"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-border bg-surface-secondary text-xs uppercase text-(--foreground-muted)"><tr><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Correo actual</th><th className="px-4 py-3">Cambio solicitado</th><th className="px-4 py-3">Solicitada</th><th className="px-4 py-3 text-right">Revisión</th></tr></thead><tbody>{loading ? <tr><td colSpan={5} className="px-4 py-10 text-center text-(--foreground-muted)">Cargando solicitudes…</td></tr> : requests.length ? requests.map((request) => <tr key={request.id} className="border-b border-border last:border-0"><td className="px-4 py-3 font-medium">{request.cliente_nombre}</td><td className="px-4 py-3 text-(--foreground-muted)">{request.email_actual}</td><td className="px-4 py-3"><p>{request.nombre_completo}</p><p className="text-xs text-(--foreground-muted)">{request.email} · {request.whatsapp_numero || "Sin WhatsApp"}</p><p className="mt-1 text-xs text-(--foreground-muted)">Contrato: {request.genero || "Género sin especificar"} · {request.numero_documento || "Sin identificación"} · {request.domicilio || "Sin domicilio"}{request.direccion ? ` · ${request.direccion}` : ""}</p></td><td className="px-4 py-3 text-xs text-(--foreground-muted)">{new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(request.solicitada_en))}</td><td className="px-4 py-3"><div className="flex justify-end gap-2"><button type="button" disabled={workingId !== null} onClick={() => void review(request, "RECHAZAR")} aria-label={`Rechazar cambios de ${request.cliente_nombre}`} className="grid size-9 place-items-center rounded-md border border-border text-danger hover:bg-danger-light disabled:opacity-50"><X className="size-4" /></button><button type="button" disabled={workingId !== null} onClick={() => void review(request, "APROBAR")} aria-label={`Aprobar cambios de ${request.cliente_nombre}`} className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"><Check className="size-4" /></button></div></td></tr>) : <tr><td colSpan={5} className="px-4 py-12 text-center text-(--foreground-muted)">No hay solicitudes pendientes.</td></tr>}</tbody></table></div>
  </section>;
}
