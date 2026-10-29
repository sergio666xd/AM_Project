"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, Edit3, FileSignature, KeyRound, Mail, MessageCircle, Phone, RefreshCw, Send } from "lucide-react";

import { ClienteFormModal } from "@/components/clientes/ClienteFormModal";
import { ReenviarAccesoDialog } from "@/components/clientes/ReenviarAccesoDialog";
import { SolicitarDocumentosModal } from "@/components/documentos/SolicitarDocumentosModal";
import { Button } from "@/components/ui/Button";
import { Radicado } from "@/components/ui/Radicado";
import { RowActionsMenu } from "@/components/ui/RowActionsMenu";
import { Tag } from "@/components/ui/Tag";
import { api, mensajeDeError } from "@/lib/api-v2/cliente";
import { ACCESO, CANAL, RUTA_CLIENTES, enlaceChat, iniciales, textoPendientes, whatsappDigitos, type FichaCliente } from "@/lib/clientes";
import { ESTADO_CONTRATO, enlaceContratosDelProceso } from "@/lib/contratos";
import { RUTA_DOCUMENTOS } from "@/lib/documentos";
import { nombreEtapa } from "@/lib/etapas";
import { diaCorto, fechaCorta, fechaRelativa } from "@/lib/fechas";
import { useLoadEffect } from "@/lib/useLoadEffect";

const RUTA_PROCESOS = "/gestion-procesos/abogado/procesos";

export default function FichaClientePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const clienteId = Number(id);
  const [ficha, setFicha] = useState<FichaCliente | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [pidiendo, setPidiendo] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/clientes/{cliente_id}", { params: { path: { cliente_id: clienteId } } });
    if (data) setFicha(data);
    else setError(mensajeDeError(fallo));
  }, [clienteId]);
  useLoadEffect(cargar);

  if (error) {
    return (
      <div>
        <Volver />
        <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] bg-bad-soft px-4 py-3 text-bad">
          <p className="flex-1 text-[14px]">{error}</p>
          <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
        </div>
      </div>
    );
  }

  if (!ficha) {
    return (
      <div aria-label="Cargando la ficha" aria-busy="true">
        <Volver />
        <div className="mt-4 h-24 animate-pulse rounded-[var(--radius-lg)] bg-manila" />
        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="h-72 animate-pulse rounded-[var(--radius-lg)] bg-manila" />
          <div className="h-72 animate-pulse rounded-[var(--radius-lg)] bg-manila" />
        </div>
      </div>
    );
  }

  const chat = enlaceChat(ficha);
  const pendiente = textoPendientes(ficha);
  const acceso = ACCESO[ficha.acceso];

  return (
    <div>
      <Volver />
      <header className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-full bg-navy-soft font-display text-[20px] text-navy-ink">
            {iniciales(ficha.nombre)}
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-[28px] leading-tight text-balance text-ink sm:text-[32px]">{ficha.nombre}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {ficha.acceso === "activo"
                ? <span className="text-[13.5px] text-ink-2">{ficha.ultimo_acceso ? `Entró al portal ${fechaRelativa(ficha.ultimo_acceso).toLowerCase()}` : "Entra al portal"}</span>
                : <Tag tone={acceso.tono}>{acceso.nombre} al portal</Tag>}
              {pendiente && <Tag tone={pendiente.tono}>{pendiente.texto}</Tag>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {chat && <Button icon={<MessageCircle size={16} />} onClick={() => router.push(chat)}>Escribirle</Button>}
          <Button variant="secondary" icon={<Send size={16} />} disabled={!ficha.procesos.length} title={ficha.procesos.length ? undefined : "Vincúlalo a un proceso para pedirle documentos."} onClick={() => setPidiendo(true)}>
            Pedir documentos
          </Button>
          <RowActionsMenu
            row={ficha}
            label={`Más acciones de ${ficha.nombre}`}
            actions={[
              { label: "Editar datos", icon: <Edit3 size={16} />, onSelect: () => setEditando(true) },
              { label: "Reenviar acceso", icon: <KeyRound size={16} />, hidden: () => ficha.acceso !== "sin_ingreso", onSelect: () => setReenviando(true) },
              { label: "Enviar correo", icon: <Mail size={16} />, href: () => `mailto:${ficha.email}`, separated: true },
              { label: "Abrir WhatsApp", icon: <Phone size={16} />, href: () => `https://wa.me/${whatsappDigitos(ficha.whatsapp)}`, hidden: () => !ficha.whatsapp },
            ]}
          />
        </div>
      </header>

      {ficha.acceso === "sin_ingreso" && (
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-lg)] bg-warn-soft px-4 py-3 sm:px-5">
          <KeyRound aria-hidden="true" size={18} className="shrink-0 text-ink-2" />
          <p className="min-w-0 flex-1 text-[14px] text-pretty text-ink">
            Aún no ha entrado al portal con su contraseña temporal. Si no le llegó o la perdió, envíale una nueva.
          </p>
          <Button size="sm" variant="secondary" icon={<KeyRound size={14} />} onClick={() => setReenviando(true)}>Reenviar acceso</Button>
        </div>
      )}

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          {ficha.expedientes.length > 0 && (
            <Seccion titulo="Le falta entregar" cuenta={ficha.pendientes.length}>
              {ficha.pendientes.length ? (
                <ul className="divide-y divide-line">
                  {ficha.pendientes.map((p) => (
                    <li key={p.solicitud_id}>
                      <Link href={`${RUTA_DOCUMENTOS}?proceso=${p.proceso.id}#solicitud-${p.solicitud_id}`} className="group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-manila/60 sm:px-5">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-ink">{p.titulo}</p>
                          <p className="mt-0.5 text-[13px] text-ink-3">{p.proceso.nombre}</p>
                          <p className="mt-1.5 text-[14px] text-pretty text-ink-2">
                            {p.faltan.length === p.total ? "Todo: " : `${p.faltan.length} de ${p.total}: `}
                            {p.faltan.join(", ")}
                          </p>
                        </div>
                        {p.fecha_limite && (
                          <Tag tone={p.vencida ? "bad" : "gold"}>{p.vencida ? `Venció el ${diaCorto(p.fecha_limite)}` : `Para el ${diaCorto(p.fecha_limite)}`}</Tag>
                        )}
                        <ChevronRight aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <Vacio>Está al día con los documentos.</Vacio>
              )}
            </Seccion>
          )}

          <Seccion titulo="Procesos activos" cuenta={ficha.expedientes.length}>
            {ficha.expedientes.length ? (
              <ul className="divide-y divide-line">
                {ficha.expedientes.map((p) => (
                  <li key={p.id}>
                    <Link href={`${RUTA_PROCESOS}/${p.id}`} className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-manila/60 sm:px-5">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-ink">{p.nombre}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-3">
                          <span>{nombreEtapa(p.etapa)}</span>
                          {p.radicados.map((numero) => <Radicado key={numero} numero={numero} copiable={false} />)}
                          <span>{p.responsable}</span>
                        </div>
                      </div>
                      <ChevronRight aria-hidden="true" size={16} className="shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Vacio>No está vinculado a ningún proceso activo. Vincúlalo desde el expediente, en Clientes y radicados.</Vacio>
            )}
          </Seccion>

          {ficha.expedientes.length > 0 && (
            <Seccion titulo="Lo que le has contado" descripcion="Los últimos avisos de actuaciones que le enviaste.">
              {ficha.avisos.length ? (
                <ul className="divide-y divide-line">
                  {ficha.avisos.map((a, i) => (
                    <li key={i} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] text-pretty text-ink">{a.asunto}</p>
                        <p className="mt-0.5 text-[13px] text-ink-3">{a.proceso.nombre}</p>
                      </div>
                      <span className="shrink-0 text-[13px] tabular-nums text-ink-3">{fechaCorta(a.enviado_en)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Vacio>Aún no le has avisado de ninguna actuación. Desde los folios del expediente, «Avisar al cliente» le explica qué pasó.</Vacio>
              )}
            </Seccion>
          )}

          {ficha.contratos && (ficha.contratos.length > 0 || ficha.expedientes.length > 0) && (
            <Seccion titulo="Contratos" cuenta={ficha.contratos.length}>
              {ficha.contratos.length ? (
                <ul className="divide-y divide-line">
                  {ficha.contratos.map((c) => (
                    <li key={c.id}>
                      <Link href={enlaceContratosDelProceso(c.proceso.id)} className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-manila/60 sm:px-5">
                        <FileSignature aria-hidden="true" size={16} className="shrink-0 text-ink-3" />
                        <div className="min-w-0 flex-1">
                          <p className="text-ink">{c.proceso.nombre}</p>
                          {c.firmado_en && <p className="text-[13px] text-ink-3">Firmado el {fechaCorta(c.firmado_en)}</p>}
                        </div>
                        <Tag tone={ESTADO_CONTRATO[c.estado as keyof typeof ESTADO_CONTRATO]?.tono ?? "neutral"}>
                          {ESTADO_CONTRATO[c.estado as keyof typeof ESTADO_CONTRATO]?.nombre ?? c.estado}
                        </Tag>
                        <ChevronRight aria-hidden="true" size={16} className="shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <Vacio>Sin contratos. Se redactan desde la pestaña Contratos del expediente.</Vacio>
              )}
            </Seccion>
          )}
        </div>

        <aside className="rounded-[var(--radius-lg)] bg-sheet shadow-[0_0_0_1px_var(--line),0_1px_2px_rgb(24_32_58/0.05)] lg:sticky lg:top-24">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
            <h2 className="font-semibold text-ink">Datos</h2>
            <Button size="sm" variant="ghost" className="-mr-2" icon={<Edit3 size={14} />} onClick={() => setEditando(true)}>Editar</Button>
          </div>
          <dl className="divide-y divide-line text-[14px]">
            <Dato nombre="Correo"><a href={`mailto:${ficha.email}`} className="[overflow-wrap:anywhere] text-navy hover:underline">{ficha.email}</a></Dato>
            <Dato nombre="WhatsApp">{ficha.whatsapp ? <span className="tabular-nums">{ficha.whatsapp}</span> : null}</Dato>
            <Dato nombre="Documento">{ficha.documento ? <span className="tabular-nums">{ficha.documento}</span> : null}</Dato>
            <Dato nombre="Domicilio">{[ficha.domicilio, ficha.direccion].filter(Boolean).join(" · ") || null}</Dato>
            <Dato nombre="Avisos por">{ficha.canal ? CANAL[ficha.canal] : null}</Dato>
            <Dato nombre="Cliente desde">{fechaCorta(ficha.creado_en)}</Dato>
          </dl>
        </aside>
      </div>

      <ClienteFormModal open={editando} clienteId={ficha.id} onClose={() => setEditando(false)} onGuardado={setFicha} />
      <ReenviarAccesoDialog cliente={reenviando ? ficha : null} onClose={() => setReenviando(false)} onEnviado={() => void cargar()} />
      <SolicitarDocumentosModal
        open={pidiendo}
        onClose={() => setPidiendo(false)}
        procesoInicial={ficha.procesos[0]?.id}
        onCreada={() => void cargar()}
      />
    </div>
  );
}

function Volver() {
  return (
    <Link href={RUTA_CLIENTES} className="inline-flex min-h-10 items-center gap-1.5 text-[14px] text-ink-2 hover:text-ink">
      <ArrowLeft aria-hidden="true" size={16} /> Clientes
    </Link>
  );
}

function Seccion({ titulo, descripcion, cuenta, children }: { titulo: string; descripcion?: string; cuenta?: number; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] bg-sheet shadow-[0_0_0_1px_var(--line),0_1px_2px_rgb(24_32_58/0.05)]">
      <header className="border-b border-line px-4 py-3 sm:px-5">
        <h2 className="font-semibold text-ink">
          {titulo}
          {cuenta !== undefined && cuenta > 0 && <span className="ml-2 text-[13px] font-normal tabular-nums text-ink-3">{cuenta}</span>}
        </h2>
        {descripcion && <p className="text-[13px] text-ink-3">{descripcion}</p>}
      </header>
      {children}
    </section>
  );
}

function Vacio({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-[14px] text-pretty text-ink-3 sm:px-5">{children}</p>;
}

function Dato({ nombre, children }: { nombre: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 px-4 py-2.5 sm:px-5">
      <dt className="text-ink-3">{nombre}</dt>
      <dd className="min-w-0 text-ink">{children ?? <span className="text-ink-3">Sin registrar</span>}</dd>
    </div>
  );
}
