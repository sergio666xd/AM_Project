export type ChatListEntry = {
  id: number;
  clave: string;
  route_key: string;
  tipo: string;
  titulo: string;
  subtitulo: string;
  href: string;
  no_leidos: number;
  updated_at: string;
  proceso_id?: number | null;
  ultimo_mensaje?: string | null;
  ultimo_remitente?: string | null;
  en_linea?: boolean;
  participantes_en_linea?: number;
};

function sameChat(left: ChatListEntry, right: ChatListEntry) {
  return left.id === right.id
    && left.clave === right.clave
    && left.route_key === right.route_key
    && left.tipo === right.tipo
    && left.titulo === right.titulo
    && left.subtitulo === right.subtitulo
    && left.href === right.href
    && left.no_leidos === right.no_leidos
    && left.updated_at === right.updated_at
    && left.proceso_id === right.proceso_id
    && left.ultimo_mensaje === right.ultimo_mensaje
    && left.ultimo_remitente === right.ultimo_remitente
    && left.en_linea === right.en_linea
    && left.participantes_en_linea === right.participantes_en_linea;
}

export function preserveChatList<T extends ChatListEntry>(current: T[], incoming: T[]): T[] {
  if (current.length === incoming.length && current.every((chat, index) => sameChat(chat, incoming[index]))) {
    return current;
  }

  const currentById = new Map(current.map((chat) => [chat.id, chat]));
  return incoming.map((chat) => {
    const existing = currentById.get(chat.id);
    return existing && sameChat(existing, chat) ? existing : chat;
  });
}

export function upsertChat<T extends ChatListEntry>(current: T[], incoming: T): T[] {
  const next = [incoming, ...current.filter((chat) => chat.id !== incoming.id)]
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
  return preserveChatList(current, next);
}
