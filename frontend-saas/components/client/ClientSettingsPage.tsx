"use client";

import { FormEvent, useState } from "react";
import { Bell, Mail, MessageCircle, Save } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fetchApi } from "@/lib/api";
import ClientPasswordChange from "@/components/client/ClientPasswordChange";

export default function ClientSettingsPage() {
  const { user, token, refreshUser } = useSession();
  const [channel, setChannel] = useState<"EMAIL" | "WHATSAPP">("EMAIL");
  const [previousUser, setPreviousUser] = useState(user);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  if (user !== previousUser) {
    setPreviousUser(user);
    setChannel(user?.canal_notificacion_cliente ?? "EMAIL");
  }

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
        body: JSON.stringify({ canal_cliente: channel }),
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
    <form onSubmit={save} className="space-y-5 border-t border-border pt-5">
      <div className="flex items-start gap-3">
        <Bell className="mt-0.5 size-5 text-primary" />
        <div>
          <h2 className="font-semibold">Notificaciones</h2>
          <p className="mt-1 text-sm text-(--foreground-muted)">Elige el canal obligatorio para todas las alertas que te correspondan.</p>
        </div>
      </div>
      <fieldset className="space-y-3">
        <legend className="sr-only">Canal obligatorio</legend>
        <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-4">
          <input type="radio" name="client-channel" value="EMAIL" checked={channel === "EMAIL"} onChange={() => setChannel("EMAIL")} />
          <Mail className="size-4" />
          <span className="text-sm">Correo · {user?.email || "correo de la cuenta"}</span>
        </label>
        <label className={`flex items-center gap-3 rounded-md border border-border p-4 ${user?.whatsapp_numero ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}>
          <input type="radio" name="client-channel" value="WHATSAPP" checked={channel === "WHATSAPP"} disabled={!user?.whatsapp_numero} onChange={() => setChannel("WHATSAPP")} />
          <MessageCircle className="size-4" />
          <span className="text-sm">WhatsApp · {user?.whatsapp_numero || "Agrega un número en tu perfil"}</span>
        </label>
      </fieldset>
      <button type="submit" disabled={saving || !token} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Save className="size-4" />{saving ? "Guardando…" : "Guardar canal"}</button>
    </form>
    {user?.id && <ClientPasswordChange token={token} whatsappAvailable={Boolean(user.whatsapp_numero)} />}
    <div className="border-t border-border pt-5 text-sm text-(--foreground-muted)"><p>Los cambios de nombre, correo o WhatsApp se solicitan desde <a className="font-medium text-primary" href="/gestion-procesos/cliente/perfil">Mi perfil</a> y requieren revisión del despacho.</p><p className="mt-2">Puedes revisar sesiones y políticas de privacidad con el administrador de la plataforma.</p></div>
  </section>;
}
