"use client";

import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { Download, Eye, FileText, Loader2, Mail, Printer, Save, ShieldCheck, Trash2, X } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { useSession } from "@/context/SessionContext";

type ClientOption = { id: number; nombre_completo: string; email: string; whatsapp_numero?: string; genero?: string | null; numero_documento?: string | null; domicilio?: string | null; direccion?: string | null };
type ContractFields = Record<string, string>;
type FieldDefinition = [string, string, "text" | "email" | "tel" | "textarea" | "gender"];
type SignedDocument = { id: number; nombre_archivo: string; mime_type: string; created_at: string } | null;
type Contract = {
  id: number; proceso_id: number; cliente_id: number; cliente: string; cliente_email: string;
  estado: "BORRADOR" | "LISTO_PARA_FIRMA" | "EN_FIRMA" | "FIRMADO" | "TERMINADO" | "ANULADO";
  version_actual: number; campos: ContractFields; emitido_en?: string | null; firmado_en?: string | null;
  terminado_en?: string | null; motivo_terminacion?: string | null; documento_firmado: SignedDocument;
  versiones: { version: number; estado: string; hash_sha256: string; created_at: string }[];
};

const STATUS_LABEL: Record<Contract["estado"], string> = {
  BORRADOR: "Borrador", LISTO_PARA_FIRMA: "Listo para firma", EN_FIRMA: "En firma",
  FIRMADO: "Firmado", TERMINADO: "Terminado", ANULADO: "Anulado",
};

const FIELD_GROUPS: { title: string; fields: FieldDefinition[] }[] = [
  { title: "Datos del cliente", fields: [
    ["nombre", "Nombres y apellidos", "text"], ["genero_cliente", "Género del cliente", "gender"],
    ["documento", "Número de cédula", "text"], ["ciudad", "Domicilio / ciudad", "text"],
  ] },
  { title: "Condiciones del contrato", fields: [
    ["objeto", "Objeto del contrato", "textarea"], ["honorarios", "Honorarios pactados", "textarea"],
  ] },
  { title: "Notificaciones del cliente", fields: [
    ["direccion", "Dirección", "text"], ["correo", "Correo", "email"], ["telefono", "Teléfono", "tel"],
  ] },
  { title: "Datos del abogado", fields: [
    ["abogado_nombre", "Nombre del abogado", "text"], ["genero_abogado", "Género del abogado", "gender"],
    ["abogado_documento", "Documento del abogado", "text"], ["abogado_tarjeta", "Tarjeta profesional", "text"],
    ["abogado_correo", "Correo del abogado", "email"], ["abogado_telefono", "Teléfono del abogado", "tel"],
    ["abogado_domicilio", "Domicilio del abogado", "text"],
  ] },
  { title: "Suscripción", fields: [
    ["dia", "Día", "text"], ["mes", "Mes", "text"], ["anio", "Año", "text"],
  ] },
];

const EMPTY_FIELDS: ContractFields = Object.fromEntries(FIELD_GROUPS.flatMap((group) => group.fields.map(([key]) => [key, ""])));
const PRESERVE_CASE_FIELD_KEYS = new Set(["correo", "abogado_correo", "objeto", "honorarios"]);
const IDENTIFIER_FIELD_KEYS = new Set(["documento", "abogado_documento", "abogado_tarjeta"]);

function normalizeIdentifier(value: string) {
  return value.replace(/\./g, "");
}

function normalizeContractFields(value: ContractFields): ContractFields {
  return Object.fromEntries(Object.entries(value).map(([key, fieldValue]) => [
    key,
    IDENTIFIER_FIELD_KEYS.has(key)
      ? normalizeIdentifier(fieldValue)
      : PRESERVE_CASE_FIELD_KEYS.has(key) ? fieldValue : fieldValue.toLocaleUpperCase("es-CO"),
  ]));
}

function localDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(value));
}

export default function ProcessContracts({ processId, clients, onChange, initialContractId = null }: {
  processId: number; clients: ClientOption[]; onChange: () => Promise<void>; initialContractId?: number | null;
}) {
  const { token } = useSession();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [fields, setFields] = useState<ContractFields>(EMPTY_FIELDS);
  const [clientId, setClientId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [documentAction, setDocumentAction] = useState<"template" | "preview" | "view" | "download" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const appliedInitialId = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiRequest(`/api/contratos/proceso/${processId}`, { headers: { Authorization: `Bearer ${token}` } });
      const result = await data.json();
      if (!data.ok) throw new Error(result.detail || "No se pudieron cargar los contratos.");
      setContracts(result);
      const selected = result.find((item: Contract) => item.id === selectedId);
      if (selected) setFields(normalizeContractFields(selected.campos || EMPTY_FIELDS));
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

  useEffect(() => {
    if (initialContractId === null) {
      appliedInitialId.current = null;
      return;
    }
    if (appliedInitialId.current === initialContractId) return;
    const item = contracts.find((contract) => contract.id === initialContractId);
    if (!item) return;
    appliedInitialId.current = initialContractId;
    setSelectedId(item.id);
    setFields(normalizeContractFields(item.campos || EMPTY_FIELDS));
    setClientId(String(item.cliente_id));
    setIsCreating(false);
  }, [initialContractId, contracts]);

  function selectContract(item: Contract) {
    setSelectedId(item.id);
    setFields(normalizeContractFields(item.campos || EMPTY_FIELDS));
    setClientId(String(item.cliente_id));
    setIsCreating(false);
    setError("");
    setMessage("");
  }

  async function createDraft() {
    if (!token || !clientId) {
      setError("Selecciona primero el cliente asociado a este expediente.");
      return;
    }
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await apiRequest(`/api/contratos/proceso/${processId}`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ cliente_id: Number(clientId), campos: normalizeContractFields(fields) }),
      });
      const created = await response.json();
      if (!response.ok) throw new Error(created.detail || "No se pudo crear el borrador.");
      setContracts((current) => [created, ...current]);
      selectContract(created);
      setIsCreating(false);
      setMessage("Borrador creado con los datos del formulario. El texto, la identidad gráfica y la diagramación vienen de CPS.pdf.");
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
      const response = await apiRequest(`/api/contratos/plantilla?proceso_id=${processId}`, { headers: { Authorization: `Bearer ${token}` } });
      const template = await response.json();
      if (!response.ok) throw new Error(template.detail || "No se pudo cargar la plantilla.");
      const firstClient = clients[0];
      setFields(normalizeContractFields({ ...EMPTY_FIELDS, ...(template.campos_iniciales || {}), nombre: firstClient.nombre_completo, correo: firstClient.email || "", telefono: firstClient.whatsapp_numero || "", genero_cliente: firstClient.genero || "", documento: firstClient.numero_documento || "", ciudad: firstClient.domicilio || "", direccion: firstClient.direccion || "" }));
      setClientId(String(firstClient.id));
      setIsCreating(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar la plantilla.");
    } finally { setBusy(false); }
  }

  function changeDraftClient(value: string) {
    setClientId(value);
    const client = clients.find((item) => String(item.id) === value);
    if (!client) return;
    setFields((current) => normalizeContractFields({
      ...current,
      nombre: client.nombre_completo,
      correo: client.email || "",
      telefono: client.whatsapp_numero || "",
      genero_cliente: client.genero || "",
      documento: client.numero_documento || "",
      ciudad: client.domicilio || "",
      direccion: client.direccion || "",
    }));
  }

  function setContractField(key: string, value: string) {
    const normalizedValue = IDENTIFIER_FIELD_KEYS.has(key)
      ? normalizeIdentifier(value)
      : PRESERVE_CASE_FIELD_KEYS.has(key) ? value : value.toLocaleUpperCase("es-CO");
    setFields((current) => ({ ...current, [key]: normalizedValue }));
  }

  function renderField([key, label, kind]: FieldDefinition, disabled: boolean) {
    const common = "mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 text-sm disabled:opacity-70";
    const maxLength = key === "objeto" ? 1600 : key === "honorarios" ? 4000 : 320;
    return <label key={key} className={`block text-xs font-medium ${kind === "textarea" ? "sm:col-span-2" : ""}`}>
      {label}
      {kind === "gender" ? <select required value={fields[key] ?? ""} disabled={disabled} onChange={(event) => setContractField(key, event.target.value)} className={common}>
        <option value="">Selecciona</option><option value="MASCULINO">Masculino</option><option value="FEMENINO">Femenino</option>
      </select> : kind === "textarea" ? <textarea value={fields[key] ?? ""} onChange={(event) => setContractField(key, event.target.value)} maxLength={maxLength} rows={key === "objeto" ? 4 : 10} disabled={disabled} placeholder={key === "objeto" ? "EL CONTRATANTE encomienda a EL ABOGADO…" : undefined} className={common} /> : <input type={kind} value={fields[key] ?? ""} onChange={(event) => setContractField(key, event.target.value)} maxLength={maxLength} disabled={disabled} className={common} style={{ textTransform: PRESERVE_CASE_FIELD_KEYS.has(key) ? "none" : "uppercase" }} />}
    </label>;
  }

  async function saveDraft() {
    if (!token || selectedId === null) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await apiRequest(`/api/contratos/${selectedId}`, {
        method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ campos: normalizeContractFields(fields) }),
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
          body: JSON.stringify({ campos: normalizeContractFields(fields) }),
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
      setFields(normalizeContractFields(updated.campos || fields));
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
    if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
      setError("El documento firmado debe estar en formato PDF.");
      return;
    }
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
    if (!token || busy) return;
    setBusy(true);
    setDocumentAction("template");
    try {
      const response = await apiRequest("/api/contratos/plantilla/referencia", { headers: { Authorization: `Bearer ${token}` } });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo abrir CPS.pdf.");
    } finally { setBusy(false); setDocumentAction(null); }
  }

  async function previewPdf() {
    if (!token || !clientId || busy) return;
    const previewTab = window.open("about:blank", "_blank");
    setBusy(true); setError("");
    setDocumentAction("preview");
    try {
      const response = await apiRequest(`/api/contratos/proceso/${processId}/vista-previa`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ cliente_id: Number(clientId), campos: normalizeContractFields(fields) }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || "No se pudo generar la vista previa.");
      }
      const url = URL.createObjectURL(await response.blob());
      if (previewTab) previewTab.location.href = url;
      else {
        const anchor = document.createElement("a"); anchor.href = url; anchor.download = "contrato-cps.pdf"; anchor.click();
        setMessage("El navegador bloqueó la pestaña emergente; se descargó el PDF.");
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) {
      previewTab?.close();
      setError(cause instanceof Error ? cause.message : "No se pudo generar la vista previa.");
    } finally { setBusy(false); setDocumentAction(null); }
  }

  async function openSignedDocument(download: boolean) {
    if (!token || !selected?.documento_firmado || busy) return;
    setBusy(true); setError("");
    setDocumentAction(download ? "download" : "view");
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
    } finally { setBusy(false); setDocumentAction(null); }
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

  async function deleteAnnulledContract() {
    if (!token || selectedId === null || selected?.estado !== "ANULADO") return;
    const confirmed = window.confirm(`¿Eliminar permanentemente el contrato anulado #${selected.id}? Los documentos cargados se conservarán en el expediente y las actividades de firma activas se cancelarán.`);
    if (!confirmed) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await apiRequest(`/api/contratos/${selected.id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "No se pudo eliminar el contrato.");
      setContracts((current) => current.filter((item) => item.id !== selected.id));
      setSelectedId(null);
      setFields(EMPTY_FIELDS);
      setClientId("");
      setMessage(result.mensaje || "Contrato anulado eliminado.");
      await onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo eliminar el contrato.");
    } finally { setBusy(false); }
  }

  const selected = contracts.find((item) => item.id === selectedId) ?? null;
  const canEdit = selected?.estado === "BORRADOR";

  return (
    <div className="space-y-4">
      <style jsx global>{`
      `}</style>
      <div className="contract-editing space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-base font-semibold">Contrato de Prestación de Servicios</h2><p className="mt-1 text-sm text-[var(--foreground-muted)]">Plantilla legal CPS. El texto, colores, encabezado, pie, gráficos y páginas se conservan del modelo original. El PDF se genera en memoria.</p></div>
          <button type="button" onClick={() => void openTemplateReference()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50">{documentAction === "template" ? <><Loader2 className="size-4 animate-spin" />Abriendo…</> : "Consultar plantilla de referencia"}</button>
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
              <label className="block text-xs font-medium">Cliente del expediente<select value={clientId} onChange={(event) => changeDraftClient(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">{clients.map((client) => <option key={client.id} value={client.id}>{client.nombre_completo}</option>)}</select></label>
            </div>}
            {!isCreating && <button type="button" onClick={() => void startNewDraft()} disabled={!clients.length || busy} className="w-full rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-semibold !text-white disabled:opacity-50">Nuevo contrato</button>}
          </aside>
          <section className="min-w-0 space-y-3 rounded-xl border border-[var(--border)] p-4">
            {selected ? <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3"><div><h3 className="font-semibold">Contrato #{selected.id} · {selected.cliente}</h3><p className="text-xs text-[var(--foreground-muted)]">Estado: {STATUS_LABEL[selected.estado]} · Versión {selected.version_actual}</p></div>
                <div className="flex flex-wrap gap-2">
                  {canEdit && <button type="button" onClick={() => void saveDraft()} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-3 py-2 text-xs"><Save className="size-3.5"/>Guardar</button>}
                  {!['FIRMADO', 'TERMINADO', 'ANULADO'].includes(selected.estado) && <button type="button" onClick={() => void previewPdf()} disabled={busy} className="inline-flex items-center gap-1 rounded-md bg-[var(--primary)] px-3 py-2 text-xs font-semibold !text-white disabled:opacity-50">{documentAction === "preview" ? <><Loader2 className="size-3.5 animate-spin"/>Generando…</> : <><Printer className="size-3.5"/>Vista previa PDF</>}</button>}
                  {canEdit && <button type="button" onClick={() => void changeStatus("LISTO_PARA_FIRMA")} disabled={busy} className="rounded-md border border-[var(--border)] px-3 py-2 text-xs">Listo para firma</button>}
                  {selected.estado === "FIRMADO" && selected.documento_firmado && <><button type="button" onClick={() => void openSignedDocument(false)} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-3 py-2 text-xs disabled:opacity-50">{documentAction === "view" ? <><Loader2 className="size-3.5 animate-spin"/>Abriendo…</> : <><Eye className="size-3.5"/>Ver firmado</>}</button><button type="button" onClick={() => void openSignedDocument(true)} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-3 py-2 text-xs disabled:opacity-50">{documentAction === "download" ? <><Loader2 className="size-3.5 animate-spin"/>Descargando…</> : <><Download className="size-3.5"/>Descargar</>}</button><button type="button" onClick={() => void retryEmail()} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-3 py-2 text-xs"><Mail className="size-3.5"/>Reenviar copia</button></>}
                  {selected.estado === "FIRMADO" && <button type="button" onClick={() => { if (window.confirm("¿Reabrir la firma? La actividad volverá a Programado y podrás cargar otra versión del PDF.")) void changeStatus("EN_FIRMA"); }} disabled={busy} className="rounded-md border border-[var(--border)] px-3 py-2 text-xs">Reabrir firma</button>}
                  {selected.estado === "FIRMADO" && <button type="button" onClick={() => { const reason = window.prompt("Motivo/causal de terminación del contrato:"); if (reason?.trim()) void changeStatus("TERMINADO", reason.trim()); }} disabled={busy} className="rounded-md border border-[var(--border)] px-3 py-2 text-xs">Terminar</button>}
                  {["EN_FIRMA", "FIRMADO"].includes(selected.estado) && <label className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-[var(--primary)] px-3 py-2 text-xs font-semibold !text-white"><ShieldCheck className="size-3.5"/>{selected.estado === "FIRMADO" ? "Reemplazar PDF firmado" : "Cargar firmado"}<input className="sr-only" type="file" accept=".pdf,application/pdf" onChange={(event) => void uploadSigned(event)} /></label>}
                  {["BORRADOR", "LISTO_PARA_FIRMA", "EN_FIRMA"].includes(selected.estado) && <button type="button" onClick={() => { const reason = window.prompt("Motivo de anulación:"); if (reason?.trim()) void changeStatus("ANULADO", reason.trim()); }} disabled={busy} className="rounded-md border border-red-500/30 px-3 py-2 text-xs text-red-700">Anular</button>}
                  {selected.estado === "ANULADO" && <button type="button" onClick={() => void deleteAnnulledContract()} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-red-500/30 px-3 py-2 text-xs text-red-700 disabled:opacity-50">{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}{busy ? "Eliminando…" : "Eliminar contrato"}</button>}
                </div>
              </div>
              <div className="space-y-5">{FIELD_GROUPS.map((group) => <fieldset key={group.title} className="grid gap-3 rounded-lg border border-[var(--border)] p-3 sm:grid-cols-2"><legend className="px-1 text-xs font-semibold">{group.title}</legend>{group.fields.map((field) => renderField(field, !canEdit))}</fieldset>)}</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--foreground-muted)]"><span>Emitido: {localDate(selected.emitido_en)}</span><span>Firmado: {localDate(selected.firmado_en)}</span><span>Terminado: {localDate(selected.terminado_en)}</span></div>
              <details><summary className="cursor-pointer text-xs font-medium">Historial de versiones</summary><ol className="mt-2 space-y-1 text-xs text-[var(--foreground-muted)]">{selected.versiones.map((version) => <li key={version.version}>v{version.version} · {STATUS_LABEL[version.estado as Contract["estado"]] || version.estado} · {localDate(version.created_at)} · SHA-256 {version.hash_sha256.slice(0, 12)}</li>)}</ol></details>
            </> : isCreating ? <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-semibold">Nuevo contrato · Expediente #{processId}</h3><button type="button" onClick={() => setIsCreating(false)} aria-label="Cerrar" className="rounded p-1"><X className="size-4"/></button></div><div className="space-y-5">{FIELD_GROUPS.map((group) => <fieldset key={group.title} className="grid gap-3 rounded-lg border border-[var(--border)] p-3 sm:grid-cols-2"><legend className="px-1 text-xs font-semibold">{group.title}</legend>{group.fields.map((field) => renderField(field, false))}</fieldset>)}</div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void createDraft()} disabled={busy || !clientId} className="rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-semibold !text-white disabled:opacity-50">{busy ? "Guardando…" : "Guardar borrador"}</button><button type="button" onClick={() => void previewPdf()} disabled={busy || !clientId} className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-3 py-2 text-sm">{documentAction === "preview" ? <><Loader2 className="size-4 animate-spin"/>Generando…</> : <><Eye className="size-4"/>Vista previa PDF</>}</button></div></div>
              : <div className="grid min-h-48 place-items-center text-center text-sm text-[var(--foreground-muted)]"><div><FileText className="mx-auto mb-2 size-8 opacity-50"/>Selecciona un contrato o crea un borrador.</div></div>}
          </section>
        </div>
      </div>
    </div>
  );
}
