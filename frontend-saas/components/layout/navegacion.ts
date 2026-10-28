import {
  BarChart3,
  CalendarDays,
  CircleHelp,
  FileSignature,
  FileText,
  FolderOpen,
  Hash,
  Home,
  Inbox,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

export type Variante = "saas" | "platform-admin" | "lawyer" | "client";
export type ItemNav = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Etiqueta corta para la barra inferior. */
  corto?: string;
  /** Subsecciones que se despliegan bajo el ítem cuando está activo. */
  hijos?: ItemNav[];
  /** Abrir con recarga completa (p. ej. el editor de contenido). */
  recargar?: boolean;
};
export type GrupoNav = {
  titulo: string | null;
  items: ItemNav[];
  /** Grupo que se pliega en el riel; empieza abierto si `abierto`. */
  plegable?: boolean;
  abierto?: boolean;
};

const A = "/gestion-procesos/abogado";
const C = "/gestion-procesos/cliente";
const D = "/gestion-procesos/dashboard";

/** Navegación del abogado. Contratos y Métricas son de la administración de la firma. */
export function gruposAbogado(esAdminFirma: boolean): GrupoNav[] {
  return [
    {
      titulo: "Trabajo",
      items: [
        { id: "hoy", label: "Hoy", href: A, icon: Inbox },
        { id: "tareas", label: "Tareas", href: `${A}/tareas`, icon: ListChecks },
        { id: "agenda", label: "Agenda", href: `${A}/agenda`, icon: CalendarDays },
        { id: "mensajes", label: "Mensajes", href: `${A}/chat`, icon: MessageSquare },
      ],
    },
    {
      titulo: "Expedientes",
      items: [
        { id: "procesos", label: "Procesos", href: `${A}/procesos`, icon: FolderOpen },
        { id: "radicados", label: "Radicados", href: `${A}/radicados`, icon: Hash },
        { id: "clientes", label: "Clientes", href: `${A}/clientes`, icon: Users },
        { id: "documentos", label: "Documentos", href: `${A}/documentos`, icon: FileText },
      ],
    },
    {
      titulo: "Firma",
      items: [
        ...(esAdminFirma ? [{ id: "contratos", label: "Contratos", href: `${A}/contratos`, icon: FileSignature }] : []),
        { id: "solicitudes-perfil", label: "Cambios de perfil", href: `${A}/solicitudes-perfil`, icon: UserCheck },
        ...(esAdminFirma ? [{ id: "metricas", label: "Métricas", href: `${A}/metricas`, icon: BarChart3 }] : []),
      ],
    },
  ];
}

// Perfil, configuración y avisos viven en el menú de cuenta y la campana.
export const gruposCliente: GrupoNav[] = [
  {
    titulo: null,
    items: [
      { id: "inicio", label: "Inicio", href: C, icon: Home },
      { id: "procesos", label: "Mis procesos", corto: "Procesos", href: `${C}/procesos`, icon: FolderOpen },
      { id: "documentos", label: "Documentos", href: `${C}/documentos`, icon: FileText },
      { id: "mensajes", label: "Mensajes", href: `${C}/chat`, icon: MessageSquare },
      { id: "tareas", label: "Pendientes", href: `${C}/tareas`, icon: ListChecks },
      { id: "calendario", label: "Calendario", href: `${C}/calendario`, icon: CalendarDays },
      { id: "ayuda", label: "Ayuda", href: `${C}/ayuda`, icon: CircleHelp },
    ],
  },
];

const gruposSaas: GrupoNav[] = [
  {
    titulo: null,
    items: [
      { id: "resumen", label: "Resumen", href: D, icon: LayoutDashboard },
      { id: "radicados", label: "Radicados", href: `${D}/radicados`, icon: Hash },
      { id: "tareas", label: "Tareas", href: `${D}/tareas`, icon: ListChecks },
    ],
  },
];

/** Las cuatro pestañas de la barra inferior en celular; el resto va en "Más". */
const PESTANAS: Record<Exclude<Variante, "platform-admin">, string[]> = {
  lawyer: ["hoy", "procesos", "tareas", "mensajes"],
  client: ["inicio", "procesos", "documentos", "mensajes"],
  saas: ["resumen", "radicados", "tareas"],
};

export function navegacion(variante: Exclude<Variante, "platform-admin">, esAdminFirma: boolean) {
  const grupos = variante === "client" ? gruposCliente : variante === "lawyer" ? gruposAbogado(esAdminFirma) : gruposSaas;
  const todos = grupos.flatMap((grupo) => grupo.items);
  const pestanas = PESTANAS[variante].map((id) => todos.find((item) => item.id === id)).filter((item): item is ItemNav => Boolean(item));
  const resto = todos.filter((item) => !PESTANAS[variante].includes(item.id));
  return { grupos, todos, pestanas, resto, inicio: todos[0].href };
}

export function rutaAreaCuenta(variante: Variante) {
  return variante === "platform-admin" ? "/gestion-procesos/admin" : variante === "client" ? C : A;
}

function normalizar(ruta: string) {
  return ruta.replace(/\/+$/, "") || "/";
}

/** Si la ruta actual pertenece a la sección. Las portadas de cada área solo coinciden exactas. */
export function estaActiva(ruta: string, href: string, inicio: string) {
  const actual = normalizar(ruta);
  const destino = normalizar(href);
  if (destino === normalizar(inicio)) return actual === destino;
  return actual === destino || actual.startsWith(`${destino}/`);
}

/**
 * La sección activa entre varias: la de ruta más larga que coincide, para que
 * /admin/chat/limpiar marque "Limpieza de chats" y no "Chat del equipo".
 */
export function itemActivo(ruta: string, items: ItemNav[], inicio: string): ItemNav | undefined {
  return items
    .filter((item) => estaActiva(ruta, item.href, inicio))
    .sort((a, b) => normalizar(b.href).length - normalizar(a.href).length)[0];
}
