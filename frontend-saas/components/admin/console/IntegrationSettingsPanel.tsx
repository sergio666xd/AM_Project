"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { fetchApi } from "@/lib/api";

type IntegrationSettings = {
  smtp_host: string;
  smtp_port: number;
  smtp_from: string;
  smtp_starttls: boolean;
  smtp_user: string;
  smtp_password_configurada: boolean;
  whatsapp_api_url: string;
  whatsapp_token_configurado: boolean;
  smtp_configurado: boolean;
  whatsapp_configurado: boolean;
};

const EMPTY_SETTINGS: IntegrationSettings = {
  smtp_host: "", smtp_port: 587, smtp_from: "", smtp_starttls: true,
  smtp_user: "", smtp_password_configurada: false, whatsapp_api_url: "",
  whatsapp_token_configurado: false, smtp_configurado: false, whatsapp_configurado: false,
};

export function IntegrationSettingsPanel({ token }: { token: string }) {
  const [settings, setSettings] = useState(EMPTY_SETTINGS);
  const [smtpPassword, setSmtpPassword] = useState("");
  const [whatsappToken, setWhatsappToken] = useState("");
  const [clearSmtpPassword, setClearSmtpPassword] = useState(false);
  const [clearWhatsappToken, setClearWhatsappToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    fetchApi("/api/admin/integraciones/configuracion", { method: "GET", token })
      .then((result: IntegrationSettings) => { if (active) setSettings(result); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "No fue posible cargar la configuración."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload: Record<string, string | number | boolean> = {
        smtp_host: settings.smtp_host,
        smtp_port: Number(settings.smtp_port),
        smtp_from: settings.smtp_from,
        smtp_starttls: settings.smtp_starttls,
        smtp_user: settings.smtp_user,
        whatsapp_api_url: settings.whatsapp_api_url,
      };
      if (smtpPassword) payload.smtp_password = smtpPassword;
      if (whatsappToken) payload.whatsapp_token = whatsappToken;
      if (clearSmtpPassword) payload.borrar_smtp_password = true;
      if (clearWhatsappToken) payload.borrar_whatsapp_token = true;
      const result = await fetchApi("/api/admin/integraciones/configuracion", {
        method: "PUT", token, body: JSON.stringify(payload),
      });
      setSettings(result);
      setSmtpPassword("");
      setWhatsappToken("");
      setClearSmtpPassword(false);
      setClearWhatsappToken(false);
      setNotice("Configuración guardada. Se aplicará en los próximos envíos, sin redeploy.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible guardar la configuración.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground";

  return (
    <form onSubmit={save} className="space-y-5 rounded-lg border border-border bg-surface p-4">
      <div>
        <h3 className="font-semibold">Credenciales de correo y WhatsApp</h3>
        <p className="mt-1 text-sm text-foreground-muted">Los secretos se cifran en la base de datos y nunca se muestran de vuelta. Los cambios rigen sin redeploy.</p>
      </div>
      {loading ? <p className="text-sm text-foreground-muted">Cargando configuración…</p> : <>
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-semibold">SMTP</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="grid gap-1 text-xs text-foreground-muted">Servidor<input className={inputClass} value={settings.smtp_host} onChange={(e) => setSettings({ ...settings, smtp_host: e.target.value })} autoComplete="off" /></label>
            <label className="grid gap-1 text-xs text-foreground-muted">Puerto<input className={inputClass} type="number" min="1" max="65535" value={settings.smtp_port} onChange={(e) => setSettings({ ...settings, smtp_port: Number(e.target.value) })} /></label>
            <label className="grid gap-1 text-xs text-foreground-muted">Remitente<input className={inputClass} type="email" value={settings.smtp_from} onChange={(e) => setSettings({ ...settings, smtp_from: e.target.value })} autoComplete="off" /></label>
            <label className="grid gap-1 text-xs text-foreground-muted">Usuario<input className={inputClass} value={settings.smtp_user} onChange={(e) => setSettings({ ...settings, smtp_user: e.target.value })} autoComplete="off" /></label>
            <label className="grid gap-1 text-xs text-foreground-muted">Contraseña SMTP<input className={inputClass} type="password" value={smtpPassword} onChange={(e) => { setSmtpPassword(e.target.value); setClearSmtpPassword(false); }} placeholder={settings.smtp_password_configurada ? "Configurada · dejar vacío para conservar" : "Sin configurar"} autoComplete="new-password" /></label>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.smtp_starttls} onChange={(e) => setSettings({ ...settings, smtp_starttls: e.target.checked })} />Usar STARTTLS</label>
          {settings.smtp_password_configurada && <label className="flex items-center gap-2 text-xs text-foreground-muted"><input type="checkbox" checked={clearSmtpPassword} onChange={(e) => { setClearSmtpPassword(e.target.checked); setSmtpPassword(""); }} />Borrar contraseña almacenada</label>}
        </fieldset>
        <fieldset className="space-y-3 border-t border-border pt-4">
          <legend className="mb-2 text-sm font-semibold">WhatsApp</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs text-foreground-muted sm:col-span-2">URL de envío<input className={inputClass} type="url" value={settings.whatsapp_api_url} onChange={(e) => setSettings({ ...settings, whatsapp_api_url: e.target.value })} placeholder="https://…" autoComplete="url" /></label>
            <label className="grid gap-1 text-xs text-foreground-muted">Token<input className={inputClass} type="password" value={whatsappToken} onChange={(e) => { setWhatsappToken(e.target.value); setClearWhatsappToken(false); }} placeholder={settings.whatsapp_token_configurado ? "Configurado · dejar vacío para conservar" : "Sin configurar"} autoComplete="new-password" /></label>
          </div>
          {settings.whatsapp_token_configurado && <label className="flex items-center gap-2 text-xs text-foreground-muted"><input type="checkbox" checked={clearWhatsappToken} onChange={(e) => { setClearWhatsappToken(e.target.checked); setWhatsappToken(""); }} />Borrar token almacenado</label>}
        </fieldset>
      </>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
      <button type="submit" disabled={loading || saving} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium !text-white disabled:opacity-50"><Save className="size-4" />{saving ? "Guardando…" : "Guardar credenciales"}</button>
    </form>
  );
}
