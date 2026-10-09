"use client";

import { FormEvent, Fragment, KeyboardEvent, ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, Check, CheckCheck, ClipboardList, FileText, Gavel, Link2, Loader2, MessageCircle, Send, Users, X } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { apiRequest } from "@/lib/api";
import { preserveChatList, upsertChat } from "@/components/chat/chatListState";

type Chat = { id: number; clave: string; route_key: string; tipo: string; titulo: string; subtitulo: string; href: string; no_leidos: number; updated_at: string; proceso_id?: number | null; ultimo_mensaje?: string | null; ultimo_remitente?: string | null };
type Message = { id: number; contenido: string; remitente_id: number | null; remitente: string; es_mio: boolean; created_at: string; estado_entrega?: "ENVIADO" | "ENTREGADO" | "ENTREGADO_PARCIAL" | "LEIDO"; entregados?: number; leidos?: number; destinatarios?: number; referencia: { tipo: string; id: number; titulo: string; url: string } | null };
type DeliveryStatus = Required<Pick<Message, "estado_entrega" | "entregados" | "leidos" | "destinatarios">>;
type Reference = { tipo: "ACTUACION" | "TAREA" | "EVENTO" | "DOCUMENTO"; id: number; titulo: string; href: string };
const referenceTypes = [
  { tipo: "ACTUACION", label: "Actuaciones", Icon: Gavel },
  { tipo: "TAREA", label: "Tareas", Icon: ClipboardList },
  { tipo: "EVENTO", label: "Eventos", Icon: CalendarDays },
  { tipo: "DOCUMENTO", label: "Documentos", Icon: FileText },
] as const;

function timeText(value: string) {
  return new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" }).format(new Date(value));
}

function dateText(value: string) {
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toLocaleDateString("es-CO", { timeZone: "America/Bogota" }) === today.toLocaleDateString("es-CO", { timeZone: "America/Bogota" });
  return sameDay ? timeText(value) : new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", timeZone: "America/Bogota" }).format(date);
}

function dayKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Bogota" }).format(new Date(value));
}

function dayLabel(value: string) {
  return new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota" }).format(new Date(value));
}

function deliveryLabel(message: Message) {
  if (message.estado_entrega === "LEIDO") return (message.destinatarios ?? 0) > 1 ? `Leído ${message.leidos}/${message.destinatarios}` : "Leído";
  if (message.estado_entrega === "ENTREGADO" || message.estado_entrega === "ENTREGADO_PARCIAL") return (message.destinatarios ?? 0) > 1 ? `Entregado ${message.entregados}/${message.destinatarios}` : "Entregado";
  return "Enviado";
}

function chatProcessId(chat: Chat) {
  const processId = Number(chat.proceso_id);
  if (Number.isInteger(processId) && processId > 0) return processId;
  const match = chat.route_key.match(/^process:(\d+):/);
  return match ? Number(match[1]) : null;
}

function chatPreview(value: string) {
  return value.replace(/\r\n?/g, "\n").split("\n")
    .map((line) => line.replace(/^\s*>\s?/, "").replace(/^\s*[-*]\s+/, "").replace(/^\s*\d+[.)]\s+/, ""))
    .join(" ");
}

function renderInlineMarkdown(value: string, keyPrefix: string): ReactNode[] {
  const tokenPattern = /(\*\*.+?\*\*|__.+?__|~~.+?~~|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let tokenIndex = 0;

  for (const match of value.matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(value.slice(cursor, index));
    const inner = token.startsWith("**") || token.startsWith("__") || token.startsWith("~~") || token.startsWith("`")
      ? token.slice(2, -2)
      : token.slice(1, -1);
    const key = `${keyPrefix}-${tokenIndex++}`;
    if (token.startsWith("**") || token.startsWith("__")) nodes.push(<strong key={key}>{renderInlineMarkdown(inner, key)}</strong>);
    else if (token.startsWith("~~")) nodes.push(<s key={key}>{renderInlineMarkdown(inner, key)}</s>);
    else if (token.startsWith("`")) nodes.push(<code key={key} className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[0.9em]">{inner}</code>);
    else nodes.push(<em key={key}>{renderInlineMarkdown(inner, key)}</em>);
    cursor = index + token.length;
  }

  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
}

export function renderMessageMarkdown(value: string): ReactNode {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listKind: "ul" | "ol" | null = null;
  let quote: string[] = [];
  let blockIndex = 0;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(<p key={`p-${blockIndex++}`} className="whitespace-pre-wrap">{paragraph.map((line, index) => <Fragment key={index}>{index > 0 && <br />}{renderInlineMarkdown(line, `p-${blockIndex}-${index}`)}</Fragment>)}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!listKind || !listItems.length) return;
    const List = listKind;
    blocks.push(<List key={`list-${blockIndex++}`} className={listKind === "ul" ? "list-disc pl-5" : "list-decimal pl-5"}>{listItems.map((item, index) => <li key={index}>{renderInlineMarkdown(item, `li-${blockIndex}-${index}`)}</li>)}</List>);
    listItems = [];
    listKind = null;
  };
  const flushQuote = () => {
    if (!quote.length) return;
    blocks.push(<blockquote key={`quote-${blockIndex++}`} className="border-l-2 border-primary/60 pl-3 text-foreground-secondary">{quote.map((line, index) => <Fragment key={index}>{index > 0 && <br />}{renderInlineMarkdown(line, `quote-${blockIndex}-${index}`)}</Fragment>)}</blockquote>);
    quote = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { flushParagraph(); flushList(); flushQuote(); continue; }
    const quoteMatch = line.match(/^\s*>\s?(.*)$/);
    if (quoteMatch) { flushParagraph(); flushList(); quote.push(quoteMatch[1]); continue; }
    flushQuote();
    const bulletMatch = line.match(/^\s*[-*]\s+(.*)$/);
    const numberedMatch = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const nextKind = bulletMatch ? "ul" : numberedMatch ? "ol" : null;
    if (nextKind) {
      flushParagraph();
      if (listKind && listKind !== nextKind) flushList();
      listKind = nextKind;
      listItems.push((bulletMatch ?? numberedMatch)![1]);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph(); flushList(); flushQuote();
  return <div className="space-y-1">{blocks}</div>;
}

export default function ChatWorkspace() {
  const { user, token } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [references, setReferences] = useState<Reference[]>([]);
  const [referenceConversationId, setReferenceConversationId] = useState<number | null>(null);
  const [referenceError, setReferenceError] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [referenceModalType, setReferenceModalType] = useState<Reference["tipo"] | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messageIdRef = useRef(0);
  const readAckRef = useRef({ key: "", messageId: 0 });

  const chatArea = user?.rol === "CLIENTE" ? "cliente" : user?.rol === "ADMIN" ? "admin" : "abogado";
  const root = `/gestion-procesos/${chatArea}/chat`;
  const parts = useMemo(() => pathname.startsWith(root) ? pathname.slice(root.length).split("/").filter(Boolean) : [], [pathname, root]);
  const processGroupRouteId = parts.length === 1 && /^\d+$/.test(parts[0]) && chats.some((chat) => chatProcessId(chat) === Number(parts[0]))
    ? Number(parts[0])
    : null;
  const pendingProcessGroupRoute = listLoading && parts.length === 1 && /^\d+$/.test(parts[0]);
  const activeKey = processGroupRouteId || pendingProcessGroupRoute ? "" : parts.length === 1 && parts[0] === "directo"
    ? ""
    : parts.length === 2 && parts[0] === "directo"
      ? `direct:${parts[1]}`
      : parts.length === 1
    ? `direct:${parts[0]}`
    : parts.length >= 2 && parts[1] === "colaboradores"
      ? `process:${parts[0]}:collaborators`
      : parts.length >= 2 ? `process:${parts[0]}:${parts[1]}` : "";
  const activeChat = chats.find((item) => item.route_key === activeKey) ?? null;
  const activeReferences = referenceConversationId === activeChat?.id ? references : [];
  const [selectedProcessId, setSelectedProcessId] = useState<number | null>(null);
  const processGroups = useMemo(() => {
    const grouped = new Map<number, Chat[]>();
    for (const chat of chats) {
      const processId = chatProcessId(chat);
      if (!processId) continue;
      grouped.set(processId, [...(grouped.get(processId) ?? []), chat]);
    }
    return [...grouped.entries()].map(([id, items]) => ({
      id,
      titulo: items[0]?.subtitulo || `Proceso ${id}`,
      chats: items.sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    })).sort((a, b) => (b.chats[0]?.updated_at ?? "").localeCompare(a.chats[0]?.updated_at ?? ""));
  }, [chats]);
  const topLevelItems = useMemo(() => [
    ...processGroups.map((group) => ({ kind: "process" as const, group, updated_at: group.chats[0]?.updated_at ?? "" })),
    ...chats.filter((chat) => !chatProcessId(chat)).map((chat) => ({ kind: "chat" as const, chat, updated_at: chat.updated_at })),
  ].sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [chats, processGroups]);
  const activeProcessMatch = activeKey.match(/^process:(\d+):/);
  const visibleProcessId = processGroupRouteId ?? (activeProcessMatch ? Number(activeProcessMatch[1]) : (!activeKey ? selectedProcessId : null));
  const visibleProcessGroup = processGroups.find((group) => group.id === Number(visibleProcessId)) ?? null;
  const processId = parts.length >= 2 && parts[1] !== "colaboradores" ? Number(parts[0]) : parts.length >= 2 ? Number(parts[0]) : null;
  const canAttachReference = !!user && user.rol !== "CLIENTE" && Number.isInteger(processId) && processId! > 0;

  const loadChats = useCallback(async () => {
    if (!token) return;
    try {
      const response = await apiRequest("/api/chat/conversaciones", { token });
      const incoming = await response.json() as Chat[];
      setChats((current) => preserveChatList(current, incoming));
      setListError("");
    } catch (cause) {
      setListError(cause instanceof Error ? cause.message : "No se pudieron cargar las conversaciones.");
    } finally { setListLoading(false); }
  }, [token]);

  const loadMessages = useCallback(async (reset = false) => {
    if (!token || !activeKey || document.visibilityState !== "visible") return;
    try {
      const after = reset ? 0 : messageIdRef.current;
      const response = await apiRequest(`/api/chat/resolver?clave=${encodeURIComponent(activeKey)}&after_id=${after}`, { token });
      const result = await response.json() as { conversacion: Chat; mensajes: Message[]; estados_mensajes?: ({ id: number } & DeliveryStatus)[] };
      setChats((current) => upsertChat(current, result.conversacion));
      const statuses = new Map((result.estados_mensajes ?? []).map(({ id, ...status }) => [id, status]));
      if (reset) {
        setMessages(result.mensajes.map((item) => ({ ...item, ...statuses.get(item.id) })));
        messageIdRef.current = result.mensajes.at(-1)?.id ?? 0;
      } else if (result.mensajes.length || statuses.size) {
        const previousMessageId = messageIdRef.current;
        const incoming = result.mensajes.filter((item) => item.id > previousMessageId);
        setMessages((current) => {
          const byId = new Map(current.map((item) => [item.id, item]));
          for (const item of incoming) byId.set(item.id, { ...item, ...statuses.get(item.id) });
          for (const [id, status] of statuses) {
            const existing = byId.get(id);
            if (existing) byId.set(id, { ...existing, ...status });
          }
          return [...byId.values()].sort((a, b) => a.id - b.id);
        });
        messageIdRef.current = Math.max(previousMessageId, result.mensajes.at(-1)?.id ?? 0);
      }
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo abrir la conversación.");
    } finally {
      setLoading(false);
    }
  }, [activeKey, token]);

  useEffect(() => {
    if (!token) return;
    void loadChats();
    const refresh = () => { if (document.visibilityState === "visible") { void loadChats(); void loadMessages(); } };
    const timer = window.setInterval(refresh, 5000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [token, loadChats, loadMessages]);

  useEffect(() => {
    setMessages([]); messageIdRef.current = 0; setLoading(!!activeKey); setError(""); setReferenceId("");
    readAckRef.current = { key: activeKey, messageId: 0 };
    if (activeKey) void loadMessages(true);
  }, [activeKey, loadMessages]);

  useEffect(() => {
    if (!canAttachReference || !token || !processId || !activeChat?.id) return;
    let cancelled = false;
    apiRequest(`/api/chat/referencias/${processId}?conversation_id=${activeChat.id}`, { token })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || "No se pudieron cargar los elementos relacionados.");
        return result as Reference[];
      })
      .then((items) => {
        if (cancelled) return;
        setReferences(items);
        setReferenceConversationId(activeChat.id);
        setReferenceError("");
      })
      .catch((cause) => {
        if (cancelled) return;
        setReferences([]);
        setReferenceConversationId(activeChat.id);
        setReferenceError(cause instanceof Error ? cause.message : "No se pudieron cargar los elementos relacionados.");
      });
    return () => { cancelled = true; };
  }, [activeChat?.id, activeKey, canAttachReference, processId, token]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  useLayoutEffect(() => {
    const textarea = composerRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const computed = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computed.lineHeight) || 20;
    const verticalPadding = Number.parseFloat(computed.paddingTop) + Number.parseFloat(computed.paddingBottom);
    const verticalBorder = Number.parseFloat(computed.borderTopWidth) + Number.parseFloat(computed.borderBottomWidth);
    const maxHeight = lineHeight * 6 + verticalPadding + verticalBorder;
    textarea.style.height = `${Math.min(textarea.scrollHeight + verticalBorder, maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [draft]);

  useEffect(() => {
    const message = messages.at(-1);
    if (!token || !activeChat || !message || document.visibilityState !== "visible") return;
    if (readAckRef.current.key !== activeKey) readAckRef.current = { key: activeKey, messageId: 0 };
    if (message.id <= readAckRef.current.messageId) return;
    const previousReadId = readAckRef.current.messageId;
    readAckRef.current.messageId = message.id;
    void apiRequest(`/api/chat/conversaciones/${activeChat.id}/leido`, {
      method: "POST",
      token,
      body: JSON.stringify({ mensaje_id: message.id }),
    }).catch(() => {
      if (readAckRef.current.key === activeKey && readAckRef.current.messageId === message.id) {
        readAckRef.current.messageId = previousReadId;
      }
    });
  }, [activeChat, activeKey, messages, token]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const content = draft.trim();
    if (!token || !activeChat || !content || sending) return;
    const draftToRestore = draft;
    const referenceToRestore = referenceId;
    const selected = references.find((item) => `${item.tipo}:${item.id}` === referenceId);
    setSending(true); setError(""); setDraft(""); setReferenceId("");
    try {
      await apiRequest(`/api/chat/conversaciones/${activeChat.id}/mensajes`, {
        method: "POST", token,
        body: JSON.stringify({ contenido: content, ...(selected ? { referencia_tipo: selected.tipo, referencia_id: selected.id } : {}) }),
      });
      await loadMessages(); await loadChats();
    } catch (cause) {
      setDraft(draftToRestore); setReferenceId(referenceToRestore);
      setError(cause instanceof Error ? cause.message : "No se pudo enviar el mensaje.");
    } finally { setSending(false); }
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); }
  }

  const renderChatRow = (chat: Chat) => <Link key={chat.id} href={chat.href} className={`flex gap-3 border-b border-border px-4 py-3 transition hover:bg-surface-hover ${chat.route_key === activeKey ? "bg-primary/5" : ""}`}>
    <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">{chat.tipo === "PROCESO_COLABORADORES" ? <Users className="size-5" /> : <MessageCircle className="size-5" />}</span>
    <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="truncate text-sm">{chat.titulo}</strong><time className="shrink-0 text-[10px] text-(--foreground-muted)">{chat.updated_at ? dateText(chat.updated_at) : ""}</time></span><span className="block truncate text-xs text-(--foreground-muted)">{chat.subtitulo}</span><span className="mt-1 block truncate text-xs text-(--foreground-muted)">{chat.ultimo_remitente ? `${chat.ultimo_remitente}: ` : ""}{chat.ultimo_mensaje ? renderInlineMarkdown(chatPreview(chat.ultimo_mensaje), `preview-${chat.id}`) : "Inicia la conversación"}</span></span>
    {chat.no_leidos > 0 && <span className="mt-7 grid size-5 shrink-0 place-items-center rounded-full bg-emerald-600 text-[10px] font-semibold text-white">{chat.no_leidos > 9 ? "9+" : chat.no_leidos}</span>}
  </Link>;

  const list = <aside className={`${activeKey ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col border-r border-border bg-surface md:w-[330px] lg:w-[370px]`}>
    <div className="border-b border-border bg-surface-muted px-4 py-4">
      {visibleProcessGroup ? <div className="flex items-center gap-2"><button type="button" onClick={() => { setSelectedProcessId(null); router.push(root); }} className="rounded-full p-1.5 hover:bg-surface-hover" aria-label="Volver a todos los chats"><ArrowLeft className="size-4" /></button><div className="min-w-0"><h1 className="truncate text-lg font-semibold">{visibleProcessGroup.titulo}</h1><p className="mt-1 text-xs text-(--foreground-muted)">{visibleProcessGroup.chats.length} chats asociados al proceso</p></div></div> : <><h1 className="text-xl font-semibold">Chats</h1><p className="mt-1 text-xs text-(--foreground-muted)">Se actualizan automáticamente cada 5 segundos.</p></>}
    </div>
    {listError && <p role="alert" className="border-b border-border px-4 py-3 text-xs text-danger">{listError}</p>}
    <div className="min-h-0 flex-1 overflow-y-auto">
      {visibleProcessGroup ? visibleProcessGroup.chats.length ? visibleProcessGroup.chats.map(renderChatRow) : <p className="px-5 py-10 text-center text-sm text-(--foreground-muted)">No hay conversaciones disponibles para este proceso.</p> : <>
        {topLevelItems.map((item) => {
          if (item.kind === "chat") return renderChatRow(item.chat);
          const { group } = item;
          const latest = group.chats[0];
          const unread = group.chats.reduce((total, chat) => total + chat.no_leidos, 0);
          return <button key={group.id} type="button" onClick={() => { setSelectedProcessId(group.id); router.push(`${root}/${group.id}`); }} className="flex w-full items-center gap-3 border-b border-border px-4 py-4 text-left transition hover:bg-surface-hover">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Users className="size-5" /></span>
            <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="truncate text-sm">{group.titulo}</strong><time className="shrink-0 text-[10px] text-(--foreground-muted)">{latest?.updated_at ? dateText(latest.updated_at) : ""}</time></span><span className="mt-1 block truncate text-xs text-(--foreground-muted)">{group.chats.length} chats · {latest?.ultimo_remitente ? `${latest.ultimo_remitente}: ` : ""}{latest?.ultimo_mensaje ? renderInlineMarkdown(chatPreview(latest.ultimo_mensaje), `process-preview-${group.id}`) : "Sin mensajes"}</span></span>
            {unread > 0 && <span className="grid size-5 shrink-0 place-items-center rounded-full bg-emerald-600 text-[10px] font-semibold text-white">{unread > 99 ? "99+" : unread}</span>}
          </button>;
        })}
        {!chats.length && <p className="px-5 py-10 text-center text-sm text-(--foreground-muted)">{listLoading ? "Cargando conversaciones…" : "No hay conversaciones disponibles."}</p>}
      </>}
    </div>
  </aside>;

  return <main className="h-full min-h-0 w-full max-w-none overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
    <div className="flex h-full min-h-0 min-w-0">{list}<section className={`${activeKey ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-1 flex-col bg-background`}>
      {activeKey && activeChat ? <>
        <header className="flex min-h-16 items-center gap-3 border-b border-border bg-surface px-3 py-2 md:px-5"><button type="button" onClick={() => router.push(root)} className="rounded-full p-2 hover:bg-surface-hover md:hidden" aria-label="Volver a conversaciones"><ArrowLeft className="size-5" /></button><span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">{activeChat.tipo === "PROCESO_COLABORADORES" ? <Users className="size-5" /> : <MessageCircle className="size-5" />}</span><div className="min-w-0"><h2 className="truncate text-sm font-semibold">{activeChat.titulo}</h2><p className="truncate text-xs text-(--foreground-muted)">{activeChat.subtitulo}</p></div><span className="ml-auto hidden items-center gap-1 text-[10px] text-(--foreground-muted) sm:flex"><CheckCheck className="size-3.5" />En línea</span></header>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-8 md:py-6">{loading ? <div className="grid h-full place-items-center"><Loader2 className="size-6 animate-spin text-primary" /></div> : messages.length ? <div className="mx-auto flex max-w-3xl flex-col gap-0">{messages.map((message, index) => {
          const previous = messages[index - 1];
          const next = messages[index + 1];
          const sameDayAsPrevious = !!previous && dayKey(previous.created_at) === dayKey(message.created_at);
          const sameDayAsNext = !!next && dayKey(next.created_at) === dayKey(message.created_at);
          const sameGroupAsPrevious = !!previous && previous.remitente_id === message.remitente_id && sameDayAsPrevious && new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() <= 5 * 60 * 1000;
          const sameGroupAsNext = !!next && next.remitente_id === message.remitente_id && sameDayAsNext && new Date(next.created_at).getTime() - new Date(message.created_at).getTime() <= 5 * 60 * 1000;
          const alignment = message.es_mio ? "ml-auto" : "mr-auto";
          const bubbleCorners = message.es_mio
            ? (sameGroupAsPrevious ? "rounded-tr-md" : "rounded-tr-sm") + " " + (sameGroupAsNext ? "rounded-br-md" : "rounded-br-sm")
            : (sameGroupAsPrevious ? "rounded-tl-md" : "rounded-tl-sm") + " " + (sameGroupAsNext ? "rounded-bl-md" : "rounded-bl-sm");
          const statusTone = message.estado_entrega === "LEIDO" ? "text-primary" : "text-foreground-muted";
          return <Fragment key={message.id}>
            {(!previous || !sameDayAsPrevious) && <div className="my-3 flex justify-center"><span className="rounded-full border border-border bg-surface/90 px-3 py-1 text-[10px] font-medium text-foreground-muted shadow-sm">{dayLabel(message.created_at)}</span></div>}
            <article className={"max-w-[88%] rounded-xl px-3 py-2 shadow-sm sm:max-w-[75%] " + alignment + " " + bubbleCorners + (sameGroupAsPrevious ? " mt-0" : " mt-2") + (message.es_mio ? " bg-primary-light text-foreground" : " bg-surface text-foreground")}>
              {!sameGroupAsPrevious && <p className="mb-1 text-[10px] font-semibold text-primary">{message.es_mio ? "Tú" : message.remitente}</p>}
              {message.referencia && <Link href={message.referencia.url} className="mb-2 flex items-start gap-2 rounded-md border-l-4 border-primary bg-primary/5 p-2 text-xs hover:bg-primary/10"><Link2 className="mt-0.5 size-3.5 shrink-0" /><span><strong className="block">Referencia · {message.referencia.tipo.toLowerCase()}</strong>{message.referencia.titulo}</span></Link>}
              <div className="break-words text-sm leading-5">{renderMessageMarkdown(message.contenido)}</div>
              <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-foreground-muted">
                <time>{timeText(message.created_at)}</time>
                {message.es_mio && <span className={"inline-flex items-center gap-1 " + statusTone} title={deliveryLabel(message)} aria-label={deliveryLabel(message)}>
                  {!message.estado_entrega || message.estado_entrega === "ENVIADO" ? <Check className="size-3.5" /> : <CheckCheck className="size-3.5" />}
                  <span>{deliveryLabel(message)}</span>
                </span>}
              </div>
            </article>
          </Fragment>;
        })}</div> : <div className="grid h-full place-items-center"><div className="rounded-xl border border-border bg-surface px-6 py-5 text-center shadow-sm"><MessageCircle className="mx-auto size-7 text-primary" /><p className="mt-2 text-sm font-medium">Esta conversación está lista</p><p className="mt-1 text-xs text-(--foreground-muted)">Envía el primer mensaje para iniciar el chat.</p></div></div>}<div ref={bottomRef} /></div>
        {error && <p role="alert" className="border-t border-border bg-surface px-4 py-2 text-xs text-danger">{error}</p>}
                <form onSubmit={(event) => void send(event)} className="relative border-t border-border bg-surface p-2 md:p-3">
          {canAttachReference && <div className="mx-auto mb-2 flex max-w-4xl items-center gap-2">
            <span className="mr-1 text-xs text-(--foreground-muted)">Referencias:</span>
            {referenceTypes.map(({ tipo, label, Icon }) => { const count = activeReferences.filter((item) => item.tipo === tipo).length; return <button key={tipo} type="button" onClick={() => setReferenceModalType(tipo)} disabled={sending} aria-label={`${label} (${count})`} title={`${label} (${count})`} className={`relative grid size-9 place-items-center rounded-full border transition ${referenceId.startsWith(`${tipo}:`) ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface-muted text-foreground-muted hover:border-primary/50 hover:text-primary"}`}><Icon className="size-4" />{count > 0 && <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-semibold text-white">{count > 99 ? "99+" : count}</span>}</button>; })}
          </div>}
          <div className="mx-auto flex max-w-4xl items-end gap-2">
            <textarea ref={composerRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onComposerKeyDown} disabled={sending} maxLength={12000} rows={1} placeholder="Escribe un mensaje..." className="min-h-10 min-w-0 flex-1 resize-none overflow-y-hidden rounded-2xl border border-border bg-surface-muted px-4 py-2.5 text-sm leading-5 outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-70" />
            <button type="submit" disabled={!draft.trim() || sending} aria-label="Enviar mensaje" className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-white disabled:opacity-50">{sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}</button>
          </div>
          {referenceId && <div className="mx-auto mt-2 flex max-w-4xl items-center gap-2 text-xs text-(--foreground-muted)"><Link2 className="size-3.5 shrink-0" /><span className="min-w-0 flex-1 truncate">{activeReferences.find((item) => `${item.tipo}:${item.id}` === referenceId)?.titulo}</span><button type="button" onClick={() => setReferenceId("")} aria-label="Quitar referencia" className="rounded-full p-1 hover:bg-surface-hover"><X className="size-3.5" /></button></div>}
          {referenceModalType && <div role="dialog" aria-label={`Seleccionar ${referenceTypes.find((item) => item.tipo === referenceModalType)?.label}`} className="absolute bottom-full left-3 z-50 mb-2 flex max-h-[min(60dvh,28rem)] w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
            <header className="flex items-center gap-2 border-b border-border bg-surface-muted px-4 py-3"><h3 className="flex-1 text-sm font-semibold">Seleccionar {referenceTypes.find((item) => item.tipo === referenceModalType)?.label.toLowerCase()}</h3><button type="button" onClick={() => setReferenceModalType(null)} aria-label="Cerrar selector" className="rounded-full p-1.5 hover:bg-surface-hover"><X className="size-4" /></button></header>
            <div className="min-h-0 overflow-y-auto">{activeReferences.filter((item) => item.tipo === referenceModalType).map((item) => <button key={`${item.tipo}:${item.id}`} type="button" onClick={() => { setReferenceId(`${item.tipo}:${item.id}`); setReferenceModalType(null); }} className="block w-full border-b border-border px-4 py-3 text-left text-sm hover:bg-surface-hover">{item.titulo}</button>)}{!activeReferences.some((item) => item.tipo === referenceModalType) && <p role={referenceError && referenceConversationId === activeChat?.id ? "alert" : undefined} className={`px-4 py-8 text-center text-sm ${referenceError && referenceConversationId === activeChat?.id ? "text-danger" : "text-(--foreground-muted)"}`}>{referenceConversationId !== activeChat?.id ? "Cargando elementos relacionados…" : referenceError || "No hay referencias disponibles de este tipo."}</p>}</div>
          </div>}
        </form>
      </> : activeKey ? <div className="grid flex-1 place-items-center p-6 text-center"><div><p className="font-medium">Abriendo conversación…</p><p className="mt-1 text-sm text-(--foreground-muted)">{error}</p></div></div> : <div className="hidden flex-1 place-items-center p-8 text-center md:grid"><div className="max-w-md"><span className="mx-auto grid size-16 place-items-center rounded-full bg-primary/10 text-primary"><MessageCircle className="size-8" /></span><h2 className="mt-4 text-xl font-semibold">Tus conversaciones</h2><p className="mt-2 text-sm text-(--foreground-muted)">Selecciona un chat para continuar. Puedes conversar con el despacho, un cliente o el equipo del proceso.</p></div></div>}
    </section></div>
  </main>;
}
