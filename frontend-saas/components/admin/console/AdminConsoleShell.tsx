"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  Activity,
  BarChart3,
  Bell,
  BookOpenText,
  CalendarDays,
  CreditCard,
  Eraser,
  FileSignature,
  FileText,
  FolderOpen,
  HardDrive,
  Inbox,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Scale,
  ScrollText,
  ServerCog,
  Settings,
  UserCheck,
  UserRound,
  Users,
} from "lucide-react";
import ChatFloatingButton from "@/components/chat/ChatFloatingButton";
import ChatPresenceHeartbeat from "@/components/chat/ChatPresenceHeartbeat";
import PushNotificationPrompt from "@/components/chat/PushNotificationPrompt";
import { BarraSuperior } from "@/components/layout/BarraSuperior";
import { BusquedaGlobal } from "@/components/layout/BusquedaGlobal";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import Sidebar from "@/components/layout/Sidebar";
import type { GrupoNav, ItemNav } from "@/components/layout/navegacion";
import { cx } from "@/lib/cx";
import { usePortalPathname } from "@/lib/usePortalPathname";

const ADMIN = "/gestion-procesos/admin";

const operacion: ItemNav[] = [
  { id: "operacion-resumen", label: "Resumen", href: `${ADMIN}/operacion`, icon: Activity },
  { id: "operacion-consultas", label: "Consultas judiciales", href: `${ADMIN}/operacion/consultas`, icon: CalendarDays },
  { id: "operacion-integraciones", label: "Integraciones", href: `${ADMIN}/operacion/integraciones`, icon: ServerCog },
  { id: "operacion-notificaciones", label: "Notificaciones", href: `${ADMIN}/operacion/notificaciones`, icon: Bell },
  { id: "operacion-mensajes", label: "Mensajes del sistema", href: `${ADMIN}/operacion/mensajes`, icon: FileText },
];

const grupos: GrupoNav[] = [
  {
    titulo: "Inicio",
    items: [
      { id: "resumen", label: "Resumen", href: ADMIN, icon: LayoutDashboard },
      { id: "alertas", label: "Alertas", href: `${ADMIN}/alertas`, icon: Bell },
      { id: "notificaciones", label: "Notificaciones", href: `${ADMIN}/notificaciones`, icon: Inbox },
    ],
  },
  {
    titulo: "Expedientes",
    items: [
      { id: "procesos", label: "Procesos", href: `${ADMIN}/procesos`, icon: FolderOpen },
      { id: "radicados", label: "Radicados", href: `${ADMIN}/radicados`, icon: Scale },
      { id: "tareas", label: "Tareas", href: `${ADMIN}/tareas`, icon: ListChecks },
      { id: "agenda", label: "Agenda", href: `${ADMIN}/agenda`, icon: CalendarDays },
      { id: "documentos", label: "Documentos", href: `${ADMIN}/documentos`, icon: BookOpenText },
      { id: "contratos", label: "Contratos", href: `${ADMIN}/contratos`, icon: FileSignature },
    ],
  },
  {
    titulo: "Personas",
    items: [
      { id: "usuarios", label: "Usuarios", href: `${ADMIN}/usuarios`, icon: Users },
      { id: "solicitudes-perfil", label: "Solicitudes de perfil", href: `${ADMIN}/solicitudes-perfil`, icon: UserRound },
      { id: "chat", label: "Chat del equipo", href: `${ADMIN}/chat`, icon: MessageSquare },
    ],
  },
  {
    titulo: "Supervisión",
    plegable: true,
    items: [
      { id: "metricas", label: "Métricas", href: `${ADMIN}/metricas`, icon: BarChart3 },
      { id: "actividad", label: "Actividad", href: `${ADMIN}/actividad`, icon: Activity },
      { id: "auditoria", label: "Auditoría técnica", href: `${ADMIN}/auditoria`, icon: ScrollText },
    ],
  },
  {
    titulo: "Sistema",
    plegable: true,
    items: [
      { id: "operacion", label: "Operación", href: `${ADMIN}/operacion`, icon: ServerCog, hijos: operacion },
      { id: "firma", label: "Datos de la firma", href: `${ADMIN}/firma`, icon: Settings },
      { id: "contenido", label: "Contenido público", href: `${ADMIN}/contenido`, icon: FileText, recargar: true },
      { id: "almacenamiento", label: "Almacenamiento", href: `${ADMIN}/almacenamiento`, icon: HardDrive },
      { id: "chat-limpiar", label: "Limpieza de chats", href: `${ADMIN}/chat/limpiar`, icon: Eraser },
    ],
  },
  {
    titulo: "Heredado",
    plegable: true,
    items: [
      { id: "solicitudes", label: "Registros pendientes", href: `${ADMIN}/solicitudes`, icon: UserCheck },
      { id: "planes", label: "Planes", href: `${ADMIN}/planes`, icon: CreditCard },
      { id: "saas-procesos", label: "Procesos SaaS", href: `${ADMIN}/saas/procesos`, icon: FolderOpen },
      { id: "saas-radicados", label: "Radicados SaaS", href: `${ADMIN}/saas/radicados`, icon: Scale },
      { id: "saas-tareas", label: "Tareas SaaS", href: `${ADMIN}/saas/tareas`, icon: ListChecks },
      { id: "saas-documentos", label: "Documentos SaaS", href: `${ADMIN}/saas/documentos`, icon: BookOpenText },
      { id: "global-radicados", label: "Radicados globales", href: `${ADMIN}/global/radicados`, icon: Scale },
    ],
  },
];

const todos = grupos.flatMap((grupo) => grupo.items);
const PESTANAS = ["resumen", "procesos", "tareas", "usuarios"];
const pestanas = PESTANAS.map((id) => todos.find((item) => item.id === id)!);
const restoAgrupado = grupos
  .map((grupo) => ({ ...grupo, items: grupo.items.filter((item) => !PESTANAS.includes(item.id)) }))
  .filter((grupo) => grupo.items.length);
const resto = restoAgrupado.flatMap((grupo) => [...grupo.items, ...grupo.items.flatMap((item) => item.hijos ?? [])]);
const enlacesCuenta = [{ label: "Mi cuenta", href: `${ADMIN}/cuenta`, icon: UserRound }];

/** Consola de administración: el mismo riel y la misma barra superior que el panel del abogado. */
export default function AdminConsoleShell({ children }: { children: ReactNode }) {
  const ruta = usePortalPathname();
  const enChat = ruta.split("/").includes("chat") && !ruta.startsWith(`${ADMIN}/chat/limpiar`);

  return (
    <div
      data-area="platform-admin"
      className={cx("bg-ground text-ink lg:pl-[248px]", enChat ? "flex h-dvh flex-col overflow-hidden" : "min-h-dvh")}
      style={{ "--alto-barra": "56px" } as CSSProperties}
    >
      <ChatPresenceHeartbeat />
      <PushNotificationPrompt />
      <Sidebar grupos={grupos} inicio={ADMIN} areaHref={ADMIN} enlacesCuenta={enlacesCuenta} />
      <BarraSuperior inicio={ADMIN} areaHref={ADMIN} fija={!enChat} avisosHref={`${ADMIN}/notificaciones`} enlacesCuenta={enlacesCuenta} />
      <main className={cx("mx-auto w-full max-w-[1280px]", enChat ? "min-h-0 flex-1" : "px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-7")}>
        {children}
      </main>
      {!enChat && <MobileTabBar pestanas={pestanas} resto={resto} gruposResto={restoAgrupado} inicio={ADMIN} />}
      {!enChat && <ChatFloatingButton />}
      <BusquedaGlobal area="admin" />
    </div>
  );
}
