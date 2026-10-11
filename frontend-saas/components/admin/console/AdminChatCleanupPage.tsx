"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, MessageSquare, RefreshCw, Search, Trash2 } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { apiRequest } from "@/lib/api";

type Conversation = {
  id: number;
  tipo: string;
  proceso: string | null;
  cliente: string | null;
  participantes: string[];
  cantidad_mensajes: number;
  ultimo_mensaje_en: string | null;
};
type Listing = { total: number; limit: number; offset: number; conversaciones: Conversation[] };
const PAGE_SIZE = 100;

function dateInBogota(value: string | null) {
  if (!value) return "Sin mensajes";
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`;
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota",
  }).format(new Date(normalized));
}

function conversationLabel(value: string) {
  const labels: Record<string, string> = {
    ADMIN_DIRECTO: "Chat con administración",
    PROCESO_DIRECTO: "Chat directo del proceso",
    PROCESO_CLIENTE: "Chat con el cliente",
    PROCESO_COLABORADORES: "Chat de colaboradores",
  };
  return labels[value] || value.replaceAll("_", " ").toLocaleLowerCase("es-CO");
}

export default function AdminChatCleanupPage() {
  const { token } = useSession();
  const [listing, setListing] = useState<Listing | null>(null);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (requestedOffset = offset) => {
    if (!token) return;
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(requestedOffset) });
      const response = await apiRequest(`/api/admin/chat/limpieza?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setListing(await response.json());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar las conversaciones.");
      setListing(null);
    } finally { setLoading(false); }
  }, [offset, token]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es-CO");
    if (!term) return listing?.conversaciones ?? [];
    return (listing?.conversaciones ?? []).filter((conversation) => [
      conversation.tipo, conversation.proceso ?? "", conversation.cliente ?? "", ...conversation.participantes,
    ].join(" ").toLocaleLowerCase("es-CO").includes(term));
  }, [listing, search]);

  async function clearConversation(conversation: Conversation) {
    if (!token) return;
    const confirmation = window.prompt(
      `Se eliminarán los ${conversation.cantidad_mensajes} mensajes del chat de ${conversation.proceso || conversationLabel(conversation.tipo)}. No se mostrará ni modificará el contenido de otros chats.\n\nEscribe LIMPIAR CONVERSACION para confirmar.`,
    );
    if (confirmation !== "LIMPIAR CONVERSACION") return;
    setWorkingId(conversation.id); setError(""); setNotice("");
    try {
      const response = await apiRequest(`/api/admin/chat/limpieza/${conversation.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirmacion: confirmation }),
      });
      const result = await response.json();
      setNotice(`Conversación limpiada. Se eliminaron ${result.mensajes_eliminados} mensajes.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo limpiar la conversación.");
      await load();
    } finally { setWorkingId(null); }
  }

  function changePage(nextOffset: number) {
    setOffset(nextOffset); setSearch("");
  }

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">Limpiar conversaciones</h1>
        <p className="mt-1 max-w-3xl text-sm text-foreground-muted">Administra la limpieza de chats sin acceder a sus mensajes. Solo se muestran participantes, proceso, cantidad de mensajes y fecha de actividad.</p>
      </div>
      <button type="button" onClick={() => void load()} disabled={loading || workingId !== null} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50">
        <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />Actualizar
      </button>
    </header>

    <label className="relative block max-w-lg text-sm font-medium">Filtrar conversaciones
      <Search className="pointer-events-none absolute left-3 top-9 size-4 text-foreground-muted" />
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Proceso o participante" className="mt-1 block w-full rounded-md border border-border bg-background py-2 pl-9 pr-3" />
    </label>

    {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">{notice}</p>}

    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      {loading && !listing ? <div className="grid min-h-48 place-items-center"><Loader2 className="size-6 animate-spin text-primary" /></div> : <>
        <div className="overflow-x-auto">
          <table className="w-full min-w-200 text-left text-sm">
            <thead className="bg-surface-secondary text-xs text-foreground-muted"><tr><th className="px-4 py-3">Conversación</th><th className="px-4 py-3">Participantes</th><th className="px-4 py-3">Mensajes</th><th className="px-4 py-3">Último mensaje</th><th className="px-4 py-3">Acción</th></tr></thead>
            <tbody>
              {visible.map((conversation) => <tr key={conversation.id} className="border-t border-border align-middle">
                <td className="px-4 py-3"><div className="flex items-start gap-2"><MessageSquare className="mt-0.5 size-4 shrink-0 text-primary" /><div><p className="font-medium">{conversation.proceso || conversation.cliente || conversationLabel(conversation.tipo)}</p><p className="mt-1 text-xs text-foreground-muted">{conversationLabel(conversation.tipo)} · Chat #{conversation.id}</p></div></div></td>
                <td className="max-w-80 px-4 py-3 text-xs">{conversation.participantes.join(", ") || "Sin participantes"}</td>
                <td className="whitespace-nowrap px-4 py-3">{conversation.cantidad_mensajes}</td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-foreground-muted">{dateInBogota(conversation.ultimo_mensaje_en)}</td>
                <td className="px-4 py-3"><button type="button" disabled={workingId !== null || conversation.cantidad_mensajes === 0} onClick={() => void clearConversation(conversation)} className="inline-flex items-center gap-2 rounded-md border border-red-500/30 px-3 py-2 text-xs text-red-700 disabled:cursor-not-allowed disabled:opacity-40">{workingId === conversation.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}Limpiar</button></td>
              </tr>)}
            </tbody>
          </table>
          {!loading && visible.length === 0 && <p className="p-10 text-center text-sm text-foreground-muted">{search.trim() ? "No hay conversaciones que coincidan." : "No hay conversaciones para limpiar."}</p>}
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-foreground-muted">
          <span>{listing?.total ?? 0} conversación(es) · mostrando {visible.length}</span>
          <div className="flex gap-2"><button type="button" onClick={() => changePage(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0 || loading || workingId !== null} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm disabled:opacity-40"><ChevronLeft className="size-4" />Anterior</button><button type="button" onClick={() => changePage(offset + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= (listing?.total ?? 0) || loading || workingId !== null} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm disabled:opacity-40">Siguiente<ChevronRight className="size-4" /></button></div>
        </footer>
      </>}
    </section>
  </div>;
}
