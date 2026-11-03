"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, RefreshCw, UserCheck, X } from "lucide-react";

import type { Trato } from "@/components/cuenta/CambioSeguro";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { fechaRelativa } from "@/lib/fechas";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Cambio = Esquemas["CambioPerfil"];

const inicialMinuscula = (texto: string) => texto.charAt(0).toLowerCase() + texto.slice(1);

const TEXTOS = {
  tu: {
    descripcion: "Lo que tus clientes pidieron corregir en sus datos. Al aprobar, se actualizan en su cuenta y en los contratos nuevos.",
    vacio: "Cuando un cliente pida corregir sus datos desde su portal, lo verás aquí.",
    motivo: "El cliente verá este motivo en su portal. Explícale qué debe corregir.",
  },
  usted: {
    descripcion: "Lo que los clientes pidieron corregir en sus datos. Al aprobar, se actualizan en su cuenta y en los contratos nuevos.",
    vacio: "Cuando un cliente pida corregir sus datos desde su portal, aparecerá aquí.",
    motivo: "El cliente verá este motivo en su portal. Explíquele qué debe corregir.",
  },
} as const;

/** Revisión de los cambios de datos que piden los clientes: antes y después, aprobar o rechazar con motivo. */
export function CambiosPerfil({ trato, rutaProceso, rutaCliente }: {
  trato: Trato;
  rutaProceso: (id: number) => string;
  rutaCliente?: (id: number) => string;
}) {
  const t = TEXTOS[trato];
  const { toast } = useToast();
  const [cambios, setCambios] = useState<Cambio[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aprobando, setAprobando] = useState<number | null>(null);
  const [rechazo, setRechazo] = useState<Cambio | null>(null);

  const cargar = useCallback(async () => {
    const { data, error: fallo } = await api.GET("/api/v2/cambios-perfil");
    if (data) {
      setCambios(data.items);
      setError(null);
    } else setError(mensajeDeError(fallo));
  }, []);
  useLoadEffect(cargar);

  function quitar(id: number) {
    setCambios((actual) => actual?.filter((c) => c.id !== id) ?? null);
  }

  async function aprobar(cambio: Cambio) {
    setAprobando(cambio.id);
    const { error: fallo } = await api.POST("/api/v2/cambios-perfil/{solicitud_id}/aprobar", { params: { path: { solicitud_id: cambio.id } }, body: {} });
    setAprobando(null);
    if (fallo) {
      toast({ title: "No se aprobó el cambio", description: mensajeDeError(fallo), tone: "error" });
      return;
    }
    quitar(cambio.id);
    toast({ title: "Datos actualizados", description: `Los datos de ${cambio.cliente} quedaron al día.`, tone: "success" });
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Cambios de perfil"
        description={t.descripcion}
        action={cambios && cambios.length > 0 ? <Button variant="ghost" size="sm" icon={<RefreshCw size={15} />} onClick={() => void cargar()}>Actualizar</Button> : undefined}
      />

      {error && !cambios ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-bad-soft px-4 py-3 text-bad">
          <p className="flex-1 text-[14px]">{error}</p>
          <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
        </div>
      ) : cambios === null ? (
        <div aria-busy="true" className="space-y-4">
          {[0, 1].map((i) => <div key={i} className="skeleton h-48 rounded-xl" />)}
        </div>
      ) : cambios.length === 0 ? (
        <div className="rounded-xl bg-sheet px-6 py-10 text-center shadow-sheet">
          <UserCheck aria-hidden size={28} className="mx-auto text-ink-3" />
          <p className="mt-3 font-display text-[19px] text-ink">No hay cambios por revisar</p>
          <p className="mx-auto mt-1 max-w-[46ch] text-pretty text-[14px] text-ink-2">{t.vacio}</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {cambios.map((c) => (
            <li key={c.id} id={`cambio-${c.id}`} className="scroll-mt-24 overflow-hidden rounded-xl bg-sheet shadow-sheet">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 pt-4 sm:px-6">
                <h2 className="font-display text-[19px] text-ink">
                  {rutaCliente ? <Link href={rutaCliente(c.cliente_id)} className="hover:underline">{c.cliente}</Link> : c.cliente}
                </h2>
                <p className="text-[13.5px] text-ink-3">Pedido {inicialMinuscula(fechaRelativa(c.solicitada_en))}</p>
              </div>
              {c.procesos.length > 0 && (
                <p className="px-5 pt-1 text-[13.5px] text-ink-2 sm:px-6">
                  {c.procesos.length === 1 ? "Proceso: " : "Procesos: "}
                  {c.procesos.map((p, i) => (
                    <span key={p.id}>
                      {i > 0 && " · "}
                      <Link href={rutaProceso(p.id)} className="text-navy-ink underline-offset-2 hover:underline">{p.nombre}</Link>
                    </span>
                  ))}
                </p>
              )}

              <dl className="mx-5 mt-3 divide-y divide-line rounded-lg shadow-[0_0_0_1px_var(--line)] sm:mx-6">
                {c.diferencias.map((d) => (
                  <div key={d.campo} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
                    <dt className="text-[13.5px] font-semibold text-ink-2">{d.etiqueta}</dt>
                    <dd className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[14.5px]">
                      <span className="break-words text-ink-3 line-through decoration-ink-3/60">{d.antes || "Sin dato"}</span>
                      <ArrowRight aria-label="cambia a" size={14} className="shrink-0 text-ink-3" />
                      <span className="break-words font-semibold text-ink">{d.despues || "Sin dato"}</span>
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-line bg-sheet-2 px-5 py-3 sm:px-6">
                <Button variant="secondary" icon={<X size={16} />} disabled={aprobando === c.id} onClick={() => setRechazo(c)}>Rechazar</Button>
                <Button icon={<Check size={16} />} loading={aprobando === c.id} onClick={() => void aprobar(c)}>Aprobar los cambios</Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Rechazo
        cambio={rechazo}
        ayuda={t.motivo}
        onClose={() => setRechazo(null)}
        onHecho={(id) => {
          quitar(id);
          setRechazo(null);
          toast({ title: "Cambio rechazado", description: "El cliente verá el motivo en su portal.", tone: "info" });
        }}
      />
    </div>
  );
}

function Rechazo({ cambio, ayuda, onClose, onHecho }: { cambio: Cambio | null; ayuda: string; onClose: () => void; onHecho: (id: number) => void }) {
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<number | null>(null);

  // Limpia el formulario cada vez que se abre para otro cambio, durante el render.
  if ((cambio?.id ?? null) !== abierto) {
    setAbierto(cambio?.id ?? null);
    setComentario("");
    setError(null);
  }

  async function enviar() {
    if (!cambio) return;
    setEnviando(true);
    setError(null);
    const { error: fallo } = await api.POST("/api/v2/cambios-perfil/{solicitud_id}/rechazar", {
      params: { path: { solicitud_id: cambio.id } },
      body: { comentario: comentario.trim() },
    });
    setEnviando(false);
    if (fallo) {
      setError(mensajeDeError(fallo));
      return;
    }
    onHecho(cambio.id);
  }

  return (
    <Modal open={cambio !== null} onClose={onClose} title={cambio ? `Rechazar el cambio de ${cambio.cliente}` : "Rechazar el cambio"} description={ayuda} size="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
        className="space-y-4"
      >
        <label className="block">
          <span className="mb-1.5 block text-[14px] font-semibold text-ink">Motivo</span>
          <textarea
            required
            rows={4}
            maxLength={1000}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Ej.: El número de documento no coincide con la cédula que nos envió."
            className="block w-full rounded-lg bg-sheet px-3.5 py-2.5 text-[15px] text-ink shadow-[0_0_0_1px_var(--line-strong)] placeholder:text-ink-3 focus:outline-none focus:shadow-[0_0_0_2px_var(--navy)]"
          />
        </label>
        {error && <p role="alert" className="rounded-lg bg-bad-soft px-3.5 py-2.5 text-[14px] text-bad">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="danger" loading={enviando} disabled={!comentario.trim()}>Rechazar</Button>
        </div>
      </form>
    </Modal>
  );
}
