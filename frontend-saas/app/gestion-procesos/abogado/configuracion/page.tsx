"use client";

import { apiRequest } from "@/lib/api";

import { useState } from "react";
import {
  Bell,
  Check,
  Mail,
  MessageCircle,
  Save,
  Settings,
} from "lucide-react";

import { useSession } from "@/context/SessionContext";

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

  const [preferences, setPreferences] = useState<ChannelPreferences>(DEFAULT_PREFERENCES);
  const [clientChannel, setClientChannel] = useState<"EMAIL" | "WHATSAPP">("EMAIL");
  const [previousUser, setPreviousUser] = useState(user);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  if (user !== previousUser) {
    setPreviousUser(user);
    if (user) {
      setPreferences(Object.fromEntries(
        TIPOS_MENSAJE.map(({ id }) => [
          id,
          user.preferencias_notificacion?.[id] ?? {
            email: user.notificaciones_email !== false,
            whatsapp: !!user.notificaciones_whatsapp,
          },
        ]),
      ) as ChannelPreferences);
      setClientChannel(user.canal_notificacion_cliente ?? "EMAIL");
    } else {
      setPreferences(DEFAULT_PREFERENCES);
      setClientChannel("EMAIL");
    }
  }

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
            ? { canal_cliente: clientChannel }
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
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-[var(--foreground-muted)]">
            <Settings className="size-4" />
            <span>Mi cuenta</span>
          </div>

          <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)]">
            Configuración
          </h1>

          <p className="mt-2 max-w-2xl text-sm text-[var(--foreground-muted)]">
            Personaliza las preferencias de tu cuenta y define cómo deseas
            recibir las alertas de tu despacho.
          </p>
        </div>

        <div className="hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:block">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--foreground-muted)]">
            Cuenta
          </p>
          <p className="mt-1 text-sm font-medium text-[var(--foreground)]">
            {user?.email || "Usuario"}
          </p>
        </div>
      </header>

      {/* Mensajes */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400"
        >
          {error}
        </div>
      )}

      {message && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400"
        >
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
            <Check className="size-4" />
          </div>

          <span>{message}</span>
        </div>
      )}

      {/* Notificaciones */}
      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        {/* Cabecera de sección */}
        <div className="flex items-start gap-4 border-b border-[var(--border)] p-5 sm:p-6">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10">
            <Bell className="size-5 text-[var(--primary)]" />
          </div>

          <div>
            <h2 className="text-base font-semibold text-[var(--foreground)]">
              Notificaciones
            </h2>

            <p className="mt-1 text-sm leading-6 text-[var(--foreground-muted)]">
              Controla los canales mediante los cuales recibirás avisos
              relacionados con la gestión de tus procesos.
            </p>
          </div>
        </div>

        {/* Opciones */}
        {user?.rol === "CLIENTE" ? (
          <fieldset className="space-y-3 p-5 sm:p-6">
            <legend className="text-sm font-semibold text-[var(--foreground)]">
              Canal obligatorio para todas tus alertas
            </legend>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--border)] p-4">
              <input
                type="radio"
                name="canal-cliente"
                value="EMAIL"
                checked={clientChannel === "EMAIL"}
                onChange={() => setClientChannel("EMAIL")}
              />
              <Mail className="size-4" />
              <span className="text-sm">Correo · {user.email}</span>
            </label>
            <label className={`flex items-center gap-3 rounded-lg border border-[var(--border)] p-4 ${user.whatsapp_numero ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}>
              <input
                type="radio"
                name="canal-cliente"
                value="WHATSAPP"
                checked={clientChannel === "WHATSAPP"}
                disabled={!user.whatsapp_numero}
                onChange={() => setClientChannel("WHATSAPP")}
              />
              <MessageCircle className="size-4" />
              <span className="text-sm">WhatsApp · {user.whatsapp_numero || "Sin número configurado"}</span>
            </label>
          </fieldset>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {TIPOS_MENSAJE.map(({ id, label }) => {
              const whatsappPlanFlag = WHATSAPP_PLAN_FLAGS[id];
              const whatsappAvailable = Boolean(user?.whatsapp_numero)
                && (user?.rol !== "ABOGADO"
                  || !whatsappPlanFlag
                  || user.plan?.[whatsappPlanFlag as keyof NonNullable<typeof user.plan>] === true);
              return (
                <fieldset key={id} className="grid gap-3 p-5 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-6">
                  <legend className="font-medium text-[var(--foreground)]">{label}</legend>
                  <label className="flex items-center gap-2 text-sm text-[var(--foreground-muted)]">
                    <input
                      type="checkbox"
                      checked={preferences[id].email}
                      onChange={(event) => setPreferences((current) => ({
                        ...current,
                        [id]: { ...current[id], email: event.target.checked },
                      }))}
                    />
                    <Mail className="size-4" />
                    Email
                  </label>
                  <label className={`flex items-center gap-2 text-sm text-[var(--foreground-muted)] ${whatsappAvailable ? "" : "cursor-not-allowed opacity-50"}`}>
                    <input
                      type="checkbox"
                      checked={preferences[id].whatsapp}
                      disabled={!whatsappAvailable}
                      onChange={(event) => setPreferences((current) => ({
                        ...current,
                        [id]: { ...current[id], whatsapp: event.target.checked },
                      }))}
                    />
                    <MessageCircle className="size-4" />
                    WhatsApp
                  </label>
                </fieldset>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="flex flex-col gap-3 border-t border-[var(--border)] bg-[var(--surface-secondary)] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="text-xs leading-5 text-[var(--foreground-muted)]">
            {user?.rol === "CLIENTE"
              ? "Recibirás todas las alertas que te correspondan en el canal elegido."
              : "Cada tipo aplica sus canales de forma independiente."}
          </div>

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="size-4" />
            {saving ? "Guardando…" : "Guardar preferencias"}
          </button>
        </div>
      </section>

      {/* Información de cuenta */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] px-5 py-5 sm:px-6">
          <h2 className="text-base font-semibold text-[var(--foreground)]">
            Información de la cuenta
          </h2>

          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
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
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--foreground-muted)]">
        {label}
      </p>

      <p className="mt-2 truncate text-sm font-medium text-[var(--foreground)]">
        {value}
      </p>
    </div>
  );
}