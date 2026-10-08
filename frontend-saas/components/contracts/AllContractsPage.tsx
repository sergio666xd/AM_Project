"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, FileSignature, RefreshCw, Search } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fetchApi } from "@/lib/api";
import ProcessContracts from "@/components/contracts/ProcessContracts";

type ProcessOption = { id: number; nombre: string };
type ClientOption = { id: number; nombre_completo: string; email: string };
type ContractRow = {
  id: number;
  proceso_id: number;
  proceso: string;
  expediente_archivado: boolean;
  cliente_id: number;
  cliente: string;
  estado: string;
  version_actual: number;
  emitido_en?: string | null;
  firmado_en?: string | null;
  documento_firmado: { id: number; nombre_archivo: string; mime_type: string; created_at: string } | null;
};

const contractStates = ["TODOS", "BORRADOR", "LISTO_PARA_FIRMA", "EN_FIRMA", "FIRMADO", "TERMINADO", "ANULADO"];
const stateLabel: Record<string, string> = { BORRADOR: "Borrador", LISTO_PARA_FIRMA: "Listo para firma", EN_FIRMA: "En firma", FIRMADO: "Firmado", TERMINADO: "Terminado", ANULADO: "Anulado" };

export default function AllContractsPage() {
  const { token } = useSession();
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [processes, setProcesses] = useState<ProcessOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedProcessId, setSelectedProcessId] = useState("");
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("TODOS");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [contractData, processData] = await Promise.all([
        fetchApi("/api/contratos", { token }),
        fetchApi("/api/expedientes/procesos", { token }),
      ]);
      setContracts(contractData);
      setProcesses(processData);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar los contratos.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const loadSelectedProcess = useCallback(async () => {
    if (!token || !selectedProcessId) return;
    try {
      const process = await fetchApi(`/api/expedientes/procesos/${selectedProcessId}`, { token });
      setClients(process.clientes || []);
      setError("");
    } catch (cause) {
      setClients([]);
      setError(cause instanceof Error ? cause.message : "No se pudo abrir el expediente.");
    }
  }, [selectedProcessId, token]);

  useEffect(() => { void loadSelectedProcess(); }, [loadSelectedProcess]);

  const visibleContracts = useMemo(() => {
    const text = query.trim().toLocaleLowerCase("es-CO");
    return contracts.filter((contract) => (status === "TODOS" || contract.estado === status)
      && (!text || `${contract.id} ${contract.proceso} ${contract.cliente} ${contract.documento_firmado?.nombre_archivo || ""}`.toLocaleLowerCase("es-CO").includes(text)));
  }, [contracts, query, status]);

  function manageContract(contract: ContractRow) {
    if (contract.expediente_archivado) return;
    if (selectedProcessId !== String(contract.proceso_id)) setClients([]);
    setSelectedProcessId(String(contract.proceso_id));
    setSelectedContractId(contract.id);
    setError("");
    window.setTimeout(() => document.getElementById("gestionar-contrato")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function refreshAfterChange() {
    await Promise.all([loadAll(), loadSelectedProcess()]);
  }

  return <section className="mx-auto max-w-7xl space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="rounded-xl bg-[var(--primary)]/10 p-3 text-[var(--primary)]"><FileSignature className="size-5" /></span><div><h1 className="text-2xl font-semibold">Contratos</h1><p className="mt-1 text-sm text-[var(--foreground-muted)]">Consulta contratos de todos los expedientes y administra sus documentos y estados.</p></div></div><button type="button" onClick={() => void loadAll()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />Actualizar</button></header>
    {error && <p role="alert" className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700"><AlertCircle className="size-4" />{error}</p>}

    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] p-4"><label className="relative min-w-56 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--foreground-muted)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por proceso, cliente o archivo" className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] pl-9 pr-3 text-sm" /></label><select aria-label="Filtrar contratos por estado" value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 text-sm">{contractStates.map((item) => <option key={item} value={item}>{item === "TODOS" ? "Todos los estados" : stateLabel[item]}</option>)}</select><span className="text-xs text-[var(--foreground-muted)]">{visibleContracts.length} contratos</span></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-[var(--surface-secondary)] text-xs uppercase text-[var(--foreground-muted)]"><tr><th className="px-4 py-3">Contrato</th><th className="px-4 py-3">Expediente</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">PDF firmado</th><th className="px-4 py-3">Acción</th></tr></thead><tbody className="divide-y divide-[var(--border)]">{visibleContracts.map((contract) => <tr key={contract.id} className="hover:bg-[var(--surface-hover)]"><td className="px-4 py-3 font-medium">#{contract.id}<span className="mt-1 block text-xs text-[var(--foreground-muted)]">Versión {contract.version_actual}</span></td><td className="px-4 py-3">{contract.proceso}<span className="mt-1 block text-xs text-[var(--foreground-muted)]">Expediente #{contract.proceso_id}{contract.expediente_archivado ? " · Archivado" : ""}</span></td><td className="px-4 py-3">{contract.cliente}</td><td className="px-4 py-3"><span className="rounded-full bg-[var(--surface-secondary)] px-2.5 py-1 text-xs">{stateLabel[contract.estado] || contract.estado}</span></td><td className="max-w-56 truncate px-4 py-3 text-xs text-[var(--foreground-muted)]">{contract.documento_firmado?.nombre_archivo || "Sin documento firmado"}</td><td className="px-4 py-3"><button type="button" onClick={() => manageContract(contract)} disabled={contract.expediente_archivado} title={contract.expediente_archivado ? "El expediente está archivado" : undefined} className="rounded-md border border-[var(--border)] px-3 py-2 text-xs font-medium hover:bg-[var(--surface-secondary)] disabled:opacity-50">Gestionar</button></td></tr>)}{!loading && visibleContracts.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-[var(--foreground-muted)]">No hay contratos que coincidan con los filtros.</td></tr>}{loading && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-[var(--foreground-muted)]"><RefreshCw className="mr-2 inline size-4 animate-spin" />Cargando contratos...</td></tr>}</tbody></table></div>
    </section>

    <section id="gestionar-contrato" className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div><h2 className="font-semibold">Gestionar contratos del expediente</h2><p className="mt-1 text-sm text-[var(--foreground-muted)]">Selecciona un contrato en la lista para abrir directamente su gestión.</p></div>
      <label className="block max-w-2xl text-sm font-medium">Expediente<select value={selectedProcessId} onChange={(event) => { setSelectedProcessId(event.target.value); setSelectedContractId(null); setClients([]); }} disabled={loading} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5"><option value="">Selecciona un expediente</option>{processes.map((process) => <option key={process.id} value={process.id}>{process.nombre} · #{process.id}</option>)}</select></label>
      {selectedProcessId && clients.length > 0 && <ProcessContracts key={selectedProcessId} processId={Number(selectedProcessId)} clients={clients} onChange={refreshAfterChange} initialContractId={selectedContractId} />}
      {selectedProcessId && !clients.length && !loading && !error && <p className="rounded-lg border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--foreground-muted)]">Este expediente no tiene clientes asociados.</p>}
    </section>
  </section>;
}
