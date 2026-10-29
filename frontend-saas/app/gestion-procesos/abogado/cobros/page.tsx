"use client";

import { useCallback, useState } from "react";
import { Download, FileText, HandCoins, Plus, ReceiptText, RefreshCw, Send, Undo2, Wallet } from "lucide-react";

import { RoleGate } from "@/components/auth/RoleGate";
import { CuentaFormModal } from "@/components/finanzas/CuentaFormModal";
import { DetalleCuentaDrawer } from "@/components/finanzas/DetalleCuentaDrawer";
import { EstadoCuentaDrawer } from "@/components/finanzas/EstadoCuentaDrawer";
import { MotivoModal } from "@/components/finanzas/MotivoModal";
import { PagoModal } from "@/components/finanzas/PagoModal";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataTableColumn, type RowAction } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SummaryStrip } from "@/components/ui/SummaryStrip";
import { Tag } from "@/components/ui/Tag";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { diaCorto, fechaCorta } from "@/lib/fechas";
import {
  FILTROS_COBRO,
  METODO_PAGO,
  abrirPdfCuenta,
  abrirRecibo,
  estadoVisible,
  pesos,
  type Cuenta,
  type DetalleCuenta,
  type FiltroCobros,
  type Pago,
} from "@/lib/finanzas";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Vista = "cuentas" | "pagos";
type PagoDialogo = { clienteId?: number; cuentaId?: number; pago?: Pago } | null;

const VACIOS: Record<FiltroCobros, [string, string]> = {
  por_cobrar: ["Nada por cobrar", "Las cuentas emitidas con saldo aparecen aquí hasta que se paguen."],
  vencidas: ["Ninguna cuenta vencida", "Una cuenta aparece aquí cuando pasa su fecha de pago con saldo."],
  pagadas: ["Aún no hay cuentas pagadas", "Cuando una cuenta quede en $0, queda aquí."],
  borradores: ["Ningún borrador", "Las cuentas que guarde sin emitir quedan aquí; el cliente no las ve."],
  anuladas: ["Ninguna cuenta anulada", "Las cuentas anuladas quedan aquí con su motivo."],
  todas: ["Aún no hay cuentas de cobro", "Cree la primera con «Nueva cuenta»."],
};
const CAMPO_FILTRO =
  "h-10 min-w-0 rounded-lg bg-sheet px-3 text-[14px] text-ink shadow-[0_0_0_1px_var(--line-strong)] focus:outline-none focus:shadow-[0_0_0_2px_var(--navy)]";

/** Cuándo vence, o en qué terminó. */
function momento(c: Cuenta): string {
  if (c.estado === "borrador") return `Creada el ${fechaCorta(c.creada_en)}`;
  if (c.estado === "pagada" || c.estado === "anulada") return `Emitida el ${fechaCorta(c.emitida_en ?? c.creada_en)}`;
  if (!c.vence_el) return "Sin fecha de pago";
  return `${c.vencida ? "Venció" : "Vence"} el ${diaCorto(c.vence_el)}`;
}

function CobrosPage() {
  const { toast } = useToast();
  const [vista, setVista] = useState<Vista>("cuentas");
  const [filtro, setFiltro] = useState<FiltroCobros>("por_cobrar");
  const [lista, setLista] = useState<Esquemas["ListaCuentas"] | null>(null);
  const [pagos, setPagos] = useState<Pago[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const [cuentaAbierta, setCuentaAbierta] = useState<number | null>(null);
  const [formulario, setFormulario] = useState<{ borrador?: DetalleCuenta } | null>(null);
  const [pagoDialogo, setPagoDialogo] = useState<PagoDialogo>(null);
  const [estadoCliente, setEstadoCliente] = useState<number | null>(null);
  const [revertir, setRevertir] = useState<Pago | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const [cuentas, recibidos] = await Promise.all([
      api.GET("/api/v2/cuentas-cobro", { params: { query: { filtro } } }),
      api.GET("/api/v2/pagos"),
    ]);
    const fallo = cuentas.error ?? recibidos.error;
    if (fallo || !cuentas.data || !recibidos.data) setError(mensajeDeError(fallo));
    else {
      setLista(cuentas.data);
      setPagos(recibidos.data.items);
    }
    setCargando(false);
    // `version` fuerza la recarga después de un cambio sin tocar el filtro.
    void version;
  }, [filtro, version]);
  useLoadEffect(cargar);
  const recargar = () => setVersion((v) => v + 1);

  async function reenviarRecibo(p: Pago) {
    const { data, error: fallo } = await api.POST("/api/v2/pagos/{pago_id}/reenviar", { params: { path: { pago_id: p.id } } });
    if (fallo || !data) toast({ title: "No se pudo reenviar", description: mensajeDeError(fallo), tone: "error" });
    else if (data.estado === "error") toast({ title: "El correo no salió", description: data.error ?? "Revise la dirección del cliente.", tone: "error" });
    else toast({ title: "Recibo reenviado", description: `Va a ${data.destinatario}.`, tone: "success" });
  }

  const columnas: DataTableColumn<Cuenta>[] = [
    {
      key: "cuenta",
      header: "Cuenta",
      mobile: "title",
      sortValue: (c) => c.numero ?? "",
      searchValue: (c) => `${c.numero ?? ""} ${c.concepto} ${c.cliente.nombre} ${c.proceso?.nombre ?? ""}`,
      exportValue: (c) => `${c.numero ?? "Borrador"} · ${c.concepto}`,
      render: (c) => (
        <span className="block min-w-0">
          <span className="block font-semibold text-pretty text-ink">{c.concepto}</span>
          <span className="text-[12.5px] tabular-nums text-ink-3">{c.numero ?? "Borrador"}{c.proceso ? ` · ${c.proceso.nombre}` : ""}</span>
        </span>
      ),
    },
    {
      key: "cliente",
      header: "Cliente",
      mobile: "subtitle",
      sortValue: (c) => c.cliente.nombre,
      exportValue: (c) => c.cliente.nombre,
      render: (c) => <span className="text-ink-2">{c.cliente.nombre}</span>,
    },
    {
      key: "estado",
      header: "Estado",
      mobile: "badge",
      sortValue: (c) => estadoVisible(c).nombre,
      exportValue: (c) => estadoVisible(c).nombre,
      render: (c) => <Tag tone={estadoVisible(c).tono}>{estadoVisible(c).nombre}</Tag>,
    },
    {
      key: "saldo",
      header: "Saldo",
      align: "right",
      sortValue: (c) => (c.estado === "anulada" ? 0 : c.saldo),
      exportValue: (c) => (c.estado === "anulada" ? 0 : c.saldo),
      render: (c) => (
        <span className="block text-right">
          <span className="block font-semibold tabular-nums text-ink">{pesos(c.estado === "anulada" ? 0 : c.saldo)}</span>
          {(c.pagado > 0 || c.estado === "anulada") && (
            <span className="block text-[12.5px] tabular-nums text-ink-3">de {pesos(c.total + c.ajustes)}</span>
          )}
        </span>
      ),
    },
    {
      key: "momento",
      header: "Fecha de pago",
      mobile: "meta",
      sortValue: (c) => c.vence_el ?? c.emitida_en ?? c.creada_en,
      exportValue: (c) => momento(c),
      render: (c) => <span className={c.vencida ? "font-semibold tabular-nums text-bad" : "tabular-nums text-ink-2"}>{momento(c)}</span>,
    },
  ];

  const acciones: RowAction<Cuenta>[] = [
    { label: "Ver la cuenta", icon: <ReceiptText size={16} />, onSelect: (c) => setCuentaAbierta(c.id) },
    { label: "Ver el PDF", icon: <FileText size={16} />, onSelect: (c) => abrirPdfCuenta(c.id) },
    {
      label: "Registrar un pago",
      icon: <HandCoins size={16} />,
      hidden: (c) => c.estado !== "pendiente" && c.estado !== "parcial",
      onSelect: (c) => setPagoDialogo({ clienteId: c.cliente.id, cuentaId: c.id }),
    },
    { label: "Estado de cuenta del cliente", icon: <Wallet size={16} />, onSelect: (c) => setEstadoCliente(c.cliente.id) },
  ];

  const columnasPagos: DataTableColumn<Pago>[] = [
    {
      key: "recibo",
      header: "Recibo",
      mobile: "title",
      sortValue: (p) => p.numero_recibo ?? "",
      searchValue: (p) => `${p.numero_recibo ?? ""} ${p.cliente.nombre} ${p.referencia ?? ""}`,
      exportValue: (p) => p.numero_recibo,
      render: (p) => (
        <span className="block min-w-0">
          <span className="block font-semibold tabular-nums text-ink">{p.numero_recibo}</span>
          {p.referencia && <span className="block truncate text-[12.5px] text-ink-3">Ref. {p.referencia}</span>}
        </span>
      ),
    },
    {
      key: "cliente",
      header: "Cliente",
      mobile: "subtitle",
      sortValue: (p) => p.cliente.nombre,
      exportValue: (p) => p.cliente.nombre,
      render: (p) => <span className="text-ink-2">{p.cliente.nombre}</span>,
    },
    {
      key: "estado",
      header: "Abonado",
      mobile: "badge",
      sortValue: (p) => (p.revertido ? -1 : p.disponible),
      exportValue: (p) => (p.revertido ? "Revertido" : p.disponible ? `A favor ${p.disponible}` : "Abonado"),
      render: (p) => (p.revertido
        ? <Tag tone="neutral">Revertido</Tag>
        : p.disponible > 0
          ? <Tag tone="gold">{pesos(p.disponible)} a favor</Tag>
          : <Tag tone="ok">Abonado</Tag>),
    },
    {
      key: "importe",
      header: "Valor",
      align: "right",
      sortValue: (p) => p.importe,
      exportValue: (p) => p.importe,
      render: (p) => <span className={p.revertido ? "tabular-nums text-ink-3 line-through" : "font-semibold tabular-nums text-ink"}>{pesos(p.importe)}</span>,
    },
    {
      key: "fecha",
      header: "Pagado el",
      mobile: "meta",
      sortValue: (p) => p.pagado_el,
      exportValue: (p) => p.pagado_el,
      render: (p) => <span className="tabular-nums text-ink-2">{diaCorto(p.pagado_el)}</span>,
    },
    {
      key: "metodo",
      header: "Cómo",
      wideOnly: true,
      sortValue: (p) => p.metodo,
      exportValue: (p) => METODO_PAGO[p.metodo],
      render: (p) => <span className="text-ink-2">{METODO_PAGO[p.metodo]}</span>,
    },
  ];

  const accionesPagos: RowAction<Pago>[] = [
    { label: "Ver el recibo", icon: <FileText size={16} />, onSelect: (p) => abrirRecibo(p.id) },
    { label: "Descargar el recibo", icon: <Download size={16} />, onSelect: (p) => abrirRecibo(p.id, true) },
    { label: "Reenviar el recibo", icon: <Send size={16} />, hidden: (p) => p.revertido, onSelect: (p) => void reenviarRecibo(p) },
    { label: "Abonar el saldo a favor", icon: <HandCoins size={16} />, hidden: (p) => p.revertido || p.disponible <= 0, onSelect: (p) => setPagoDialogo({ pago: p }) },
    { label: "Estado de cuenta del cliente", icon: <Wallet size={16} />, onSelect: (p) => setEstadoCliente(p.cliente.id) },
    { label: "Revertir el pago", icon: <Undo2 size={16} />, hidden: (p) => p.revertido, onSelect: (p) => setRevertir(p) },
  ];

  const resumen = lista?.resumen;
  const activo = vista === "pagos" ? "cobrado_mes" : filtro === "vencidas" ? "vencido" : filtro === "borradores" ? "borradores" : filtro === "por_cobrar" ? "por_cobrar" : null;
  const [tituloVacio, textoVacio] = VACIOS[filtro];

  return (
    <div>
      <PageHeader
        title="Cobros"
        description="Cuentas de cobro, pagos recibidos y lo que cada cliente debe."
        action={(
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<HandCoins size={16} />} onClick={() => setPagoDialogo({})}>Registrar pago</Button>
            <Button icon={<Plus size={16} />} onClick={() => setFormulario({})}>Nueva cuenta</Button>
          </div>
        )}
      />

      <SummaryStrip
        active={activo}
        onSelect={(clave) => {
          if (clave === "cobrado_mes") return setVista("pagos");
          setVista("cuentas");
          setFiltro(clave === "vencido" ? "vencidas" : clave === "borradores" ? "borradores" : "por_cobrar");
        }}
        items={[
          { key: "por_cobrar", label: "Por cobrar", value: resumen ? pesos(resumen.por_cobrar) : "—" },
          {
            key: "vencido",
            label: resumen?.cuentas_vencidas ? `Vencido · ${resumen.cuentas_vencidas} ${resumen.cuentas_vencidas === 1 ? "cuenta" : "cuentas"}` : "Vencido",
            value: resumen ? pesos(resumen.vencido) : "—",
            tone: resumen?.vencido ? "danger" : "default",
          },
          { key: "cobrado_mes", label: "Recibido este mes", value: resumen ? pesos(resumen.cobrado_mes) : "—", tone: resumen?.cobrado_mes ? "success" : "default" },
          { key: "borradores", label: "Borradores", value: resumen?.borradores ?? "—" },
        ]}
      />

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SegmentedControl<Vista>
          label="Qué ver"
          value={vista}
          onChange={setVista}
          options={[{ value: "cuentas", label: "Cuentas de cobro" }, { value: "pagos", label: "Pagos recibidos" }]}
        />
        {vista === "cuentas" && (
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as FiltroCobros)} aria-label="Qué cuentas mostrar" className={CAMPO_FILTRO}>
            {FILTROS_COBRO.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        )}
      </div>

      <div className="mt-4">
        {error ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] bg-bad-soft px-4 py-3 text-bad">
            <p className="flex-1 text-[14px]">{error}</p>
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
          </div>
        ) : vista === "cuentas" ? (
          <DataTable
            caption="Cuentas de cobro"
            rows={lista?.items ?? []}
            columns={columnas}
            rowKey={(c) => c.id}
            onRowClick={(c) => setCuentaAbierta(c.id)}
            rowActions={acciones}
            searchPlaceholder="Buscar cuenta o cliente"
            initialSort={{ key: "momento", direction: "asc" }}
            exportFilename="cuentas-de-cobro"
            storageKey="abogado-cobros"
            loading={cargando && !lista}
            emptyTitle={tituloVacio}
            emptyDescription={textoVacio}
          />
        ) : (
          <DataTable
            caption="Pagos recibidos"
            rows={pagos ?? []}
            columns={columnasPagos}
            rowKey={(p) => p.id}
            onRowClick={(p) => abrirRecibo(p.id)}
            rowActions={accionesPagos}
            searchPlaceholder="Buscar recibo o cliente"
            initialSort={{ key: "fecha", direction: "desc" }}
            exportFilename="pagos-recibidos"
            storageKey="abogado-pagos"
            loading={cargando && !pagos}
            emptyTitle="Aún no hay pagos registrados"
            emptyDescription="Registre aquí lo que llegue por transferencia, consignación o en efectivo; el cliente recibe el recibo."
          />
        )}
      </div>

      <DetalleCuentaDrawer
        cuentaId={cuentaAbierta}
        version={version}
        onClose={() => setCuentaAbierta(null)}
        onCambio={recargar}
        onEditar={(borrador) => setFormulario({ borrador })}
        onRegistrarPago={(c) => setPagoDialogo({ clienteId: c.cliente.id, cuentaId: c.id })}
      />
      <EstadoCuentaDrawer
        clienteId={estadoCliente}
        onClose={() => setEstadoCliente(null)}
        onAbrirCuenta={(id) => { setEstadoCliente(null); setCuentaAbierta(id); }}
      />
      <CuentaFormModal
        open={formulario !== null}
        borrador={formulario?.borrador}
        onClose={() => setFormulario(null)}
        onGuardada={(c) => { recargar(); setCuentaAbierta(c.id); }}
      />
      <PagoModal
        open={pagoDialogo !== null}
        clienteInicial={pagoDialogo?.clienteId}
        cuentaInicial={pagoDialogo?.cuentaId}
        pago={pagoDialogo?.pago}
        onClose={() => setPagoDialogo(null)}
        onRegistrado={recargar}
      />
      <MotivoModal
        open={revertir !== null}
        onClose={() => setRevertir(null)}
        titulo={`Revertir ${revertir?.numero_recibo ?? "el pago"}`}
        descripcion="El pago no se borra: queda revertido con su motivo y sus abonos dejan de contar. Úselo si el dinero no llegó o se registró por error."
        etiqueta="Por qué se revierte"
        confirmar="Revertir el pago"
        onConfirmar={async (motivo) => {
          if (!revertir) return null;
          const { error: fallo } = await api.POST("/api/v2/pagos/{pago_id}/revertir", { params: { path: { pago_id: revertir.id } }, body: { motivo } });
          if (fallo) return mensajeDeError(fallo);
          toast({ title: `${revertir.numero_recibo} revertido`, description: "Las cuentas que abonaba vuelven a tener ese saldo.", tone: "success" });
          recargar();
          return null;
        }}
      />
    </div>
  );
}

export default function CobrosRuta() {
  return <RoleGate roles={["ABOGADO_ADMIN"]}><CobrosPage /></RoleGate>;
}
