"use client";

import { apiRequest } from "@/lib/api";

import { useMemo, useState } from "react";
import {
  Bell,
  Check,
  Mail,
  MessageCircle,
  Save,
  Settings,
} from "lucide-react";

import { useSession } from "@/context/SessionContext";
import { SecurityChangeButton } from "@/components/security/SecurityChangeButton";
import PushDeviceManager from "@/components/push/PushDeviceManager";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";

const TIPOS_MENSAJE = [
  { id: "ACCESO", label: "Acceso y cuenta" },
  { id: "ACTUACIONES", label: "Actuaciones judiciales" },
  { id: "TAREAS", label: "Asignaciones de tareas" },
  { id: "SUBTAREAS", label: "Asignaciones de subtareas" },
  { id: "RECORDATORIOS", label: "Recordatorios" },
  { id: "DOCUMENTOS", label: "Documentos y solicitudes" },
  { id: "RESUMENES", label: "Resúmenes" },
] as const;

type NotificationType = (typeof TIPOS_MENSAJE)[number]["id"];
type ChannelPreferences = Record<NotificationType, { email: boolean; whatsapp: boolean }>;

const DEFAULT_PREFERENCES: ChannelPreferences = {
  ACCESO: { email: true, whatsapp: false },
  ACTUACIONES: { email: true, whatsapp: false },
  TAREAS: { email: true, whatsapp: false },
  SUBTAREAS: { email: true, whatsapp: false },
  RECORDATORIOS: { email: true, whatsapp: false },
  DOCUMENTOS: { email: true, whatsapp: false },
  RESUMENES: { email: true, whatsapp: false },
};

const WHATSAPP_PLAN_FLAGS: Record<NotificationType, string | null> = {
  ACCESO: "notificaciones_whatsapp_procesos",
  ACTUACIONES: "notificaciones_whatsapp_procesos",
  TAREAS: "notificaciones_whatsapp_tareas",
  SUBTAREAS: "notificaciones_whatsapp_tareas",
  RECORDATORIOS: "notificaciones_whatsapp_tareas",
  DOCUMENTOS: "notificaciones_whatsapp_procesos",
  RESUMENES: "notificaciones_whatsapp_procesos",
};


export default function ConfiguracionAbogadoPage() {
  const { user, token, refreshUser } = useSession();

  const [preferencesOverride, setPreferencesOverride] = useState<{ userId: number; value: ChannelPreferences } | null>(null);
  const [clientChannelsOverride, setClientChannelsOverride] = useState<{ userId: number; email: boolean; whatsapp: boolean } | null>(null);
  const preferences = useMemo(() => {
    if (user && preferencesOverride?.userId === user.id) return preferencesOverride.value;
    if (!user) return DEFAULT_PREFERENCES;
    return Object.fromEntries(TIPOS_MENSAJE.map(({ id }) => {
      const saved = user.preferencias_notificacion?.[id];
      return [id, {
        email: saved?.email ?? user.notificaciones_email !== false,
        whatsapp: saved?.whatsapp ?? Boolean(user.notificaciones_whatsapp),
      }];
    })) as ChannelPreferences;
  }, [user, preferencesOverride]);
  const clientChannels = user && clientChannelsOverride?.userId === user.id
    ? clientChannelsOverride
    : { email: user?.notificaciones_email !== false, whatsapp: Boolean(user?.notificaciones_whatsapp) };
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await apiRequest(
        `/api/auth/preferencias-notificaciones`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(user?.rol === "CLIENTE"
            ? { notificaciones_email: clientChannels.email, notificaciones_whatsapp: clientChannels.whatsapp }
            : { preferencias: preferences }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "No fue posible actualizar las preferencias.",
        );
      }

      await refreshUser();
      setPreferencesOverride(null);
      setClientChannelsOverride(null);
      setMessage("Preferencias de notificación guardadas.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Error al guardar.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      {/* Encabezado */}
      <PageHeader
        overline="Mi cuenta"
        title="Configuración"
        description="Personaliza las preferencias de tu cuenta y define cómo deseas recibir las alertas de tu despacho."
        action={
          <div className="hidden rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-2 text-right sm:block">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
              Cuenta
            </p>
            <p className="mt-0.5 text-sm font-medium text-foreground">
              {user?.email || "Usuario"}
            </p>
          </div>
        }
      />

      {/* Mensajes */}
      {error && (
        <div
          role="alert"
          className="rounded-[var(--radius-lg)] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400"
        >
          {error}
        </div>
      )}

      {message && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400"
        >
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
            <Check className="size-4" />
          </div>

          <span>{message}</span>
        </div>
      )}

      {/* Notificaciones */}
      <section className="overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface shadow-sm">
        {/* Cabecera de sección */}
        <div className="flex items-start gap-4 border-b border-border p-5 sm:p-6">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-brand-900/10">
            <Bell className="size-5 text-brand-900" />
          </div>

          <div>
            <h2 className="text-base font-semibold text-foreground">
              Notificaciones
            </h2>

            <p className="mt-1 text-sm leading-6 text-foreground-muted">
              Controla los canales mediante los cuales recibirás avisos
              relacionados con la gestión de tus procesos.
            </p>
          </div>
        </div>

        {/* Opciones */}
        {user?.rol === "CLIENTE" ? (
          <fieldset className="space-y-3 p-5 sm:p-6">
            <legend className="text-sm font-semibold text-foreground">
              Canales para tus alertas
            </legend>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-4">
              <input
                type="checkbox"
                checked={clientChannels.email}
                onChange={(event) => user && setClientChannelsOverride({ userId: user.id, email: event.target.checked, whatsapp: clientChannels.whatsapp })}
              />
              <Mail className="size-4" />
              <span className="text-sm">Correo · {user.email}</span>
            </label>
            <label className={`flex items-center gap-3 rounded-lg border border-border p-4 ${user.whatsapp_numero ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}>
              <input
                type="checkbox"
                checked={clientChannels.whatsapp}
                disabled={!user.whatsapp_numero}
                onChange={(event) => user && setClientChannelsOverride({ userId: user.id, email: clientChannels.email, whatsapp: event.target.checked })}
              />
              <MessageCircle className="size-4" />
              <span className="text-sm">WhatsApp · {user.whatsapp_numero || "Agrega un número desde Seguridad"}</span>
            </label>
          </fieldset>
        ) : (
          <div className="divide-y divide-border">
            {TIPOS_MENSAJE.map(({ id, label }) => {
              const whatsappPlanFlag = WHATSAPP_PLAN_FLAGS[id];
              const whatsappAvailable = Boolean(user?.whatsapp_numero)
                && (user?.rol !== "ABOGADO"
                  || !whatsappPlanFlag
                  || user.plan?.[whatsappPlanFlag as keyof NonNullable<typeof user.plan>] === true);
              return (
                <fieldset key={id} className="grid gap-3 p-5 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-6">
                  <legend className="font-medium text-foreground">{label}</legend>
                  <label className="flex items-center gap-2 text-sm text-foreground-muted">
                    <input
                      type="checkbox"
                      checked={preferences[id].email}
                      onChange={(event) => user && setPreferencesOverride({ userId: user.id, value: {
                        ...preferences,
                        [id]: { ...preferences[id], email: event.target.checked },
                      } })}
                    />
                    <Mail className="size-4" />
                    Email
                  </label>
                  <label className={`flex items-center gap-2 text-sm text-foreground-muted ${whatsappAvailable ? "" : "cursor-not-allowed opacity-50"}`}>
                    <input
                      type="checkbox"
                      checked={preferences[id].whatsapp}
                      disabled={!whatsappAvailable}
                      onChange={(event) => user && setPreferencesOverride({ userId: user.id, value: {
                        ...preferences,
                        [id]: { ...preferences[id], whatsapp: event.target.checked },
                      } })}
                    />
                    <MessageCircle className="size-4" />
                    WhatsApp
                  </label>
                  {!whatsappAvailable && (
                    <p className="text-xs text-foreground-muted sm:col-start-2 sm:col-span-2">
                      {!user?.whatsapp_numero
                        ? "Configura un número de WhatsApp para activar este canal."
                        : "El plan actual no habilita WhatsApp para esta notificación."}
                    </p>
                  )}
                </fieldset>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="flex flex-col gap-3 border-t border-border bg-surface-secondary p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="text-xs leading-5 text-foreground-muted">
            {user?.rol === "CLIENTE"
              ? "Recibirás todas las alertas que te correspondan en el canal elegido."
              : "Cada tipo aplica sus canales de forma independiente."}
          </div>

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-lg)] bg-brand-900 px-5 py-2.5 text-sm font-medium !text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="size-4" />
            {saving ? "Guardando…" : "Guardar preferencias"}
          </button>
        </div>
      </section>

      {/* Dispositivos Push */}
      <section className="rounded-[var(--radius-xl)] border border-border bg-surface p-5 sm:p-6">
        <PushDeviceManager />
      </section>

      {/* Información de cuenta */}
      <section className="rounded-[var(--radius-xl)] border border-border bg-surface">
        <div className="border-b border-border px-5 py-5 sm:px-6">
          <h2 className="text-base font-semibold text-foreground">
            Información de la cuenta
          </h2>

          <p className="mt-1 text-sm text-foreground-muted">
            Datos actualmente asociados a tu cuenta.
          </p>
        </div>

        <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
          <AccountField
            label="Nombre"
            value={user?.nombre_completo || "No disponible"}
          />

          <AccountField
            label="Correo electrónico"
            value={user?.email || "No disponible"}
          />

          <AccountField
            label="WhatsApp"
            value={user?.whatsapp_numero || "No configurado"}
          />

          <AccountField
            label="Rol"
            value={user?.rol || "No disponible"}
          />
        </div>
      </section>

      <section className="space-y-5 rounded-[var(--radius-xl)] border border-border bg-surface p-5 sm:p-6">
        <div>
          <h2 className="text-base font-semibold text-foreground">Seguridad de la cuenta</h2>
          <p className="mt-1 text-sm text-foreground-muted">Confirma con un código enviado a tus datos actuales antes de cambiar correo, WhatsApp o contraseña.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <SecurityChangeButton action="email" title="Cambiar correo" token={token} whatsappAvailable={Boolean(user?.whatsapp_numero)} onComplete={refreshUser} />
          <SecurityChangeButton action="whatsapp" title="Cambiar WhatsApp" token={token} whatsappAvailable={Boolean(user?.whatsapp_numero)} onComplete={refreshUser} />
          <SecurityChangeButton action="password" title="Cambiar contraseña" token={token} whatsappAvailable={Boolean(user?.whatsapp_numero)} onComplete={refreshUser} />
        </div>
      </section>
    </section>
  );
}

function AccountField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface-secondary p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
        {label}
      </p>

      <p className="mt-2 truncate text-sm font-medium text-foreground">
        {value}
      </p>
    </div>
  );
}
