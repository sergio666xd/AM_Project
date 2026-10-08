"use client";

import { ChangeEvent, useCallback, useEffect, useState } from "react";
import { Download, Eye, FileText, Loader2, Mail, Printer, Save, ShieldCheck, X } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { useSession } from "@/context/SessionContext";

type ClientOption = { id: number; nombre_completo: string; email: string };
type SignedDocument = { id: number; nombre_archivo: string; mime_type: string; created_at: string } | null;
type Contract = {
  id: number; proceso_id: number; cliente_id: number; cliente: string; cliente_email: string;
  estado: "BORRADOR" | "LISTO_PARA_FIRMA" | "EN_FIRMA" | "FIRMADO" | "TERMINADO" | "ANULADO";
  version_actual: number; contenido: string; emitido_en?: string | null; firmado_en?: string | null;
  terminado_en?: string | null; motivo_terminacion?: string | null; documento_firmado: SignedDocument;
  versiones: { version: number; estado: string; hash_sha256: string; created_at: string }[];
};

const STATUS_LABEL: Record<Contract["estado"], string> = {
  BORRADOR: "Borrador", LISTO_PARA_FIRMA: "Listo para firma", EN_FIRMA: "En firma",
  FIRMADO: "Firmado", TERMINADO: "Terminado", ANULADO: "Anulado",
};

function localDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function ProcessContracts({ processId, clients, onChange }: {
  processId: number; clients: ClientOption[]; onChange: () => Promise<void>;
}) {
  const { token } = useSession();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [content, setContent] = useState("");
  const [clientId, setClientId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiRequest(`/api/contratos/proceso/${processId}`, { headers: { Authorization: `Bearer ${token}` } });
      const result = await data.json();
      if (!data.ok) throw new Error(result.detail || "No se pudieron cargar los contratos.");
      setContracts(result);
      const selected = result.find((item: Contract) => item.id === selectedId);
      if (selected) setContent(selected.contenido);
      else if (selectedId !== null) setSelectedId(null);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar los contratos.");
    } finally {
      setLoading(false);
    }
  }, [processId, selectedId, token]);

  // The effect starts an asynchronous request; state updates occur after the response.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  function selectContract(item: Contract) {
    setSelectedId(item.id);
    setContent(item.contenido);
    setClientId(String(item.cliente_id));
    setIsCreating(false);
    setError("");
    setMessage("");
  }

  async function createDraft() {
    if (!token || !clientId || !content.trim()) {
      setError("Selecciona primero el cliente asociado a este expediente.");
      return;
    }
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await apiRequest(`/api/contratos/proceso/${processId}`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ cliente_id: Number(clientId), contenido: content }),
      });
      const created = await response.json();
      if (!response.ok) throw new Error(created.detail || "No se pudo crear el borrador.");
      setContracts((current) => [created, ...current]);
      selectContract(created);
      setIsCreating(false);
      setMessage("Borrador creado. Puedes editar el contenido antes de guardarlo.");
      await onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear el contrato.");
    } finally {
      setBusy(false);
    }
  }

  async function startNewDraft() {
    if (!token || !clients.length) return;
    setBusy(true); setError(""); setMessage(""); setSelectedId(null);
    try {
      const response = await apiRequest("/api/contratos/plantilla", { headers: { Authorization: `Bearer ${token}` } });
      const template = await response.json();
      if (!response.ok) throw new Error(template.detail || "No se pudo cargar la plantilla.");
      setContent(template.contenido);
      setClientId(String(clients[0].id));
      setIsCreating(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar la plantilla.");
    } finally { setBusy(false); }
  }

  async function saveDraft() {
    if (!token || selectedId === null) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await apiRequest(`/api/contratos/${selectedId}`, {
        method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ contenido: content }),
      });
      const updated = await response.json();
      if (!response.ok) throw new Error(updated.detail || "No se pudo guardar el contrato.");
      setContracts((current) => current.map((item) => item.id === updated.id ? updated : item));
      setMessage("Borrador guardado como una nueva versión.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el contrato.");
    } finally { setBusy(false); }
  }

  async function changeStatus(estado: string, motivo?: string) {
    if (!token || selectedId === null) return;
    setBusy(true); setError(""); setMessage("");
    try {
      if (estado === "LISTO_PARA_FIRMA" && selected?.estado === "BORRADOR") {
        const savedResponse = await apiRequest(`/api/contratos/${selectedId}`, {
          method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ contenido: content }),
        });
        const saved = await savedResponse.json();
        if (!savedResponse.ok) throw new Error(saved.detail || "Guarda el contenido antes de emitir el contrato.");
        setContracts((current) => current.map((item) => item.id === saved.id ? saved : item));
      }
      const response = await apiRequest(`/api/contratos/${selectedId}/estado`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ estado, motivo }),
      });
      const updated = await response.json();
      if (!response.ok) throw new Error(updated.detail || "No se pudo actualizar el estado.");
      setContracts((current) => current.map((item) => item.id === updated.id ? updated : item));
      setContent(updated.contenido);
      setMessage(`Estado actualizado: ${STATUS_LABEL[updated.estado as Contract["estado"]] || updated.estado}.`);
      await onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo actualizar el estado.");
    } finally { setBusy(false); }
  }

  async function uploadSigned(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!token || selectedId === null || !file) return;
    const form = new FormData(); form.append("archivo", file);
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await apiRequest(`/api/contratos/${selectedId}/firmado`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "No se pudo cargar el contrato firmado.");
      setMessage(result.mensaje);
      await load();
      await onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar el contrato firmado.");
    } finally { setBusy(false); }
  }

  async function openTemplateReference() {
    if (!token) return;
    setBusy(true);
    try {
      const response = await apiRequest("/api/contratos/plantilla/referencia", { headers: { Authorization: `Bearer ${token}` } });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo abrir CPS.pdf.");
    } finally { setBusy(false); }
  }

  async function openSignedDocument(download: boolean) {
    if (!token || !selected?.documento_firmado) return;
    setBusy(true); setError("");
    try {
      const response = await apiRequest(`/api/expedientes/documentos/${selected.documento_firmado.id}/archivo`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || "No se pudo abrir el archivo firmado.");
      }
      const url = URL.createObjectURL(await response.blob());
      if (download) {
        const anchor = document.createElement("a"); anchor.href = url;
        anchor.download = selected.documento_firmado.nombre_archivo; anchor.click();
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo abrir el archivo firmado.");
    } finally { setBusy(false); }
  }

  async function retryEmail() {
    if (!token || selectedId === null) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await apiRequest(`/api/contratos/${selectedId}/reenviar-copia`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "No se pudo reenviar la copia.");
      setMessage(result.mensaje);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo reenviar la copia.");
    } finally { setBusy(false); }
  }

  const selected = contracts.find((item) => item.id === selectedId) ?? null;
  const canEdit = selected?.estado === "BORRADOR";

  return (
    <div className="space-y-4">
      <style jsx global>{`
        @page { size: letter; margin: 2.2cm 2.4cm; }
        @media print {
          body * { visibility: hidden !important; }
          .contract-print, .contract-print * { visibility: visible !important; }
          .contract-print { display: block !important; position: absolute; inset: 0; width: 100%; color: #111; background: white; }
          .contract-print-content { font-family: "Times New Roman", serif; font-size: 11pt; line-height: 1.35; white-space: pre-wrap; overflow-wrap: anywhere; }
        }
      `}</style>
      <div className="contract-editing space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-base font-semibold">Contratos de prestación de servicios</h2><p className="mt-1 text-sm text-[var(--foreground-muted)]">Los contratos se crean dentro de este expediente. El PDF listo para imprimir se genera al abrir la impresión y no se almacena.</p></div>
          <button type="button" onClick={() => void openTemplateReference()} disabled={busy} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">Consultar referencia CPS.pdf</button>
        </div>
        {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">{message}</p>}
        <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.5fr)]">
          <aside className="space-y-3 rounded-xl border border-[var(--border)] p-4">
            {contracts.map((item) => <button key={item.id} type="button" onClick={() => selectContract(item)} className={`w-full rounded-lg border p-3 text-left ${item.id === selectedId ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-[var(--border)]"}`}>
              <span className="flex items-start justify-between gap-2"><strong className="text-sm">Contrato #{item.id}</strong><span className="rounded-full bg-[var(--surface-secondary)] px-2 py-1 text-[10px]">{STATUS_LABEL[item.estado]}</span></span>
              <span className="mt-1 block text-xs text-[var(--foreground-muted)]">{item.cliente} · v{item.version_actual}</span>
            </button>)}
            {!contracts.length && !loading && <p className="text-sm text-[var(--foreground-muted)]">Aún no hay contratos en este expediente.</p>}
            {loading && <Loader2 className="size-4 animate-spin" />}
            {isCreating && <div className="space-y-2 border-t border-[var(--border)] pt-3">
              <label className="block text-xs font-medium">Cliente del expediente<select value={clientId} onChange={(event) => setClientId(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">{clients.map((client) => <option key={client.id} value={client.id}>{client.nombre_completo}</option>)}</select></label>
            </div>}
            {!isCreating && <button type="button" onClick={() => void startNewDraft()} disabled={!clients.length || busy} className="w-full rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Nuevo contrato</button>}
          </aside>
          <section className="min-w-0 space-y-3 rounded-xl border border-[var(--border)] p-4">
            {selected ? <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3"><div><h3 className="font-semibold">Contrato #{selected.id} · {selected.cliente}</h3><p className="text-xs text-[var(--foreground-muted)]">Estado: {STATUS_LABEL[selected.estado]} · Versión {selected.version_actual}</p></div>
                <div className="flex flex-wrap gap-2">
                  {canEdit && <button type="button" onClick={() => void saveDraft()} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-3 py-2 text-xs"><Save className="size-3.5"/>Guardar</button>}
                  {!['FIRMADO', 'TERMINADO', 'ANULADO'].includes(selected.estado) && <button type="button" onClick={() => window.print()} disabled={busy} className="inline-flex items-center gap-1 rounded-md bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white"><Printer className="size-3.5"/>Generar / imprimir PDF</button>}
                  {canEdit && <button type="button" onClick={() => void changeStatus("LISTO_PARA_FIRMA")} disabled={busy || !content.trim()} className="rounded-md border border-[var(--border)] px-3 py-2 text-xs">Listo para firma</button>}
                  {selected.estado === "FIRMADO" && selected.documento_firmado && <><button type="button" onClick={() => void openSignedDocument(false)} className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-3 py-2 text-xs"><Eye className="size-3.5"/>Ver firmado</button><button type="button" onClick={() => void openSignedDocument(true)} className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-3 py-2 text-xs"><Download className="size-3.5"/>Descargar</button><button type="button" onClick={() => void retryEmail()} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-3 py-2 text-xs"><Mail className="size-3.5"/>Reenviar copia</button></>}
                  {selected.estado === "FIRMADO" && <button type="button" onClick={() => { const reason = window.prompt("Motivo/causal de terminación del contrato:"); if (reason?.trim()) void changeStatus("TERMINADO", reason.trim()); }} disabled={busy} className="rounded-md border border-[var(--border)] px-3 py-2 text-xs">Terminar</button>}
                  {selected.estado === "EN_FIRMA" && <label className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white"><ShieldCheck className="size-3.5"/>Cargar firmado<input className="sr-only" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => void uploadSigned(event)} /></label>}
                  {["BORRADOR", "LISTO_PARA_FIRMA", "EN_FIRMA"].includes(selected.estado) && <button type="button" onClick={() => { const reason = window.prompt("Motivo de anulación:"); if (reason?.trim()) void changeStatus("ANULADO", reason.trim()); }} disabled={busy} className="rounded-md border border-red-500/30 px-3 py-2 text-xs text-red-700">Anular</button>}
                </div>
              </div>
              {canEdit ? <label className="block text-sm font-medium">Contenido editable completo<textarea value={content} onChange={(event) => setContent(event.target.value)} rows={24} maxLength={120000} className="mt-2 w-full resize-y rounded-lg border border-[var(--border)] bg-white p-5 font-serif text-sm leading-7 text-slate-900 shadow-inner" /></label>
                : <div className="rounded-md bg-[var(--surface-secondary)] p-3 text-xs text-[var(--foreground-muted)]">Esta versión está congelada. Para hacer cambios se debe crear una nueva versión contractual.</div>}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--foreground-muted)]"><span>Emitido: {localDate(selected.emitido_en)}</span><span>Firmado: {localDate(selected.firmado_en)}</span><span>Terminado: {localDate(selected.terminado_en)}</span></div>
              <details><summary className="cursor-pointer text-xs font-medium">Historial de versiones</summary><ol className="mt-2 space-y-1 text-xs text-[var(--foreground-muted)]">{selected.versiones.map((version) => <li key={version.version}>v{version.version} · {STATUS_LABEL[version.estado as Contract["estado"]] || version.estado} · {localDate(version.created_at)} · SHA-256 {version.hash_sha256.slice(0, 12)}</li>)}</ol></details>
            </> : isCreating ? <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-semibold">Nuevo contrato · Expediente #{processId}</h3><button type="button" onClick={() => setIsCreating(false)} aria-label="Cerrar" className="rounded p-1"><X className="size-4"/></button></div><label className="block text-sm font-medium">Contenido contractual editable completo<textarea value={content} onChange={(event) => setContent(event.target.value)} rows={24} maxLength={120000} className="mt-2 w-full resize-y rounded-lg border border-[var(--border)] bg-white p-5 font-serif text-sm leading-7 text-slate-900 shadow-inner" /></label><button type="button" onClick={() => void createDraft()} disabled={busy || !clientId || !content.trim()} className="rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Guardando…" : "Guardar borrador"}</button></div>
              : <div className="grid min-h-48 place-items-center text-center text-sm text-[var(--foreground-muted)]"><div><FileText className="mx-auto mb-2 size-8 opacity-50"/>Selecciona un contrato o crea un borrador.</div></div>}
            {isCreating && <button type="button" onClick={() => window.print()} disabled={busy || !content.trim()} className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-3 py-2 text-xs"><Printer className="size-3.5"/>Vista de impresión</button>}
          </section>
        </div>
      </div>
      {(selected || isCreating) && <div className="contract-print hidden"><div className="contract-print-content">{content}</div></div>}
    </div>
  );
}
