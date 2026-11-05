"use client";

import { useId, useMemo, useState } from "react";
import { AlertTriangle, Eye, FileText, PenLine, Plus, Trash2 } from "lucide-react";

import { Hoja, type Abogado } from "@/components/contratos/Hoja";
import { CAMPO, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SheetHeader } from "@/components/ui/Sheet";
import { Tag } from "@/components/ui/Tag";
import type { Esquemas } from "@/lib/api-v2/cliente";
import {
  contextoContrato, faltantes, firmantes, listasDe, resolverTexto, usaCodigo,
  type Campo, type DatosContrato, type OtraNotificacion, type Persona, type PlantillaBase,
} from "@/lib/contratos/motor";
import { cx } from "@/lib/cx";

export type PlantillaElegible = PlantillaBase & { id?: number | null; nombre: string; descripcion?: string | null };
type Contexto = Esquemas["ContextoContrato"];

const nuevaRef = () => `p${Math.random().toString(36).slice(2, 10)}`;
const personaNueva = (): Persona => ({ ref: nuevaRef(), cliente_id: null, nombre: "", cedula: "", ciudad: "", direccion: "", correo: "", telefono: "", genero: "" });
const otraNueva = (): OtraNotificacion => ({ ref: nuevaRef(), nombre: "", direccion: "", correo: "", telefono: "" });
const titulo = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();

/** Los datos con que empieza un contrato nuevo: el primer cliente del proceso en la primera lista. */
export function datosIniciales(plantilla: PlantillaBase, clientes: Persona[]): DatosContrato {
  const listas = Object.fromEntries(listasDe(plantilla.campos).map((d, i) => [d.clave, i === 0 && clientes[0] ? [{ ...clientes[0] }] : []]));
  const valores = Object.fromEntries(plantilla.campos.filter((c) => c.tipo !== "lista" && c.inicial).map((c) => [c.clave, c.inicial ?? ""]));
  const primera = Object.values(listas).flat()[0];
  return { valores, listas, notificaciones: { personas: primera ? [primera.ref] : [], otras: [] } };
}

const abogadoDe = (fijos: Record<string, string>): Abogado => ({ nombre: fijos["abogado.nombre"] ?? "", documento: fijos["abogado.documento"] ?? "", tarjeta: fijos["abogado.tarjeta"] ?? "" });

/** El contrato resuelto sobre el documento base, con lo que falta resaltado. */
export function VistaContrato({ plantilla, datos, fijos }: { plantilla: PlantillaBase; datos: DatosContrato; fijos: Record<string, string> }) {
  const resultado = useMemo(() => resolverTexto(plantilla.cuerpo, contextoContrato(plantilla, datos, fijos)), [plantilla, datos, fijos]);
  return (
    <Hoja
      bloques={resultado.bloques}
      firmantes={firmantes(plantilla.campos, datos.listas ?? {})}
      rotuloAbogado={plantilla.firmas.abogado ?? "EL ABOGADO"}
      abogado={abogadoDe(fijos)}
    />
  );
}

/** Elegir la plantilla de un contrato nuevo. */
export function ElegirPlantilla({ plantillas, elegida, onElegir }: { plantillas: PlantillaElegible[]; elegida: number | null; onElegir: (id: number) => void }) {
  if (!plantillas.length) {
    return <EmptyState icon={FileText} title="No hay plantillas" description="Cree una plantilla en la página Contratos, pestaña Plantillas, para poder redactar contratos." />;
  }
  return (
    <fieldset className="grid gap-2.5 p-4 sm:grid-cols-2 sm:p-5">
      <legend className="sr-only">Plantilla</legend>
      {plantillas.map((x) => {
        const listas = listasDe(x.campos);
        const propios = x.campos.length - listas.length;
        return (
          <label key={x.id} className={cx("flex cursor-pointer gap-3 rounded-xl bg-sheet p-4 transition-shadow", elegida === x.id ? "shadow-[0_0_0_2px_var(--navy)]" : "shadow-[0_0_0_1px_var(--line-strong)] hover:shadow-[0_0_0_1px_var(--ink-3)]")}>
            <input type="radio" name="plantilla" checked={elegida === x.id} onChange={() => onElegir(x.id!)} className="mt-1 size-4 shrink-0 accent-[var(--navy)]" />
            <span className="min-w-0">
              <span className="block text-[14.5px] font-semibold text-pretty text-ink">{x.nombre}</span>
              {x.descripcion && <span className="mt-0.5 block text-[13px] text-pretty text-ink-3">{x.descripcion}</span>}
              <span className="mt-1.5 block text-[12.5px] text-ink-3">{[`${propios} ${propios === 1 ? "dato" : "datos"} por llenar`, ...listas.map((d) => d.etiqueta.toLowerCase())].join(" · ")}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

/**
 * El formulario de un contrato con plantilla y su vista previa al lado.
 * En celular se alterna entre el formulario y la hoja.
 */
export function FormularioContratoPlantilla({ plantilla, contexto, datos, onCambio, fijos, pie }: {
  plantilla: PlantillaElegible;
  contexto: Contexto;
  datos: DatosContrato;
  onCambio: (datos: DatosContrato) => void;
  fijos: Record<string, string>;
  pie: (faltan: number) => React.ReactNode;
}) {
  const [ver, setVer] = useState<"form" | "hoja">("form");
  const defs = listasDe(plantilla.campos);
  const listas = datos.listas ?? {};
  const personas = defs.flatMap((d) => listas[d.clave] ?? []);
  const notif = { personas: datos.notificaciones?.personas ?? [], otras: datos.notificaciones?.otras ?? [] };
  const usaNotif = usaCodigo(plantilla.cuerpo, "notificaciones");
  const ocupados = personas.map((p) => p.cliente_id).filter(Boolean) as number[];
  const propios = plantilla.campos.filter((c) => c.tipo !== "lista");
  const resultado = useMemo(() => resolverTexto(plantilla.cuerpo, contextoContrato(plantilla, datos, fijos)), [plantilla, datos, fijos]);
  const faltan = faltantes(plantilla, datos, resultado);
  const destinatarios = [...personas.filter((p) => notif.personas.includes(p.ref)), ...notif.otras];

  const cambiar = (parcial: Partial<DatosContrato>) => onCambio({ ...datos, ...parcial });
  const setLista = (clave: string, ps: Persona[]) => cambiar({ listas: { ...listas, [clave]: ps } });
  const setPersona = (clave: string, ref: string, k: keyof Persona, v: string) => setLista(clave, (listas[clave] ?? []).map((p) => (p.ref === ref ? { ...p, [k]: v } : p)));
  const quitar = (clave: string, ref: string) => onCambio({
    ...datos, listas: { ...listas, [clave]: (listas[clave] ?? []).filter((p) => p.ref !== ref) }, notificaciones: { ...notif, personas: notif.personas.filter((r) => r !== ref) },
  });
  const cambiarCliente = (clave: string, ref: string, clienteId: number) => {
    const cliente = contexto.clientes.find((c) => c.cliente_id === clienteId);
    if (!cliente) return;
    // La nueva persona hereda el lugar en notificaciones de la anterior.
    onCambio({
      ...datos,
      listas: { ...listas, [clave]: (listas[clave] ?? []).map((p) => (p.ref === ref ? { ...cliente } : p)) },
      notificaciones: { ...notif, personas: notif.personas.map((r) => (r === ref ? cliente.ref : r)) },
    });
  };
  const setOtra = (ref: string, k: keyof OtraNotificacion, v: string) => cambiar({ notificaciones: { ...notif, otras: notif.otras.map((o) => (o.ref === ref ? { ...o, [k]: v } : o)) } });
  const alternarNotif = (ref: string) => cambiar({ notificaciones: { ...notif, personas: notif.personas.includes(ref) ? notif.personas.filter((r) => r !== ref) : [...notif.personas, ref] } });

  return (
    <div>
      <div className="px-4 pt-4 lg:hidden sm:px-5">
        <SegmentedControl label="Qué ver" value={ver} onChange={setVer} options={[{ value: "form", label: <><PenLine size={14} aria-hidden /> Formulario</> }, { value: "hoja", label: <><Eye size={14} aria-hidden /> Vista previa</> }]} />
      </div>
      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <div className={cx("min-w-0 space-y-4", ver === "hoja" && "hidden lg:block")}>
          {defs.map((d) => {
            const ps = listas[d.clave] ?? [];
            const libre = contexto.clientes.find((c) => !ocupados.includes(c.cliente_id!));
            return (
              <section key={d.clave} className="rounded-xl bg-sheet shadow-[0_0_0_1px_var(--line)]">
                <SheetHeader title={d.etiqueta} count={ps.length} />
                <div className="space-y-3 p-3">
                  {ps.map((p, i) => (
                    <FichaPersona
                      key={p.ref}
                      persona={p}
                      titulo={`${titulo(d.singular || "Persona")} ${i + 1}`}
                      clientes={contexto.clientes}
                      ocupados={ocupados}
                      puedeQuitar={ps.length > 1 || !d.obligatorio}
                      onDato={(k, v) => setPersona(d.clave, p.ref, k, v)}
                      onCliente={(id) => cambiarCliente(d.clave, p.ref, id)}
                      onQuitar={() => quitar(d.clave, p.ref)}
                    />
                  ))}
                  {!ps.length && <p className="px-1 text-[13px] text-ink-3">Aún no hay {d.etiqueta.toLowerCase()}.</p>}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="secondary" icon={<Plus size={15} />} disabled={!libre} title={libre ? undefined : "Todos los clientes del proceso ya están en el contrato"} onClick={() => libre && setLista(d.clave, [...ps, { ...libre }])}>Cliente del proceso</Button>
                    <Button size="sm" variant="secondary" icon={<Plus size={15} />} onClick={() => setLista(d.clave, [...ps, personaNueva()])}>Persona sin registrar</Button>
                  </div>
                  {d.firma !== false && <p className="px-1 text-[12.5px] text-ink-3">Cada {(d.singular || "persona").toLowerCase()} tendrá su espacio de firma y huella al final.</p>}
                </div>
              </section>
            );
          })}

          {usaNotif && (
            <section className="rounded-xl bg-sheet shadow-[0_0_0_1px_var(--line)]">
              <SheetHeader title="Notificaciones" />
              <div className="space-y-3 p-4">
                <p className="text-[13px] text-pretty text-ink-3">Use los datos de una o varias personas del contrato, agregue otra dirección, o ambas.</p>
                <div className="space-y-1">
                  {personas.map((p, i) => (
                    <label key={p.ref} className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1.5 text-[14px] text-ink">
                      <input type="checkbox" checked={notif.personas.includes(p.ref)} onChange={() => alternarNotif(p.ref)} className="mt-1 size-4 accent-[var(--navy)]" />
                      <span className="min-w-0">
                        <span className="block font-semibold">{p.nombre || `Persona ${i + 1}`}{p.cliente_id && <span className="text-[12px] font-normal text-ink-3"> · cliente del proceso</span>}</span>
                        <span className="block break-words text-[12.5px] text-ink-3">{[p.direccion, p.correo, p.telefono].filter(Boolean).join(" · ") || "Sin datos de contacto todavía"}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {notif.otras.map((o, i) => (
                  <div key={o.ref} className="space-y-2.5 rounded-lg bg-sheet-2 p-3 shadow-[0_0_0_1px_var(--line)]">
                    <div className="flex items-center justify-between">
                      <p className="text-[13px] font-semibold text-ink-2">Otra dirección {notif.otras.length > 1 ? i + 1 : ""}</p>
                      <IconButton icon={Trash2} iconSize={15} label="Quitar esta dirección" className="size-8 hover:bg-bad-soft hover:text-bad" onClick={() => cambiar({ notificaciones: { ...notif, otras: notif.otras.filter((y) => y.ref !== o.ref) } })} />
                    </div>
                    <Entrada etiqueta="Nombre" valor={o.nombre ?? ""} onCambio={(v) => setOtra(o.ref, "nombre", v)} />
                    <Entrada etiqueta="Dirección" valor={o.direccion ?? ""} onCambio={(v) => setOtra(o.ref, "direccion", v)} />
                    <div className="grid grid-cols-2 gap-2.5">
                      <Entrada etiqueta="Correo" tipo="email" valor={o.correo ?? ""} onCambio={(v) => setOtra(o.ref, "correo", v)} />
                      <Entrada etiqueta="Teléfono" tipo="tel" valor={o.telefono ?? ""} onCambio={(v) => setOtra(o.ref, "telefono", v)} />
                    </div>
                  </div>
                ))}
                <Button size="sm" variant="ghost" icon={<Plus size={15} />} onClick={() => cambiar({ notificaciones: { ...notif, otras: [...notif.otras, otraNueva()] } })}>Agregar otra dirección</Button>
                {!destinatarios.length && <p className="flex items-center gap-1.5 text-[13px] text-bad"><AlertTriangle size={14} aria-hidden />Elija al menos un destinatario.</p>}
              </div>
            </section>
          )}

          <section className="rounded-xl bg-sheet shadow-[0_0_0_1px_var(--line)]">
            <SheetHeader title="Datos de este contrato" count={propios.length} />
            <div className="space-y-4 p-4">
              {propios.length === 0 && <p className="text-[13.5px] text-ink-3">Esta plantilla no pide datos adicionales.</p>}
              {propios.map((c) => <CampoPropio key={c.clave} campo={c} valor={datos.valores?.[c.clave] ?? ""} onCambio={(v) => cambiar({ valores: { ...datos.valores, [c.clave]: v } })} />)}
            </div>
          </section>
        </div>
        <div className={cx("min-w-0", ver === "form" && "hidden lg:block")}>
          <div className="lg:sticky lg:top-20">
            <VistaContrato plantilla={plantilla} datos={datos} fijos={fijos} />
          </div>
        </div>
      </div>
      {pie(faltan)}
    </div>
  );
}

function Entrada({ etiqueta, valor, onCambio, tipo = "text", bloqueado = false, aviso = false, className }: {
  etiqueta: string; valor: string; onCambio: (v: string) => void; tipo?: "text" | "email" | "tel"; bloqueado?: boolean; aviso?: boolean; className?: string;
}) {
  const id = useId();
  return (
    <div className={cx("min-w-0", className)}>
      <label htmlFor={id} className={ETIQUETA}>{etiqueta}</label>
      <input
        id={id} type={tipo} value={valor} readOnly={bloqueado} onChange={(e) => onCambio(e.target.value)} autoComplete="off" maxLength={300}
        inputMode={tipo === "tel" ? "tel" : undefined} placeholder={aviso ? "Falta en el perfil" : undefined}
        className={cx(CAMPO, bloqueado && "bg-sheet-2 text-ink-2", aviso && "border-warn")}
      />
    </div>
  );
}

function FichaPersona({ persona: p, titulo: t, clientes, ocupados, puedeQuitar, onDato, onCliente, onQuitar }: {
  persona: Persona;
  titulo: string;
  clientes: Persona[];
  ocupados: number[];
  puedeQuitar: boolean;
  onDato: (k: keyof Persona, v: string) => void;
  onCliente: (id: number) => void;
  onQuitar: () => void;
}) {
  const id = useId();
  const registrado = !!p.cliente_id;
  const perfil = clientes.find((c) => c.cliente_id === p.cliente_id);
  // Lo que el perfil ya tiene no se cambia aquí; lo que le falta se completa y se guarda también en el perfil.
  const fijo = (k: "cedula" | "ciudad") => registrado && !!perfil?.[k];
  const falta = (k: keyof Persona) => registrado && !p[k];
  return (
    <div className="rounded-lg bg-sheet-2 p-3 shadow-[0_0_0_1px_var(--line)]">
      <div className="mb-2.5 flex items-center gap-2">
        <p className="text-[13px] font-semibold text-ink-2">{t}</p>
        <Tag tone={registrado ? "navy" : "neutral"}>{registrado ? "Cliente del proceso" : "Sin registrar"}</Tag>
        {puedeQuitar && <IconButton icon={Trash2} iconSize={15} label={`Quitar ${t}`} className="ml-auto size-8 hover:bg-bad-soft hover:text-bad" onClick={onQuitar} />}
      </div>
      <div className="space-y-2.5">
        {registrado ? (
          <div>
            <label htmlFor={`${id}-cliente`} className={ETIQUETA}>Cliente</label>
            <select id={`${id}-cliente`} value={p.cliente_id ?? ""} onChange={(e) => onCliente(Number(e.target.value))} className={CAMPO}>
              {!perfil && <option value={p.cliente_id ?? ""}>{p.nombre}</option>}
              {clientes.map((c) => <option key={c.cliente_id} value={c.cliente_id ?? ""} disabled={c.cliente_id !== p.cliente_id && ocupados.includes(c.cliente_id!)}>{c.nombre}</option>)}
            </select>
          </div>
        ) : (
          <Entrada etiqueta="Nombre completo" valor={p.nombre ?? ""} onCambio={(v) => onDato("nombre", v)} />
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <Entrada etiqueta="Cédula" valor={p.cedula ?? ""} bloqueado={fijo("cedula")} aviso={falta("cedula")} onCambio={(v) => onDato("cedula", v)} />
          <Entrada etiqueta="Ciudad de domicilio" valor={p.ciudad ?? ""} bloqueado={fijo("ciudad")} aviso={falta("ciudad")} onCambio={(v) => onDato("ciudad", v)} />
        </div>
        <div>
          <p className={ETIQUETA}>Género para el texto</p>
          <SegmentedControl label="Género para el texto" value={(p.genero || "ninguno") as "m" | "f" | "ninguno"} onChange={(v) => onDato("genero", v === "ninguno" ? "" : v)} options={[{ value: "m", label: "Masculino" }, { value: "f", label: "Femenino" }]} />
          {!p.genero && <p className="mt-1 text-[12px] text-warn">Elíjalo: de esto dependen palabras como «identificado» o «identificada».</p>}
        </div>
        <details className="group" open={!registrado}>
          <summary className="cursor-pointer list-none text-[13px] font-semibold text-navy-ink hover:underline">
            Contacto para notificaciones{registrado && [p.direccion, p.correo, p.telefono].some((x) => !x) ? " · faltan datos" : ""}
          </summary>
          <div className="mt-2.5 space-y-2.5">
            <Entrada etiqueta="Dirección" valor={p.direccion ?? ""} aviso={falta("direccion")} onCambio={(v) => onDato("direccion", v)} />
            <div className="grid grid-cols-2 gap-2.5">
              <Entrada etiqueta="Correo" tipo="email" valor={p.correo ?? ""} onCambio={(v) => onDato("correo", v)} />
              <Entrada etiqueta="Teléfono" tipo="tel" valor={p.telefono ?? ""} onCambio={(v) => onDato("telefono", v)} />
            </div>
            {registrado && <p className="text-[12px] text-ink-3">La cédula, la ciudad, la dirección y el género que complete aquí también quedan en el perfil del cliente.</p>}
          </div>
        </details>
      </div>
    </div>
  );
}

function CampoPropio({ campo: c, valor, onCambio }: { campo: Campo; valor: string; onCambio: (v: string) => void }) {
  const id = useId();
  const etiqueta = c.etiqueta + (c.obligatorio ? "" : " (opcional)");
  let entrada: React.ReactNode;
  if (c.tipo === "parrafo") entrada = <textarea id={id} rows={3} value={valor} maxLength={5000} onChange={(e) => onCambio(e.target.value)} className={cx(CAMPO, "py-2 leading-relaxed")} />;
  else if (c.tipo === "opciones") {
    entrada = (
      <select id={id} value={valor} onChange={(e) => onCambio(e.target.value)} className={CAMPO}>
        <option value="">Elija una opción</option>
        {(c.opciones ?? []).map((o) => <option key={o}>{o}</option>)}
      </select>
    );
  } else if (c.tipo === "pesos") {
    entrada = (
      <div className="relative">
        <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-ink-3">$</span>
        <input id={id} inputMode="numeric" value={valor ? Number(valor.replace(/\D/g, "")).toLocaleString("es-CO").replace(/,/g, ".") : ""} onChange={(e) => onCambio(e.target.value.replace(/\D/g, "").slice(0, 15))} className={cx(CAMPO, "pl-7 tabular-nums")} />
      </div>
    );
  } else if (c.tipo === "porcentaje") {
    entrada = (
      <div className="relative">
        <input id={id} inputMode="decimal" value={valor} onChange={(e) => onCambio(e.target.value.replace(/[^\d,]/g, "").slice(0, 8))} className={cx(CAMPO, "pr-9 tabular-nums")} />
        <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[14px] text-ink-3">%</span>
      </div>
    );
  } else if (c.tipo === "numero") entrada = <input id={id} inputMode="numeric" value={valor} onChange={(e) => onCambio(e.target.value.replace(/\D/g, "").slice(0, 15))} className={cx(CAMPO, "tabular-nums")} />;
  else if (c.tipo === "fecha") entrada = <input id={id} type="date" value={valor} onChange={(e) => onCambio(e.target.value)} className={CAMPO} />;
  else entrada = <input id={id} value={valor} maxLength={500} onChange={(e) => onCambio(e.target.value)} className={CAMPO} />;
  return (
    <div>
      <label htmlFor={id} className={ETIQUETA}>{etiqueta}</label>
      {entrada}
      {c.ayuda && <p className="mt-1 text-[12.5px] text-pretty text-ink-3">{c.ayuda}</p>}
    </div>
  );
}
