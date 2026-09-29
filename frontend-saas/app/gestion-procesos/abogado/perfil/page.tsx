"use client";

import { apiRequest } from "@/lib/api";

import { FormEvent, useEffect, useState } from "react";
import {
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  Phone,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useSession } from "@/context/SessionContext";


export default function PerfilAbogadoPage() {
  const { user, token, refreshUser } = useSession();

  const [nombre, setNombre] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");

  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const [passwordActual, setPasswordActual] = useState("");
  const [passwordNueva, setPasswordNueva] = useState("");
  const [passwordConfirmacion, setPasswordConfirmacion] =
    useState("");

  const [showCurrentPassword, setShowCurrentPassword] =
    useState(false);
  const [showNewPassword, setShowNewPassword] =
    useState(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  useEffect(() => {
    if (!user) return;

    setNombre(user.nombre_completo);
    setWhatsapp(user.whatsapp_numero || "");
  }, [user]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();

    if (!token) {
      setProfileError("La sesión no está disponible.");
      return;
    }

    setSavingProfile(true);
    setProfileError("");
    setProfileMessage("");

    try {
      const response = await apiRequest(
        `/api/auth/perfil`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            nombre_completo: nombre.trim(),
            whatsapp_numero: whatsapp.trim(),
          }),
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            "No fue posible actualizar los datos personales."
        );
      }

      await refreshUser();

      setProfileMessage(
        "Tus datos personales fueron actualizados correctamente."
      );
    } catch (cause) {
      setProfileError(
        cause instanceof Error
          ? cause.message
          : "No fue posible actualizar los datos personales."
      );
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();

    setPasswordError("");
    setPasswordMessage("");

    if (!token) {
      setPasswordError("La sesión no está disponible.");
      return;
    }

    if (!passwordActual) {
      setPasswordError("Ingresa tu contraseña actual.");
      return;
    }

    if (!passwordNueva) {
      setPasswordError("Ingresa la nueva contraseña.");
      return;
    }

    if (passwordNueva.length < 8) {
      setPasswordError(
        "La nueva contraseña debe tener al menos 8 caracteres."
      );
      return;
    }

    if (passwordNueva !== passwordConfirmacion) {
      setPasswordError(
        "La confirmación no coincide con la nueva contraseña."
      );
      return;
    }

    if (passwordActual === passwordNueva) {
      setPasswordError(
        "La nueva contraseña debe ser diferente a la actual."
      );
      return;
    }

    setSavingPassword(true);

    try {
      const response = await apiRequest(
        `/api/auth/cambiar-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            password_actual: passwordActual,
            password_nueva: passwordNueva,
          }),
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            "No fue posible cambiar la contraseña."
        );
      }

      setPasswordActual("");
      setPasswordNueva("");
      setPasswordConfirmacion("");

      setPasswordMessage(
        "Tu contraseña fue actualizada correctamente."
      );
    } catch (cause) {
      setPasswordError(
        cause instanceof Error
          ? cause.message
          : "No fue posible cambiar la contraseña."
      );
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <section className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* ENCABEZADO */}
      <header>
        <p
          className="text-sm"
          style={{ color: "var(--foreground-muted)" }}
        >
          Mi cuenta
        </p>

        <h1
          className="text-3xl font-semibold tracking-tight"
          style={{ color: "var(--foreground)" }}
        >
          Mi perfil
        </h1>

        <p
          className="mt-1 text-sm"
          style={{ color: "var(--foreground-muted)" }}
        >
          Administra tus datos personales y la seguridad de tu
          cuenta.
        </p>
      </header>

      {/* PERFIL */}
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* RESUMEN */}
        <aside
          className="rounded-xl border p-5"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div className="flex flex-col items-center text-center">
            <div
              className="flex size-20 items-center justify-center rounded-full"
              style={{
                background: "var(--primary-light)",
                color: "var(--primary)",
              }}
            >
              <UserRound size={34} />
            </div>

            <h2
              className="mt-4 text-lg font-semibold"
              style={{ color: "var(--foreground)" }}
            >
              {user?.nombre_completo || "Usuario"}
            </h2>

            <p
              className="mt-1 break-all text-sm"
              style={{ color: "var(--foreground-muted)" }}
            >
              {user?.email || "Sin correo"}
            </p>
          </div>

          <div
            className="mt-6 space-y-3 border-t pt-5"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="flex items-start gap-3">
              <Mail
                size={17}
                className="mt-0.5 shrink-0"
                style={{ color: "var(--foreground-muted)" }}
              />

              <div className="min-w-0">
                <p
                  className="text-xs"
                  style={{
                    color: "var(--foreground-muted)",
                  }}
                >
                  Correo electrónico
                </p>

                <p
                  className="mt-0.5 break-all text-sm"
                  style={{
                    color: "var(--foreground-secondary)",
                  }}
                >
                  {user?.email || "—"}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Phone
                size={17}
                className="mt-0.5 shrink-0"
                style={{ color: "var(--foreground-muted)" }}
              />

              <div className="min-w-0">
                <p
                  className="text-xs"
                  style={{
                    color: "var(--foreground-muted)",
                  }}
                >
                  WhatsApp
                </p>

                <p
                  className="mt-0.5 text-sm"
                  style={{
                    color: "var(--foreground-secondary)",
                  }}
                >
                  {user?.whatsapp_numero || "No registrado"}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <ShieldCheck
                size={17}
                className="mt-0.5 shrink-0"
                style={{ color: "var(--success)" }}
              />

              <div>
                <p
                  className="text-xs"
                  style={{
                    color: "var(--foreground-muted)",
                  }}
                >
                  Seguridad
                </p>

                <p
                  className="mt-0.5 text-sm"
                  style={{
                    color: "var(--foreground-secondary)",
                  }}
                >
                  Cuenta protegida
                </p>
              </div>
            </div>
          </div>
        </aside>

        {/* DATOS PERSONALES */}
        <form
          onSubmit={saveProfile}
          className="overflow-hidden rounded-xl border"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div
            className="border-b px-5 py-4"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex size-9 items-center justify-center rounded-lg"
                style={{
                  background: "var(--primary-light)",
                  color: "var(--primary)",
                }}
              >
                <UserRound size={18} />
              </div>

              <div>
                <h2
                  className="font-semibold"
                  style={{ color: "var(--foreground)" }}
                >
                  Información personal
                </h2>

                <p
                  className="mt-0.5 text-xs"
                  style={{
                    color: "var(--foreground-muted)",
                  }}
                >
                  Actualiza tus datos de contacto.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-5 p-5">
            {profileError && (
              <div
                className="rounded-lg border px-4 py-3 text-sm"
                style={{
                  background: "var(--danger-light)",
                  borderColor: "var(--danger)",
                  color: "var(--danger)",
                }}
              >
                {profileError}
              </div>
            )}

            {profileMessage && (
              <div
                className="rounded-lg border px-4 py-3 text-sm"
                style={{
                  background: "var(--success-light)",
                  borderColor: "var(--success)",
                  color: "var(--success)",
                }}
              >
                {profileMessage}
              </div>
            )}

            {/* NOMBRE */}
            <div>
              <label
                htmlFor="nombre"
                className="mb-1.5 block text-sm font-medium"
                style={{ color: "var(--foreground)" }}
              >
                Nombre completo
              </label>

              <input
                id="nombre"
                type="text"
                value={nombre}
                onChange={(event) =>
                  setNombre(event.target.value)
                }
                required
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition focus:ring-2"
                style={{
                  background: "var(--surface-muted)",
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                  outlineColor: "var(--primary)",
                }}
              />
            </div>

            {/* CORREO */}
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium"
                style={{ color: "var(--foreground)" }}
              >
                Correo electrónico
              </label>

              <input
                id="email"
                type="email"
                value={user?.email || ""}
                readOnly
                className="w-full cursor-not-allowed rounded-lg border px-3 py-2.5 text-sm outline-none"
                style={{
                  background: "var(--surface-muted)",
                  borderColor: "var(--border)",
                  color: "var(--foreground-muted)",
                }}
              />

              <p
                className="mt-1.5 text-xs"
                style={{
                  color: "var(--foreground-muted)",
                }}
              >
                El correo electrónico identifica tu cuenta y no
                puede modificarse desde aquí.
              </p>
            </div>

            {/* WHATSAPP */}
            <div>
              <label
                htmlFor="whatsapp"
                className="mb-1.5 block text-sm font-medium"
                style={{ color: "var(--foreground)" }}
              >
                Número de WhatsApp
              </label>

              <input
                id="whatsapp"
                type="tel"
                value={whatsapp}
                onChange={(event) =>
                  setWhatsapp(event.target.value)
                }
                placeholder="Ej. +57 300 123 4567"
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition"
                style={{
                  background: "var(--surface-muted)",
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              />

              <p
                className="mt-1.5 text-xs"
                style={{
                  color: "var(--foreground-muted)",
                }}
              >
                Este número puede utilizarse para las
                notificaciones habilitadas en tu cuenta.
              </p>
            </div>
          </div>

          <div
            className="flex justify-end border-t px-5 py-4"
            style={{ borderColor: "var(--border)" }}
          >
            <button
              type="submit"
              disabled={savingProfile}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: "var(--primary)",
                color: "var(--primary-foreground)",
              }}
            >
              <Save size={17} />

              {savingProfile
                ? "Guardando..."
                : "Guardar cambios"}
            </button>
          </div>
        </form>
      </div>

      {/* SEGURIDAD */}
      <form
        onSubmit={changePassword}
        className="overflow-hidden rounded-xl border"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div
          className="border-b px-5 py-4"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex size-9 items-center justify-center rounded-lg"
              style={{
                background: "var(--primary-light)",
                color: "var(--primary)",
              }}
            >
              <KeyRound size={18} />
            </div>

            <div>
              <h2
                className="font-semibold"
                style={{ color: "var(--foreground)" }}
              >
                Seguridad
              </h2>

              <p
                className="mt-0.5 text-xs"
                style={{
                  color: "var(--foreground-muted)",
                }}
              >
                Cambia la contraseña utilizada para acceder a
                tu cuenta.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5 p-5">
          {passwordError && (
            <div
              className="rounded-lg border px-4 py-3 text-sm"
              style={{
                background: "var(--danger-light)",
                borderColor: "var(--danger)",
                color: "var(--danger)",
              }}
            >
              {passwordError}
            </div>
          )}

          {passwordMessage && (
            <div
              className="rounded-lg border px-4 py-3 text-sm"
              style={{
                background: "var(--success-light)",
                borderColor: "var(--success)",
                color: "var(--success)",
              }}
            >
              {passwordMessage}
            </div>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            {/* CONTRASEÑA ACTUAL */}
            <div className="md:col-span-2">
              <label
                htmlFor="passwordActual"
                className="mb-1.5 block text-sm font-medium"
                style={{ color: "var(--foreground)" }}
              >
                Contraseña actual
              </label>

              <div className="relative">
                <input
                  id="passwordActual"
                  type={
                    showCurrentPassword
                      ? "text"
                      : "password"
                  }
                  value={passwordActual}
                  onChange={(event) =>
                    setPasswordActual(event.target.value)
                  }
                  autoComplete="current-password"
                  className="w-full rounded-lg border px-3 py-2.5 pr-11 text-sm outline-none transition"
                  style={{
                    background: "var(--surface-muted)",
                    borderColor: "var(--border)",
                    color: "var(--foreground)",
                  }}
                />

                <button
                  type="button"
                  aria-label={
                    showCurrentPassword
                      ? "Ocultar contraseña"
                      : "Mostrar contraseña"
                  }
                  onClick={() =>
                    setShowCurrentPassword(
                      (visible) => !visible
                    )
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 transition"
                  style={{
                    color: "var(--foreground-muted)",
                  }}
                >
                  {showCurrentPassword ? (
                    <EyeOff size={17} />
                  ) : (
                    <Eye size={17} />
                  )}
                </button>
              </div>
            </div>

            {/* NUEVA CONTRASEÑA */}
            <div>
              <label
                htmlFor="passwordNueva"
                className="mb-1.5 block text-sm font-medium"
                style={{ color: "var(--foreground)" }}
              >
                Nueva contraseña
              </label>

              <div className="relative">
                <input
                  id="passwordNueva"
                  type={
                    showNewPassword ? "text" : "password"
                  }
                  value={passwordNueva}
                  onChange={(event) =>
                    setPasswordNueva(event.target.value)
                  }
                  autoComplete="new-password"
                  className="w-full rounded-lg border px-3 py-2.5 pr-11 text-sm outline-none transition"
                  style={{
                    background: "var(--surface-muted)",
                    borderColor: "var(--border)",
                    color: "var(--foreground)",
                  }}
                />

                <button
                  type="button"
                  aria-label={
                    showNewPassword
                      ? "Ocultar contraseña"
                      : "Mostrar contraseña"
                  }
                  onClick={() =>
                    setShowNewPassword(
                      (visible) => !visible
                    )
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5"
                  style={{
                    color: "var(--foreground-muted)",
                  }}
                >
                  {showNewPassword ? (
                    <EyeOff size={17} />
                  ) : (
                    <Eye size={17} />
                  )}
                </button>
              </div>

              <p
                className="mt-1.5 text-xs"
                style={{
                  color: "var(--foreground-muted)",
                }}
              >
                Mínimo 8 caracteres.
              </p>
            </div>

            {/* CONFIRMACIÓN */}
            <div>
              <label
                htmlFor="passwordConfirmacion"
                className="mb-1.5 block text-sm font-medium"
                style={{ color: "var(--foreground)" }}
              >
                Confirmar nueva contraseña
              </label>

              <div className="relative">
                <input
                  id="passwordConfirmacion"
                  type={
                    showConfirmPassword
                      ? "text"
                      : "password"
                  }
                  value={passwordConfirmacion}
                  onChange={(event) =>
                    setPasswordConfirmacion(
                      event.target.value
                    )
                  }
                  autoComplete="new-password"
                  className="w-full rounded-lg border px-3 py-2.5 pr-11 text-sm outline-none transition"
                  style={{
                    background: "var(--surface-muted)",
                    borderColor: "var(--border)",
                    color: "var(--foreground)",
                  }}
                />

                <button
                  type="button"
                  aria-label={
                    showConfirmPassword
                      ? "Ocultar contraseña"
                      : "Mostrar contraseña"
                  }
                  onClick={() =>
                    setShowConfirmPassword(
                      (visible) => !visible
                    )
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5"
                  style={{
                    color: "var(--foreground-muted)",
                  }}
                >
                  {showConfirmPassword ? (
                    <EyeOff size={17} />
                  ) : (
                    <Eye size={17} />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div
          className="flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-2">
            <ShieldCheck
              size={16}
              style={{ color: "var(--success)" }}
            />

            <p
              className="text-xs"
              style={{
                color: "var(--foreground-muted)",
              }}
            >
              Tu contraseña se utiliza para proteger el acceso
              a tu cuenta.
            </p>
          </div>

          <button
            type="submit"
            disabled={savingPassword}
            className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: "var(--primary)",
              color: "var(--primary-foreground)",
            }}
          >
            <KeyRound size={17} />

            {savingPassword
              ? "Cambiando..."
              : "Cambiar contraseña"}
          </button>
        </div>
      </form>
    </section>
  );
}