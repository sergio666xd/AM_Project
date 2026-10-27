"use client";

import { useEffect, useState } from "react";
import { Check, RefreshCw, X, UserCheck } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fetchApi } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";

type Request = {
  id: number;
  cliente_id: number;
  cliente_nombre: string;
  email_actual: string;
  nombre_completo: string;
  email: string;
  whatsapp_numero: string;
  genero?: string | null;
  numero_documento?: string | null;
  domicilio?: string | null;
  direccion?: string | null;
  solicitada_en: string;
};

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
    try {
      setRequests(await fetchApi("/api/expedientes/solicitudes-edicion-perfil", { method: "GET", token }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible cargar solicitudes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    let active = true;
    fetchApi("/api/expedientes/solicitudes-edicion-perfil", { method: "GET", token })
      .then((items) => {
        if (active) setRequests(items);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "No fue posible cargar solicitudes.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
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

  return (
    <div className="motion-swap mx-auto max-w-6xl space-y-6">
      <PageHeader
        overline="Revisión de clientes"
        title="Solicitudes de edición de perfil"
        description="Confirma datos de contacto e identificación antes de aplicar cambios al expediente."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void reload()}
            loading={loading}
            icon={<RefreshCw className="size-4" />}
          >
            Actualizar
          </Button>
        }
      />

      {error && (
        <div role="alert" className="rounded-lg border border-risk/30 bg-risk/10 p-3.5 text-sm text-risk font-medium">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-lg border border-completed/30 bg-completed/10 p-3.5 text-sm text-completed font-medium">
          {notice}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-border bg-surface-secondary text-xs font-semibold uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Correo actual</th>
                <th className="px-4 py-3">Cambio solicitado</th>
                <th className="px-4 py-3">Solicitada</th>
                <th className="px-4 py-3 text-right">Revisión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="motion-delayed-in size-4 animate-spin text-brand-700" />
                      <span>Cargando solicitudes…</span>
                    </div>
                  </td>
                </tr>
              ) : requests.length > 0 ? (
                requests.map((request) => (
                  <tr key={request.id} className="transition-colors hover:bg-surface-hover/60">
                    <td className="px-4 py-3.5 font-medium text-foreground">{request.cliente_nombre}</td>
                    <td className="px-4 py-3.5 text-muted">{request.email_actual}</td>
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-foreground">{request.nombre_completo}</p>
                      <p className="text-xs text-muted">
                        {request.email} · {request.whatsapp_numero || "Sin WhatsApp"}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        Contrato: {request.genero || "Género sin especificar"} · {request.numero_documento || "Sin identificación"} · {request.domicilio || "Sin domicilio"}
                        {request.direccion ? ` · ${request.direccion}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted">
                      {new Intl.DateTimeFormat("es-CO", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "America/Bogota",
                      }).format(new Date(request.solicitada_en))}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={workingId !== null}
                          onClick={() => void review(request, "RECHAZAR")}
                          aria-label={`Rechazar cambios de ${request.cliente_nombre}`}
                          className="text-risk hover:bg-risk/10 hover:text-risk"
                          icon={<X className="size-4" />}
                        >
                          Rechazar
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={workingId !== null}
                          onClick={() => void review(request, "APROBAR")}
                          aria-label={`Aprobar cambios de ${request.cliente_nombre}`}
                          icon={<Check className="size-4" />}
                        >
                          Aprobar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted">
                    <div className="mx-auto flex max-w-xs flex-col items-center justify-center gap-2">
                      <div className="flex size-10 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                        <UserCheck className="size-5" />
                      </div>
                      <p className="font-medium text-foreground">No hay solicitudes pendientes</p>
                      <p className="text-xs text-muted">
                        Todas las solicitudes de actualización de perfil de clientes han sido procesadas.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
