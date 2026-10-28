"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Edit3, ExternalLink, KeyRound, Mail, MessageCircle, Phone, Plus, RefreshCw } from "lucide-react";

import { ClienteFormModal } from "@/components/clientes/ClienteFormModal";
import { ReenviarAccesoDialog } from "@/components/clientes/ReenviarAccesoDialog";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataTableColumn, type RowAction } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { SummaryStrip } from "@/components/ui/SummaryStrip";
import { Tag } from "@/components/ui/Tag";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { ACCESO, RUTA_CLIENTES, enlaceChat, iniciales, textoPendientes, whatsappDigitos, type Cliente, type GrupoClientes } from "@/lib/clientes";
import { fechaRelativa } from "@/lib/fechas";
import { useAccionDeUrl } from "@/lib/useAccionDeUrl";
import { useLoadEffect } from "@/lib/useLoadEffect";

const VACIOS: Record<GrupoClientes, [string, string]> = {
  todos: ["Aún no hay clientes", "Crea el primero; le enviamos su acceso al portal para que siga sus procesos."],
  con_pendientes: ["Nadie debe documentos", "Cuando le pidas documentos a un cliente, aparece aquí hasta que los entregue."],
  sin_ingreso: ["Todos ya entraron al portal", "Los clientes que no han usado su contraseña temporal aparecen aquí."],
  sin_procesos: ["Todos tienen procesos activos", "Los clientes sin un proceso activo aparecen aquí."],
};

export default function ClientesPage() {
  const router = useRouter();
  const [grupo, setGrupo] = useState<GrupoClientes>("todos");
  const [lista, setLista] = useState<Esquemas["ListaClientes"] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<{ clienteId: number | null } | null>(null);
  const [reenviar, setReenviar] = useState<Cliente | null>(null);

  useAccionDeUrl("nuevo", useCallback(() => setFormulario({ clienteId: null }), []));

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/clientes", { params: { query: { grupo } } });
    if (data) setLista(data);
    else setError(mensajeDeError(fallo));
    setCargando(false);
  }, [grupo]);
  useLoadEffect(cargar);

  const columnas: DataTableColumn<Cliente>[] = [
    {
      key: "nombre",
      header: "Cliente",
      mobile: "title",
      sortValue: (c) => c.nombre,
      searchValue: (c) => [c.nombre, c.email, c.whatsapp, c.documento, ...c.procesos.map((p) => p.nombre)].filter(Boolean).join(" "),
      exportValue: (c) => c.nombre,
      render: (c) => (
        <span className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="hidden size-9 shrink-0 place-items-center rounded-full bg-navy-soft text-[12px] font-semibold text-navy-ink md:grid">
            {iniciales(c.nombre)}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-ink">{c.nombre}</span>
            <span className="block truncate text-[12.5px] text-ink-3">{c.email}</span>
          </span>
        </span>
      ),
    },
    {
      key: "procesos",
      header: "Procesos activos",
      mobile: "subtitle",
      sortValue: (c) => c.procesos.length,
      exportValue: (c) => c.procesos.map((p) => p.nombre).join("; "),
      render: (c) => c.procesos.length ? (
        <span className="block min-w-0 text-ink-2">
          <span className="block truncate">{c.procesos[0].nombre}</span>
          {c.procesos.length > 1 && <span className="text-[12.5px] text-ink-3">y {c.procesos.length - 1} más</span>}
        </span>
      ) : <span className="text-ink-3">Sin procesos activos</span>,
    },
    {
      key: "pendientes",
      header: "Documentos",
      mobile: "badge",
      sortValue: (c) => c.documentos_pendientes,
      exportValue: (c) => c.documentos_pendientes,
      render: (c) => {
        const pendiente = textoPendientes(c);
        return pendiente ? <Tag tone={pendiente.tono}>{pendiente.texto}</Tag> : <span className="text-[13px] text-ink-3">Al día</span>;
      },
    },
    {
      key: "acceso",
      header: "Portal",
      mobile: "meta",
      sortValue: (c) => c.ultimo_acceso ?? "",
      exportValue: (c) => ACCESO[c.acceso].nombre,
      render: (c) => c.acceso === "activo"
        ? <span className="text-ink-2">{c.ultimo_acceso ? `Entró ${fechaRelativa(c.ultimo_acceso).toLowerCase()}` : "Entra al portal"}</span>
        : <Tag tone={ACCESO[c.acceso].tono}>{ACCESO[c.acceso].nombre}</Tag>,
    },
    {
      key: "whatsapp",
      header: "WhatsApp",
      wideOnly: true,
      sortValue: (c) => c.whatsapp,
      exportValue: (c) => c.whatsapp,
      render: (c) => c.whatsapp ? <span className="tabular-nums text-ink-2">{c.whatsapp}</span> : <span className="text-ink-3">—</span>,
    },
  ];

  const acciones: RowAction<Cliente>[] = [
    { label: "Abrir ficha", icon: <ExternalLink size={16} />, href: (c) => `${RUTA_CLIENTES}/${c.id}` },
    { label: "Escribirle", icon: <MessageCircle size={16} />, href: (c) => enlaceChat(c) ?? "#", hidden: (c) => !enlaceChat(c) },
    { label: "Editar datos", icon: <Edit3 size={16} />, onSelect: (c) => setFormulario({ clienteId: c.id }) },
    { label: "Reenviar acceso", icon: <KeyRound size={16} />, hidden: (c) => c.acceso !== "sin_ingreso", onSelect: setReenviar },
    { label: "Enviar correo", icon: <Mail size={16} />, href: (c) => `mailto:${c.email}`, separated: true },
    { label: "Abrir WhatsApp", icon: <Phone size={16} />, href: (c) => `https://wa.me/${whatsappDigitos(c.whatsapp)}`, hidden: (c) => !c.whatsapp },
  ];

  const resumen = lista?.resumen;
  const [tituloVacio, textoVacio] = VACIOS[grupo];

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Quiénes son, en qué procesos están, qué les falta entregar y si ya usan el portal."
        action={<Button icon={<Plus size={16} />} onClick={() => setFormulario({ clienteId: null })}>Nuevo cliente</Button>}
      />

      <SummaryStrip
        active={grupo === "todos" ? "total" : grupo}
        onSelect={(clave) => setGrupo(clave === "total" || clave === grupo ? "todos" : (clave as GrupoClientes))}
        items={[
          { key: "total", label: "Clientes", value: resumen?.total ?? "—" },
          { key: "con_pendientes", label: "Deben documentos", value: resumen?.con_pendientes ?? "—", tone: resumen?.con_pendientes ? "warning" : "default" },
          { key: "sin_ingreso", label: "No han entrado al portal", value: resumen?.sin_ingreso ?? "—" },
          { key: "sin_procesos", label: "Sin procesos activos", value: resumen?.sin_procesos ?? "—" },
        ]}
      />

      <div className="mt-5">
        {error ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] bg-bad-soft px-4 py-3 text-bad">
            <p className="flex-1 text-[14px]">{error}</p>
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
          </div>
        ) : (
          <DataTable
            caption="Clientes"
            rows={lista?.items ?? []}
            columns={columnas}
            rowKey={(c) => c.id}
            onRowClick={(c) => router.push(`${RUTA_CLIENTES}/${c.id}`)}
            rowActions={acciones}
            searchPlaceholder="Buscar por nombre, correo o proceso"
            initialSort={{ key: "nombre", direction: "asc" }}
            exportFilename="clientes"
            storageKey="abogado-clientes-v2"
            loading={cargando && !lista}
            emptyTitle={tituloVacio}
            emptyDescription={textoVacio}
            emptyAction={grupo === "todos" ? <Button icon={<Plus size={16} />} onClick={() => setFormulario({ clienteId: null })}>Nuevo cliente</Button> : undefined}
          />
        )}
      </div>

      <ClienteFormModal
        open={formulario !== null}
        clienteId={formulario?.clienteId}
        onClose={() => setFormulario(null)}
        onGuardado={(ficha) => (formulario?.clienteId ? void cargar() : router.push(`${RUTA_CLIENTES}/${ficha.id}`))}
      />
      <ReenviarAccesoDialog cliente={reenviar} onClose={() => setReenviar(null)} onEnviado={() => void cargar()} />
    </div>
  );
}
