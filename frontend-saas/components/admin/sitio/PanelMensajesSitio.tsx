"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, Copy, MessageCircle, RefreshCw, RotateCcw } from "lucide-react";

import { Campo } from "@/components/clientes/ClienteFormModal";
import { CAMPO } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Sheet } from "@/components/ui/Sheet";
import { Tag } from "@/components/ui/Tag";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { fechaConHora, fechaRelativa } from "@/lib/fechas";
import { AREA_CONSULTA, ESTADO_MENSAJE, telefonoLegible, type EstadoMensajeSitio, type MensajeSitio } from "@/lib/sitio";
import { useValorDeUrl } from "@/lib/useAccionDeUrl";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Filtro = EstadoMensajeSitio | "todos";

const VACIOS: Record<Filtro, string> = {
  nueva: "No hay mensajes sin atender.",
  atendida: "Aún no se ha marcado ningún mensaje como atendido.",
  descartada: "No hay mensajes descartados.",
  todos: "Aún no ha llegado ningún mensaje por el formulario del sitio.",
};

function contacto(m: MensajeSitio) {
  return [m.telefono && telefonoLegible(m.telefono), m.correo].filter(Boolean).join(" · ");
}

function Copiar({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      aria-label={copiado ? "Copiado" : etiqueta}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          window.setTimeout(() => setCopiado(false), 1600);
        } catch {
          /* Sin permiso de portapapeles: el texto sigue seleccionable. */
        }
      }}
      className="grid size-10 shrink-0 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-manila hover:text-ink"
    >
      {copiado ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
    </button>
  );
}

function Detalle({ mensaje, onCambio }: { mensaje: MensajeSitio; onCambio: (m: MensajeSitio) => void }) {
  const id = useId();
  const { toast } = useToast();
  const [nota, setNota] = useState(mensaje.nota ?? "");
  const [guardando, setGuardando] = useState<string | null>(null);

  async function cambiar(cuerpo: Esquemas["CambioMensajeSitio"], clave: string, aviso?: string) {
    setGuardando(clave);
    const { data, error } = await api.PUT("/api/v2/admin/sitio/mensajes/{mensaje_id}", {
      params: { path: { mensaje_id: mensaje.id } }, body: cuerpo,
    });
    setGuardando(null);
    if (error || !data) {
      toast({ title: "No se pudo guardar", description: mensajeDeError(error), tone: "error" });
      return;
    }
    onCambio(data);
    if (aviso) toast({ title: aviso, tone: "success" });
  }

  const notaCambiada = (mensaje.nota ?? "") !== nota.trim();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Tag tone={ESTADO_MENSAJE[mensaje.estado].tono}>{ESTADO_MENSAJE[mensaje.estado].nombre}</Tag>
      </div>

      {mensaje.aviso_firma === "fallido" && (
        <div className="rounded-lg bg-bad-soft px-3 py-2.5 text-[13.5px] text-bad">
          <p className="font-semibold">No le llegó el aviso por correo a la firma</p>
          <p className="mt-0.5 break-words">{mensaje.aviso_error ?? "El servidor de correo no respondió."} Responda desde aquí.</p>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-ink-2">Lo que escribió</p>
        <p className="whitespace-pre-wrap break-words rounded-lg bg-sheet-2 px-3.5 py-3 text-[15px] leading-relaxed text-ink shadow-[inset_0_0_0_1px_var(--line)]">
          {mensaje.mensaje}
        </p>
      </div>

      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-ink-2">Cómo responderle</p>
        <ul className="divide-y divide-line rounded-lg shadow-[inset_0_0_0_1px_var(--line)]">
          {mensaje.telefono && (
            <li className="flex items-center gap-3 py-1 pl-3.5 pr-1">
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] text-ink-2">WhatsApp o teléfono</span>
                <span className="block select-all text-[15px] tabular-nums text-ink">{telefonoLegible(mensaje.telefono)}</span>
              </span>
              <Copiar texto={mensaje.telefono} etiqueta="Copiar el número" />
            </li>
          )}
          {mensaje.correo && (
            <li className="flex items-center gap-3 py-1 pl-3.5 pr-1">
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] text-ink-2">Correo</span>
                <span className="block select-all truncate text-[15px] text-ink">{mensaje.correo}</span>
              </span>
              <Copiar texto={mensaje.correo} etiqueta="Copiar el correo" />
            </li>
          )}
        </ul>
        {mensaje.whatsapp_url && (
          <a
            href={mensaje.whatsapp_url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg bg-sheet px-3.5 text-[14px] font-semibold text-ink shadow-[0_0_0_1px_var(--line-strong)] transition-colors hover:bg-sheet-2"
          >
            <MessageCircle size={16} aria-hidden="true" /> Escribirle por WhatsApp
          </a>
        )}
      </div>

      <Campo id={`${id}-nota`} etiqueta="Nota interna" opcional ayuda="Solo la ve la administración. Por ejemplo: «La abogada lo llamó el martes».">
        <textarea id={`${id}-nota`} value={nota} onChange={(e) => setNota(e.target.value)} rows={3} maxLength={2000} className={`${CAMPO} h-auto py-2.5`} />
      </Campo>
      {notaCambiada && (
        <Button size="sm" variant="secondary" loading={guardando === "nota"} onClick={() => void cambiar({ nota }, "nota", "Nota guardada")}>
          Guardar la nota
        </Button>
      )}

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13.5px]">
        <dt className="text-ink-2">Recibido</dt>
        <dd className="tabular-nums text-ink">{fechaConHora(mensaje.recibida_en)}</dd>
        {mensaje.atendida_en && (
          <>
            <dt className="text-ink-2">{mensaje.estado === "descartada" ? "Descartado" : "Atendido"}</dt>
            <dd className="tabular-nums text-ink">{fechaConHora(mensaje.atendida_en)}{mensaje.atendida_por ? ` por ${mensaje.atendida_por}` : ""}</dd>
          </>
        )}
      </dl>

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        {mensaje.estado === "nueva" ? (
          <>
            <Button icon={<Check size={16} />} loading={guardando === "atendida"}
              onClick={() => void cambiar({ estado: "atendida", ...(notaCambiada ? { nota } : {}) }, "atendida", "Mensaje marcado como atendido")}>
              Marcar como atendido
            </Button>
            <Button variant="ghost" loading={guardando === "descartada"}
              onClick={() => void cambiar({ estado: "descartada", ...(notaCambiada ? { nota } : {}) }, "descartada", "Mensaje descartado")}>
              Descartar
            </Button>
          </>
        ) : (
          <Button variant="secondary" icon={<RotateCcw size={16} />} loading={guardando === "nueva"}
            onClick={() => void cambiar({ estado: "nueva" }, "nueva", "El mensaje volvió a sin atender")}>
            Volver a sin atender
          </Button>
        )}
      </div>
    </div>
  );
}

/** Mensajes del formulario de contacto del sitio público. */
export function PanelMensajesSitio() {
  const [filtro, setFiltro] = useState<Filtro>("nueva");
  const [pagina, setPagina] = useState<Esquemas["PaginaMensajesSitio"] | null>(null);
  const [items, setItems] = useState<MensajeSitio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<MensajeSitio | null>(null);
  const [pedido, setPedido] = useState<number | null>(null);
  const ultima = useRef(0);

  const cargar = useCallback(async (cursor?: string) => {
    const esta = ++ultima.current;
    setCargando(true);
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/admin/sitio/mensajes", {
      params: { query: { estado: filtro === "todos" ? undefined : filtro, limite: 30, cursor } },
    });
    if (esta !== ultima.current) return;
    if (fallo || !data) setError(mensajeDeError(fallo));
    else {
      setPagina(data);
      setItems((actuales) => (cursor ? [...actuales, ...data.items] : data.items));
    }
    setCargando(false);
  }, [filtro]);
  useLoadEffect(cargar);

  // ?mensaje=12 llega desde el correo de aviso y desde la actividad.
  useValorDeUrl("mensaje", useCallback((valor: string) => {
    const n = Number(valor);
    if (Number.isInteger(n) && n > 0) setPedido(n);
  }, []));
  useEffect(() => {
    if (pedido === null) return;
    let vigente = true;
    void api.GET("/api/v2/admin/sitio/mensajes/{mensaje_id}", { params: { path: { mensaje_id: pedido } } }).then(({ data }) => {
      if (vigente && data) setAbierto(data);
    });
    return () => { vigente = false; };
  }, [pedido]);

  function actualizar(m: MensajeSitio) {
    setAbierto(m);
    const sigueEnLista = filtro === "todos" || m.estado === filtro;
    setItems((xs) => (sigueEnLista ? xs.map((x) => (x.id === m.id ? m : x)) : xs.filter((x) => x.id !== m.id)));
    void api.GET("/api/v2/admin/sitio/mensajes", { params: { query: { limite: 1 } } }).then(({ data }) => {
      if (data) setPagina((p) => (p ? { ...p, conteo: data.conteo } : p));
    });
  }

  const conteo = pagina?.conteo;

  return (
    <div>
      <PageHeader
        title="Mensajes del sitio"
        description="Lo que las personas escriben en el formulario de contacto del sitio web. A la firma le llega un aviso por correo con cada uno."
      />
      <SegmentedControl<Filtro>
        label="Qué mensajes ver"
        value={filtro}
        onChange={setFiltro}
        options={[
          { value: "nueva", label: "Sin atender", count: conteo?.nueva || undefined },
          { value: "atendida", label: "Atendidos" },
          { value: "descartada", label: "Descartados" },
          { value: "todos", label: "Todos" },
        ]}
      />

      <div className="mt-4">
        {error ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-bad-soft px-4 py-3 text-bad">
            <p className="flex-1 text-[14px]">{error}</p>
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
          </div>
        ) : !pagina && cargando ? (
          <LoadingState label="Cargando los mensajes" rows={4} />
        ) : (
          <Sheet aria-label="Mensajes" className="overflow-hidden">
            {items.length ? (
              <ul className="divide-y divide-line">
                {items.map((m) => (
                  <li key={m.id}>
                    <button type="button" onClick={() => setAbierto(m)}
                      className="flex w-full flex-col gap-1.5 px-4 py-3.5 text-left transition-colors hover:bg-sheet-2 sm:flex-row sm:items-start sm:gap-4">
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-[15px] font-semibold text-ink">{m.nombre}</span>
                          <span className="text-[13px] text-ink-2">{AREA_CONSULTA[m.area]}</span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-[14px] text-ink-2">{m.mensaje}</span>
                        <span className="mt-1 block truncate text-[13px] tabular-nums text-ink-3">{contacto(m)}</span>
                      </span>
                      <span className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end sm:gap-1">
                        <Tag tone={ESTADO_MENSAJE[m.estado].tono}>{ESTADO_MENSAJE[m.estado].nombre}</Tag>
                        {m.aviso_firma === "fallido" && m.estado === "nueva" && <Tag tone="bad">Sin aviso por correo</Tag>}
                        <span className="text-[12.5px] tabular-nums text-ink-3">{fechaRelativa(m.recibida_en)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-[14px] text-ink-2">{VACIOS[filtro]}</p>
            )}
            {pagina?.siguiente && (
              <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2 text-[13px] text-ink-2">
                <span className="tabular-nums">{items.length} de {pagina.total}</span>
                <Button size="sm" variant="ghost" loading={cargando} onClick={() => void cargar(pagina.siguiente ?? undefined)}>Ver más</Button>
              </div>
            )}
          </Sheet>
        )}
      </div>

      <Drawer
        open={abierto !== null}
        onClose={() => { setAbierto(null); setPedido(null); }}
        title={abierto?.nombre ?? "Mensaje"}
        subtitle={abierto ? `${AREA_CONSULTA[abierto.area]} · ${fechaRelativa(abierto.recibida_en)}` : undefined}
      >
        {abierto && <Detalle key={abierto.id} mensaje={abierto} onCambio={actualizar} />}
      </Drawer>
    </div>
  );
}
