"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, FileImage, RefreshCw, Search, X } from "lucide-react";
import { API_URL, apiRequest, fetchApi } from "@/lib/api";

type Plan = { id: number; nombre: string; activo: boolean };
type Request = {
  id: number;
  fecha_solicitud: string;
  usuario: { nombre_completo: string; email: string; whatsapp_numero?: string };
};
type RequestData = { requests: Request[]; plans: Plan[] };

async function loadRequests(token: string): Promise<RequestData> {
  const [requests, plans] = await Promise.all([
    fetchApi("/api/admin/solicitudes", { method: "GET", token }),
    fetchApi("/api/admin/planes", { method: "GET", token }),
  ]);
  return { requests, plans: plans.filter((plan: Plan) => plan.activo) };
}

export default function AdminRequestsPage() {
  const [data, setData] = useState<RequestData>({ requests: [], plans: [] });
  const [planId, setPlanId] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [viewer, setViewer] = useState<{ url: string; title: string } | null>(
    null,
  );
  const token =
    typeof window === "undefined" ? "" : localStorage.getItem("token") || "";

  useEffect(() => {
    if (!token) return;
    let active = true;
    loadRequests(token)
      .then((result) => {
        if (active) {
          setData(result);
          if (result.plans[0])
            setPlanId((current) => current || String(result.plans[0].id));
        }
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "No fue posible cargar solicitudes.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function reload() {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      setData(await loadRequests(token));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible cargar solicitudes.",
      );
    } finally {
      setLoading(false);
    }
  }

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return data.requests.filter(
      (item) =>
        !term ||
        `${item.usuario.nombre_completo} ${item.usuario.email} ${item.usuario.whatsapp_numero || ""}`
          .toLowerCase()
          .includes(term),
    );
  }, [data.requests, search]);

  async function decide(request: Request, decision: "aprobar" | "rechazar") {
    if (decision === "aprobar" && !planId) {
      setError("Selecciona el plan que se asignará al abogado SaaS.");
      return;
    }
    if (!token) return;
    setWorkingId(request.id);
    setError("");
    setNotice("");
    try {
      const endpoint =
        decision === "aprobar"
          ? `/api/admin/solicitudes/${request.id}/aprobar?plan_id=${planId}`
          : `/api/admin/solicitudes/${request.id}/rechazar`;
      const result = await fetchApi(endpoint, { method: "POST", token });
      setNotice(
        result.mensaje ||
          (decision === "aprobar"
            ? "Acceso aprobado."
            : "Solicitud rechazada."),
      );
      setSelected((current) => current.filter((id) => id !== request.id));
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible procesar la solicitud.",
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function decideSelected(decision: "APROBAR" | "RECHAZAR") {
    if (!token || selected.length === 0) return;
    if (decision === "RECHAZAR" && !window.confirm(`¿Rechazar ${selected.length} solicitudes?`)) return;
    if (decision === "APROBAR" && !planId) {
      setError("Selecciona el plan que se asignará a los abogados SaaS.");
      return;
    }
    setWorkingId(-1);
    setError("");
    setNotice("");
    try {
      const result = await fetchApi("/api/admin/solicitudes/accion-masiva", {
        method: "POST",
        token,
        body: JSON.stringify({
          solicitud_ids: selected,
          accion: decision,
          plan_id: decision === "APROBAR" ? Number(planId) : null,
        }),
      });
      setNotice(result.mensaje || "Solicitudes procesadas.");
      setSelected([]);
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible procesar las solicitudes.",
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function viewCard(request: Request) {
    if (!token) return;
    setError("");
    try {
      const response = await apiRequest(
        `${API_URL}/api/admin/solicitudes/${request.id}/tarjeta`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok)
        throw new Error("No fue posible abrir la tarjeta profesional.");
      setViewer({
        url: URL.createObjectURL(await response.blob()),
        title: `Tarjeta profesional · ${request.usuario.nombre_completo}`,
      });
    } catch (cause) {
      setError(
        cause instanceof TypeError
          ? `No se pudo conectar con la API en ${API_URL}. Verifica el backend y CORS.`
          : cause instanceof Error
            ? cause.message
            : "No fue posible abrir el documento.",
      );
    }
  }

  function closeViewer() {
    if (viewer) URL.revokeObjectURL(viewer.url);
    setViewer(null);
  }

  return (
    <section className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Panel Administrativo · SaaS individual
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            Solicitudes de acceso
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Verifica la tarjeta profesional y asigna un plan al aprobar.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          disabled={loading}
          aria-label="Actualizar solicitudes"
          className="grid size-10 place-items-center rounded-lg border border-border bg-surface hover:bg-surface-hover"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger-light p-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-success/30 bg-success-light p-3 text-sm text-success"
        >
          {notice}
        </p>
      )}
      <section className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3">
        <label className="min-w-60 flex-1 text-sm">
          <span className="sr-only">Buscar profesional</span>
          <span className="relative block">
            <Search className="absolute left-3 top-2.5 size-4 text-foreground-muted" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar profesional o correo"
              className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3"
            />
          </span>
        </label>
        <label className="min-w-52 text-sm">
          Plan al aprobar
          <select
            value={planId}
            onChange={(event) => setPlanId(event.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
          >
            <option value="">Seleccionar plan</option>
            {data.plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.nombre}
              </option>
            ))}
          </select>
        </label>
      </section>
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            aria-label="Seleccionar todas las solicitudes visibles"
            checked={visible.length > 0 && visible.every((item) => selected.includes(item.id))}
            onChange={(event) => setSelected((current) => event.target.checked
              ? Array.from(new Set([...current, ...visible.map((item) => item.id)]))
              : current.filter((id) => !visible.some((item) => item.id === id)))}
          />
          {selected.length} seleccionadas
        </label>
        <div className="flex gap-2">
          <button type="button" disabled={!selected.length || workingId !== null} onClick={() => void decideSelected("RECHAZAR")} className="rounded-md border border-danger/30 px-3 py-2 text-xs text-danger disabled:opacity-50">Rechazar seleccionadas</button>
          <button type="button" disabled={!selected.length || !planId || workingId !== null} onClick={() => void decideSelected("APROBAR")} className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">Aprobar seleccionadas</button>
        </div>
      </section>
      <section className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-205 text-left text-sm">
          <thead className="border-b border-border bg-surface-secondary text-xs uppercase text-foreground-muted">
            <tr>
              <th className="px-4 py-3">
                <span className="sr-only">Seleccionar solicitud</span>
              </th>
              <th className="px-4 py-3">Profesional</th>
              <th className="px-4 py-3">Contacto</th>
              <th className="px-4 py-3">Recibida</th>
              <th className="px-4 py-3">Verificación</th>
              <th className="px-4 py-3 text-right">Decisión</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-foreground-muted"
                >
                  Cargando solicitudes...
                </td>
              </tr>
            ) : visible.length ? (
              visible.map((request) => (
                <tr
                  key={request.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.includes(request.id)}
                      onChange={() => setSelected((current) => current.includes(request.id)
                        ? current.filter((id) => id !== request.id)
                        : [...current, request.id])}
                      aria-label={`Seleccionar solicitud de ${request.usuario.nombre_completo}`}
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {request.usuario.nombre_completo}
                  </td>
                  <td className="px-4 py-3 text-foreground-secondary">
                    <div>{request.usuario.email}</div>
                    <div className="text-xs text-foreground-muted">
                      {request.usuario.whatsapp_numero || "Sin WhatsApp"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-foreground-secondary">
                    {new Intl.DateTimeFormat("es-CO", {
                      dateStyle: "medium",
                      timeZone: "America/Bogota",
                    }).format(new Date(request.fecha_solicitud))}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => void viewCard(request)}
                      className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-foreground hover:bg-surface-hover"
                    >
                      <FileImage className="size-4" />
                      Ver tarjeta
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={workingId !== null}
                        onClick={() => void decide(request, "rechazar")}
                        className="rounded-md border border-danger/30 px-3 py-2 text-xs text-danger hover:bg-danger-light disabled:opacity-50"
                      >
                        Rechazar
                      </button>
                      <button
                        type="button"
                        disabled={workingId !== null || !planId}
                        onClick={() => void decide(request, "aprobar")}
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                      >
                        <Check className="size-3.5" />
                        Aprobar
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-foreground-muted"
                >
                  No hay solicitudes pendientes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      {viewer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={viewer.title}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div className="flex h-[min(88vh,900px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-surface">
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="font-medium">{viewer.title}</h2>
              <button
                type="button"
                onClick={closeViewer}
                aria-label="Cerrar tarjeta"
                className="grid size-9 place-items-center rounded-md hover:bg-surface-hover"
              >
                <X className="size-4" />
              </button>
            </header>
            <iframe
              className="min-h-0 flex-1 bg-surface-secondary"
              src={viewer.url}
              title={viewer.title}
            />
          </div>
        </div>
      )}
    </section>
  );
}
