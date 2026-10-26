"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, ChevronRight, Database, Download, Eye, File, Folder, Home, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { apiRequest } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";

type Scope = "system" | "tp-registros";
type Association = { tipo: string; id: number; nombre: string; proceso?: string | null; cliente?: string | null; solicitud?: string | null; contrato_id?: number | null; usuario?: string };
type StoredFile = { key: string; size: number; last_modified: string | null; etag: string; associations: Association[]; orphan: boolean };
type FolderEntry = { prefix: string; name: string };
type Listing = { scope: Scope; bucket: string; prefix: string; folders: FolderEntry[]; files: StoredFile[]; is_truncated: boolean; next_token: string | null };

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(value)) : "—";
}

export default function AdminStoragePage() {
  const { token } = useSession();
  const [scope, setScope] = useState<Scope>("system");
  const [prefix, setPrefix] = useState("");
  const [listing, setListing] = useState<Listing | null>(null);
  const [pageTokens, setPageTokens] = useState<(string | null)[]>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [workingKey, setWorkingKey] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<StoredFile | null>(null);
  const [preview, setPreview] = useState<{ url: string; filename: string } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (requestedScope = scope, tokenValue = pageTokens[pageIndex]) => {
    if (!token) return;
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ scope: requestedScope, prefix });
      if (tokenValue) query.set("continuation_token", tokenValue);
      const response = await apiRequest(`/api/admin/almacenamiento/archivos?${query}`, { headers: { Authorization: `Bearer ${token}` } });
      setListing(await response.json());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar los archivos de R2.");
      setListing(null);
    } finally { setLoading(false); }
  }, [pageIndex, pageTokens, prefix, scope, token]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const visibleFiles = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es-CO");
    if (!term) return listing?.files ?? [];
    return (listing?.files ?? []).filter((file) => file.key.toLocaleLowerCase("es-CO").includes(term) || file.associations.some((association) => `${association.nombre} ${association.proceso ?? ""} ${association.cliente ?? ""} ${association.usuario ?? ""}`.toLocaleLowerCase("es-CO").includes(term)));
  }, [listing, search]);

  const crumbs = useMemo(() => prefix.split("/").filter(Boolean), [prefix]);

  function navigate(nextPrefix: string) {
    setPrefix(nextPrefix);
    setPageTokens([null]); setPageIndex(0); setSearch(""); setSelectedFile(null);
    setListing(null); setLoading(true);
  }

  function changeScope(value: Scope) {
    setScope(value); navigate(""); setNotice("");
  }

  async function openFile(file: StoredFile, mode: "preview" | "download") {
    if (!token) return;
    setWorkingKey(file.key); setError("");
    try {
      const query = new URLSearchParams({ scope, key: file.key, download: mode === "download" ? "true" : "false" });
      const response = await apiRequest(`/api/admin/almacenamiento/archivos/url-temporal?${query}`, { headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (mode === "preview") setPreview({ url: result.url, filename: result.filename });
      else {
        window.location.assign(result.url);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo abrir el archivo.");
    } finally { setWorkingKey(null); }
  }

  async function deleteFile(file: StoredFile) {
    if (!token) return;
    const references = file.associations.length
      ? ` También se retirarán ${file.associations.length} asociación(es): ${file.associations.map((item) => `${item.nombre} #${item.id}`).join(", ")}.`
      : " El archivo no tiene asociaciones registradas.";
    if (!window.confirm(`¿Eliminar permanentemente este objeto del bucket ${listing?.bucket}?\n\n${file.key}\n\n${references}\n\nEsta acción no se puede deshacer.`)) return;
    setWorkingKey(file.key); setError(""); setNotice("");
    try {
      const response = await apiRequest("/api/admin/almacenamiento/archivos/eliminar", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ scope, key: file.key, confirmar_asociaciones: true }) });
      const result = await response.json();
      setNotice(result.mensaje || "Archivo eliminado."); setSelectedFile(null); await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo eliminar el archivo."); await load();
    } finally { setWorkingKey(null); }
  }

  async function deleteFolder(folder: FolderEntry) {
    if (!token) return;
    const confirmation = window.prompt(
      `Esto eliminará recursivamente todos los archivos y sus asociaciones dentro de "${folder.prefix}" en el bucket ${listing?.bucket}. La operación no se puede deshacer.\n\nEscribe ELIMINAR CARPETA para continuar.`,
    );
    if (confirmation !== "ELIMINAR CARPETA") return;
    setWorkingKey(folder.prefix); setError(""); setNotice("");
    try {
      const response = await apiRequest("/api/admin/almacenamiento/carpetas/eliminar", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scope, prefix: folder.prefix, confirmacion: confirmation }),
      });
      const result = await response.json();
      setNotice(result.mensaje || "Carpeta eliminada.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo eliminar la carpeta.");
      await load();
    } finally { setWorkingKey(null); }
  }

  async function moveFile(file: StoredFile) {
    if (!token || scope !== "tp-registros") return;
    if (!window.confirm(`¿Mover ${file.key} al bucket del sistema y quitarlo de tp-registros? Las asociaciones registradas se conservarán.`)) return;
    setWorkingKey(file.key); setError(""); setNotice("");
    try {
      const response = await apiRequest("/api/admin/almacenamiento/archivos/mover-a-sistema", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ key: file.key }) });
      const result = await response.json();
      setNotice(result.mensaje || "Archivo movido al bucket del sistema."); setSelectedFile(null); await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo mover el archivo."); await load();
    } finally { setWorkingKey(null); }
  }

  function nextPage() {
    if (!listing?.next_token) return;
    setPageTokens([...pageTokens.slice(0, pageIndex + 1), listing.next_token]); setPageIndex(pageIndex + 1);
  }

  return <div className="space-y-5">
    <PageHeader
        title="Gestor de archivos R2"
        description="Explora las carpetas del almacenamiento, consulta las asociaciones y administra los archivos. Las tarjetas profesionales permanecen en su bucket reservado."
        action={<Button variant="outline" onClick={() => void load()} disabled={loading || workingKey !== null} icon={<RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />}>Actualizar</Button>}
      />

    <section className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
      <label className="min-w-56 text-sm font-medium">Almacenamiento<select value={scope} onChange={(event) => changeScope(event.target.value as Scope)} className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2"><option value="system">Sistema</option><option value="tp-registros">tp-registros · tarjetas profesionales</option></select></label>
      <label className="min-w-56 flex-1 text-sm font-medium">Buscar en esta carpeta<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, proceso o usuario" className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2" /></label>
      <div className="text-xs text-foreground-muted">{listing?.bucket && <span className="inline-flex items-center gap-1"><Database className="size-3.5" />{listing.bucket}</span>}</div>
    </section>

    <nav aria-label="Ruta de carpetas" className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
      <button type="button" onClick={() => navigate("")} className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-surface-secondary"><Home className="size-4" />Raíz</button>
      {crumbs.map((part, index) => {
        const target = `${crumbs.slice(0, index + 1).join("/")}/`;
        return <span key={target} className="inline-flex items-center gap-1"><ChevronRight className="size-4 text-foreground-muted" /><button type="button" onClick={() => navigate(target)} className="rounded px-2 py-1 hover:bg-surface-secondary">{part}</button></span>;
      })}
    </nav>

    {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger-100 p-3 text-sm text-danger">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-success/30 bg-success-100 p-3 text-sm text-success">{notice}</p>}
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      {loading && !listing ? <div className="grid min-h-48 place-items-center"><Loader2 className="size-6 animate-spin text-brand-700" /></div> : <div className="overflow-x-auto">
        <table className="w-full min-w-225 text-left text-sm"><thead className="bg-surface-secondary text-xs text-foreground-muted"><tr><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Asociaciones</th><th className="px-4 py-3">Tamaño</th><th className="px-4 py-3">Modificado</th><th className="px-4 py-3">Acciones</th></tr></thead><tbody>
          {(listing?.folders ?? []).map((folder) => <tr key={folder.prefix} className="border-t border-border"><td colSpan={5} className="px-4 py-2"><div className="flex items-center gap-2"><button type="button" onClick={() => navigate(folder.prefix)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-secondary"><Folder className="size-5 shrink-0 fill-amber-400/20 text-amber-600" /><span className="truncate font-medium">{folder.name}</span><span className="text-xs text-foreground-muted">Carpeta</span></button><button type="button" aria-label={`Eliminar carpeta ${folder.name}`} title="Eliminar carpeta y todo su contenido" disabled={workingKey !== null} onClick={() => void deleteFolder(folder)} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-danger/30 px-2 py-1.5 text-xs text-danger disabled:opacity-50">{workingKey === folder.prefix ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}<span className="hidden sm:inline">Eliminar carpeta</span></button></div></td></tr>)}
          {visibleFiles.map((file) => <tr key={file.key} className={`border-t border-border align-top ${selectedFile?.key === file.key ? "bg-brand-50" : ""}`}><td className="max-w-100 break-all px-4 py-3"><button type="button" onClick={() => setSelectedFile(file)} className="flex items-start gap-2 text-left"><File className="mt-0.5 size-4 shrink-0 text-brand-700" /><span><span className="block font-medium">{file.key.split("/").at(-1)}</span><span className="mt-1 block text-xs text-foreground-muted">{file.key}</span>{file.orphan && <span className="mt-2 inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-800">Sin asociación</span>}</span></button></td><td className="px-4 py-3">{file.associations.length ? <ul className="space-y-1">{file.associations.map((association) => <li key={`${association.tipo}-${association.id}`} className="text-xs"><span className="font-medium">{association.nombre} #{association.id}</span>{association.proceso && <span className="block text-foreground-muted">Expediente: {association.proceso}</span>}{association.solicitud && <span className="block text-foreground-muted">Solicitud: {association.solicitud}</span>}{(association.cliente || association.usuario) && <span className="block text-foreground-muted">Usuario: {association.cliente || association.usuario}</span>}{association.contrato_id && <span className="block text-foreground-muted">Contrato: #{association.contrato_id}</span>}</li>)}</ul> : <span className="text-xs text-foreground-muted">Sin vínculos en la base de datos</span>}</td><td className="whitespace-nowrap px-4 py-3 text-xs">{formatSize(file.size)}</td><td className="whitespace-nowrap px-4 py-3 text-xs text-foreground-muted">{formatDate(file.last_modified)}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-2"><button type="button" disabled={workingKey !== null} onClick={() => void openFile(file, "preview")} aria-label="Ver archivo" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs disabled:opacity-50"><Eye className="size-3.5" />Ver</button>{scope === "tp-registros" && !file.associations.some((item) => item.tipo === "tarjeta_profesional") && <button type="button" disabled={workingKey !== null} onClick={() => void moveFile(file)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs disabled:opacity-50"><ArrowRightLeft className="size-3.5" />Mover</button>}<button type="button" disabled={workingKey !== null} onClick={() => void deleteFile(file)} className="inline-flex items-center gap-1 rounded-md border border-danger/30 px-2 py-1.5 text-xs text-danger disabled:opacity-50">{workingKey === file.key ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}Eliminar</button></div></td></tr>)}
        </tbody></table>
        {!loading && (listing?.folders.length ?? 0) === 0 && visibleFiles.length === 0 && <div className="p-10 text-center"><Folder className="mx-auto size-9 text-foreground-muted/60" /><p className="mt-3 text-sm font-medium">{search.trim() ? "No hay resultados en esta carpeta." : prefix ? "Esta carpeta está vacía." : "Este bucket está vacío."}</p><p className="mt-1 text-xs text-foreground-muted">Cuando se carguen archivos o se creen carpetas, aparecerán aquí.</p></div>}
      </div>}
      <footer className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-foreground-muted"><span>{(listing?.folders.length ?? 0)} carpeta(s) · {visibleFiles.length} archivo(s) en esta página</span><button type="button" onClick={nextPage} disabled={!listing?.next_token || loading || workingKey !== null} className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-40">Siguiente página</button></footer>
    </section>

    {selectedFile && <div className="fixed inset-0 z-50 flex justify-end bg-brand-950/40 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedFile(null); }}><aside role="dialog" aria-modal="true" aria-label="Detalles del archivo" className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-surface p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Detalles del archivo</h2><p className="mt-1 break-all text-sm text-foreground-muted">{selectedFile.key}</p></div><button type="button" onClick={() => setSelectedFile(null)} aria-label="Cerrar detalles" className="rounded-md p-2 hover:bg-surface-secondary"><X className="size-5" /></button></div><dl className="mt-6 grid grid-cols-2 gap-4 rounded-lg border border-border p-4 text-sm"><div><dt className="text-xs text-foreground-muted">Tamaño</dt><dd className="mt-1">{formatSize(selectedFile.size)}</dd></div><div><dt className="text-xs text-foreground-muted">Modificado</dt><dd className="mt-1">{formatDate(selectedFile.last_modified)}</dd></div><div className="col-span-2"><dt className="text-xs text-foreground-muted">Bucket</dt><dd className="mt-1">{listing?.bucket}</dd></div><div className="col-span-2"><dt className="text-xs text-foreground-muted">ETag</dt><dd className="mt-1 break-all font-mono text-xs">{selectedFile.etag || "—"}</dd></div></dl><div className="mt-6"><h3 className="font-medium">Asociaciones</h3>{selectedFile.associations.length ? <ul className="mt-3 space-y-3">{selectedFile.associations.map((association) => <li key={`${association.tipo}-${association.id}`} className="rounded-lg border border-border p-3 text-sm"><p className="font-medium">{association.nombre} <span className="text-foreground-muted">#{association.id}</span></p><p className="mt-1 text-xs text-foreground-muted">{association.tipo}</p>{association.proceso && <p className="mt-1 text-xs">Expediente: {association.proceso}</p>}{association.solicitud && <p className="mt-1 text-xs">Solicitud: {association.solicitud}</p>}{(association.cliente || association.usuario) && <p className="mt-1 text-xs">Usuario: {association.cliente || association.usuario}</p>}{association.contrato_id && <p className="mt-1 text-xs">Contrato: #{association.contrato_id}</p>}</li>)}</ul> : <p className="mt-3 rounded-lg bg-surface-secondary p-3 text-sm text-foreground-muted">Este archivo no tiene asociaciones registradas.</p>}</div><div className="mt-6 flex flex-wrap gap-2"><button type="button" disabled={workingKey !== null} onClick={() => void openFile(selectedFile, "preview")} className="inline-flex items-center gap-2 rounded-md bg-brand-900 hover:bg-brand-950 px-3 py-2 text-sm text-white disabled:opacity-50"><Eye className="size-4" />Ver archivo</button><button type="button" disabled={workingKey !== null} onClick={() => void openFile(selectedFile, "download")} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"><Download className="size-4" />Descargar</button><button type="button" disabled={workingKey !== null} onClick={() => void deleteFile(selectedFile)} className="inline-flex items-center gap-2 rounded-md border border-danger/30 px-3 py-2 text-sm text-danger disabled:opacity-50"><Trash2 className="size-4" />Eliminar</button></div></aside></div>}
    {preview && <div className="fixed inset-0 z-[60] grid place-items-center bg-brand-950/40 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label={`Vista previa de ${preview.filename}`}><div className="flex h-[min(90vh,900px)] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"><header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3"><p className="truncate text-sm font-medium">{preview.filename}</p><button type="button" onClick={() => setPreview(null)} aria-label="Cerrar vista previa" className="rounded-md p-2 hover:bg-surface-secondary"><X className="size-5" /></button></header><iframe title={`Vista previa: ${preview.filename}`} src={preview.url} className="min-h-0 flex-1 bg-white" /></div></div>}
  </div>;
}
