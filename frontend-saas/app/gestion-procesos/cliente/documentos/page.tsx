"use client";

import { apiRequest } from "@/lib/api";
import Link from "next/link";

import { ChangeEvent, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Download, FileText, FileUp, Loader2, RefreshCw, Upload } from "lucide-react";
import { useSession } from "@/context/SessionContext";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
	"application/pdf",
	"image/jpeg",
	"image/png",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

type Request = {
	id: number;
	proceso: string;
	titulo: string;
	instrucciones?: string | null;
	atendida_en?: string | null;
	created_at: string;
};

type Document = {
	id: number;
	proceso_id: number;
	solicitud_id: number | null;
	contrato_id?: number | null;
	proceso: string;
	nombre_archivo: string;
	mime_type: string;
	estado_revision: string;
	comentario_revision?: string | null;
	created_at: string;
};

type DocumentsData = { solicitudes: Request[]; documentos: Document[] };

async function fetchDocuments(token: string): Promise<DocumentsData> {
	const response = await apiRequest(`/api/expedientes/documentos`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	const data = await response.json();
	if (!response.ok) throw new Error(data.detail || "No fue posible cargar los documentos.");
	return data;
}

export default function DocumentosClientePage() {
	const { token, loading: sessionLoading } = useSession();
	const [data, setData] = useState<DocumentsData>({ solicitudes: [], documentos: [] });
	const [files, setFiles] = useState<Record<number, File | null>>({});
	const [loading, setLoading] = useState(true);
	const [workingId, setWorkingId] = useState<number | null>(null);
	const [downloadingId, setDownloadingId] = useState<number | null>(null);
	const [documentAction, setDocumentAction] = useState<"view" | "download" | null>(null);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");

	useEffect(() => {
		if (sessionLoading || !token) return;
		let active = true;
		fetchDocuments(token)
			.then((result) => { if (active) setData(result); })
			.catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "No fue posible cargar los documentos."); })
			.finally(() => { if (active) setLoading(false); });
		return () => { active = false; };
	}, [sessionLoading, token]);

	async function reload() {
		if (!token) return;
		setLoading(true);
		setError("");
		try {
			setData(await fetchDocuments(token));
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "No fue posible cargar los documentos.");
		} finally {
			setLoading(false);
		}
	}

	function selectFile(requestId: number, event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0] ?? null;
		setError("");
		if (file && !ALLOWED_TYPES.has(file.type)) {
			setFiles((current) => ({ ...current, [requestId]: null }));
			setError("El archivo debe ser PDF, JPG, PNG o DOCX.");
			return;
		}
		if (file && file.size > MAX_FILE_SIZE) {
			setFiles((current) => ({ ...current, [requestId]: null }));
			setError("El archivo no puede superar 15 MB.");
			return;
		}
		setFiles((current) => ({ ...current, [requestId]: file }));
	}

	async function upload(requestId: number) {
		const file = files[requestId];
		if (!token || !file) return;
		setWorkingId(requestId);
		setError("");
		setNotice("");
		try {
			const form = new FormData();
			form.append("archivo", file);
			const response = await apiRequest(`/api/expedientes/solicitudes-documento/${requestId}/archivo`, {
				method: "POST",
				headers: { Authorization: `Bearer ${token}` },
				body: form,
			});
			const result: { detail?: string } = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(result.detail || "No fue posible cargar el documento.");
			setFiles((current) => ({ ...current, [requestId]: null }));
			setNotice("Documento entregado correctamente.");
			await reload();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "No fue posible cargar el documento.");
		} finally {
			setWorkingId(null);
		}
	}

	async function download(document: Document) {
		if (!token) return;
		if (downloadingId !== null) return;
		setDownloadingId(document.id);
		setDocumentAction("download");
		setError("");
		try {
			const response = await apiRequest(`/api/expedientes/documentos/${document.id}/archivo`, {
				headers: { Authorization: `Bearer ${token}` },
			});
			if (!response.ok) {
				const result: { detail?: string } = await response.json().catch(() => ({}));
				throw new Error(result.detail || "No fue posible descargar el documento.");
			}
			const url = URL.createObjectURL(await response.blob());
			const anchor = window.document.createElement("a");
			anchor.href = url;
			anchor.download = document.nombre_archivo;
			anchor.click();
			URL.revokeObjectURL(url);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "No fue posible descargar el documento.");
		} finally {
			setDownloadingId(null);
			setDocumentAction(null);
		}
	}

	async function preview(document: Document) {
		if (!token) return;
		if (downloadingId !== null) return;
		setDownloadingId(document.id);
		setDocumentAction("view");
		setError("");
		try {
			const response = await apiRequest(`/api/expedientes/documentos/${document.id}/archivo`, { headers: { Authorization: `Bearer ${token}` } });
			if (!response.ok) {
				const result: { detail?: string } = await response.json().catch(() => ({}));
				throw new Error(result.detail || "No fue posible abrir el contrato.");
			}
			const url = URL.createObjectURL(await response.blob());
			const opened = window.open(url, "_blank", "noopener,noreferrer");
			if (!opened) {
				const anchor = window.document.createElement("a");
				anchor.href = url;
				anchor.download = document.nombre_archivo;
				anchor.click();
			}
			window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "No fue posible abrir el contrato.");
		} finally {
			setDownloadingId(null);
			setDocumentAction(null);
		}
	}

	const documentGroups = [
		{ key: "EN_REVISION", title: "En revisión" },
		{ key: "RECIBIDO", title: "Recibidos" },
		{ key: "APROBADO", title: "Aprobados" },
		{ key: "REQUIERE_CORRECCION", title: "Requieren corrección" },
		{ key: "RECHAZADO", title: "No aprobados" },
	];
	const contractDocuments = data.documentos.filter((document) => Boolean(document.contrato_id));
	const uploadedDocuments = data.documentos.filter((document) => !document.contrato_id);

	return (
		<section className="mx-auto max-w-5xl space-y-6">
			<header className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<p className="text-sm text-(--foreground-muted)">Portal del cliente</p>
					<h1 className="mt-1 text-2xl font-semibold text-foreground">Documentos</h1>
					<p className="mt-1 text-sm text-(--foreground-muted)">Solicitudes de tus procesos y archivos entregados.</p>
				</div>
				<button type="button" onClick={() => void reload()} disabled={loading || sessionLoading} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-hover disabled:opacity-50">
					<RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
				</button>
			</header>

			{error && <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-700"><AlertCircle className="size-4 shrink-0" />{error}</div>}
			{notice && <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-700/20 bg-surface p-4 text-sm text-emerald-700"><CheckCircle2 className="size-4 shrink-0" />{notice}</div>}

			{loading || sessionLoading ? <div className="flex min-h-40 items-center justify-center gap-3 text-sm text-(--foreground-muted)"><RefreshCw className="size-5 animate-spin" />Cargando documentos...</div> : <>
				<section className="space-y-3">
					<div><h2 className="font-semibold text-foreground">Solicitudes pendientes</h2><p className="mt-1 text-sm text-(--foreground-muted)">Entrega los archivos solicitados por tu abogado.</p></div>
					{data.solicitudes.filter((item) => !item.atendida_en).length ? data.solicitudes.filter((item) => !item.atendida_en).map((request) => (
						<article id={`solicitud-${request.id}`} key={request.id} className="rounded-lg border border-border bg-surface p-4 sm:p-5">
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div><p className="text-xs text-(--foreground-muted)">{request.proceso}</p><h3 className="mt-1 font-medium text-foreground">{request.titulo}</h3>{request.instrucciones && <p className="mt-1 text-sm text-(--foreground-muted)">{request.instrucciones}</p>}</div>
								<span className="rounded-md bg-amber-500/10 px-2.5 py-1 text-xs text-amber-700">Pendiente</span>
							</div>
							<div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
								<label className="flex-1 text-sm"><span className="sr-only">Archivo para {request.titulo}</span><input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => selectFile(request.id, event)} className="block w-full text-sm text-(--foreground-muted) file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-secondary file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground" /></label>
								<button type="button" onClick={() => void upload(request.id)} disabled={!files[request.id] || workingId !== null} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"><Upload className="size-4" />{workingId === request.id ? "Entregando..." : "Entregar archivo"}</button>
							</div>
							<p className="mt-2 text-xs text-(--foreground-muted)">PDF, JPG, PNG o DOCX; máximo 15 MB.</p>
						</article>
					)) : <div className="rounded-lg border border-dashed border-border px-5 py-8 text-center text-sm text-(--foreground-muted)"><FileUp className="mx-auto mb-2 size-6" />No tienes solicitudes pendientes.</div>}
				</section>

				<section className="space-y-3">
					<div><h2 className="font-semibold text-foreground">Documentos entregados</h2><p className="mt-1 text-sm text-(--foreground-muted)">Archivos asociados a tus procesos.</p></div>
					{uploadedDocuments.length ? <div className="space-y-4">{documentGroups.map((group) => { const documents = uploadedDocuments.filter((document) => (document.estado_revision || "RECIBIDO") === group.key); return documents.length ? <section key={group.key} className="overflow-hidden rounded-lg border border-border bg-surface"><h3 className="border-b border-border px-4 py-3 text-sm font-semibold">{group.title} <span className="text-(--foreground-muted)">({documents.length})</span></h3>{documents.map((document, index) => <div key={document.id} className={`flex flex-wrap items-center justify-between gap-4 px-4 py-3 ${index ? "border-t border-border" : ""}`}><div className="flex min-w-0 items-center gap-3"><FileText className="size-5 shrink-0 text-[var(--primary)]" /><div className="min-w-0"><p className="truncate text-sm font-medium text-foreground">{document.nombre_archivo}</p><p className="mt-0.5 truncate text-xs text-(--foreground-muted)">{document.proceso} · {new Date(document.created_at).toLocaleDateString("es-CO")}</p>{document.comentario_revision && <p className="mt-1 text-sm text-amber-800">Comentario: {document.comentario_revision}</p>}</div></div><div className="flex gap-2"><Link href={`/gestion-procesos/cliente/documentos#solicitud-${document.solicitud_id}`} className="inline-flex items-center rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-hover">{document.estado_revision === "REQUIERE_CORRECCION" ? "Reemplazar" : "Ver solicitud"}</Link><button type="button" onClick={() => void download(document)} disabled={downloadingId !== null} aria-label={`Descargar ${document.nombre_archivo}`} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-surface-hover disabled:opacity-50">{downloadingId === document.id && documentAction === "download" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}{downloadingId === document.id && documentAction === "download" ? "Descargando…" : "Descargar"}</button></div></div>)}</section> : null; })}</div> : <div className="rounded-lg border border-dashed border-border px-5 py-8 text-center text-sm text-(--foreground-muted)"><FileText className="mx-auto mb-2 size-6" />Aún no has entregado documentos.</div>}
				</section>

				<section className="space-y-3"><div><h2 className="font-semibold text-foreground">Contratos firmados</h2><p className="mt-1 text-sm text-(--foreground-muted)">Documentos oficiales asociados a tus procesos.</p></div>{contractDocuments.length ? <div className="overflow-hidden rounded-lg border border-border bg-surface">{contractDocuments.map((document, index) => <article key={document.id} className={`flex flex-wrap items-center justify-between gap-4 px-4 py-3 ${index ? "border-t border-border" : ""}`}><div className="flex min-w-0 items-center gap-3"><FileText className="size-5 shrink-0 text-[var(--primary)]" /><div className="min-w-0"><p className="truncate text-sm font-medium text-foreground">{document.nombre_archivo}</p><p className="mt-1 truncate text-xs text-(--foreground-muted)">{document.proceso} · Contrato #{document.contrato_id} · {new Date(document.created_at).toLocaleDateString("es-CO")}</p></div></div><div className="flex gap-2"><button type="button" onClick={() => void preview(document)} disabled={downloadingId !== null} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-hover disabled:opacity-50">{downloadingId === document.id && documentAction === "view" ? <><Loader2 className="size-4 animate-spin" />Abriendo…</> : "Ver PDF"}</button><button type="button" onClick={() => void download(document)} disabled={downloadingId !== null} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-hover disabled:opacity-50">{downloadingId === document.id && documentAction === "download" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}{downloadingId === document.id && documentAction === "download" ? "Descargando…" : "Descargar"}</button></div></article>)}</div> : <div className="rounded-lg border border-dashed border-border px-5 py-8 text-center text-sm text-(--foreground-muted)"><FileText className="mx-auto mb-2 size-6" />Los contratos firmados de tus procesos aparecerán aquí.</div>}</section>
			</>}
		</section>
	);
}
