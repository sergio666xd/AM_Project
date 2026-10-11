"use client";

import { CSSProperties, FormEvent, Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Check, CheckCheck, MessageCircle, Send, X } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { apiRequest } from "@/lib/api";
import { renderMessageMarkdown } from "@/components/chat/ChatWorkspace";
import { preserveChatList } from "@/components/chat/chatListState";
import ChatPushNotifications from "@/components/chat/ChatPushNotifications";
import { useChatViewport } from "@/components/chat/useChatViewport";

type Chat = { id: number; clave: string; route_key: string; tipo: string; titulo: string; subtitulo: string; href: string; no_leidos: number; updated_at: string; proceso_id?: number | null; ultimo_mensaje?: string | null; ultimo_remitente?: string | null; en_linea?: boolean; participantes_en_linea?: number };
type Message = { id: number; contenido: string; remitente_id: number | null; remitente: string; es_mio: boolean; created_at: string; estado_entrega?: "ENVIADO" | "ENTREGADO" | "ENTREGADO_PARCIAL" | "LEIDO"; entregados?: number; leidos?: number; destinatarios?: number; referencia: { tipo: string; id: number; titulo: string; url: string } | null };
type DeliveryStatus = Pick<Message, "estado_entrega" | "entregados" | "leidos" | "destinatarios">;

function sameDeliveryStatus(left: Message, right: DeliveryStatus) {
  return left.estado_entrega === right.estado_entrega
    && left.entregados === right.entregados
    && left.leidos === right.leidos
    && left.destinatarios === right.destinatarios;
}

function sameMessage(left: Message, right: Message) {
  return left.id === right.id
    && left.contenido === right.contenido
    && left.remitente_id === right.remitente_id
    && left.remitente === right.remitente
    && left.es_mio === right.es_mio
    && left.created_at === right.created_at
    && left.referencia?.tipo === right.referencia?.tipo
    && left.referencia?.id === right.referencia?.id
    && left.referencia?.titulo === right.referencia?.titulo
    && left.referencia?.url === right.referencia?.url
    && sameDeliveryStatus(left, right);
}

function sameChat(left: Chat, right: Chat) {
  return left.id === right.id
    && left.route_key === right.route_key
    && left.tipo === right.tipo
    && left.titulo === right.titulo
    && left.subtitulo === right.subtitulo
    && left.href === right.href
    && left.no_leidos === right.no_leidos
    && left.updated_at === right.updated_at
    && left.ultimo_mensaje === right.ultimo_mensaje
    && left.ultimo_remitente === right.ultimo_remitente
    && left.en_linea === right.en_linea
    && left.participantes_en_linea === right.participantes_en_linea;
}

function processId(chat: Chat) {
  const id = Number(chat.proceso_id);
  if (Number.isInteger(id) && id > 0) return id;
  const match = chat.route_key.match(/^process:(\d+):/);
  return match ? Number(match[1]) : null;
}

function preview(value?: string | null) {
  return (value ?? "").replace(/\r\n?/g, "\n").split("\n")
    .map((line) => line.replace(/^\s*>\s?/, "").replace(/^\s*[-*]\s+/, "").replace(/^\s*\d+[.)]\s+/, ""))
    .join(" ");
}

function timeText(value: string) {
  return new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" }).format(new Date(value));
}

function dayKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Bogota" }).format(new Date(value));
}

function dayLabel(value: string) {
  return new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota" }).format(new Date(value));
}

function FloatingMessageTimeline({ messages }: { messages: Message[] }) {
  return <div className="mx-auto flex max-w-3xl flex-col gap-0">
    {messages.map((message, index) => {
      const previous = messages[index - 1];
      const next = messages[index + 1];
      const sameDayAsPrevious = !!previous && dayKey(previous.created_at) === dayKey(message.created_at);
      const sameDayAsNext = !!next && dayKey(next.created_at) === dayKey(message.created_at);
      const sameSender = (left: Message, right: Message) => left.remitente_id !== null && right.remitente_id !== null
        ? left.remitente_id === right.remitente_id
        : left.es_mio === right.es_mio && left.remitente === right.remitente;
      const closeInTime = (left: Message, right: Message) => {
        const elapsed = new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
        return elapsed >= 0 && elapsed <= 5 * 60 * 1000;
      };
      const sameGroupAsPrevious = !!previous && sameDayAsPrevious && sameSender(previous, message) && closeInTime(previous, message);
      const sameGroupAsNext = !!next && sameDayAsNext && sameSender(message, next) && closeInTime(message, next);
      const bubbleCorners = message.es_mio
        ? (sameGroupAsPrevious ? "rounded-tr-md" : "rounded-tr-sm") + " " + (sameGroupAsNext ? "rounded-br-md" : "rounded-br-sm")
        : (sameGroupAsPrevious ? "rounded-tl-md" : "rounded-tl-sm") + " " + (sameGroupAsNext ? "rounded-bl-md" : "rounded-bl-sm");
      return <Fragment key={message.id}>
        {(!previous || !sameDayAsPrevious) && <div className="my-3 flex justify-center"><span className="rounded-full border border-border bg-surface/90 px-3 py-1 text-[10px] font-medium text-foreground-muted shadow-sm">{dayLabel(message.created_at)}</span></div>}
        <article className={`max-w-[88%] rounded-xl px-3 py-2 text-sm shadow-sm ${message.es_mio ? "ml-auto bg-primary-light text-foreground" : "mr-auto bg-surface text-foreground"} ${bubbleCorners} ${sameGroupAsPrevious ? "mt-0" : "mt-2"}`}>
          {!message.es_mio && !sameGroupAsPrevious && <p className="mb-1 text-[10px] font-semibold text-primary">{message.remitente}</p>}
          <div className="break-words leading-5">{renderMessageMarkdown(message.contenido)}</div>
          <div className="mt-1 flex justify-end gap-1 text-[10px] text-foreground-muted"><time>{timeText(message.created_at)}</time>{message.es_mio && (message.estado_entrega === "ENVIADO" ? <Check className="size-3.5" /> : <CheckCheck className={`size-3.5 ${message.estado_entrega === "LEIDO" ? "text-primary" : ""}`} />)}</div>
        </article>
      </Fragment>;
    })}
  </div>;
}

export default function ChatFloatingButton() {
  const { user, token } = useSession();
  const pathname = usePathname();
  const isFirmChat = user?.rol === "CLIENTE" || user?.rol === "ABOGADO_ADMIN" || user?.rol === "ADMIN";
  const viewport = useChatViewport();
  const [open, setOpen] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selected, setSelected] = useState<Chat | null>(null);
  const [selectedProcessId, setSelectedProcessId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const lastMessageId = useRef(0);
  const lastReadAckId = useRef(0);
  const activeChatId = useRef<number | null>(null);
  const selectedChatRef = useRef<Chat | null>(selected);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const refocusComposerAfterSendRef = useRef(false);
  const selectedChatId = selected?.id ?? null;
  selectedChatRef.current = selected;

  const unreadChats = chats.filter((chat) => chat.no_leidos > 0).length;
  const processGroups = useMemo(() => {
    const grouped = new Map<number, Chat[]>();
    chats.forEach((chat) => {
      const id = processId(chat);
      if (id) grouped.set(id, [...(grouped.get(id) ?? []), chat]);
    });
    return [...grouped.entries()].map(([id, items]) => ({
      id,
      titulo: items[0]?.subtitulo || `Proceso ${id}`,
      chats: items.sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    })).sort((a, b) => (b.chats[0]?.updated_at ?? "").localeCompare(a.chats[0]?.updated_at ?? ""));
  }, [chats]);
  const topLevelItems = useMemo(() => [
    ...processGroups.map((group) => ({ kind: "process" as const, group, updated_at: group.chats[0]?.updated_at ?? "" })),
    ...chats.filter((chat) => !processId(chat)).map((chat) => ({ kind: "chat" as const, chat, updated_at: chat.updated_at })),
  ].sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [chats, processGroups]);

  const loadChats = useCallback(async () => {
    if (!token) return;
    try {
      const response = await apiRequest("/api/chat/conversaciones", { token });
      const incoming = await response.json() as Chat[];
      setChats((current) => preserveChatList(current, incoming));
      setSelected((current) => {
        if (!current) return current;
        const updated = incoming.find((chat) => chat.id === current.id);
        return updated && !sameChat(current, updated) ? updated : current;
      });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar los chats.");
    }
  }, [token]);

  const loadMessages = useCallback(async (chat: Chat, reset = false) => {
    if (!token || activeChatId.current !== chat.id || document.visibilityState !== "visible") return;
    setLoading(reset);
    try {
      const after = reset ? 0 : lastMessageId.current;
      const response = await apiRequest(`/api/chat/resolver?clave=${encodeURIComponent(chat.route_key)}&after_id=${after}`, { token });
      const result = await response.json() as { mensajes: Message[]; estados_mensajes?: ({ id: number } & DeliveryStatus)[] };
      if (activeChatId.current !== chat.id) return;
      const statuses = new Map((result.estados_mensajes ?? []).map(({ id, ...status }) => [id, status]));
      setMessages((current) => {
        const byId = new Map((reset ? [] : current).map((message) => [message.id, message]));
        result.mensajes.forEach((message) => {
          const next = { ...message, ...statuses.get(message.id) };
          const existing = byId.get(message.id);
          if (!existing || !sameMessage(existing, next)) byId.set(message.id, next);
        });
        statuses.forEach((status, id) => {
          const existing = byId.get(id);
          if (existing && !sameDeliveryStatus(existing, status)) byId.set(id, { ...existing, ...status });
        });
        const next = [...byId.values()].sort((a, b) => a.id - b.id);
        return next.length === current.length && next.every((item, index) => item === current[index]) ? current : next;
      });
      lastMessageId.current = reset ? (result.mensajes.at(-1)?.id ?? 0) : Math.max(lastMessageId.current, result.mensajes.at(-1)?.id ?? 0);
      const latestId = result.mensajes.at(-1)?.id ?? lastMessageId.current;
      if (latestId > lastReadAckId.current) {
        await apiRequest(`/api/chat/conversaciones/${chat.id}/leido`, { method: "POST", token, body: JSON.stringify({ mensaje_id: latestId }) });
        lastReadAckId.current = latestId;
      }
      setError("");
    } catch (cause) {
      if (activeChatId.current === chat.id) setError(cause instanceof Error ? cause.message : "No se pudo cargar la conversación.");
    } finally {
      if (activeChatId.current === chat.id) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const initialLoad = window.setTimeout(() => { void loadChats(); }, 0);
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void loadChats();
      const active = selectedChatRef.current;
      if (open && active) void loadMessages(active);
    };
    const timer = window.setInterval(refresh, 5000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearTimeout(initialLoad); window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [token, open, selectedChatId, loadChats, loadMessages]);

  useEffect(() => {
    if (!open || !selectedChatId) return;
    const activeId = selectedChatId;
    const initialLoad = window.setTimeout(() => {
      const active = selectedChatRef.current;
      if (active?.id === activeId) void loadMessages(active, true);
    }, 0);
    return () => window.clearTimeout(initialLoad);
  }, [open, selectedChatId, loadMessages]);
  useLayoutEffect(() => {
    const container = messagesContainerRef.current;
    if (selected && container) container.scrollTop = container.scrollHeight;
  }, [selectedChatId, messages.length, loading]);

  useEffect(() => {
    if (sending || !refocusComposerAfterSendRef.current) return;
    refocusComposerAfterSendRef.current = false;
    const frame = window.requestAnimationFrame(() => composerRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [sending]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!token || !selected || !content || sending) return;
    const previousDraft = draft;
    setDraft(""); setSending(true); setError("");
    try {
      await apiRequest(`/api/chat/conversaciones/${selected.id}/mensajes`, { method: "POST", token, body: JSON.stringify({ contenido: content }) });
      await loadMessages(selected); await loadChats();
    } catch (cause) {
      setDraft(previousDraft);
      setError(cause instanceof Error ? cause.message : "No se pudo enviar el mensaje.");
    } finally { setSending(false); }
  }

  const floatingStyle = {
    "--chat-visual-height": viewport.height ? `${viewport.height}px` : "100dvh",
    "--chat-visual-top": `${viewport.offsetTop}px`,
  } as CSSProperties;

  const firmFloatingClass = "fixed inset-x-0 top-[var(--chat-visual-top,0px)] z-[80] flex h-[var(--chat-visual-height,100dvh)] w-screen flex-col overflow-hidden border-0 bg-surface shadow-2xl sm:inset-auto sm:top-auto sm:bottom-24 sm:right-6 sm:h-[min(620px,calc(100dvh-6rem))] sm:w-[min(380px,calc(100vw-2rem))] sm:rounded-2xl sm:border";
  const standardFloatingClass = viewport.keyboardOpen
    ? "fixed inset-x-0 top-[var(--chat-visual-top,0px)] z-[80] flex h-[var(--chat-visual-height,100dvh)] w-screen flex-col overflow-hidden rounded-none border-0 bg-surface shadow-2xl sm:inset-auto sm:top-auto sm:bottom-24 sm:right-6 sm:h-[min(620px,calc(100dvh-6rem))] sm:w-[min(380px,calc(100vw-2rem))] sm:rounded-2xl sm:border"
    : "fixed bottom-20 right-4 z-[80] flex h-[min(620px,calc(100dvh-6rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl sm:bottom-24 sm:right-6";

  function openChat(chat: Chat) {
    activeChatId.current = chat.id;
    lastMessageId.current = 0;
    lastReadAckId.current = 0;
    setSelected(chat);
    setMessages([]);
    setError("");
  }

  if (!user || !token || pathname.split("/").includes("chat")) return null;

  return <>
    {open && <section aria-label="Chat flotante" style={floatingStyle} className={isFirmChat ? firmFloatingClass : standardFloatingClass}>
      <header className="flex items-center gap-2 border-b border-border bg-surface-muted px-3 py-3">
        {selected && <button type="button" onClick={() => { activeChatId.current = null; setSelected(null); setMessages([]); lastMessageId.current = 0; lastReadAckId.current = 0; setError(""); }} aria-label="Volver a la lista de chats" className={`grid ${isFirmChat ? "size-11" : "size-8"} place-items-center rounded-full hover:bg-surface-hover`}><ArrowLeft className="size-4" /></button>}
        <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold">{selected?.titulo ?? (selectedProcessId ? processGroups.find((group) => group.id === selectedProcessId)?.titulo : null) ?? "Chats"}</h2><p className="text-[10px] text-foreground-muted">{selected ? selected.tipo === "PROCESO_COLABORADORES" ? selected.participantes_en_linea ? `${selected.participantes_en_linea} en línea` : "Nadie en línea" : selected.en_linea ? "En línea" : "Desconectado" : "Conversaciones recientes"}</p></div>
        {!selected && <ChatPushNotifications />}
        {selected && <Link href={selected.href} title="Abrir pantalla completa" className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10">Pantalla completa</Link>}
        <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar chat flotante" className={`grid ${isFirmChat ? "size-11" : "size-8"} place-items-center rounded-full hover:bg-surface-hover`}><X className="size-4" /></button>
      </header>
      {error && <p role="alert" className="border-b border-border bg-danger/5 px-3 py-2 text-xs text-danger">{error}</p>}
      {!selected ? <div className="min-h-0 flex-1 overflow-y-auto">
        {selectedProcessId ? <><button type="button" onClick={() => setSelectedProcessId(null)} className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-xs font-medium text-primary"><ArrowLeft className="size-3.5" />Todos los chats</button>{(processGroups.find((group) => group.id === Number(selectedProcessId))?.chats ?? []).map((chat) => <button key={chat.id} type="button" onClick={() => openChat(chat)} className="flex w-full items-center gap-3 border-b border-border px-3 py-3 text-left hover:bg-surface-hover"><span className="grid size-9 place-items-center rounded-full bg-primary/10 text-primary"><MessageCircle className="size-4" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{chat.titulo}</strong><span className="block truncate text-[10px] text-foreground-muted">{chat.ultimo_remitente ? `${chat.ultimo_remitente}: ` : ""}{preview(chat.ultimo_mensaje)}</span></span>{chat.no_leidos > 0 && <span className="grid size-5 place-items-center rounded-full bg-emerald-600 text-[10px] text-white">{chat.no_leidos}</span>}</button>)}</> : <>
          {topLevelItems.map((item) => {
            if (item.kind === "chat") {
              const chat = item.chat;
              return <button key={chat.id} type="button" onClick={() => openChat(chat)} className="flex w-full items-center gap-3 border-b border-border px-3 py-3 text-left hover:bg-surface-hover"><span className="grid size-9 place-items-center rounded-full bg-primary/10 text-primary"><MessageCircle className="size-4" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{chat.titulo}</strong><span className="block truncate text-[10px] text-foreground-muted">{chat.ultimo_remitente ? `${chat.ultimo_remitente}: ` : ""}{preview(chat.ultimo_mensaje)}</span></span>{chat.tipo === "PROCESO_COLABORADORES" ? chat.participantes_en_linea ? <span className="size-2 rounded-full bg-emerald-500" title={`${chat.participantes_en_linea} en línea`} /> : null : <span className={`size-2 rounded-full ${chat.en_linea ? "bg-emerald-500" : "bg-gray-400"}`} title={chat.en_linea ? "En línea" : "Desconectado"} />}{chat.no_leidos > 0 && <span className="grid size-5 place-items-center rounded-full bg-emerald-600 text-[10px] text-white">{chat.no_leidos}</span>}</button>;
            }
            const { group } = item;
            const unread = group.chats.reduce((sum, chat) => sum + chat.no_leidos, 0);
            const latest = group.chats[0];
            return <button key={`process-${group.id}`} type="button" onClick={() => setSelectedProcessId(group.id)} className="flex w-full items-center gap-3 border-b border-border px-3 py-3 text-left hover:bg-surface-hover"><span className="grid size-9 place-items-center rounded-full bg-primary/10 text-primary"><MessageCircle className="size-4" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{group.titulo}</strong><span className="block truncate text-[10px] text-foreground-muted">{group.chats.length} chats ? {latest?.ultimo_remitente ? `${latest.ultimo_remitente}: ` : ""}{preview(latest?.ultimo_mensaje)}</span></span>{unread > 0 && <span className="grid size-5 place-items-center rounded-full bg-emerald-600 text-[10px] text-white">{unread > 99 ? "99+" : unread}</span>}</button>;
          })}
          {!chats.length && <p className="px-4 py-12 text-center text-sm text-foreground-muted">No hay conversaciones disponibles.</p>}
        </>}
      </div> : <>
        <div ref={messagesContainerRef} className="min-h-0 flex-1 overflow-y-auto bg-background px-3 py-3">{loading ? <p className="py-8 text-center text-xs text-foreground-muted">Cargando mensajes...</p> : messages.length ? <FloatingMessageTimeline messages={messages} /> : <p className="py-8 text-center text-xs text-foreground-muted">Aun no hay mensajes en esta conversacion.</p>}</div>
        <form onSubmit={(event) => void send(event)} className="flex items-end gap-2 border-t border-border p-2"><textarea ref={composerRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (draft.trim() && !sending) { refocusComposerAfterSendRef.current = true; event.currentTarget.form?.requestSubmit(); } } }} disabled={sending} rows={2} maxLength={12000} placeholder="Escribe un mensaje..." className="max-h-24 min-h-10 min-w-0 flex-1 resize-none overflow-y-auto rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" /><button type="submit" disabled={!draft.trim() || sending} aria-label="Enviar mensaje" className={`grid ${isFirmChat ? "size-11" : "size-9"} shrink-0 place-items-center rounded-full bg-primary !text-white disabled:opacity-50`}><Send className="size-4" /></button></form>
      </>}
    </section>}
    {!(open && isFirmChat) && <button type="button" onClick={() => { setOpen((value) => !value); setSelectedProcessId(null); }} aria-label={`Abrir chats${unreadChats ? `, ${unreadChats} conversaciones sin leer` : ""}`} className="fixed bottom-4 right-4 z-[80] grid size-14 place-items-center rounded-full bg-primary !text-white shadow-xl transition hover:scale-105 sm:bottom-6 sm:right-6"><MessageCircle className="size-6" />{unreadChats > 0 && <span className="absolute -right-1 -top-1 grid min-w-6 place-items-center rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-bold text-white">{unreadChats > 99 ? "99+" : unreadChats}</span>}</button>}
  </>;
}
