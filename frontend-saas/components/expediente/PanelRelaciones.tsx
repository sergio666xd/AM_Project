"use client";

import { useCallback, useId, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ExternalLink, FileText, Plus, Search, Trash2, UserPlus, UserRound, Users } from "lucide-react";

import { CAMPO, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { AgregarRadicadoModal } from "@/components/radicados/AgregarRadicadoModal";
import type { Relaciones } from "@/components/expediente/Expediente";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Radicado } from "@/components/ui/Radicado";
import { RowActionsMenu, type RowAction } from "@/components/ui/RowActionsMenu";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SheetHeader } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { diaCorto } from "@/lib/fechas";
import { useLoadEffect } from "@/lib/useLoadEffect";

const BASE = "/gestion-procesos/abogado";
type Cliente = Relaciones["clientes"][number];
type RadicadoDelProceso = Relaciones["radicados"][number];
type Quitar = { tipo: "cliente"; item: Cliente } | { tipo: "radicado"; item: RadicadoDelProceso };

/** Quién tiene acceso al proceso en el portal y qué radicados se siguen en él. */
export function PanelRelaciones({ procesoId, relaciones, onRelaciones }: {
  procesoId: number;
  relaciones: Relaciones;
  onRelaciones: (relaciones: Relaciones) => void;
}) {
  const { toast } = useToast();
  const [darAcceso, setDarAcceso] = useState(false);
  const [agregarRadicado, setAgregarRadicado] = useState(false);
  const [quitar, setQuitar] = useState<Quitar | null>(null);
  const editable = relaciones.puede_editar;

  async function confirmarQuitar() {
    if (!quitar) return;
    const { data, error } = quitar.tipo === "cliente"
      ? await api.DELETE("/api/v2/procesos/{proceso_id}/clientes/{cliente_id}", { params: { path: { proceso_id: procesoId, cliente_id: quitar.item.id } } })
      : await api.DELETE("/api/v2/procesos/{proceso_id}/radicados/{radicado_id}", { params: { path: { proceso_id: procesoId, radicado_id: quitar.item.id } } });
    if (!data) throw new Error(mensajeDeError(error));
    onRelaciones(data);
    toast({ title: quitar.tipo === "cliente" ? `${quitar.item.nombre} ya no ve este proceso` : "Radicado quitado del proceso", tone: "success" });
  }

  const accionesCliente: RowAction<Cliente>[] = [
    { label: "Abrir la ficha", icon: <UserRound size={16} />, href: (c) => `${BASE}/clientes/${c.id}` },
    { label: "Quitar el acceso", icon: <Trash2 size={16} />, tone: "danger", separated: true, hidden: () => !editable, onSelect: (c) => setQuitar({ tipo: "cliente", item: c }) },
  ];
  const accionesRadicado: RowAction<RadicadoDelProceso>[] = [
    { label: "Abrir el radicado", icon: <ExternalLink size={16} />, href: (r) => `${BASE}/radicados/${r.id}` },
    { label: "Quitar del proceso", icon: <Trash2 size={16} />, tone: "danger", separated: true, hidden: () => !editable, onSelect: (r) => setQuitar({ tipo: "radicado", item: r }) },
  ];

  return (
    <div className="grid xl:grid-cols-2 xl:divide-x xl:divide-line">
      <section aria-labelledby="titulo-clientes" className="min-w-0">
        <SheetHeader
          title={<span id="titulo-clientes">Clientes con acceso</span>}
          count={relaciones.clientes.length}
          action={editable ? <Button variant="secondary" size="sm" icon={<UserPlus size={15} />} onClick={() => setDarAcceso(true)}>Dar acceso</Button> : undefined}
        />
        {relaciones.clientes.length === 0 ? (
          <EmptyState icon={Users} title="Ningún cliente ve este proceso" description="Al darle acceso, el cliente sigue el proceso en su portal y recibe los avisos." />
        ) : (
          <ul className="divide-y divide-line">
            {relaciones.clientes.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <Link href={`${BASE}/clientes/${c.id}`} className="block truncate text-[14.5px] font-semibold text-ink hover:underline">{c.nombre}</Link>
                  <p className="truncate text-[13px] text-ink-3">{[c.email, c.whatsapp].filter(Boolean).join(" · ")}</p>
                </div>
                <RowActionsMenu row={c} actions={accionesCliente} label={`Acciones para ${c.nombre}`} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="titulo-radicados" className="min-w-0 border-t border-line xl:border-t-0">
        <SheetHeader
          title={<span id="titulo-radicados">Radicados</span>}
          count={relaciones.radicados.length}
          action={editable ? <Button variant="secondary" size="sm" icon={<Plus size={15} />} onClick={() => setAgregarRadicado(true)}>Agregar radicado</Button> : undefined}
        />
        {relaciones.radicados.length === 0 ? (
          <EmptyState icon={FileText} title="Sin radicados" description="Agregue el radicado del juzgado y la plataforma consulta sus actuaciones en la Rama Judicial." />
        ) : (
          <ul className="divide-y divide-line">
            {relaciones.radicados.map((r) => {
              const ultima = r.actuaciones[0];
              return (
                <li key={r.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <Radicado numero={r.numero} className="text-[14.5px] font-semibold text-ink" />
                    <p className="mt-1 text-[13px] text-ink-2">
                      {r.total_actuaciones === 0 ? "Aún sin actuaciones registradas." : (
                        <>
                          <span className="tabular-nums">{r.total_actuaciones}</span> {r.total_actuaciones === 1 ? "actuación" : "actuaciones"}
                          {ultima && <> · la última: <span className="text-ink">{ultima.texto}</span>{ultima.fecha ? `, ${diaCorto(ultima.fecha)}` : ""}</>}
                        </>
                      )}
                    </p>
                  </div>
                  <RowActionsMenu row={r} actions={accionesRadicado} label={`Acciones para el radicado ${r.numero}`} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {darAcceso && (
        <DarAccesoModal
          procesoId={procesoId}
          yaVinculados={new Set(relaciones.clientes.map((c) => c.id))}
          onClose={() => setDarAcceso(false)}
          onListo={(r, nombre) => { onRelaciones(r); toast({ title: `${nombre} ya ve este proceso`, description: "Le avisamos en su portal y por sus canales.", tone: "success" }); }}
        />
      )}
      {agregarRadicado && (
        <AgregarRadicadoModal
          procesoId={procesoId}
          onClose={() => setAgregarRadicado(false)}
          onListo={(r, aviso) => { onRelaciones(r.relaciones); toast({ title: "Radicado agregado", description: aviso, tone: "success" }); }}
        />
      )}
      <ConfirmDialog
        open={quitar !== null}
        onClose={() => setQuitar(null)}
        onConfirm={confirmarQuitar}
        destructive
        title={quitar?.tipo === "cliente" ? `¿Quitarle el acceso a ${quitar.item.nombre}?` : "¿Quitar el radicado del proceso?"}
        description={quitar?.tipo === "cliente"
          ? "Deja de ver el proceso en su portal y de recibir sus avisos. Su cuenta y lo que ya entregó se conservan."
          : "El radicado y sus actuaciones siguen en la firma; solo dejan de aparecer en este expediente."}
        confirmLabel={quitar?.tipo === "cliente" ? "Quitar el acceso" : "Quitar el radicado"}
      />
    </div>
  );
}

function DarAccesoModal({ procesoId, yaVinculados, onClose, onListo }: {
  procesoId: number;
  yaVinculados: Set<number>;
  onClose: () => void;
  onListo: (relaciones: Relaciones, nombre: string) => void;
}) {
  const id = useId();
  const [modo, setModo] = useState<"existente" | "nuevo">("existente");
  const [clientes, setClientes] = useState<Esquemas["ClienteResumen"][] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [elegido, setElegido] = useState<number | null>(null);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [canal, setCanal] = useState<"EMAIL" | "WHATSAPP">("EMAIL");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const { data } = await api.GET("/api/v2/clientes", { params: { query: { grupo: "todos" } } });
    setClientes(data?.items ?? []);
  }, []);
  useLoadEffect(cargar);

  const disponibles = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase("es");
    return (clientes ?? [])
      .filter((c) => !yaVinculados.has(c.id))
      .filter((c) => !texto || `${c.nombre} ${c.email} ${c.documento ?? ""}`.toLocaleLowerCase("es").includes(texto));
  }, [busqueda, clientes, yaVinculados]);

  async function vincular(clienteId: number, nombreCliente: string) {
    const { data, error } = await api.POST("/api/v2/procesos/{proceso_id}/clientes", {
      params: { path: { proceso_id: procesoId } }, body: { cliente_id: clienteId },
    });
    if (!data) return mensajeDeError(error);
    onListo(data, nombreCliente);
    onClose();
    return null;
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setErrores({});
    if (modo === "existente") {
      const cliente = disponibles.find((c) => c.id === elegido);
      if (!cliente) {
        setErrores({ general: "Elija un cliente de la lista." });
        return;
      }
      setGuardando(true);
      const fallo = await vincular(cliente.id, cliente.nombre);
      setGuardando(false);
      if (fallo) setErrores({ general: fallo });
      return;
    }
    const faltan: Record<string, string> = {};
    if (nombre.trim().length < 3) faltan.nombre = "Escriba el nombre completo.";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) faltan.email = "Escriba un correo válido.";
    if (canal === "WHATSAPP" && !whatsapp.trim()) faltan.whatsapp = "Para enviarle el acceso por WhatsApp, escriba su número.";
    if (Object.keys(faltan).length) {
      setErrores(faltan);
      return;
    }
    setGuardando(true);
    const { data, error } = await api.POST("/api/v2/clientes", {
      body: { nombre: nombre.trim(), email: email.trim(), whatsapp: whatsapp.trim() || null, canal },
    });
    if (!data) {
      setGuardando(false);
      const campos = (error as { campos?: Record<string, string> } | undefined)?.campos ?? {};
      setErrores({ ...campos, general: mensajeDeError(error) });
      return;
    }
    const fallo = await vincular(data.id, data.nombre);
    setGuardando(false);
    if (fallo) setErrores({ general: `La cuenta quedó creada y el acceso enviado, pero no se pudo dar acceso al proceso: ${fallo}` });
  }

  return (
    <Modal open onClose={onClose} title="Dar acceso a un cliente" description="El cliente verá el proceso en su portal y recibirá sus avisos.">
      <form onSubmit={guardar} noValidate>
        <SegmentedControl
          label="Cliente existente o nuevo"
          value={modo}
          onChange={(v) => { setModo(v); setErrores({}); }}
          options={[{ value: "existente", label: "Un cliente de la firma" }, { value: "nuevo", label: "Un cliente nuevo" }]}
        />
        {modo === "existente" ? (
          <div className="mt-4">
            <label htmlFor={`${id}-buscar`} className="sr-only">Buscar cliente</label>
            <div className="relative">
              <Search aria-hidden="true" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <input id={`${id}-buscar`} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre, correo o documento" className={cx(CAMPO, "pl-9")} />
            </div>
            <div role="radiogroup" aria-label="Clientes" className="mt-2 max-h-72 overflow-y-auto rounded-lg shadow-[0_0_0_1px_var(--line)]">
              {!clientes ? (
                <p className="px-3 py-4 text-[14px] text-ink-3">Cargando los clientes…</p>
              ) : disponibles.length === 0 ? (
                <p className="px-3 py-4 text-[14px] text-ink-3">{busqueda ? "Ningún cliente coincide con la búsqueda." : "Todos los clientes de la firma ya tienen acceso."}</p>
              ) : disponibles.map((c) => (
                <label key={c.id} className={cx("flex min-h-12 cursor-pointer items-center gap-3 border-b border-line px-3 py-2 last:border-b-0 has-[:focus-visible]:bg-manila", elegido === c.id ? "bg-navy-soft" : "hover:bg-sheet-2")}>
                  <input type="radio" name={`${id}-cliente`} checked={elegido === c.id} onChange={() => setElegido(c.id)} className="size-4 accent-[var(--navy)]" />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold text-ink">{c.nombre}</span>
                    <span className="block truncate text-[13px] text-ink-3">{c.email}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-4">
            <div>
              <label htmlFor={`${id}-nombre`} className={ETIQUETA}>Nombre completo</label>
              <input id={`${id}-nombre`} value={nombre} maxLength={150} onChange={(e) => setNombre(e.target.value)} aria-invalid={errores.nombre ? true : undefined} className={CAMPO} />
              {errores.nombre && <p className="mt-1.5 text-[13px] text-bad">{errores.nombre}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`${id}-email`} className={ETIQUETA}>Correo</label>
                <input id={`${id}-email`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={errores.email ? true : undefined} className={CAMPO} />
                {errores.email && <p className="mt-1.5 text-[13px] text-bad">{errores.email}</p>}
              </div>
              <div>
                <label htmlFor={`${id}-whatsapp`} className={ETIQUETA}>WhatsApp <span className="font-normal text-ink-3">(opcional)</span></label>
                <input id={`${id}-whatsapp`} type="tel" value={whatsapp} maxLength={20} onChange={(e) => setWhatsapp(e.target.value)} aria-invalid={errores.whatsapp ? true : undefined} className={CAMPO} />
                {errores.whatsapp && <p className="mt-1.5 text-[13px] text-bad">{errores.whatsapp}</p>}
              </div>
            </div>
            <fieldset>
              <legend className={ETIQUETA}>Enviarle el acceso por</legend>
              <SegmentedControl label="Canal del acceso" value={canal} onChange={setCanal} options={[{ value: "EMAIL", label: "Correo" }, { value: "WHATSAPP", label: "WhatsApp" }]} />
              <p className="mt-1.5 text-[13px] text-ink-3">Le llega una contraseña temporal que debe cambiar al entrar.</p>
            </fieldset>
          </div>
        )}
        {errores.general && <p role="alert" className="mt-3 text-[13px] text-bad">{errores.general}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={guardando} icon={<UserPlus size={16} />}>{modo === "nuevo" ? "Crear y dar acceso" : "Dar acceso"}</Button>
        </div>
      </form>
    </Modal>
  );
}
