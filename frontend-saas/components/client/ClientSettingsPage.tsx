"use client";

import { FormEvent, useState } from "react";
import { Bell, Save } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fetchApi } from "@/lib/api";

export default function ClientSettingsPage() {
  const { user, token, refreshUser } = useSession();
  const [email, setEmail] = useState(user?.notificaciones_email !== false);
  const [whatsapp, setWhatsapp] = useState(Boolean(user?.notificaciones_whatsapp));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await fetchApi("/api/auth/preferencias-notificaciones", {
        method: "PATCH",
        token,
        body: JSON.stringify({ notificaciones_email: email, notificaciones_whatsapp: whatsapp }),
      });
      await refreshUser();
      setNotice("Preferencias guardadas.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible guardar las preferencias.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="mx-auto max-w-3xl space-y-6">
    <header><p className="text-xs font-semibold uppercase tracking-wide text-primary">Portal del cliente</p><h1 className="mt-1 text-2xl font-semibold text-foreground">Configuración</h1><p className="mt-1 text-sm text-(--foreground-muted)">Administra cómo recibes avisos de tus procesos.</p></header>
    {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger-light p-3 text-sm text-danger">{error}</p>}{notice && <p role="status" className="rounded-lg border border-success/30 bg-success-light p-3 text-sm text-success">{notice}</p>}
    <form onSubmit={save} className="space-y-5 border-t border-border pt-5"><div className="flex items-start gap-3"><Bell className="mt-0.5 size-5 text-primary" /><div><h2 className="font-semibold">Notificaciones</h2><p className="mt-1 text-sm text-(--foreground-muted)">Estas preferencias no requieren aprobación.</p></div></div><label className="flex items-center gap-3 rounded-md border border-border p-4"><input type="checkbox" checked={email} onChange={(event) => setEmail(event.target.checked)} /><span><span className="block text-sm font-medium">Correo electrónico</span><span className="text-xs text-(--foreground-muted)">Solicitudes de documentos y tareas asignadas</span></span></label><label className="flex items-center gap-3 rounded-md border border-border p-4"><input type="checkbox" checked={whatsapp} onChange={(event) => setWhatsapp(event.target.checked)} /><span><span className="block text-sm font-medium">WhatsApp</span><span className="text-xs text-(--foreground-muted)">Avisos al número registrado en tu perfil</span></span></label><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Save className="size-4" />{saving ? "Guardando…" : "Guardar preferencias"}</button></form>
  </section>;
}
