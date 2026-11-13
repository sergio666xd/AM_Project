"use client";

import { useCallback, useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Ban, CalendarClock, CheckCircle2, Eye, FilePen, FilePlus2, FileSignature, Mail, Printer, RotateCcw, Save, Trash2, Upload, XCircle } from "lucide-react";

import {
  ElegirPlantilla, FormularioContratoPlantilla, VistaContrato, datosIniciales, type PlantillaElegible,
} from "@/components/contratos/ContratoConPlantilla";
import { FormularioContrato } from "@/components/contratos/FormularioContrato";
import { CAMPO, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { RowActionsMenu, type RowAction } from "@/components/ui/RowActionsMenu";
import { SheetHeader } from "@/components/ui/Sheet";
import { Tag } from "@/components/ui/Tag";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { ESTADO_CONTRATO } from "@/lib/contratos";
import { cx } from "@/lib/cx";
import { diaLargo, fechaConHora, fechaCorta, hoyISO, horaDe, diaDe } from "@/lib/fechas";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Datos = Esquemas["ContratosDelProceso"];
type Detalle = Esquemas["ContratoDetalle"];
type Contexto = Esquemas["ContextoContrato"];
type DatosContrato = Esquemas["DatosContrato"];
/** Un contrato nuevo: primero se elige la plantilla y luego se llenan sus datos. */
type Borrador = { plantilla: PlantillaElegible | null; datos: DatosContrato | null };
type Motivo = { tipo: "anular" | "terminar"; contrato: Detalle };

const SOLICITUD = { "X-AM-Solicitud": "1" };

/** Abre un PDF que se pide con POST (la vista previa) en una pestaña nueva. */
async function abrirPdf(ruta: string, cuerpo: unknown): Promise<string | null> {
  const ventana = window.open("", "_blank");
  try {
    const respuesta = await fetch(ruta, { method: "POST", credentials: "include", headers: { ...SOLICITUD, "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    if (!respuesta.ok) {
      ventana?.close();
      const datos = await respuesta.json().catch(() => null);
      return mensajeDeError(datos);
    }
    const url = URL.createObjectURL(await respuesta.blob());
    if (ventana) ventana.location.href = url;
    else window.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return null;
  } catch {
    ventana?.close();
    return "No se pudo generar el PDF. Revise su conexión.";
  }
}

/** Los contratos de servicios del proceso: redactarlos, agendar la firma, subir el escaneado y cerrarlos. */
export function PanelContratos({ procesoId, contratoInicial, onCambio }: {
  procesoId: number;
  contratoInicial: number | null;
  onCambio: () => void;
}) {
  const { toast } = useToast();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [elegido, setElegido] = useState<number | "nuevo" | null>(contratoInicial);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [cambios, setCambios] = useState<Record<string, string> | null>(null);
  const [cambiosDatos, setCambiosDatos] = useState<DatosContrato | null>(null);
  const [plantillas, setPlantillas] = useState<PlantillaElegible[] | null>(null);
  const [contexto, setContexto] = useState<Contexto | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [firma, setFirma] = useState<Detalle | null>(null);
  const [motivo, setMotivo] = useState<Motivo | null>(null);
  const [eliminar, setEliminar] = useState<Detalle | null>(null);
  const [reabrir, setReabrir] = useState<Detalle | null>(null);
  const archivo = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    const { data, error } = await api.GET("/api/v2/contratos/proceso/{proceso_id}", { params: { path: { proceso_id: procesoId } } });
    if (!data) {
      setFallo(mensajeDeError(error));
      return;
    }
    setDatos(data);
    setFallo(null);
    setElegido((actual) => actual === "nuevo" || data.items.some((c) => c.id === actual) ? actual : data.items[0]?.id ?? null);
  }, [procesoId]);
  useLoadEffect(cargar);

  // Un borrador con plantilla se edita con los datos del proceso (abogado, fecha, clientes) a mano.
  const borradorConPlantilla = datos?.items.some((c) => c.id === elegido && c.plantilla && c.estado === "BORRADOR" && c.puede_editar) ?? false;
  const cargarContexto = useCallback(async () => {
    if (!borradorConPlantilla || contexto) return;
    await prepararContexto();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prepararContexto solo depende del proceso
  }, [borradorConPlantilla, contexto, procesoId]);
  useLoadEffect(cargarContexto);

  function reemplazar(contrato: Detalle) {
    setDatos((d) => d && { ...d, items: d.items.some((c) => c.id === contrato.id) ? d.items.map((c) => (c.id === contrato.id ? contrato : c)) : [contrato, ...d.items] });
    setElegido(contrato.id);
    setCambios(null);
    setCambiosDatos(null);
    onCambio();
  }

  /** Las plantillas vigentes y los datos del proceso (abogado, fecha, clientes con su perfil). */
  async function prepararContexto(): Promise<{ plantillas: PlantillaElegible[]; contexto: Contexto } | null> {
    const [lista, ctx] = await Promise.all([
      plantillas ? Promise.resolve({ data: { items: plantillas }, error: undefined }) : api.GET("/api/v2/contratos/plantillas"),
      api.GET("/api/v2/contratos/proceso/{proceso_id}/contexto", { params: { path: { proceso_id: procesoId } } }),
    ]);
    if (!lista.data || !ctx.data) {
      toast({ title: mensajeDeError(lista.error ?? ctx.error), tone: "error" });
      return null;
    }
    const items = lista.data.items.map((x) => ({ ...x, campos: x.campos ?? [], firmas: { abogado: x.firmas?.abogado ?? "EL ABOGADO" } }));
    setPlantillas(items);
    setContexto(ctx.data);
    return { plantillas: items, contexto: ctx.data };
  }

  function empezar(plantilla: PlantillaElegible, ctx: Contexto) {
    setBorrador({ plantilla, datos: datosIniciales(plantilla, ctx.clientes) });
  }

  async function nuevo() {
    setOcupado("plantilla");
    const listo = await prepararContexto();
    setOcupado(null);
    if (!listo) return;
    setElegido("nuevo");
    // Con una sola plantilla no hay nada que elegir.
    if (listo.plantillas.length === 1) empezar(listo.plantillas[0], listo.contexto);
    else setBorrador({ plantilla: null, datos: null });
  }

  async function crear() {
    if (!borrador?.plantilla?.id || !borrador.datos) return;
    setOcupado("crear");
    const { data, error } = await api.POST("/api/v2/contratos/proceso/{proceso_id}/con-plantilla", {
      params: { path: { proceso_id: procesoId } }, body: { plantilla_id: borrador.plantilla.id, datos: borrador.datos },
    });
    setOcupado(null);
    if (!data) {
      toast({ title: mensajeDeError(error), tone: "error" });
      return;
    }
    setBorrador(null);
    reemplazar(data);
    toast({ title: "Borrador guardado", description: "Cuando los datos estén completos, déjelo listo para firmar.", tone: "success" });
  }

  /** Guarda los cambios pendientes de un borrador con plantilla. Devuelve false si no se pudo. */
  async function guardarDatos(contrato: Detalle): Promise<boolean> {
    if (!cambiosDatos) return true;
    return accion("guardar", () => api.PATCH("/api/v2/contratos/{contrato_id}/datos", { ...ruta(contrato.id), body: { datos: cambiosDatos } }), "Cambios guardados");
  }

  async function accion(clave: string, llamada: () => Promise<{ data?: Detalle; error?: unknown }>, exito: string) {
    setOcupado(clave);
    const { data, error } = await llamada();
    setOcupado(null);
    if (!data) {
      toast({ title: mensajeDeError(error), tone: "error" });
      return false;
    }
    reemplazar(data);
    toast({ title: exito, tone: "success" });
    return true;
  }

  const ruta = (id: number) => ({ params: { path: { contrato_id: id } } });

  async function subir(contrato: Detalle, evento: ChangeEvent<HTMLInputElement>) {
    const elegidoArchivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!elegidoArchivo) return;
    if (elegidoArchivo.type !== "application/pdf") {
      toast({ title: "El contrato firmado se sube en PDF.", tone: "error" });
      return;
    }
    const formulario = new FormData();
    formulario.append("archivo", elegidoArchivo);
    setOcupado("subir");
    const { data, error } = await api.POST("/api/v2/contratos/{contrato_id}/firmado", {
      ...ruta(contrato.id),
      // openapi-fetch envía un FormData tal cual y el navegador pone el límite multipart.
      body: formulario as unknown as { archivo: string },
    });
    setOcupado(null);
    if (!data) {
      toast({ title: mensajeDeError(error), tone: "error" });
      return;
    }
    reemplazar(data.contrato);
    toast({ title: data.mensaje, tone: data.entrega.estado === "ENVIADO" ? "success" : "error" });
  }

  if (fallo) return <p role="alert" className="px-5 py-6 text-[14px] text-bad">{fallo}</p>;
  if (!datos) return <div className="space-y-2 p-5" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-manila" />)}</div>;

  const actual = typeof elegido === "number" ? datos.items.find((c) => c.id === elegido) ?? null : null;
  const sinClientes = datos.clientes.length === 0;


  if (!datos.items.length && elegido !== "nuevo") {
    return (
      <EmptyState
        icon={FileSignature}
        title="Este proceso aún no tiene contrato"
        description={sinClientes
          ? "Redacte el contrato con una plantilla de la firma. Las personas que firman pueden ser clientes del proceso o personas sin registrar."
          : "Redacte el contrato con una plantilla de la firma: se llena con los datos de los clientes y del abogado responsable."}
        action={datos.puede_crear ? <Button icon={<FilePlus2 size={16} />} loading={ocupado === "plantilla"} onClick={() => void nuevo()}>Redactar contrato</Button> : undefined}
      />
    );
  }

  return (
    <div className="xl:grid xl:grid-cols-[17rem_minmax(0,1fr)]">
      <nav aria-label="Contratos del proceso" className="border-b border-line xl:border-b-0 xl:border-r">
        <SheetHeader
          title="Contratos"
          count={datos.items.length}
          action={datos.puede_crear ? <Button variant="secondary" size="sm" icon={<FilePlus2 size={15} />} loading={ocupado === "plantilla"} onClick={() => void nuevo()}>Nuevo</Button> : undefined}
        />
        <ul className={cx("gap-2 overflow-x-auto p-2 xl:block xl:space-y-1 xl:overflow-visible", datos.items.length + (elegido === "nuevo" ? 1 : 0) > 1 ? "flex" : "hidden")}>
          {elegido === "nuevo" && (
            <li className="shrink-0">
              <span aria-current="true" className="block min-w-48 rounded-lg bg-navy-soft px-3 py-2.5 text-[14px] font-semibold text-navy-ink">Contrato nuevo</span>
            </li>
          )}
          {datos.items.map((c) => (
            <li key={c.id} className="shrink-0">
              <button
                type="button"
                aria-current={c.id === elegido ? "true" : undefined}
                onClick={() => { setElegido(c.id); setCambios(null); }}
                className={cx("block w-full min-w-48 rounded-lg px-3 py-2.5 text-left transition-colors", c.id === elegido ? "bg-navy-soft" : "hover:bg-sheet-2")}
              >
                <span className="block truncate text-[14px] font-semibold text-ink">{c.personas.length ? c.personas.join(", ") : c.cliente?.nombre ?? "Cliente"}</span>
                <span className="mt-1 flex items-center gap-2 text-[12.5px] text-ink-3">
                  <Tag tone={ESTADO_CONTRATO[c.estado].tono} className="h-5 shrink-0">{ESTADO_CONTRATO[c.estado].nombre}</Tag>
                  <span className="truncate">Versión {c.version} · {fechaCorta(c.creado_en)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0">
        {elegido === "nuevo" && borrador ? (
          <article aria-label="Contrato nuevo">
            <header className="border-b border-line px-4 py-3 sm:px-5">
              <h3 className="font-semibold text-ink">Contrato nuevo{borrador.plantilla ? ` · ${borrador.plantilla.nombre}` : ""}</h3>
              <p className="text-[13px] text-ink-3">{borrador.plantilla ? "Se guarda como borrador; la vista previa muestra en amarillo lo que falta." : "Elija la plantilla del contrato."}</p>
            </header>
            {!borrador.plantilla || !borrador.datos || !contexto ? (
              <>
                <ElegirPlantilla plantillas={plantillas ?? []} elegida={null} onElegir={(id) => { const p = plantillas?.find((x) => x.id === id); if (p && contexto) empezar(p, contexto); }} />
                <div className="flex justify-end border-t border-line px-4 py-3 sm:px-5">
                  <Button variant="ghost" onClick={() => { setBorrador(null); setElegido(datos.items[0]?.id ?? null); }}>Cancelar</Button>
                </div>
              </>
            ) : (
              <FormularioContratoPlantilla
                plantilla={borrador.plantilla}
                contexto={contexto}
                datos={borrador.datos}
                fijos={contexto.fijos}
                onCambio={(d) => setBorrador((b) => b && { ...b, datos: d })}
                pie={(faltan) => (
                  <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-sheet px-4 py-3 sm:px-5">
                    {faltan > 0 && <span className="mr-auto text-[13px] text-ink-3">Faltan {faltan} {faltan === 1 ? "dato" : "datos"} para dejarlo listo</span>}
                    <Button variant="ghost" onClick={() => { setBorrador(null); setElegido(datos.items[0]?.id ?? null); }}>Cancelar</Button>
                    {(plantillas?.length ?? 0) > 1 && <Button variant="ghost" onClick={() => setBorrador({ plantilla: null, datos: null })}>Otra plantilla</Button>}
                    <Button variant="secondary" icon={<Eye size={16} />} onClick={async () => {
                      const error = await abrirPdf(`/api/v2/contratos/proceso/${procesoId}/con-plantilla/vista-previa`, { plantilla_id: borrador.plantilla!.id, datos: borrador.datos });
                      if (error) toast({ title: error, tone: "error" });
                    }}>PDF</Button>
                    <Button icon={<Save size={16} />} loading={ocupado === "crear"} onClick={() => void crear()}>Guardar borrador</Button>
                  </div>
                )}
              />
            )}
          </article>
        ) : actual ? (
          <DetalleContrato
            key={actual.id}
            contrato={actual}
            procesoId={procesoId}
            cambios={cambios}
            ocupado={ocupado}
            onCampo={(clave, valor) => setCambios((c) => ({ ...(c ?? actual.campos), [clave]: valor }))}
            onGuardar={() => cambios && void accion("guardar", () => api.PATCH("/api/v2/contratos/{contrato_id}", { ...ruta(actual.id), body: { campos: cambios } }), "Cambios guardados")}
            onDescartar={() => { setCambios(null); setCambiosDatos(null); }}
            contexto={contexto}
            cambiosDatos={cambiosDatos}
            onDatos={setCambiosDatos}
            onGuardarDatos={() => void guardarDatos(actual)}
            onVistaPrevia={async () => {
              if (actual.plantilla) {
                if (await guardarDatos(actual)) window.open(`/api/v2/contratos/${actual.id}/pdf`, "_blank", "noopener");
                return;
              }
              const error = await abrirPdf(`/api/v2/contratos/proceso/${procesoId}/vista-previa`, { cliente_id: actual.cliente?.id, campos: cambios ?? actual.campos });
              if (error) toast({ title: error, tone: "error" });
            }}
            onListo={async () => {
              if (!(await guardarDatos(actual))) return;
              if (cambios) {
                const guardado = await accion("guardar", () => api.PATCH("/api/v2/contratos/{contrato_id}", { ...ruta(actual.id), body: { campos: cambios } }), "Cambios guardados");
                if (!guardado) return;
              }
              void accion("listo", () => api.POST("/api/v2/contratos/{contrato_id}/listo", ruta(actual.id)), "Listo para firmar");
            }}
            onAgendar={() => setFirma(actual)}
            onSubir={() => archivo.current?.click()}
            onReenviar={() => void accion("reenviar", () => api.POST("/api/v2/contratos/{contrato_id}/reenviar-copia", ruta(actual.id)), "Copia reenviada")}
            acciones={[
              { label: "Reemplazar el escaneado", icon: <RotateCcw size={16} />, hidden: () => actual.estado !== "FIRMADO", onSelect: () => setReabrir(actual) },
              { label: "Terminar el contrato", icon: <CheckCircle2 size={16} />, hidden: () => actual.estado !== "FIRMADO", onSelect: () => setMotivo({ tipo: "terminar", contrato: actual }) },
              { label: "Anular", icon: <Ban size={16} />, tone: "danger", separated: true, hidden: () => !["BORRADOR", "LISTO_PARA_FIRMA", "EN_FIRMA"].includes(actual.estado), onSelect: () => setMotivo({ tipo: "anular", contrato: actual }) },
              { label: "Eliminar", icon: <Trash2 size={16} />, tone: "danger", separated: true, hidden: () => actual.estado !== "ANULADO", onSelect: () => setEliminar(actual) },
            ]}
          />
        ) : null}
        {actual && <input ref={archivo} type="file" accept="application/pdf,.pdf" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void subir(actual, e)} />}
      </div>

      {firma && (
        <AgendarFirmaModal
          contrato={firma}
          onClose={() => setFirma(null)}
          onListo={reemplazar}
        />
      )}
      {motivo && (
        <MotivoModal
          motivo={motivo}
          onClose={() => setMotivo(null)}
          onListo={(c) => { reemplazar(c); toast({ title: motivo.tipo === "anular" ? "Contrato anulado" : "Contrato terminado", tone: "success" }); }}
        />
      )}
      {reabrir && <ReemplazarEscaneadoModal contrato={reabrir} onClose={() => setReabrir(null)} onListo={reemplazar} />}
      <ConfirmDialog
        open={eliminar !== null}
        onClose={() => setEliminar(null)}
        destructive
        onConfirm={async () => {
          if (!eliminar) return;
          const { error } = await api.DELETE("/api/v2/contratos/{contrato_id}", ruta(eliminar.id));
          if (error) throw new Error(mensajeDeError(error));
          setElegido(null);
          toast({ title: "Contrato eliminado", tone: "success" });
          onCambio();
          void cargar();
        }}
        title="¿Eliminar el contrato anulado?"
        description="Sale del proceso para siempre. Los archivos que se subieron quedan en los documentos del expediente."
        confirmLabel="Eliminar"
      />
    </div>
  );
}

function PasoSiguiente({ tono, icono, children, acciones }: { tono: "gold" | "neutral" | "ok" | "bad"; icono: ReactNode; children: ReactNode; acciones?: ReactNode }) {
  const fondo = { gold: "bg-gold-soft", neutral: "bg-sheet-2", ok: "bg-ok-soft", bad: "bg-bad-soft" }[tono];
  return (
    <div className={cx("mx-4 mt-4 rounded-[var(--radius-lg)] px-4 py-3.5 sm:mx-5", fondo)}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-0.5 shrink-0 text-ink-2">{icono}</span>
        <div className="min-w-0 flex-1 text-[14px] text-pretty text-ink">{children}</div>
      </div>
      {acciones && <div className="mt-3 flex flex-wrap gap-2 pl-8">{acciones}</div>}
    </div>
  );
}

function DetalleContrato({ contrato: c, procesoId, cambios, ocupado, onCampo, onGuardar, onDescartar, onVistaPrevia, onListo, onAgendar, onSubir, onReenviar, acciones, contexto, cambiosDatos, onDatos, onGuardarDatos }: {
  contrato: Detalle;
  procesoId: number;
  contexto: Contexto | null;
  cambiosDatos: DatosContrato | null;
  onDatos: (d: DatosContrato) => void;
  onGuardarDatos: () => void;
  cambios: Record<string, string> | null;
  ocupado: string | null;
  onCampo: (clave: string, valor: string) => void;
  onGuardar: () => void;
  onDescartar: () => void;
  onVistaPrevia: () => void;
  onListo: () => void;
  onAgendar: () => void;
  onSubir: () => void;
  onReenviar: () => void;
  acciones: RowAction<Detalle>[];
}) {
  const editable = c.puede_editar && c.estado === "BORRADOR";
  const cliente = c.personas.length ? c.personas.join(", ") : c.cliente?.nombre ?? "el cliente";
  const pdf = `/api/v2/contratos/${c.id}/pdf`;
  const firmado = `/api/v2/contratos/${c.id}/firmado?descargar=false`;
  const agenda = `/gestion-procesos/abogado/procesos/${procesoId}/agenda`;

  let paso: ReactNode = null;
  if (c.estado === "BORRADOR") {
    paso = (
      <PasoSiguiente tono="neutral" icono={<FilePen size={18} />} acciones={c.puede_editar ? (
        <>
          <Button size="sm" icon={<CheckCircle2 size={15} />} loading={ocupado === "listo"} onClick={onListo}>Listo para firmar</Button>
          <Button size="sm" variant="secondary" icon={<Eye size={15} />} onClick={onVistaPrevia}>Vista previa</Button>
        </>
      ) : undefined}>
        <p className="font-semibold">Borrador</p>
        <p className="text-ink-2">Revise los datos. Cuando estén completos, déjelo listo para firmar; desde ahí ya no se edita.</p>
      </PasoSiguiente>
    );
  } else if (c.estado === "LISTO_PARA_FIRMA") {
    paso = (
      <PasoSiguiente tono="gold" icono={<CalendarClock size={18} />} acciones={(
        <>
          {c.puede_editar && <Button size="sm" icon={<CalendarClock size={15} />} onClick={onAgendar}>Agendar la firma</Button>}
          <Button size="sm" variant="secondary" icon={<Printer size={15} />} onClick={() => window.open(pdf, "_blank", "noopener")}>Imprimir</Button>
        </>
      )}>
        <p className="font-semibold">Listo para firmar</p>
        <p className="text-ink-2">Agende la firma con {cliente}: le llega el aviso y queda en la agenda del proceso.</p>
      </PasoSiguiente>
    );
  } else if (c.estado === "EN_FIRMA") {
    paso = (
      <PasoSiguiente tono="gold" icono={<FileSignature size={18} />} acciones={(
        <>
          {c.puede_editar && <Button size="sm" icon={<Upload size={15} />} loading={ocupado === "subir"} onClick={onSubir}>Subir el firmado</Button>}
          <Button size="sm" variant="secondary" icon={<Printer size={15} />} onClick={() => window.open(pdf, "_blank", "noopener")}>Imprimir</Button>
        </>
      )}>
        <p className="font-semibold">
          {c.firma ? <>Firma el <span className="first-letter:uppercase">{diaLargo(diaDe(c.firma.inicio))}</span>, {horaDe(c.firma.inicio)}</> : "Firma agendada"}
        </p>
        <p className="text-ink-2">
          Después de firmar, suba el escaneado en PDF: le enviamos la copia a {cliente} por correo.{" "}
          <Link href={agenda} className="text-navy-ink underline underline-offset-2">Mover la cita</Link>
        </p>
      </PasoSiguiente>
    );
  } else if (c.estado === "FIRMADO") {
    const entrega = c.ultima_entrega;
    paso = (
      <PasoSiguiente tono={entrega?.estado === "ERROR" ? "bad" : "ok"} icono={entrega?.estado === "ERROR" ? <XCircle size={18} /> : <CheckCircle2 size={18} />} acciones={(
        <>
          {c.documento_firmado && <Button size="sm" variant="secondary" icon={<Eye size={15} />} onClick={() => window.open(firmado, "_blank", "noopener")}>Ver el firmado</Button>}
          {c.puede_editar && <Button size="sm" variant="secondary" icon={<Mail size={15} />} loading={ocupado === "reenviar"} onClick={onReenviar}>{entrega?.estado === "ERROR" ? "Reintentar el envío" : "Reenviar la copia"}</Button>}
        </>
      )}>
        <p className="font-semibold">Firmado{c.firmado_en ? ` el ${fechaCorta(c.firmado_en)}` : ""}</p>
        <p className="text-ink-2">
          {entrega
            ? entrega.estado === "ENVIADO"
              ? `La copia le llegó a ${entrega.destinatario} el ${fechaConHora(entrega.enviado_en)}.`
              : `No se pudo enviar la copia a ${entrega.destinatario || cliente}: ${entrega.error ?? "error del correo"}.`
            : "La copia aún no se ha enviado al cliente."}
        </p>
      </PasoSiguiente>
    );
  } else {
    paso = (
      <PasoSiguiente tono="neutral" icono={c.estado === "ANULADO" ? <Ban size={18} /> : <CheckCircle2 size={18} />}>
        <p className="font-semibold">{ESTADO_CONTRATO[c.estado].nombre}{c.cerrado_en ? ` el ${fechaCorta(c.cerrado_en)}` : ""}</p>
        {c.motivo_cierre && <p className="text-ink-2">Motivo: {c.motivo_cierre}</p>}
      </PasoSiguiente>
    );
  }

  const visibles = acciones.filter((a) => !a.hidden?.(c));
  return (
    <article aria-label={`Contrato con ${cliente}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h3 className="font-semibold text-ink">Contrato de servicios con {cliente}</h3>
          <p className="text-[13px] text-ink-3">Versión {c.version} · creado el {fechaCorta(c.creado_en)}{c.emitido_en ? ` · listo el ${fechaCorta(c.emitido_en)}` : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <Tag tone={ESTADO_CONTRATO[c.estado].tono}>{ESTADO_CONTRATO[c.estado].nombre}</Tag>
          {c.puede_editar && visibles.length > 0 && <RowActionsMenu row={c} actions={acciones} label="Más acciones del contrato" />}
        </div>
      </header>

      {paso}

      {c.plantilla && c.datos ? (
        editable ? (
          contexto ? (
            <div className="mt-4 border-t border-line">
              <FormularioContratoPlantilla
                plantilla={{ ...c.plantilla, campos: c.plantilla.campos ?? [], firmas: { abogado: c.plantilla.firmas?.abogado ?? "EL ABOGADO" } }}
                contexto={contexto}
                datos={cambiosDatos ?? c.datos}
                fijos={contexto.fijos}
                onCambio={onDatos}
                pie={(faltan) => (
                  <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-sheet px-4 py-3 sm:px-5">
                    <span className="mr-auto text-[13px] text-ink-3">{[cambiosDatos && "Hay cambios sin guardar", faltan > 0 && `Faltan ${faltan} ${faltan === 1 ? "dato" : "datos"}`].filter(Boolean).join(" · ")}</span>
                    {cambiosDatos && <Button variant="ghost" onClick={onDescartar}>Descartar</Button>}
                    <Button variant="secondary" icon={<Save size={16} />} disabled={!cambiosDatos} loading={ocupado === "guardar"} onClick={onGuardarDatos}>Guardar cambios</Button>
                  </div>
                )}
              />
            </div>
          ) : (
            <div className="m-5 h-40 animate-pulse rounded-lg bg-manila" aria-busy="true" />
          )
        ) : (
          <details className="group mt-4 border-t border-line" open>
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-[14px] font-semibold text-ink hover:bg-sheet-2 sm:px-5">
              El contrato · {c.plantilla.nombre}
              <span className="text-[13px] font-normal text-ink-3 group-open:hidden">Ver</span>
              <span className="hidden text-[13px] font-normal text-ink-3 group-open:inline">Ocultar</span>
            </summary>
            <div className="bg-manila/60 p-3 sm:p-6">
              <div className="mx-auto max-w-3xl">
                <VistaContrato
                  plantilla={{ ...c.plantilla, campos: c.plantilla.campos ?? [], firmas: { abogado: c.plantilla.firmas?.abogado ?? "EL ABOGADO" } }}
                  datos={c.datos}
                  fijos={c.datos.fijos ?? {}}
                />
              </div>
            </div>
          </details>
        )
      ) : editable ? (
        <div className="mt-4 border-t border-line">
          <FormularioContrato campos={cambios ?? c.campos} onCambio={onCampo} />
          <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-sheet px-4 py-3 sm:px-5">
            {cambios && <span className="mr-auto text-[13px] text-ink-3">Hay cambios sin guardar</span>}
            {cambios && <Button variant="ghost" onClick={onDescartar}>Descartar</Button>}
            <Button variant="secondary" icon={<Save size={16} />} disabled={!cambios} loading={ocupado === "guardar"} onClick={onGuardar}>Guardar cambios</Button>
          </div>
        </div>
      ) : (
        <details className="group mt-4 border-t border-line">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-[14px] font-semibold text-ink hover:bg-sheet-2 sm:px-5">
            Datos del contrato
            <span className="text-[13px] font-normal text-ink-3 group-open:hidden">Ver</span>
            <span className="hidden text-[13px] font-normal text-ink-3 group-open:inline">Ocultar</span>
          </summary>
          <FormularioContrato campos={c.campos} soloLectura />
        </details>
      )}

      {c.versiones.length > 1 && (
        <details className="group border-t border-line">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-[14px] font-semibold text-ink hover:bg-sheet-2 sm:px-5">
            Historial
            <span className="text-[13px] font-normal tabular-nums text-ink-3">{c.versiones.length} versiones</span>
          </summary>
          <ol className="divide-y divide-line">
            {[...c.versiones].reverse().map((v) => (
              <li key={v.version} className="flex items-center justify-between gap-3 px-4 py-2 text-[13.5px] sm:px-5">
                <span className="text-ink">Versión {v.version} · {ESTADO_CONTRATO[v.estado].nombre}</span>
                <span className="text-ink-3">{fechaConHora(v.creado_en)}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </article>
  );
}

/** La fecha que lleva un contrato con plantilla, en letras ("20 de noviembre de 2026"). */
function fechaDelContrato(c: Detalle): string | null {
  return c.plantilla ? c.datos?.fijos?.["fecha.hoy"] || null : null;
}

/** El contrato listo para imprimir: vista previa del PDF y los botones para abrirlo o imprimirlo. */
function ParaImprimir({ contrato, children, onClose }: { contrato: Detalle; children: ReactNode; onClose: () => void }) {
  const marco = useRef<HTMLIFrameElement>(null);
  const pdf = `/api/v2/contratos/${contrato.id}/pdf`;
  function imprimir() {
    try {
      marco.current?.contentWindow?.focus();
      marco.current?.contentWindow?.print();
    } catch {
      window.open(pdf, "_blank", "noopener");
    }
  }
  return (
    <div className="space-y-4">
      {children}
      <iframe ref={marco} src={pdf} title="Vista previa del contrato" className="hidden h-[55vh] w-full rounded-lg bg-white shadow-[0_0_0_1px_var(--line-strong)] sm:block" />
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onClose}>Cerrar</Button>
        <Button type="button" variant="secondary" icon={<Eye size={16} />} onClick={() => window.open(pdf, "_blank", "noopener")}>Vista previa</Button>
        <Button type="button" icon={<Printer size={16} />} onClick={imprimir}>Imprimir</Button>
      </div>
    </div>
  );
}

function AgendarFirmaModal({ contrato, onClose, onListo }: { contrato: Detalle; onClose: () => void; onListo: (c: Detalle) => void }) {
  const id = useId();
  const [dia, setDia] = useState(hoyISO());
  const [inicio, setInicio] = useState("09:00");
  const [fin, setFin] = useState("");
  const [lugar, setLugar] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [agendado, setAgendado] = useState<Detalle | null>(null);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!dia || !inicio) return setError("Indique el día y la hora.");
    if (fin && fin <= inicio) return setError("La hora final va después del inicio.");
    setGuardando(true);
    const { data, error: fallo } = await api.POST("/api/v2/contratos/{contrato_id}/firma", {
      params: { path: { contrato_id: contrato.id } },
      body: { inicio: `${dia}T${inicio}:00-05:00`, fin: fin ? `${dia}T${fin}:00-05:00` : null, lugar: lugar.trim() || null },
    });
    setGuardando(false);
    if (!data) return setError(mensajeDeError(fallo));
    onListo(data);
    setAgendado(data);
  }

  if (agendado) {
    const fecha = fechaDelContrato(agendado);
    return (
      <Modal open onClose={onClose} size="xl" title="Firma agendada" description={`Le avisamos a ${agendado.cliente?.nombre ?? "el cliente"} y quedó en la agenda del proceso.`}>
        <ParaImprimir contrato={agendado} onClose={onClose}>
          <p className="text-[14px] text-ink-2">
            {fecha
              ? <>El contrato quedó con fecha del <strong className="text-ink">{fecha}</strong>, el día de la firma. Si la cita se mueve en la agenda, la fecha del contrato se mueve con ella.</>
              : <>Revíselo e imprímalo para el día de la firma.</>}
          </p>
        </ParaImprimir>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Agendar la firma" description={`Le avisamos a ${contrato.cliente?.nombre ?? "el cliente"} y queda en la agenda del proceso.`}>
      <form onSubmit={guardar} noValidate className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor={`${id}-dia`} className={ETIQUETA}>Día</label>
            <input id={`${id}-dia`} type="date" value={dia} min={hoyISO()} onChange={(e) => setDia(e.target.value)} className={CAMPO} />
          </div>
          <div>
            <label htmlFor={`${id}-inicio`} className={ETIQUETA}>Hora</label>
            <input id={`${id}-inicio`} type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} className={CAMPO} />
          </div>
          <div>
            <label htmlFor={`${id}-fin`} className={ETIQUETA}>Hasta (opcional)</label>
            <input id={`${id}-fin`} type="time" value={fin} onChange={(e) => setFin(e.target.value)} className={CAMPO} />
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-lugar`} className={ETIQUETA}>Dónde (opcional)</label>
          <input id={`${id}-lugar`} value={lugar} maxLength={500} onChange={(e) => setLugar(e.target.value)} placeholder="Ej.: en la oficina de la firma" className={CAMPO} />
        </div>
        {contrato.plantilla && <p className="text-[13px] text-ink-3">El contrato tomará la fecha de este día.</p>}
        {error && <p role="alert" className="text-[13px] text-bad">{error}</p>}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={guardando} icon={<CalendarClock size={16} />}>Agendar</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Reabre la firma para subir otro escaneado; en un contrato con plantilla pregunta si conserva la fecha. */
function ReemplazarEscaneadoModal({ contrato, onClose, onListo }: { contrato: Detalle; onClose: () => void; onListo: (c: Detalle) => void }) {
  const id = useId();
  const { toast } = useToast();
  const actual = fechaDelContrato(contrato);
  const [cambiar, setCambiar] = useState(false);
  const [dia, setDia] = useState(hoyISO());
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [reabierto, setReabierto] = useState<Detalle | null>(null);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (cambiar && !dia) return setError("Indique la fecha nueva.");
    setGuardando(true);
    const { data, error: fallo } = await api.POST("/api/v2/contratos/{contrato_id}/reabrir-firma", {
      params: { path: { contrato_id: contrato.id } },
      body: { fecha: cambiar ? dia : null },
    });
    setGuardando(false);
    if (!data) return setError(mensajeDeError(fallo));
    onListo(data);
    if (cambiar) return setReabierto(data);
    toast({ title: "Firma reabierta", description: "Suba el escaneado correcto cuando lo tenga.", tone: "success" });
    onClose();
  }

  if (reabierto) {
    return (
      <Modal open onClose={onClose} size="xl" title="Contrato con fecha nueva" description="La cita de firma pasó a ese día, a la misma hora.">
        <ParaImprimir contrato={reabierto} onClose={onClose}>
          <p className="text-[14px] text-ink-2">
            El contrato ahora tiene fecha del <strong className="text-ink">{fechaDelContrato(reabierto)}</strong>. Imprímalo para firmarlo de nuevo y luego suba el escaneado.
          </p>
        </ParaImprimir>
      </Modal>
    );
  }

  const opcion = (activa: boolean) => cx(
    "flex cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2.5 shadow-[0_0_0_1px_var(--line-strong)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-navy/30",
    activa ? "bg-navy-soft shadow-[0_0_0_1.5px_var(--navy)]" : "bg-sheet hover:bg-manila/60",
  );

  return (
    <Modal open onClose={onClose} title="Reemplazar el escaneado firmado" description="El contrato vuelve a «Firma agendada» para subir otro PDF. El escaneado actual se conserva en los documentos del proceso.">
      <form onSubmit={guardar} noValidate className="space-y-4">
        {actual && (
          <fieldset className="space-y-2">
            <legend className={ETIQUETA}>Fecha del contrato</legend>
            <label className={opcion(!cambiar)}>
              <input type="radio" name={`${id}-fecha`} checked={!cambiar} onChange={() => setCambiar(false)} className="mt-1 size-4 accent-[var(--navy)]" />
              <span>
                <span className="block font-semibold text-ink">Mantener el {actual}</span>
                <span className="block text-[13px] text-ink-3">Por ejemplo, si se subió un archivo equivocado.</span>
              </span>
            </label>
            <label className={opcion(cambiar)}>
              <input type="radio" name={`${id}-fecha`} checked={cambiar} onChange={() => setCambiar(true)} className="mt-1 size-4 accent-[var(--navy)]" />
              <span>
                <span className="block font-semibold text-ink">Cambiar la fecha</span>
                <span className="block text-[13px] text-ink-3">Si se va a firmar de nuevo otro día. La cita pasa a ese día.</span>
              </span>
            </label>
            {cambiar && (
              <div className="pl-1 pt-1">
                <label htmlFor={`${id}-dia`} className={ETIQUETA}>Fecha nueva</label>
                <input id={`${id}-dia`} type="date" value={dia} onChange={(e) => setDia(e.target.value)} className={cx(CAMPO, "sm:max-w-56")} />
              </div>
            )}
          </fieldset>
        )}
        {error && <p role="alert" className="text-[13px] text-bad">{error}</p>}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={guardando} icon={<RotateCcw size={16} />}>Reabrir la firma</Button>
        </div>
      </form>
    </Modal>
  );
}

function MotivoModal({ motivo, onClose, onListo }: { motivo: Motivo; onClose: () => void; onListo: (c: Detalle) => void }) {
  const id = useId();
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const anular = motivo.tipo === "anular";

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (texto.trim().length < 3) return setError("Escriba el motivo.");
    setGuardando(true);
    const opciones = { params: { path: { contrato_id: motivo.contrato.id } }, body: { motivo: texto.trim() } };
    const { data, error: fallo } = anular
      ? await api.POST("/api/v2/contratos/{contrato_id}/anular", opciones)
      : await api.POST("/api/v2/contratos/{contrato_id}/terminar", opciones);
    setGuardando(false);
    if (!data) return setError(mensajeDeError(fallo));
    onListo(data);
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={anular ? "Anular el contrato" : "Terminar el contrato"}
      description={anular
        ? "Queda en el historial y ya no se puede firmar. Si la firma estaba agendada, la cita se cancela."
        : "El contrato firmado queda cerrado. El proceso vuelve a aparecer como «sin contrato» si sigue activo."}
    >
      <form onSubmit={guardar} noValidate className="space-y-4">
        <div>
          <label htmlFor={`${id}-motivo`} className={ETIQUETA}>Motivo</label>
          <textarea id={`${id}-motivo`} rows={3} maxLength={500} value={texto} onChange={(e) => { setTexto(e.target.value); setError(null); }} className={cx(CAMPO, "min-h-0 py-2")} />
        </div>
        {error && <p role="alert" className="text-[13px] text-bad">{error}</p>}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant={anular ? "danger" : "primary"} loading={guardando}>{anular ? "Anular" : "Terminar"}</Button>
        </div>
      </form>
    </Modal>
  );
}
