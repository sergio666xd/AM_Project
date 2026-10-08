"use client";

import { useCallback, useEffect, useState } from "react";
import { FileSignature, RefreshCw } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fetchApi } from "@/lib/api";
import ProcessContracts from "@/components/contracts/ProcessContracts";

type Process = { id: number; nombre: string };
type Client = { id: number; nombre_completo: string; email: string };

export default function AdminContractsPage() {
  const { token } = useSession();
  const [processes, setProcesses] = useState<Process[]>([]);
  const [selectedProcessId, setSelectedProcessId] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadProcesses = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchApi("/api/expedientes/procesos", { token });
      setProcesses(data);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar los expedientes.");
    } finally { setLoading(false); }
  }, [token]);

  // Both effects fetch server data; their state updates run when the requests settle.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadProcesses(); }, [loadProcesses]);

  const loadSelectedProcess = useCallback(async () => {
    if (!token || !selectedProcessId) return;
    try {
      const data = await fetchApi(`/api/expedientes/procesos/${selectedProcessId}`, { token });
      setClients(data.clientes || []);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo abrir el expediente.");
    }
  }, [selectedProcessId, token]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadSelectedProcess(); }, [loadSelectedProcess]);

  return <section className="mx-auto max-w-7xl space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="rounded-xl bg-[var(--primary)]/10 p-3 text-[var(--primary)]"><FileSignature className="size-5"/></span><div><h1 className="text-2xl font-semibold">Contratos de la firma</h1><p className="mt-1 text-sm text-[var(--foreground-muted)]">ADMIN puede consultar y gestionar los contratos de cualquier expediente.</p></div></div><button type="button" onClick={() => void loadProcesses()} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"><RefreshCw className="size-4"/>Actualizar</button></header>
    {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700">{error}</p>}
    <label className="block max-w-2xl text-sm font-medium">Expediente<select value={selectedProcessId} onChange={(event) => { setSelectedProcessId(event.target.value); setClients([]); }} disabled={loading} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5"><option value="">Selecciona un expediente</option>{processes.map((process) => <option key={process.id} value={process.id}>{process.nombre} · #{process.id}</option>)}</select></label>
    {selectedProcessId && clients.length > 0 && <ProcessContracts processId={Number(selectedProcessId)} clients={clients} onChange={loadSelectedProcess}/>}
    {selectedProcessId && !clients.length && !loading && !error && <p className="rounded-lg border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--foreground-muted)]">Este expediente no tiene clientes asociados.</p>}
  </section>;
}
