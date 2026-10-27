"use client";

import Link from "next/link";
import { apiRequest } from "@/lib/api";

import { FormEvent, useState } from "react";
import { SecurityChangeButton } from "@/components/security/SecurityChangeButton";
import { Mail, Phone, Save, ShieldCheck, UserRound } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";


export default function PerfilAbogadoPage() {
  const { user, token, refreshUser } = useSession();
  const [contractProfileEdits, setContractProfileEdits] = useState<Partial<{ genero: string; numero_documento: string; domicilio: string; tarjeta_profesional: string }>>({});
  const contractProfile = {
    genero: contractProfileEdits.genero ?? user?.genero ?? "",
    numero_documento: (contractProfileEdits.numero_documento ?? user?.numero_documento ?? "").replace(/\./g, ""),
    domicilio: contractProfileEdits.domicilio ?? user?.domicilio ?? "",
    tarjeta_profesional: (contractProfileEdits.tarjeta_profesional ?? user?.tarjeta_profesional ?? "").replace(/\./g, ""),
  };

  const [nombreEditado, setNombreEditado] = useState<{ userId: number; value: string } | null>(null);
  const nombre = user && nombreEditado?.userId === user.id ? nombreEditado.value : user?.nombre_completo ?? "";

  const [savingProfile, setSavingProfile] = useState(false);

  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");


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
            ...contractProfile,
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
      setNombreEditado(null);
      setContractProfileEdits({});

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

  return (
    <section className="motion-swap mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* ENCABEZADO */}
      <PageHeader
        overline="Mi cuenta"
        title="Mi perfil"
        description="Administra tus datos personales y la seguridad de tu cuenta."
        action={
          <Link href="/gestion-procesos/abogado/configuracion" className="text-sm font-medium text-brand-900 underline hover:text-brand-800">
            Cambiar correo, WhatsApp o contraseña
          </Link>
        }
      />

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
                  Actualiza tus datos personales y la información que se usa al preparar contratos.
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
                onChange={(event) => user && setNombreEditado({ userId: user.id, value: event.target.value })}
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

            <div><p className="text-sm font-medium">Correo electrónico</p><p className="mt-1 text-sm text-[var(--foreground-muted)]">{user?.email || "No configurado"}</p></div>

            <div><p className="text-sm font-medium">WhatsApp</p><p className="mt-1 text-sm text-[var(--foreground-muted)]">{user?.whatsapp_numero || "No configurado"}</p></div>
            <fieldset className="grid gap-4 rounded-lg border border-[var(--border)] p-4 sm:grid-cols-2">
              <legend className="px-2 text-sm font-semibold">Datos para los contratos</legend>
              <label className="text-sm font-medium">Género<select value={contractProfile.genero} onChange={(event) => setContractProfileEdits({ ...contractProfileEdits, genero: event.target.value })} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5"><option value="">Sin especificar</option><option value="MASCULINO">Masculino</option><option value="FEMENINO">Femenino</option></select></label>
              <label className="text-sm font-medium">Documento<input maxLength={40} value={contractProfile.numero_documento} onChange={(event) => setContractProfileEdits({ ...contractProfileEdits, numero_documento: event.target.value })} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5" /></label>
              <label className="text-sm font-medium">Tarjeta profesional<input maxLength={40} value={contractProfile.tarjeta_profesional} onChange={(event) => setContractProfileEdits({ ...contractProfileEdits, tarjeta_profesional: event.target.value })} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5" /></label>
              <label className="text-sm font-medium">Domicilio<input maxLength={120} value={contractProfile.domicilio} onChange={(event) => setContractProfileEdits({ ...contractProfileEdits, domicilio: event.target.value })} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5" /></label>
            </fieldset>
          </div>

          <div className="flex justify-end border-t border-border px-5 py-4">
            <Button
              type="submit"
              variant="primary"
              loading={savingProfile}
              icon={<Save className="size-4" />}
            >
              {savingProfile ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        </form>
      </div>

      {/* SEGURIDAD */}
      <section className="space-y-4 rounded-xl border p-5" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <h2 className="font-semibold">Seguridad de la cuenta</h2>
        <div className="flex flex-wrap gap-3">
          <SecurityChangeButton action="email" title="Cambiar correo" token={token} whatsappAvailable={Boolean(user?.whatsapp_numero)} onComplete={refreshUser} />
          <SecurityChangeButton action="whatsapp" title="Cambiar WhatsApp" token={token} whatsappAvailable={Boolean(user?.whatsapp_numero)} onComplete={refreshUser} />
          <SecurityChangeButton action="password" title="Cambiar contraseña" token={token} whatsappAvailable={Boolean(user?.whatsapp_numero)} onComplete={refreshUser} />
        </div>
      </section>
    </section>
  );
}
