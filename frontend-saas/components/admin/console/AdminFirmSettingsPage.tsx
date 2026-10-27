"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { useSession } from "@/context/SessionContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";

type FirmSettings = {
  nombre: string; correo_contacto: string | null; correo_pqr: string | null;
  telefono: string; whatsapp: string; direccion: string; ciudad: string; pais: string;
  logo_url: string; sitio_web: string; zona_horaria: string; mostrar_contacto_publico: boolean;
  preferencias_notificacion: { email?: boolean; whatsapp?: boolean };
  parametros_generales: Record<string, unknown> & { contrato_abogado?: ContractAttorneySettings };
  updated_at?: string;
};

type ContractAttorneySettings = {
  nombre: string; genero: "MASCULINO" | "FEMENINO"; documento: string;
  tarjeta_profesional: string; correo: string; telefono: string; domicilio: string;
};

const DEFAULT_CONTRACT_ATTORNEY: ContractAttorneySettings = {
  nombre: "YEINNY ALEJANDRA MUÑOZ MARÍN", genero: "FEMENINO", documento: "40.328.563",
  tarjeta_profesional: "375.092", correo: "alejandramunozabg@outlook.com", telefono: "3508809878", domicilio: "SABANETA",
};

const EMPTY: FirmSettings = {
  nombre: "", correo_contacto: "", correo_pqr: "", telefono: "", whatsapp: "",
  direccion: "", ciudad: "", pais: "Colombia", logo_url: "", sitio_web: "",
  zona_horaria: "America/Bogota", mostrar_contacto_publico: true,
  preferencias_notificacion: { email: true, whatsapp: true }, parametros_generales: { contrato_abogado: DEFAULT_CONTRACT_ATTORNEY },
};

function normalizeFirmSettings(data: Partial<FirmSettings>): FirmSettings {
  return {
    ...EMPTY,
    ...data,
    telefono: data.telefono ?? "",
    whatsapp: data.whatsapp ?? "",
    direccion: data.direccion ?? "",
    ciudad: data.ciudad ?? "",
    pais: data.pais ?? "Colombia",
    logo_url: data.logo_url ?? "",
    sitio_web: data.sitio_web ?? "",
    preferencias_notificacion: { ...EMPTY.preferencias_notificacion, ...data.preferencias_notificacion },
    parametros_generales: {
      ...EMPTY.parametros_generales,
      ...data.parametros_generales,
      contrato_abogado: { ...DEFAULT_CONTRACT_ATTORNEY, ...data.parametros_generales?.contrato_abogado },
    },
  };
}

export default function AdminFirmSettingsPage() {
  const { token } = useSession();
  const [settings, setSettings] = useState<FirmSettings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!token) return;
    let active = true;
    fetchApi("/api/admin/configuracion/firma", { method: "GET", token })
      .then((data: FirmSettings) => { if (active) setSettings(normalizeFirmSettings(data)); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "No se pudo cargar la configuración de la firma."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const payload = {
        ...settings,
        correo_contacto: settings.correo_contacto?.trim() || null,
        correo_pqr: settings.correo_pqr?.trim() || null,
      };
      const result = await fetchApi("/api/admin/configuracion/firma", { method: "PUT", token, body: JSON.stringify(payload) });
      setSettings(normalizeFirmSettings(result));
      setNotice("Configuración de la firma guardada.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la configuración.");
    } finally { setSaving(false); }
  }

  const input = "mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground";
  const set = (key: keyof FirmSettings, value: string | boolean) => setSettings((current) => ({ ...current, [key]: value }));
  const attorney = settings.parametros_generales.contrato_abogado ?? DEFAULT_CONTRACT_ATTORNEY;
  const setAttorney = (key: keyof ContractAttorneySettings, value: string) => setSettings((current) => ({
    ...current,
    parametros_generales: {
      ...current.parametros_generales,
      contrato_abogado: { ...(current.parametros_generales.contrato_abogado ?? DEFAULT_CONTRACT_ATTORNEY), [key]: key === "correo" ? value : value.toUpperCase() },
    },
  }));

  return <section className="mx-auto max-w-5xl space-y-6">
    <PageHeader overline="Panel Administrativo · Firma" title="Configuración de la firma" description="Identidad, contacto público y parámetros operativos de la firma. Las credenciales técnicas se administran aparte en Integraciones." />
    {error && <p role="alert" className="rounded-md border border-danger/30 bg-danger-light p-3 text-sm text-danger">{error}</p>}
    {notice && <p role="status" className="rounded-md border border-success/30 bg-success-light p-3 text-sm text-success">{notice}</p>}
    {settings.updated_at && <p className="text-xs text-foreground-muted">Última actualización: {new Date(`${settings.updated_at.replace(/Z$/, "")}Z`).toLocaleString("es-CO", { timeZone: "America/Bogota" })}</p>}
    {loading ? <p className="py-12 text-center text-sm text-foreground-muted">Cargando configuración…</p> : <form onSubmit={save} className="space-y-5">
      <fieldset className="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2">
        <legend className="px-2 font-semibold">Identidad y presencia pública</legend>
        <label className="text-sm font-medium sm:col-span-2">Nombre de la firma<input required maxLength={180} className={input} value={settings.nombre} onChange={(e) => set("nombre", e.target.value)} /></label>
        <label className="text-sm font-medium sm:col-span-2">URL del logo<input type="url" className={input} value={settings.logo_url} onChange={(e) => set("logo_url", e.target.value)} placeholder="https://…" /></label>
        {settings.logo_url && <div className="sm:col-span-2"><p className="mb-2 text-xs text-foreground-muted">Vista previa del logo</p>{/* eslint-disable-next-line @next/next/no-img-element -- vista previa de una URL de logo que escribe el usuario; next/image exigiría declarar cada dominio. */}
          <img src={settings.logo_url} alt={`Logo de ${settings.nombre}`} className="max-h-24 max-w-64 object-contain" /></div>}
        <label className="text-sm font-medium sm:col-span-2">Sitio web<input type="url" className={input} value={settings.sitio_web} onChange={(e) => set("sitio_web", e.target.value)} placeholder="https://…" /></label>
      </fieldset>
      <fieldset className="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2">
        <legend className="px-2 font-semibold">Canales de contacto</legend>
        <label className="text-sm font-medium">Correo de contacto<input type="email" className={input} value={settings.correo_contacto ?? ""} onChange={(e) => set("correo_contacto", e.target.value)} /></label>
        <label className="text-sm font-medium">Correo PQR<input type="email" className={input} value={settings.correo_pqr ?? ""} onChange={(e) => set("correo_pqr", e.target.value)} /></label>
        <label className="text-sm font-medium">Teléfono<input type="tel" className={input} value={settings.telefono} onChange={(e) => set("telefono", e.target.value)} /></label>
        <label className="text-sm font-medium">WhatsApp con indicativo<input type="tel" className={input} value={settings.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} /></label>
        <label className="text-sm font-medium sm:col-span-2">Dirección<input className={input} value={settings.direccion} onChange={(e) => set("direccion", e.target.value)} /></label>
        <label className="text-sm font-medium">Ciudad / departamento<input className={input} value={settings.ciudad} onChange={(e) => set("ciudad", e.target.value)} /></label>
        <label className="text-sm font-medium">País<input className={input} value={settings.pais} onChange={(e) => set("pais", e.target.value)} /></label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={settings.mostrar_contacto_publico} onChange={(e) => set("mostrar_contacto_publico", e.target.checked)} />Mostrar los canales en comunicaciones públicas de correo</label>
      </fieldset>
      <fieldset className="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2">
        <legend className="px-2 font-semibold">Datos del abogado que aparecen en los contratos CPS</legend>
        <label className="text-sm font-medium">Nombre<input required maxLength={150} className={input} value={attorney.nombre} onChange={(e) => setAttorney("nombre", e.target.value)} /></label>
        <label className="text-sm font-medium">Género<select className={input} value={attorney.genero} onChange={(e) => setAttorney("genero", e.target.value)}><option value="FEMENINO">Femenino</option><option value="MASCULINO">Masculino</option></select></label>
        <label className="text-sm font-medium">Documento<input required maxLength={40} className={input} value={attorney.documento} onChange={(e) => setAttorney("documento", e.target.value)} /></label>
        <label className="text-sm font-medium">Tarjeta profesional<input required maxLength={40} className={input} value={attorney.tarjeta_profesional} onChange={(e) => setAttorney("tarjeta_profesional", e.target.value)} /></label>
        <label className="text-sm font-medium">Correo del abogado<input required type="email" maxLength={320} className={input} value={attorney.correo} onChange={(e) => setAttorney("correo", e.target.value)} /></label>
        <label className="text-sm font-medium">Teléfono del abogado<input required maxLength={40} className={input} value={attorney.telefono} onChange={(e) => setAttorney("telefono", e.target.value)} /></label>
        <label className="text-sm font-medium sm:col-span-2">Domicilio del abogado<input required maxLength={120} className={input} value={attorney.domicilio} onChange={(e) => setAttorney("domicilio", e.target.value)} /></label>
        <p className="text-xs text-foreground-muted sm:col-span-2">Estos datos precargan el formulario de cada contrato. Cada contrato guarda su propia versión; el encabezado y el pie de página del modelo permanecen intactos.</p>
      </fieldset>
      <fieldset className="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2">
        <legend className="px-2 font-semibold">Preferencias y parámetros generales</legend>
        <label className="text-sm font-medium">Zona horaria<input className={input} value={settings.zona_horaria} onChange={(e) => set("zona_horaria", e.target.value)} placeholder="America/Bogota" /></label>
        <div className="space-y-3 text-sm"><p className="font-medium">Canales habilitados para comunicaciones de la firma</p><label className="flex items-center gap-2"><input type="checkbox" checked={settings.preferencias_notificacion.email ?? true} onChange={(e) => setSettings((current) => ({ ...current, preferencias_notificacion: { ...current.preferencias_notificacion, email: e.target.checked } }))} />Correo</label><label className="flex items-center gap-2"><input type="checkbox" checked={settings.preferencias_notificacion.whatsapp ?? true} onChange={(e) => setSettings((current) => ({ ...current, preferencias_notificacion: { ...current.preferencias_notificacion, whatsapp: e.target.checked } }))} />WhatsApp</label></div>
        <p className="text-xs text-foreground-muted sm:col-span-2">Las preferencias de cada usuario y las credenciales SMTP/WhatsApp permanecen independientes. Los parámetros comerciales del SaaS se administran en Planes.</p>
      </fieldset>
      <div className="flex justify-end"><Button type="submit" variant="primary" loading={saving} icon={<Save className="size-4" />}>{saving ? "Guardando…" : "Guardar configuración"}</Button></div>
    </form>}
  </section>;
}
