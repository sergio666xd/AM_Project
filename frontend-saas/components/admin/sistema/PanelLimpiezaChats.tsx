"use client";

import { useCallback, useId, useState, type FormEvent } from "react";
import { Eraser, RefreshCw } from "lucide-react";

import { Campo } from "@/components/clientes/ClienteFormModal";
import { CAMPO } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { fechaRelativa } from "@/lib/fechas";
import { TIPO_CHAT } from "@/lib/sistema";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Chat = Esquemas["ChatParaLimpiar"];

function titulo(c: Chat) {
  return c.proceso ? `${TIPO_CHAT[c.tipo]} · ${c.proceso}` : TIPO_CHAT[c.tipo];
}

function Vaciar({ chat, onCerrar, onVaciado }: { chat: Chat | null; onCerrar: () => void; onVaciado: (borrados: number) => void }) {
  const id = useId();
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [vaciando, setVaciando] = useState(false);

  function cerrar() {
    setTexto("");
    setError(null);
    onCerrar();
  }

  async function vaciar(e: FormEvent) {
    e.preventDefault();
    if (!chat || texto.trim() !== "VACIAR") return;
    setVaciando(true);
    setError(null);
    const { data, error: fallo } = await api.POST("/api/v2/admin/chats/{chat_id}/vaciar", {
      params: { path: { chat_id: chat.id } }, body: { confirmacion: "VACIAR" },
    });
    setVaciando(false);
    if (fallo || !data) { setError(mensajeDeError(fallo)); return; }
    setTexto("");
    onVaciado(data.mensajes_eliminados);
  }

  return (
    <Modal open={chat !== null} onClose={cerrar} size="sm" title="Vaciar la conversación"
      description="Se borran todos los mensajes para todas las personas. La conversación queda vacía y se puede seguir usando. No se puede deshacer.">
      {chat && (
        <form onSubmit={vaciar} noValidate className="space-y-4">
          <div className="rounded-lg bg-sheet-2 px-3 py-2.5 text-[13.5px] shadow-[inset_0_0_0_1px_var(--line)]">
            <p className="font-semibold text-ink">{titulo(chat)}</p>
            <p className="mt-0.5 text-ink-2">{chat.participantes.join(", ")}</p>
            <p className="mt-0.5 tabular-nums text-ink-2">{chat.mensajes === 1 ? "1 mensaje" : `${chat.mensajes} mensajes`}</p>
          </div>
          <Campo id={`${id}-c`} etiqueta="Escriba VACIAR para confirmar" error={error ?? undefined}>
            <input id={`${id}-c`} value={texto} onChange={(e) => setTexto(e.target.value.toUpperCase())} autoComplete="off" spellCheck={false} className={`${CAMPO} font-mono`} />
          </Campo>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={cerrar}>Cancelar</Button>
            <Button type="submit" variant="danger" loading={vaciando} disabled={texto.trim() !== "VACIAR"}>Vaciar</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function PanelLimpiezaChats() {
  const { toast } = useToast();
  const [pagina, setPagina] = useState<Esquemas["PaginaChats"] | null>(null);
  const [items, setItems] = useState<Chat[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aVaciar, setAVaciar] = useState<Chat | null>(null);

  const cargar = useCallback(async (cursor?: string) => {
    setCargando(true);
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/admin/chats", { params: { query: { limite: 50, cursor } } });
    if (fallo || !data) setError(mensajeDeError(fallo));
    else {
      setPagina(data);
      setItems((actuales) => (cursor ? [...actuales, ...data.items] : data.items));
    }
    setCargando(false);
  }, []);
  useLoadEffect(cargar);

  return (
    <div>
      <PageHeader title="Limpieza de chats" description="Vacíe una conversación cuando haya que borrar lo que se escribió. Aquí solo se ve quiénes participan y cuántos mensajes hay, nunca su contenido." />
      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-bad-soft px-4 py-3 text-bad">
          <p className="flex-1 text-[14px]">{error}</p>
          <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
        </div>
      ) : !pagina && cargando ? (
        <LoadingState label="Cargando las conversaciones" rows={5} />
      ) : (
        <Sheet aria-label="Conversaciones" className="overflow-hidden">
          {items.length ? (
            <ul className="divide-y divide-line">
              {items.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="truncate text-[14px] font-semibold text-ink">{titulo(c)}</p>
                    <p className="truncate text-[13px] text-ink-2">{c.participantes.join(", ") || "Sin participantes"}</p>
                  </div>
                  <p className="text-[13px] tabular-nums text-ink-2 sm:w-44 sm:text-right">
                    {c.mensajes === 0 ? "Vacía" : `${c.mensajes === 1 ? "1 mensaje" : `${c.mensajes} mensajes`} · ${fechaRelativa(c.ultimo_mensaje)}`}
                  </p>
                  <Button size="sm" variant="secondary" icon={<Eraser size={14} />} disabled={c.mensajes === 0} onClick={() => setAVaciar(c)}>
                    Vaciar
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-[14px] text-ink-2">Aún no hay conversaciones.</p>
          )}
          {pagina?.siguiente && (
            <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2 text-[13px] text-ink-2">
              <span className="tabular-nums">{items.length} de {pagina.total}</span>
              <Button size="sm" variant="ghost" loading={cargando} onClick={() => void cargar(pagina.siguiente ?? undefined)}>Ver más</Button>
            </div>
          )}
        </Sheet>
      )}
      <Vaciar
        chat={aVaciar}
        onCerrar={() => setAVaciar(null)}
        onVaciado={(borrados) => {
          const id = aVaciar?.id;
          setAVaciar(null);
          setItems((xs) => xs.map((c) => (c.id === id ? { ...c, mensajes: 0, ultimo_mensaje: null } : c)));
          toast({ title: "Conversación vaciada", description: borrados === 1 ? "Se borró 1 mensaje." : `Se borraron ${borrados} mensajes.`, tone: "success" });
        }}
      />
    </div>
  );
}
