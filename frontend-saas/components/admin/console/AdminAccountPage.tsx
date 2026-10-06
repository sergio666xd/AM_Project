"use client";

import { FormEvent, useState } from "react";
import { KeyRound, Save, ShieldCheck } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fetchApi } from "@/lib/api";
import { SecurityChangePanel } from "@/app/gestion-procesos/abogado/configuracion/page";

export default function AdminAccountPage() {
  const { user, token, refreshUser } = useSession();
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [whatsapp, setWhatsapp] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileNotice, setProfileNotice] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordNotice, setPasswordNotice] = useState("");

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return setProfileError("La sesión no está disponible.");
    setSavingProfile(true);
    setProfileError("");
    setProfileNotice("");
    try {
      const result = await fetchApi("/api/auth/perfil", {
        method: "PATCH",
        token,
        body: JSON.stringify({
          nombre_completo: (name ?? user?.nombre_completo ?? "").trim(),
        }),
      });
      await refreshUser();
      setEmail(result.email);
      setName(result.nombre_completo);
      setWhatsapp(result.whatsapp_numero);
      setProfileNotice("Datos de acceso actualizados.");
    } catch (cause) {
      setProfileError(
        cause instanceof Error
          ? cause.message
          : "No fue posible actualizar la cuenta.",
      );
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");
    setPasswordNotice("");
    if (!token) return setPasswordError("La sesión no está disponible.");
    if (newPassword.length < 8)
      return setPasswordError("Usa al menos 8 caracteres.");
    if (newPassword !== confirmPassword)
      return setPasswordError("La confirmación no coincide.");
    if (newPassword === currentPassword)
      return setPasswordError("La nueva contraseña debe ser distinta.");
    setSavingPassword(true);
    try {
      const result = await fetchApi("/api/auth/cambiar-password", {
        method: "POST",
        token,
        body: JSON.stringify({
          password_actual: currentPassword,
          password_nueva: newPassword,
        }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordNotice(result.mensaje || "Contraseña actualizada.");
    } catch (cause) {
      setPasswordError(
        cause instanceof Error
          ? cause.message
          : "No fue posible cambiar la contraseña.",
      );
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          Panel Administrativo · Seguridad
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          Mi cuenta
        </h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Actualiza el correo de acceso y protege tu contraseña.
        </p>
      </header>
      <section className="grid gap-4 md:grid-cols-3">
        <SecurityChangePanel action="email" title="Cambiar correo" token={token} whatsappAvailable={Boolean(user?.whatsapp_numero)} onComplete={refreshUser} />
        <SecurityChangePanel action="whatsapp" title="Cambiar WhatsApp" token={token} whatsappAvailable={Boolean(user?.whatsapp_numero)} onComplete={refreshUser} />
        <SecurityChangePanel action="password" title="Cambiar contraseña" token={token} whatsappAvailable={Boolean(user?.whatsapp_numero)} onComplete={refreshUser} />
      </section>
      <section className="space-y-4 border-t border-border pt-5">
        <div className="flex items-center gap-3">
          <ShieldCheck className="size-5 text-primary" />
          <div>
            <h2 className="font-semibold">Datos de acceso</h2>
            <p className="text-sm text-foreground-muted">
              El correo se utiliza para iniciar sesión.
            </p>
          </div>
        </div>
        {profileError && (
          <p
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger-light p-3 text-sm text-danger"
          >
            {profileError}
          </p>
        )}
        {profileNotice && (
          <p
            role="status"
            className="rounded-lg border border-success/30 bg-success-light p-3 text-sm text-success"
          >
            {profileNotice}
          </p>
        )}
        <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Nombre completo
            <input
              required
              maxLength={150}
              value={name ?? user?.nombre_completo ?? ""}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5"
            />
          </label>
          <label className="text-sm font-medium">
            Correo de acceso
            <input
              required
              type="email"
              autoComplete="email"
              value={email ?? user?.email ?? ""}
              disabled
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5"
            />
          </label>
          <label className="text-sm font-medium">
            WhatsApp
            <input
              value={whatsapp ?? user?.whatsapp_numero ?? ""}
              disabled
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={savingProfile}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Save className="size-4" />
              Guardar datos
            </button>
          </div>
        </form>
      </section>
      <section className="hidden space-y-4 border-t border-border pt-5">
        <div className="flex items-center gap-3">
          <KeyRound className="size-5 text-primary" />
          <div>
            <h2 className="font-semibold">Contraseña</h2>
            <p className="text-sm text-foreground-muted">
              Confirma tu contraseña actual para cambiarla.
            </p>
          </div>
        </div>
        {passwordError && (
          <p
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger-light p-3 text-sm text-danger"
          >
            {passwordError}
          </p>
        )}
        {passwordNotice && (
          <p
            role="status"
            className="rounded-lg border border-success/30 bg-success-light p-3 text-sm text-success"
          >
            {passwordNotice}
          </p>
        )}
        <form onSubmit={changePassword} className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium sm:col-span-2">
            Contraseña actual
            <input
              required
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5"
            />
          </label>
          <label className="text-sm font-medium">
            Nueva contraseña
            <input
              required
              minLength={8}
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5"
            />
          </label>
          <label className="text-sm font-medium">
            Confirmar contraseña
            <input
              required
              minLength={8}
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5"
            />
          </label>
          <div>
            <button
              type="submit"
              disabled={savingPassword}
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm font-semibold hover:bg-surface-hover disabled:opacity-50"
            >
              <KeyRound className="size-4" />
              Cambiar contraseña
            </button>
          </div>
        </form>
      </section>
    </section>
  );
}
