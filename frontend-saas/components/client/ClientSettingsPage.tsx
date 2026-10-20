"use client";

import { FormEvent, useEffect, useState } from "react";
import { Bell, Mail, MessageCircle } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fetchApi } from "@/lib/api";
import { SecurityChangeButton } from "@/components/security/SecurityChangeButton";
import PushDeviceManager from "@/components/push/PushDeviceManager";

export default function ClientSettingsPage() {
  const { user, token, refreshUser } = useSession();
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setEmailEnabled(user?.notificaciones_email !== false);
    setWhatsappEnabled(Boolean(user?.notificaciones_whatsapp));
  }, [user?.id, user?.notificaciones_email, user?.notificaciones_whatsapp]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    if (!emailEnabled && !whatsappEnabled) {
      setError("Selecciona al menos un canal de notificación.");
      return;
    }
    setSaving(true); setError(""); setNotice("");
    try {
      await fetchApi("/api/auth/preferencias-notificaciones", {
        method: "PATCH", token,
        body: JSON.stringify({ notificaciones_email: emailEnabled, notificaciones_whatsapp: whatsappEnabled }),
      });
      await refreshUser();
      setNotice("Preferencias guardadas.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible guardar las preferencias.");
    } finally { setSaving(false); }
  }

  return <section className="mx-auto max-w-3xl space-y-6">
    <header><p className="text-xs font-semibold uppercase tracking-wide text-primary">Portal del cliente</p><h1 className="mt-1 text-2xl font-semibold text-foreground">Configuración</h1><p className="mt-1 text-sm text-(--foreground-muted)">Administra cómo recibes avisos y protege el acceso a tu cuenta.</p></header>
    {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger-light p-3 text-sm text-danger">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-success/30 bg-success-light p-3 text-sm text-success">{notice}</p>}
    <form onSubmit={save} className="space-y-5 border-t border-border pt-5">
      <div className="flex items-start gap-3"><Bell className="mt-0.5 size-5 text-primary" /><div><h2 className="font-semibold">Notificaciones</h2><p className="mt-1 text-sm text-(--foreground-muted)">Puedes activar correo y WhatsApp al mismo tiempo.</p></div></div>
      <fieldset className="space-y-3">
        <legend className="sr-only">Canales de notificación</legend>
        <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-4"><input type="checkbox" checked={emailEnabled} onChange={(event) => setEmailEnabled(event.target.checked)} /><Mail className="size-4" /><span className="text-sm">Correo · {user?.email || "correo de la cuenta"}</span></label>
        <label className={`flex items-center gap-3 rounded-md border border-border p-4 ${user?.whatsapp_numero ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}><input type="checkbox" checked={whatsappEnabled} disabled={!user?.whatsapp_numero} onChange={(event) => setWhatsappEnabled(event.target.checked)} /><MessageCircle className="size-4" /><span className="text-sm">WhatsApp · {user?.whatsapp_numero || "Agrega un número desde Seguridad"}</span></label>
      </fieldset>
      <button type="submit" disabled={saving || !token} className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? "Guardando…" : "Guardar preferencias"}</button>
    </form>
    <section className="border-t border-border pt-5">
      <PushDeviceManager />
    </section>
    <section className="space-y-4 border-t border-border pt-5"><div><h2 className="font-semibold">Seguridad de la cuenta</h2><p className="mt-1 text-sm text-(--foreground-muted)">Solicita un código y valídalo antes de ingresar el nuevo dato. Al cerrar la ventana, el código se invalida.</p></div><div className="flex flex-wrap gap-3"><SecurityChangeButton action="email" title="Cambiar correo" token={token} whatsappAvailable={Boolean(user?.whatsapp_numero)} onComplete={refreshUser} /><SecurityChangeButton action="whatsapp" title="Cambiar WhatsApp" token={token} whatsappAvailable={Boolean(user?.whatsapp_numero)} onComplete={refreshUser} /><SecurityChangeButton action="password" title="Cambiar contraseña" token={token} whatsappAvailable={Boolean(user?.whatsapp_numero)} onComplete={refreshUser} /></div></section>
    <p className="border-t border-border pt-5 text-sm text-(--foreground-muted)">Los cambios de nombre y datos del contrato siguen solicitándose desde <a className="font-medium text-primary" href="/gestion-procesos/cliente/perfil">Mi perfil</a> para revisión del despacho.</p>
  </section>;
}
