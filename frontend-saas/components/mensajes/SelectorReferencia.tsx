"use client";

import { useCallback, useMemo, useState } from "react";
import { CalendarDays, ClipboardList, FileText, Gavel, RefreshCw, Search } from "lucide-react";

import { CAMPO } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Radicado } from "@/components/ui/Radicado";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { api, mensajeDeError } from "@/lib/api-v2/cliente";
import { tituloReferencia, type OpcionReferencia } from "@/lib/mensajes";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Categoria = "radicados" | "tareas" | "eventos" | "documentos";

const TIPOS: Record<Categoria, OpcionReferencia["tipo"][]> = {
  radicados: ["RADICADO", "ACTUACION"],
  tareas: ["TAREA", "SUBTAREA"],
  eventos: ["EVENTO"],
  documentos: ["DOCUMENTO"],
};

const VACIO: Record<Categoria, string> = {
  radicados: "El proceso aún no tiene radicados.",
  tareas: "No hay tareas que la otra persona pueda ver.",
  eventos: "No hay eventos del proceso que la otra persona pueda ver.",
  documentos: "No hay documentos que todos en la conversación puedan ver.",
};

type Grupo = { titulo: string | null; cabecera?: OpcionReferencia; items: OpcionReferencia[] };

function agrupar(categoria: Categoria, opciones: OpcionReferencia[]): Grupo[] {
  if (categoria === "radicados") {
    return opciones.filter((o) => o.tipo === "RADICADO").map((radicado) => ({
      titulo: null,
      cabecera: radicado,
      items: opciones.filter((o) => o.tipo === "ACTUACION" && o.grupo === String(radicado.id)),
    }));
  }
  if (categoria === "tareas") {
    const tareas = opciones.filter((o) => o.tipo === "TAREA");
    const sueltas = opciones.filter((o) => o.tipo === "SUBTAREA" && !tareas.some((t) => t.id === o.padre_id));
    return [
      ...tareas.map((tarea) => ({ titulo: null, cabecera: tarea, items: opciones.filter((o) => o.tipo === "SUBTAREA" && o.padre_id === tarea.id) })),
      ...(sueltas.length ? [{ titulo: "Subtareas del cliente", items: sueltas }] : []),
    ];
  }
  if (categoria === "documentos") {
    const grupos = new Map<string, OpcionReferencia[]>();
    for (const o of opciones) grupos.set(o.grupo ?? "Otros documentos", [...(grupos.get(o.grupo ?? "Otros documentos") ?? []), o]);
    return [...grupos].map(([titulo, items]) => ({ titulo, items }));
  }
  return [{ titulo: null, items: opciones }];
}

/** Elegir un radicado, actuación, tarea, evento o documento del proceso para enlazarlo en el mensaje. */
export function SelectorReferencia({ conversacionId, open, onClose, onElegir }: {
  conversacionId: number;
  open: boolean;
  onClose: () => void;
  onElegir: (opcion: OpcionReferencia) => void;
}) {
  const [opciones, setOpciones] = useState<OpcionReferencia[] | null>(null);
  const [cargadas, setCargadas] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<Categoria>("radicados");
  const [busqueda, setBusqueda] = useState("");

  const cargar = useCallback(async () => {
    if (!open || cargadas === conversacionId) return;
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/conversaciones/{conversacion_id}/referencias", {
      params: { path: { conversacion_id: conversacionId } },
    });
    if (data) {
      setOpciones(data);
      setCargadas(conversacionId);
      const primera = (Object.keys(TIPOS) as Categoria[]).find((c) => data.some((o) => TIPOS[c].includes(o.tipo)));
      if (primera) setCategoria(primera);
    } else setError(mensajeDeError(fallo));
  }, [open, cargadas, conversacionId]);
  useLoadEffect(cargar);

  const lista = cargadas === conversacionId ? opciones ?? [] : [];
  const texto = busqueda.trim().toLocaleLowerCase("es");
  const coincide = (o: OpcionReferencia) => !texto || [o.titulo, o.grupo, o.radicado].filter(Boolean).join(" ").toLocaleLowerCase("es").includes(texto);
  const grupos = useMemo(() => {
    const deCategoria = lista.filter((o) => TIPOS[categoria].includes(o.tipo));
    return agrupar(categoria, deCategoria)
      .map((g) => ({ ...g, items: g.items.filter(coincide), cabeceraVisible: g.cabecera ? coincide(g.cabecera) : false }))
      .filter((g) => g.cabeceraVisible || g.items.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `coincide` depende solo de `texto`.
  }, [lista, categoria, texto]);

  function elegir(opcion: OpcionReferencia) {
    onElegir(opcion);
    setBusqueda("");
    onClose();
  }

  const opcionesCategoria = (Object.keys(TIPOS) as Categoria[]).map((c) => ({
    value: c,
    label: { radicados: "Radicados", tareas: "Tareas", eventos: "Eventos", documentos: "Documentos" }[c],
    count: lista.filter((o) => TIPOS[c].includes(o.tipo)).length,
  }));

  return (
    <Modal open={open} onClose={onClose} title="Enlazar al mensaje" description="Quien lo reciba podrá abrirlo con un toque. Solo aparece lo que todos en la conversación pueden ver.">
      <div className="space-y-3 px-5 pb-5 pt-4">
        <SegmentedControl label="Qué enlazar" value={categoria} onChange={setCategoria} options={opcionesCategoria} />
        <label className="relative block">
          <span className="sr-only">Buscar</span>
          <Search aria-hidden="true" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar" className={`${CAMPO} pl-9`} />
        </label>
        <div className="max-h-[min(50dvh,24rem)] overflow-y-auto rounded-lg shadow-[0_0_0_1px_var(--line)]" aria-busy={cargadas !== conversacionId && !error}>
          {error ? (
            <div role="alert" className="flex flex-col items-center gap-3 px-4 py-8 text-center text-[14px] text-bad">
              {error}
              <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
            </div>
          ) : cargadas !== conversacionId ? (
            <ul aria-hidden="true" className="divide-y divide-line">
              {[0, 1, 2].map((i) => <li key={i} className="px-4 py-3.5"><span className="block h-3.5 w-2/3 animate-pulse rounded bg-manila" /></li>)}
            </ul>
          ) : grupos.length === 0 ? (
            <p className="px-4 py-8 text-center text-[14px] text-ink-3">{texto ? "Nada coincide con la búsqueda." : VACIO[categoria]}</p>
          ) : (
            <div className="divide-y divide-line">
              {grupos.map((g, i) => (
                <section key={g.cabecera ? `${g.cabecera.tipo}:${g.cabecera.id}` : `${g.titulo}:${i}`}>
                  {g.titulo && <h3 className="bg-sheet-2 px-4 py-2 text-[12px] font-semibold text-ink-2">{g.titulo}</h3>}
                  {g.cabecera && (
                    <Fila opcion={g.cabecera} onElegir={elegir} destacada />
                  )}
                  {g.items.length > 0 && (
                    <ul className={g.cabecera ? "border-t border-line" : undefined}>
                      {g.items.map((o) => <li key={`${o.tipo}:${o.id}`}><Fila opcion={o} onElegir={elegir} sangria={Boolean(g.cabecera)} /></li>)}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

const ICONO: Record<OpcionReferencia["tipo"], typeof Gavel> = {
  RADICADO: Gavel,
  ACTUACION: FileText,
  TAREA: ClipboardList,
  SUBTAREA: ClipboardList,
  EVENTO: CalendarDays,
  DOCUMENTO: FileText,
};

function Fila({ opcion, onElegir, destacada, sangria }: {
  opcion: OpcionReferencia;
  onElegir: (opcion: OpcionReferencia) => void;
  destacada?: boolean;
  sangria?: boolean;
}) {
  const Icono = ICONO[opcion.tipo];
  return (
    <button
      type="button"
      onClick={() => onElegir(opcion)}
      className={`flex min-h-11 w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-manila focus-visible:bg-manila focus-visible:outline-none ${sangria ? "pl-11" : ""}`}
    >
      <Icono aria-hidden="true" size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ink-3" />
      <span className="min-w-0 flex-1">
        {opcion.tipo === "RADICADO" ? (
          <>
            <Radicado numero={opcion.titulo} copiable={false} className="text-[13.5px] text-ink" />
            <span className="block text-[12.5px] text-ink-3">Enlazar solo el radicado</span>
          </>
        ) : (
          <span className={`block text-[14px] ${destacada ? "font-semibold text-ink" : "text-ink-2"}`}>{tituloReferencia(opcion.titulo)}</span>
        )}
      </span>
    </button>
  );
}
