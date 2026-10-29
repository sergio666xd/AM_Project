"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogOut, Mail, PauseCircle, PlayCircle, Plus, RefreshCw, UserRound } from "lucide-react";

import { ConfirmarAccionCuenta, type AccionCuenta } from "@/components/admin/usuarios/ConfirmarAccionCuenta";
import { UsuarioFormModal } from "@/components/admin/usuarios/UsuarioFormModal";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataTableColumn, type RowAction } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Tag } from "@/components/ui/Tag";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { fechaRelativa } from "@/lib/fechas";
import { useValorDeUrl } from "@/lib/useAccionDeUrl";
import { useLoadEffect } from "@/lib/useLoadEffect";
import { ROL, RUTA_USUARIOS, estadoCuenta, plural, type GrupoUsuarios, type UsuarioFila } from "@/lib/usuariosAdmin";

type Filtro = "todas" | "activas" | "sin_ingreso" | "suspendidas";

const FILTROS: { valor: Filtro; nombre: string }[] = [
  { valor: "todas", nombre: "Todas las cuentas" },
  { valor: "activas", nombre: "Activas" },
  { valor: "sin_ingreso", nombre: "No han entrado" },
  { valor: "suspendidas", nombre: "Suspendidas" },
];
const CONSULTA: Record<Filtro, { estado?: "activo" | "suspendido"; acceso?: "activo" | "sin_ingreso" }> = {
  todas: {},
  activas: { acceso: "activo" },
  sin_ingreso: { acceso: "sin_ingreso" },
  suspendidas: { estado: "suspendido" },
};
const CAMPO_FILTRO =
  "h-10 min-w-0 rounded-lg bg-sheet px-3 text-[14px] text-ink shadow-[0_0_0_1px_var(--line-strong)] focus:outline-none focus:shadow-[0_0_0_2px_var(--navy)]";
const VACIOS: Record<GrupoUsuarios, [string, string]> = {
  equipo: ["Aún no hay abogados", "Cree la cuenta de cada abogado de la firma con «Nueva cuenta»."],
  clientes: ["Aún no hay clientes", "Los abogados crean a sus clientes desde su panel; también puede hacerlo aquí."],
  administradores: ["Sin cuentas de administración", ""],
};

/** Todas las páginas del listado: la firma tiene decenas de cuentas, no miles. */
async function todasLasCuentas(grupo: GrupoUsuarios, filtro: Filtro) {
  const items: UsuarioFila[] = [];
  let cursor: string | undefined;
  let conteo: Esquemas["ConteoUsuarios"] | null = null;
  for (let vuelta = 0; vuelta < 20; vuelta++) {
    const { data, error } = await api.GET("/api/v2/admin/usuarios", { params: { query: { grupo, ...CONSULTA[filtro], limite: 100, cursor } } });
    if (error || !data) return { error };
    items.push(...data.items);
    conteo = data.conteo;
    if (!data.siguiente) break;
    cursor = data.siguiente;
  }
  return { items, conteo };
}

export function PanelUsuarios() {
  const router = useRouter();
  const { toast } = useToast();
  const [grupo, setGrupo] = useState<GrupoUsuarios>("equipo");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [filas, setFilas] = useState<UsuarioFila[] | null>(null);
  const [conteo, setConteo] = useState<Esquemas["ConteoUsuarios"] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [creando, setCreando] = useState(false);
  const [pendiente, setPendiente] = useState<{ accion: AccionCuenta; cuenta: UsuarioFila } | null>(null);
  // Si se cambia de pestaña o filtro a mitad de una carga, solo cuenta la última.
  const ultimaCarga = useRef(0);

  // El resumen enlaza aquí con `?grupo=clientes&acceso=sin_ingreso`.
  useValorDeUrl("grupo", useCallback((valor: string) => {
    if (valor === "equipo" || valor === "clientes" || valor === "administradores") setGrupo(valor);
  }, []));
  useValorDeUrl("acceso", useCallback((valor: string) => { if (valor === "sin_ingreso") setFiltro("sin_ingreso"); }, []));

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const esta = ++ultimaCarga.current;
    const resultado = await todasLasCuentas(grupo, filtro);
    if (esta !== ultimaCarga.current) return;
    if ("items" in resultado && resultado.items) {
      setFilas(resultado.items);
      setConteo(resultado.conteo);
    } else setError(mensajeDeError(resultado.error));
    setCargando(false);
    void version;
  }, [grupo, filtro, version]);
  useLoadEffect(cargar);
  const recargar = () => setVersion((v) => v + 1);

  async function cambiarVarias(cuentas: UsuarioFila[], estado: "activo" | "suspendido") {
    const ids = cuentas.filter((c) => c.rol !== "ADMIN").map((c) => c.id);
    if (!ids.length) return;
    const { data, error: fallo } = await api.POST("/api/v2/admin/usuarios/estado", { body: { estado, ids } });
    if (fallo || !data) {
      toast({ title: "No se pudo cambiar el estado", description: mensajeDeError(fallo), tone: "error" });
      return;
    }
    const n = data.actualizados;
    toast({
      title: n === 0
        ? "No había nada que cambiar"
        : `${plural(n, "cuenta", "cuentas")} ${estado === "suspendido" ? (n === 1 ? "suspendida" : "suspendidas") : (n === 1 ? "reactivada" : "reactivadas")}`,
      tone: "success",
    });
    recargar();
  }

  const columnas: DataTableColumn<UsuarioFila>[] = [
    {
      key: "nombre",
      header: "Nombre",
      mobile: "title",
      sortValue: (u) => u.nombre,
      searchValue: (u) => `${u.nombre} ${u.email} ${u.whatsapp ?? ""}`,
      exportValue: (u) => u.nombre,
      render: (u) => (
        <span className="block min-w-0">
          <span className="block font-semibold text-ink">{u.nombre}</span>
          <span className="block truncate text-[12.5px] text-ink-3 xl:hidden">{u.email}</span>
        </span>
      ),
    },
    {
      key: "correo",
      header: "Correo",
      mobile: "hidden",
      wideOnly: true,
      sortValue: (u) => u.email,
      exportValue: (u) => u.email,
      render: (u) => <span className="block max-w-64 truncate text-ink-2" title={u.email}>{u.email}</span>,
    },
    ...(grupo === "clientes"
      ? [{
        key: "responsable",
        header: "Abogado responsable",
        mobile: "subtitle",
        sortValue: (u) => u.responsable?.nombre ?? "",
        exportValue: (u) => u.responsable?.nombre ?? "",
        render: (u) => (u.responsable ? <span className="text-ink-2">{u.responsable.nombre}</span> : <span className="text-ink-3">Sin asignar</span>),
      } satisfies DataTableColumn<UsuarioFila>]
      : grupo === "equipo"
        ? [{
          key: "rol",
          header: "Rol",
          mobile: "subtitle",
          sortValue: (u) => ROL[u.rol],
          exportValue: (u) => ROL[u.rol],
          render: (u) => <span className="text-ink-2">{ROL[u.rol]}</span>,
        } satisfies DataTableColumn<UsuarioFila>]
        : []),
    {
      key: "estado",
      header: "Estado",
      mobile: "badge",
      sortValue: (u) => estadoCuenta(u).nombre,
      exportValue: (u) => estadoCuenta(u).nombre,
      render: (u) => <Tag tone={estadoCuenta(u).tono}>{estadoCuenta(u).nombre}</Tag>,
    },
    ...(grupo === "administradores"
      ? []
      : [{
        key: "procesos",
        header: "Procesos activos",
        align: "right",
        sortValue: (u) => u.procesos,
        exportValue: (u) => u.procesos,
        render: (u) => <span className="tabular-nums text-ink-2">{u.procesos || "Ninguno"}</span>,
      } satisfies DataTableColumn<UsuarioFila>]),
    {
      key: "acceso",
      header: "Último ingreso",
      mobile: "meta",
      sortValue: (u) => u.ultimo_acceso ?? "",
      exportValue: (u) => u.ultimo_acceso ?? "",
      render: (u) => <span className="tabular-nums text-ink-2">{u.ultimo_acceso ? fechaRelativa(u.ultimo_acceso) : "Nunca"}</span>,
    },
  ];

  const editable = (u: UsuarioFila) => u.rol !== "ADMIN";
  const acciones: RowAction<UsuarioFila>[] = [
    { label: "Ver la ficha", icon: <UserRound size={16} />, href: (u) => `${RUTA_USUARIOS}/${u.id}` },
    { label: "Reenviar el acceso", icon: <Mail size={16} />, hidden: (u) => !editable(u) || u.acceso !== "sin_ingreso", onSelect: (u) => setPendiente({ accion: "acceso", cuenta: u }) },
    { label: "Enviar enlace para cambiar la contraseña", icon: <KeyRound size={16} />, hidden: (u) => !editable(u) || u.acceso !== "activo", onSelect: (u) => setPendiente({ accion: "enlace", cuenta: u }) },
    { label: "Cerrar sus sesiones", icon: <LogOut size={16} />, hidden: (u) => !editable(u) || u.estado !== "activo", onSelect: (u) => setPendiente({ accion: "cerrar", cuenta: u }) },
    { label: "Suspender", icon: <PauseCircle size={16} />, separated: true, hidden: (u) => !editable(u) || u.estado !== "activo", onSelect: (u) => setPendiente({ accion: "suspender", cuenta: u }) },
    { label: "Reactivar", icon: <PlayCircle size={16} />, separated: true, hidden: (u) => !editable(u) || u.estado === "activo", onSelect: (u) => setPendiente({ accion: "reactivar", cuenta: u }) },
  ];

  const [tituloVacio, textoVacio] = filtro === "todas"
    ? VACIOS[grupo]
    : ["Ninguna cuenta con este filtro", "Pruebe con «Todas las cuentas»."];

  return (
    <div>
      <PageHeader
        title="Usuarios"
        description={conteo
          ? [
            plural(conteo.equipo, "abogado", "abogados"),
            plural(conteo.clientes, "cliente", "clientes"),
            conteo.sin_ingreso ? `${conteo.sin_ingreso} sin entrar todavía` : null,
            conteo.suspendidos ? plural(conteo.suspendidos, "suspendida", "suspendidas") : null,
          ].filter(Boolean).join(" · ")
          : "Las cuentas del equipo, los clientes y la administración."}
        action={<Button icon={<Plus size={16} />} onClick={() => setCreando(true)}>Nueva cuenta</Button>}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SegmentedControl<GrupoUsuarios>
          label="Qué cuentas ver"
          value={grupo}
          onChange={setGrupo}
          options={[
            { value: "equipo", label: "Equipo", count: conteo?.equipo },
            { value: "clientes", label: "Clientes", count: conteo?.clientes },
            { value: "administradores", label: "Administración", count: conteo?.administradores },
          ]}
        />
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)} aria-label="Filtrar por estado" className={CAMPO_FILTRO}>
          {FILTROS.map((f) => <option key={f.valor} value={f.valor}>{f.nombre}</option>)}
        </select>
      </div>

      <div className="mt-4">
        {error ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] bg-bad-soft px-4 py-3 text-bad">
            <p className="flex-1 text-[14px]">{error}</p>
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
          </div>
        ) : (
          <DataTable
            key={grupo}
            caption="Cuentas"
            rows={filas ?? []}
            columns={columnas}
            rowKey={(u) => u.id}
            rowHref={(u) => `${RUTA_USUARIOS}/${u.id}`}
            onRowClick={(u) => router.push(`${RUTA_USUARIOS}/${u.id}`)}
            rowActions={acciones}
            bulkActions={grupo === "administradores" ? undefined : [
              { label: "Suspender", icon: <PauseCircle size={16} />, tone: "danger", onRun: (rows) => cambiarVarias(rows, "suspendido") },
              { label: "Reactivar", icon: <PlayCircle size={16} />, onRun: (rows) => cambiarVarias(rows, "activo") },
            ]}
            searchPlaceholder="Buscar por nombre, correo o WhatsApp"
            initialSort={{ key: "nombre", direction: "asc" }}
            exportFilename={`usuarios-${grupo}`}
            storageKey="admin-usuarios"
            loading={cargando && !filas}
            emptyTitle={tituloVacio}
            emptyDescription={textoVacio}
          />
        )}
      </div>

      <UsuarioFormModal
        open={creando}
        rolInicial={grupo === "equipo" ? "ABOGADO_ADMIN" : "CLIENTE"}
        onClose={() => setCreando(false)}
        onGuardado={(ficha) => router.push(`${RUTA_USUARIOS}/${ficha.id}`)}
      />
      <ConfirmarAccionCuenta
        accion={pendiente?.accion ?? null}
        cuenta={pendiente?.cuenta ?? null}
        onClose={() => setPendiente(null)}
        onHecho={() => { setPendiente(null); recargar(); }}
      />
    </div>
  );
}
