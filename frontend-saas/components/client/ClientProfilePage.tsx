"use client";

import { FormEvent, useEffect, useState } from "react";
import { Clock3, Send } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fetchApi } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

type Request = {
  id: number;
  nombre_completo: string;
  email: string;
  whatsapp_numero: string;
  estado: "PENDIENTE" | "APROBADA" | "RECHAZADA";
  solicitada_en: string;
  revisada_en?: string | null;
  comentario_revision?: string | null;
};

export default function ClientProfilePage() {
  const { user, token } = useSession();
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [contractProfileEdits, setContractProfileEdits] = useState<
    Partial<{ genero: string; numero_documento: string; domicilio: string; direccion: string }>
  >({});

  const contractProfile = {
    genero: contractProfileEdits.genero ?? user?.genero ?? "",
    numero_documento: (contractProfileEdits.numero_documento ?? user?.numero_documento ?? "").replace(/\./g, ""),
    domicilio: contractProfileEdits.domicilio ?? user?.domicilio ?? "",
    direccion: contractProfileEdits.direccion ?? user?.direccion ?? "",
  };

  useEffect(() => {
    if (!token) return;
    let active = true;
    fetchApi("/api/expedientes/clientes/solicitud-edicion-perfil", { method: "GET", token })
      .then((items) => {
        if (active) setRequests(items);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "No fue posible cargar las solicitudes.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    setSending(true);
    setError("");
    setNotice("");
    try {
      const request = await fetchApi("/api/expedientes/clientes/solicitud-edicion-perfil", {
        method: "POST",
        token,
        body: JSON.stringify({
          nombre_completo: String(form.get("nombre_completo") || "").trim(),
          ...contractProfile,
        }),
      });
      setRequests((current) => [request, ...current]);
      setNotice("Solicitud enviada. Tus datos cambiarán cuando el abogado o ADMIN la apruebe.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible enviar la solicitud.");
    } finally {
      setSending(false);
    }
  }

  const pending = requests.some((request) => request.estado === "PENDIENTE");
  const statusLabel = { PENDIENTE: "Pendiente", APROBADA: "Aprobada", RECHAZADA: "Rechazada" };

  return (
    <section className="mx-auto max-w-3xl space-y-6 pb-24">
      <PageHeader
        overline="Portal del cliente"
        title="Mi perfil"
        description="El correo y WhatsApp se cambian desde Configuración. Los cambios de identificación y datos para contratos requieren aprobación del despacho."
      />

      {error && (
        <div role="alert" className="rounded-lg border border-risk/30 bg-risk/10 p-3.5 text-sm font-medium text-risk">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-lg border border-completed/30 bg-completed/10 p-3.5 text-sm font-medium text-completed">
          {notice}
        </div>
      )}

      {/* FORMULARIO */}
      <section className="rounded-xl border border-border bg-surface p-6 shadow-xs space-y-4">
        <h2 className="font-semibold text-foreground text-base">Solicitar edición de datos</h2>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-foreground">
            Nombre completo
            <input
              required
              maxLength={150}
              name="nombre_completo"
              defaultValue={user?.nombre_completo || ""}
              className="mt-1.5 w-full rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-foreground outline-none transition focus:border-brand-500"
            />
          </label>
          <label className="text-sm font-medium text-foreground">
            Género para el contrato
            <select
              value={contractProfile.genero}
              onChange={(event) => setContractProfileEdits({ ...contractProfileEdits, genero: event.target.value })}
              className="mt-1.5 w-full rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-foreground outline-none transition focus:border-brand-500"
            >
              <option value="">Sin especificar</option>
              <option value="MASCULINO">Masculino</option>
              <option value="FEMENINO">Femenino</option>
            </select>
          </label>
          <label className="text-sm font-medium text-foreground">
            Número de identificación
            <input
              maxLength={40}
              value={contractProfile.numero_documento}
              onChange={(event) =>
                setContractProfileEdits({ ...contractProfileEdits, numero_documento: event.target.value })
              }
              className="mt-1.5 w-full rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-foreground outline-none transition focus:border-brand-500"
            />
          </label>
          <label className="text-sm font-medium text-foreground">
            Municipio / domicilio
            <input
              maxLength={120}
              value={contractProfile.domicilio}
              onChange={(event) =>
                setContractProfileEdits({ ...contractProfileEdits, domicilio: event.target.value })
              }
              className="mt-1.5 w-full rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-foreground outline-none transition focus:border-brand-500"
            />
          </label>
          <label className="text-sm font-medium text-foreground sm:col-span-2">
            Dirección de notificación
            <input
              maxLength={300}
              value={contractProfile.direccion}
              onChange={(event) =>
                setContractProfileEdits({ ...contractProfileEdits, direccion: event.target.value })
              }
              className="mt-1.5 w-full rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-foreground outline-none transition focus:border-brand-500"
            />
          </label>
          <div className="flex items-center sm:col-span-2 pt-2">
            <Button
              type="submit"
              variant="primary"
              disabled={sending || pending || loading}
              loading={sending}
              icon={<Send className="size-4" />}
            >
              Solicitar edición
            </Button>
          </div>
        </form>
        {pending && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning-foreground font-medium">
            Ya tienes una solicitud de edición pendiente; espera la revisión del despacho antes de enviar otra.
          </div>
        )}
      </section>

      {/* HISTORIAL */}
      <section className="space-y-3">
        <h2 className="font-semibold text-foreground text-base">Historial de solicitudes</h2>
        {loading ? (
          <p className="text-xs text-muted">Cargando solicitudes…</p>
        ) : requests.length > 0 ? (
          <div className="space-y-3">
            {requests.map((request) => (
              <article key={request.id} className="rounded-xl border border-border bg-surface p-4 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-sm text-foreground">{request.nombre_completo}</span>
                  <Badge
                    tone={
                      request.estado === "APROBADA"
                        ? "completed"
                        : request.estado === "RECHAZADA"
                          ? "rejected"
                          : "pending"
                    }
                  >
                    {statusLabel[request.estado]}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {request.email} · {request.whatsapp_numero || "Sin WhatsApp"}
                </p>
                <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-muted">
                  <Clock3 className="size-3.5" />
                  {new Intl.DateTimeFormat("es-CO", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "America/Bogota",
                  }).format(new Date(request.solicitada_en))}
                </p>
                {request.comentario_revision && (
                  <p className="mt-2 rounded-lg bg-surface-secondary p-2.5 text-xs text-foreground">
                    <span className="font-semibold">Respuesta del despacho:</span> {request.comentario_revision}
                  </p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-xs text-muted">
            Todavía no has solicitado cambios de perfil.
          </div>
        )}
      </section>
    </section>
  );
}
