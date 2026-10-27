"use client";

import { FormEvent, useState } from "react";
import { Save, ShieldCheck } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fetchApi } from "@/lib/api";
import { SecurityChangeButton } from "@/components/security/SecurityChangeButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function AdminAccountPage() {
  const { user, token, refreshUser } = useSession();
  const [name, setName] = useState<string | null>(null);
  const [gender, setGender] = useState<string | null>(null);
  const [documentNumber, setDocumentNumber] = useState<string | null>(null);
  const [domicile, setDomicile] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [professionalCard, setProfessionalCard] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileNotice, setProfileNotice] = useState("");

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
          genero: gender ?? user?.genero ?? "",
          numero_documento: documentNumber ?? user?.numero_documento ?? "",
          domicilio: domicile ?? user?.domicilio ?? "",
          direccion: address ?? user?.direccion ?? "",
          tarjeta_profesional: professionalCard ?? user?.tarjeta_profesional ?? "",
        }),
      });
      await refreshUser();
      setName(result.nombre_completo);
      setProfileNotice("Datos personales actualizados.");
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

  return (
    <section className="motion-swap mx-auto max-w-4xl space-y-6">
      <PageHeader
        overline="Panel Administrativo · Seguridad"
        title="Mi cuenta"
        description="Actualiza el correo de acceso y protege tu contraseña."
      />

      <section className="grid gap-4 md:grid-cols-3">
        <SecurityChangeButton action="email" title="Cambiar correo" token={token} whatsappAvailable={Boolean(user?.whatsapp_numero)} onComplete={refreshUser} />
        <SecurityChangeButton action="whatsapp" title="Cambiar WhatsApp" token={token} whatsappAvailable={Boolean(user?.whatsapp_numero)} onComplete={refreshUser} />
        <SecurityChangeButton action="password" title="Cambiar contraseña" token={token} whatsappAvailable={Boolean(user?.whatsapp_numero)} onComplete={refreshUser} />
      </section>

      <Card
        title="Datos personales"
        description="El correo se utiliza para iniciar sesión."
        action={<ShieldCheck className="size-5 text-primary" />}
      >
        {profileError && (
          <p
            role="alert"
            className="mb-4 rounded-[var(--radius-md)] border border-danger/30 bg-danger-light p-3 text-sm text-danger"
          >
            {profileError}
          </p>
        )}
        {profileNotice && (
          <p
            role="status"
            className="mb-4 rounded-[var(--radius-md)] border border-success/30 bg-success-light p-3 text-sm text-success"
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
              className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2.5"
            />
          </label>
          <div className="text-sm">
            <span className="font-medium">Correo de acceso</span>
            <p className="mt-1 rounded-[var(--radius-md)] border border-border bg-surface-secondary px-3 py-2.5">{user?.email || "No configurado"}</p>
          </div>
          <div className="text-sm">
            <span className="font-medium">WhatsApp</span>
            <p className="mt-1 rounded-[var(--radius-md)] border border-border bg-surface-secondary px-3 py-2.5">{user?.whatsapp_numero || "No configurado"}</p>
          </div>
          <label className="text-sm font-medium">
            Género para documentos
            <select
              value={gender ?? user?.genero ?? ""}
              onChange={(event) => setGender(event.target.value)}
              className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2.5"
            >
              <option value="">Sin especificar</option>
              <option value="MASCULINO">Masculino</option>
              <option value="FEMENINO">Femenino</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            Número de identificación
            <input maxLength={40} value={documentNumber ?? user?.numero_documento ?? ""} onChange={(event) => setDocumentNumber(event.target.value)} className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2.5" />
          </label>
          <label className="text-sm font-medium">
            Municipio / domicilio
            <input maxLength={120} value={domicile ?? user?.domicilio ?? ""} onChange={(event) => setDomicile(event.target.value)} className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2.5" />
          </label>
          <label className="text-sm font-medium">
            Dirección de notificación
            <input maxLength={300} value={address ?? user?.direccion ?? ""} onChange={(event) => setAddress(event.target.value)} className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2.5" />
          </label>
          <label className="text-sm font-medium">
            Tarjeta profesional
            <input maxLength={40} value={professionalCard ?? user?.tarjeta_profesional ?? ""} onChange={(event) => setProfessionalCard(event.target.value)} className="mt-1 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2.5" />
          </label>
          <div className="flex items-end">
            <Button
              type="submit"
              variant="primary"
              loading={savingProfile}
              icon={<Save className="size-4" />}
            >
              Guardar datos
            </Button>
          </div>
        </form>
      </Card>
    </section>
  );
}
