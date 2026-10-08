"use client";

import { FormEvent, useEffect, useState } from "react";
import { Clock3, Send } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fetchApi } from "@/lib/api";

type Request = { id: number; nombre_completo: string; email: string; whatsapp_numero: string; estado: "PENDIENTE" | "APROBADA" | "RECHAZADA"; solicitada_en: string; revisada_en?: string | null; comentario_revision?: string | null };

export default function ClientProfilePage() {
  const { user, token } = useSession();
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [contractProfileEdits, setContractProfileEdits] = useState<Partial<{ genero: string; numero_documento: string; domicilio: string; direccion: string }>>({});
  const contractProfile = {
    genero: contractProfileEdits.genero ?? user?.genero ?? "",
    numero_documento: contractProfileEdits.numero_documento ?? user?.numero_documento ?? "",
    domicilio: contractProfileEdits.domicilio ?? user?.domicilio ?? "",
    direccion: contractProfileEdits.direccion ?? user?.direccion ?? "",
  };

  useEffect(() => {
    if (!token) return;
    let active = true;
    fetchApi("/api/expedientes/clientes/solicitud-edicion-perfil", { method: "GET", token })
      .then((items) => { if (active) setRequests(items); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "No fue posible cargar las solicitudes."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
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
          email: String(form.get("email") || "").trim(),
          whatsapp_numero: String(form.get("whatsapp_numero") || "").trim(),
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
  const statusStyle = { PENDIENTE: "bg-amber-500/10 text-amber-800", APROBADA: "bg-emerald-500/10 text-emerald-800", RECHAZADA: "bg-red-500/10 text-red-800" };

  return <section className="mx-auto max-w-3xl space-y-6">
    <header><p className="text-xs font-semibold uppercase tracking-wide text-primary">Portal del cliente</p><h1 className="mt-1 text-2xl font-semibold text-foreground">Mi perfil</h1><p className="mt-1 text-sm text-(--foreground-muted)">Los cambios de contacto y los datos usados para tus contratos requieren aprobación del abogado responsable o ADMIN.</p></header>
    {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger-light p-3 text-sm text-danger">{error}</p>}{notice && <p role="status" className="rounded-lg border border-success/30 bg-success-light p-3 text-sm text-success">{notice}</p>}
    <section className="space-y-4 border-t border-border pt-5"><h2 className="font-semibold">Solicitar cambios</h2><form onSubmit={submit} className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Nombre completo<input required maxLength={150} name="nombre_completo" defaultValue={user?.nombre_completo || ""} className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5" /></label><label className="text-sm font-medium">Correo<input required type="email" name="email" defaultValue={user?.email || ""} className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5" /></label><label className="text-sm font-medium">WhatsApp<input name="whatsapp_numero" defaultValue={user?.whatsapp_numero || ""} className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5" /></label><label className="text-sm font-medium">Género para el contrato<select value={contractProfile.genero} onChange={(event) => setContractProfileEdits({ ...contractProfileEdits, genero: event.target.value })} className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5"><option value="">Sin especificar</option><option value="MASCULINO">Masculino</option><option value="FEMENINO">Femenino</option></select></label><label className="text-sm font-medium">Número de identificación<input maxLength={40} value={contractProfile.numero_documento} onChange={(event) => setContractProfileEdits({ ...contractProfileEdits, numero_documento: event.target.value })} className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5" /></label><label className="text-sm font-medium">Municipio / domicilio<input maxLength={120} value={contractProfile.domicilio} onChange={(event) => setContractProfileEdits({ ...contractProfileEdits, domicilio: event.target.value })} className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5" /></label><label className="text-sm font-medium sm:col-span-2">Dirección de notificación<input maxLength={300} value={contractProfile.direccion} onChange={(event) => setContractProfileEdits({ ...contractProfileEdits, direccion: event.target.value })} className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5" /></label><div className="flex items-end"><button type="submit" disabled={sending || pending || loading} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Send className="size-4" />{sending ? "Enviando…" : "Solicitar edición"}</button></div></form>{pending && <p className="text-sm text-amber-800">Ya tienes una solicitud pendiente; espera la revisión antes de enviar otra.</p>}</section>
    <section className="space-y-3 border-t border-border pt-5"><h2 className="font-semibold">Historial de solicitudes</h2>{loading ? <p className="text-sm text-(--foreground-muted)">Cargando solicitudes…</p> : requests.length ? requests.map((request) => <article key={request.id} className="rounded-md border border-border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{request.nombre_completo}</span><span className={`rounded-md px-2 py-1 text-xs font-medium ${statusStyle[request.estado]}`}>{statusLabel[request.estado]}</span></div><p className="mt-1 text-sm text-(--foreground-muted)">{request.email} · {request.whatsapp_numero || "Sin WhatsApp"}</p><p className="mt-2 inline-flex items-center gap-1.5 text-xs text-(--foreground-muted)"><Clock3 className="size-3.5" />{new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(request.solicitada_en))}</p>{request.comentario_revision && <p className="mt-2 text-sm">Respuesta: {request.comentario_revision}</p>}</article>) : <p className="text-sm text-(--foreground-muted)">Todavía no has solicitado cambios.</p>}</section>
  </section>;
}
