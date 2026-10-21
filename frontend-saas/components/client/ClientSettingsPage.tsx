"use client";

import { FormEvent, useEffect, useState } from "react";
import { Bell, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fetchApi } from "@/lib/api";
import { SecurityChangeButton } from "@/components/security/SecurityChangeButton";
import PushDeviceManager from "@/components/push/PushDeviceManager";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";

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
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await fetchApi("/api/auth/preferencias-notificaciones", {
        method: "PATCH",
        token,
        body: JSON.stringify({ notificaciones_email: emailEnabled, notificaciones_whatsapp: whatsappEnabled }),
      });
      await refreshUser();
      setNotice("Preferencias guardadas.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible guardar las preferencias.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6 pb-24">
      <PageHeader
        overline="Portal del cliente"
        title="Configuración"
        description="Administra cómo recibes avisos y protege el acceso a tu cuenta."
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

      {/* NOTIFICACIONES */}
      <form onSubmit={save} className="rounded-xl border border-border bg-surface p-6 shadow-xs space-y-5">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
            <Bell className="size-5" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground text-base">Canales de notificación</h2>
            <p className="mt-0.5 text-xs text-muted">
              Puedes activar correo y WhatsApp al mismo tiempo para recibir actualizaciones.
            </p>
          </div>
        </div>

        <fieldset className="space-y-3">
          <legend className="sr-only">Canales de notificación</legend>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface-secondary/50 p-3.5 hover:bg-surface-secondary transition-colors">
            <input
              type="checkbox"
              checked={emailEnabled}
              onChange={(event) => setEmailEnabled(event.target.checked)}
              className="size-4 rounded border-border text-brand-900 focus:ring-brand-500"
            />
            <Mail className="size-4 text-muted" />
            <span className="text-sm font-medium text-foreground">Correo electrónico · {user?.email || "correo de la cuenta"}</span>
          </label>
          <label
            className={`flex items-center gap-3 rounded-lg border border-border bg-surface-secondary/50 p-3.5 transition-colors ${
              user?.whatsapp_numero ? "cursor-pointer hover:bg-surface-secondary" : "cursor-not-allowed opacity-60"
            }`}
          >
            <input
              type="checkbox"
              checked={whatsappEnabled}
              disabled={!user?.whatsapp_numero}
              onChange={(event) => setWhatsappEnabled(event.target.checked)}
              className="size-4 rounded border-border text-brand-900 focus:ring-brand-500"
            />
            <MessageCircle className="size-4 text-muted" />
            <span className="text-sm font-medium text-foreground">
              WhatsApp · {user?.whatsapp_numero || "Agrega un número desde la sección Seguridad"}
            </span>
          </label>
        </fieldset>

        <Button type="submit" variant="primary" loading={saving} disabled={saving || !token}>
          Guardar preferencias
        </Button>
      </form>

      {/* DISPOSITIVOS PUSH */}
      <section className="rounded-xl border border-border bg-surface p-6 shadow-xs">
        <PushDeviceManager />
      </section>

      {/* SEGURIDAD DE LA CUENTA */}
      <section className="rounded-xl border border-border bg-surface p-6 shadow-xs space-y-4">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground text-base">Seguridad de la cuenta</h2>
            <p className="mt-0.5 text-xs text-muted">
              Solicita un código de un solo uso y valídalo antes de ingresar el nuevo dato seguro.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5 pt-2">
          <SecurityChangeButton
            action="email"
            title="Cambiar correo"
            token={token}
            whatsappAvailable={Boolean(user?.whatsapp_numero)}
            onComplete={refreshUser}
          />
          <SecurityChangeButton
            action="whatsapp"
            title="Cambiar WhatsApp"
            token={token}
            whatsappAvailable={Boolean(user?.whatsapp_numero)}
            onComplete={refreshUser}
          />
          <SecurityChangeButton
            action="password"
            title="Cambiar contraseña"
            token={token}
            whatsappAvailable={Boolean(user?.whatsapp_numero)}
            onComplete={refreshUser}
          />
        </div>
      </section>

      <p className="text-xs text-muted text-center">
        Los cambios de nombre e identificación para contratos siguen solicitándose desde{" "}
        <a className="font-semibold text-brand-700 hover:underline dark:text-brand-300" href="/gestion-procesos/cliente/perfil">
          Mi perfil
        </a>{" "}
        para revisión y aprobación del despacho.
      </p>
    </section>
  );
}
