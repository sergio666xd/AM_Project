"use client";

import { apiRequest } from "@/lib/api";

import { useEffect, useMemo, useState } from "react";
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

  const [preferencesOverride, setPreferencesOverride] = useState<{ userId: number; value: ChannelPreferences } | null>(null);
  const [clientChannelOverride, setClientChannelOverride] = useState<{ userId: number; value: "EMAIL" | "WHATSAPP" } | null>(null);
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
  const clientChannel = user && clientChannelOverride?.userId === user.id
    ? clientChannelOverride.value
    : user?.canal_notificacion_cliente ?? "EMAIL";
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
      setPreferencesOverride(null);
      setClientChannelOverride(null);
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
                onChange={() => user && setClientChannelOverride({ userId: user.id, value: "EMAIL" })}
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
                onChange={() => user && setClientChannelOverride({ userId: user.id, value: "WHATSAPP" })}
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
                      onChange={(event) => user && setPreferencesOverride({ userId: user.id, value: {
                        ...preferences,
                        [id]: { ...preferences[id], email: event.target.checked },
                      } })}
                    />
                    <Mail className="size-4" />
                    Email
                  </label>
                  <label className={`flex items-center gap-2 text-sm text-[var(--foreground-muted)] ${whatsappAvailable ? "" : "cursor-not-allowed opacity-50"}`}>
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
                    <p className="text-xs text-[var(--foreground-muted)] sm:col-start-2 sm:col-span-2">
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

      <section className="space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
        <div>
          <h2 className="text-base font-semibold text-[var(--foreground)]">Seguridad de la cuenta</h2>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">Confirma con un código enviado a tus datos actuales antes de cambiar correo, WhatsApp o contraseña.</p>
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          {user?.rol !== "CLIENTE" ? <>
            <SecurityChangePanel action="email" title="Cambiar correo" token={token} whatsappAvailable={Boolean(user?.whatsapp_numero)} onComplete={refreshUser} />
            <SecurityChangePanel action="whatsapp" title="Cambiar WhatsApp" token={token} whatsappAvailable={Boolean(user?.whatsapp_numero)} onComplete={refreshUser} />
          </> : <p className="text-sm text-[var(--foreground-muted)]">Para cambiar correo o WhatsApp, solicita la edición de perfil a tu abogado.</p>}
          <SecurityChangePanel action="password" title="Cambiar contraseña" token={token} whatsappAvailable={Boolean(user?.whatsapp_numero)} onComplete={refreshUser} />
        </div>
      </section>
    </section>
  );
}

type SecurityAction = "email" | "whatsapp" | "password";
type SecurityChallenge = { id: string; accion: SecurityAction; canal: "EMAIL" | "WHATSAPP"; expira_en: string; reenviar_desde: string };

export function SecurityChangePanel({ action, title, token, whatsappAvailable, onComplete }: {
  action: SecurityAction;
  title: string;
  token: string | null;
  whatsappAvailable: boolean;
  onComplete: () => Promise<void>;
}) {
  const [challenge, setChallenge] = useState<SecurityChallenge | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const [channel, setChannel] = useState<"EMAIL" | "WHATSAPP">("EMAIL");
  const [value, setValue] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    void apiRequest(`/api/auth/seguridad/codigos/activo?accion=${action}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(async (response) => {
      if (response.ok) {
        const active = await response.json();
        if (active) {
          setChallenge(active);
          setChannel(active.canal);
        }
      }
    }).catch(() => undefined);
  }, [action, token]);

  useEffect(() => {
    if (!challenge) return;
    const update = () => {
      const now = Date.now();
      setRemaining(Math.max(0, Math.ceil((Date.parse(challenge.expira_en) - now) / 1000)));
      setCooldown(Math.max(0, Math.ceil((Date.parse(challenge.reenviar_desde) - now) / 1000)));
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [challenge]);

  async function call(path: string, init: RequestInit = {}) {
    if (!token) throw new Error("Inicia sesión nuevamente para continuar.");
    const response = await apiRequest(path, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init.headers },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "No fue posible completar la solicitud.");
    return data;
  }

  async function requestCode() {
    setBusy(true); setError(""); setMessage("");
    try {
      const payload: Record<string, string> = { accion: action, canal: channel };
      if (action === "email" || action === "whatsapp") payload.valor = value;
      if (action === "password") {
        payload.password_actual = currentPassword;
        payload.password_nueva = newPassword;
      }
      const next = await call("/api/auth/seguridad/codigos", { method: "POST", body: JSON.stringify(payload) });
      setChallenge(next); setCode(""); setMessage("Código enviado. Tienes 3 minutos para usarlo.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Error al enviar el código."); }
    finally { setBusy(false); }
  }

  async function resend() {
    if (!challenge || cooldown > 0) return;
    const nextChannel = channel === "EMAIL" ? "WHATSAPP" : "EMAIL";
    setBusy(true); setError(""); setMessage("");
    try {
      const next = await call(`/api/auth/seguridad/codigos/${challenge.id}/reenviar`, {
        method: "POST", body: JSON.stringify({ canal: nextChannel }),
      });
      setChallenge(next); setChannel(nextChannel); setCode(""); setMessage(`Código reenviado por ${nextChannel === "EMAIL" ? "correo" : "WhatsApp"}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Error al reenviar el código."); }
    finally { setBusy(false); }
  }

  async function verify() {
    if (!challenge) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await call(`/api/auth/seguridad/codigos/${challenge.id}/verificar`, { method: "POST", body: JSON.stringify({ codigo: code }) });
      setChallenge(null); setValue(""); setCurrentPassword(""); setNewPassword(""); setCode("");
      setMessage(result.mensaje || "Cambio aplicado.");
      await onComplete();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo verificar el código."); }
    finally { setBusy(false); }
  }

  const inputClass = "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)]";
  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] p-4">
      <h3 className="text-sm font-semibold text-[var(--foreground)]">{title}</h3>
      {!challenge ? <>
        {action === "email" && <input aria-label="Nuevo correo" type="email" autoComplete="email" placeholder="Nuevo correo" value={value} onChange={(event) => setValue(event.target.value)} className={inputClass} />}
        {action === "whatsapp" && <input aria-label="Nuevo número de WhatsApp" type="tel" placeholder="Nuevo número con indicativo" value={value} onChange={(event) => setValue(event.target.value)} className={inputClass} />}
        {action === "password" && <>
          <input aria-label="Contraseña actual" type="password" autoComplete="current-password" placeholder="Contraseña actual" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className={inputClass} />
          <input aria-label="Nueva contraseña" type="password" autoComplete="new-password" placeholder="Nueva contraseña (mínimo 8 caracteres)" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className={inputClass} />
        </>}
        <select aria-label="Enviar código por" value={channel} onChange={(event) => setChannel(event.target.value as "EMAIL" | "WHATSAPP")} className={inputClass}>
          <option value="EMAIL">Enviar código al correo actual</option>
          <option value="WHATSAPP" disabled={!whatsappAvailable}>Enviar código al WhatsApp actual</option>
        </select>
        <button type="button" disabled={busy || (action === "email" || action === "whatsapp" ? !value : !currentPassword || !newPassword)} onClick={() => void requestCode()} className="w-full rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? "Enviando…" : "Enviar código"}</button>
      </> : <>
        <p className="text-sm text-[var(--foreground-muted)]">Código enviado por {challenge.canal === "EMAIL" ? "correo" : "WhatsApp"}. {remaining > 0 ? <>Vence en <strong className="text-[var(--foreground)]">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</strong>.</> : "El código venció."}</p>
        {remaining === 0 && <button type="button" onClick={() => { setChallenge(null); setCode(""); }} className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--foreground)]">Solicitar un código nuevo</button>}
        <input aria-label="Código de seguridad" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="Código de 6 dígitos" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} className={inputClass} />
        <button type="button" disabled={busy || code.length !== 6 || remaining === 0} onClick={() => void verify()} className="w-full rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? "Verificando…" : "Verificar y aplicar"}</button>
        <button type="button" disabled={busy || cooldown > 0 || remaining === 0 || (channel === "EMAIL" && !whatsappAvailable)} onClick={() => void resend()} className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--foreground)] disabled:opacity-50">{cooldown > 0 ? `Reenviar o cambiar canal en ${cooldown}s` : `Reenviar por ${channel === "EMAIL" ? "WhatsApp" : "correo"}`}</button>
      </>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
    </div>
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
