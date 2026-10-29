"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  BookOpenText,
  CreditCard,
  FileText,
  FolderOpen,
  Globe,
  LayoutDashboard,
  ListChecks,
  Scale,
  ServerCog,
  Settings,
  UserCheck,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import ChatFloatingButton from "@/components/chat/ChatFloatingButton";
import ChatPresenceHeartbeat from "@/components/chat/ChatPresenceHeartbeat";
import PushNotificationPrompt from "@/components/chat/PushNotificationPrompt";
import { BarraSuperior } from "@/components/layout/BarraSuperior";
import { BusquedaGlobal } from "@/components/layout/BusquedaGlobal";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import Sidebar from "@/components/layout/Sidebar";
import { estaActiva, itemActivo, type GrupoNav } from "@/components/layout/navegacion";
import { cx } from "@/lib/cx";
import { usePortalPathname } from "@/lib/usePortalPathname";

const ADMIN = "/gestion-procesos/admin";

const EXPEDIENTES = ["procesos", "radicados", "tareas", "agenda", "documentos", "contratos"].map((r) => `${ADMIN}/${r}`);

const grupos: GrupoNav[] = [
  {
    titulo: null,
    items: [{ id: "resumen", label: "Resumen", href: ADMIN, icon: LayoutDashboard }],
  },
  {
    titulo: "La firma",
    items: [
      { id: "expedientes", label: "Expedientes", href: `${ADMIN}/procesos`, icon: FolderOpen, rutas: EXPEDIENTES },
      { id: "cobros", label: "Cobros", href: `${ADMIN}/cobros`, icon: Wallet },
      { id: "usuarios", label: "Usuarios", href: `${ADMIN}/usuarios`, icon: Users, rutas: [`${ADMIN}/solicitudes-perfil`] },
    ],
  },
  {
    titulo: "Operación",
    items: [
      {
        id: "consultas", label: "Consultas y envíos", corto: "Consultas", href: `${ADMIN}/operacion/consultas`, icon: Scale,
        rutas: [`${ADMIN}/operacion/notificaciones`],
      },
      { id: "integraciones", label: "Integraciones", href: `${ADMIN}/operacion/integraciones`, icon: ServerCog },
      {
        id: "plantillas", label: "Plantillas y glosario", corto: "Plantillas", href: `${ADMIN}/operacion/mensajes`, icon: FileText,
        rutas: [`${ADMIN}/operacion/glosario`],
      },
    ],
  },
  {
    titulo: "Sistema",
    items: [
      {
        id: "actividad", label: "Actividad y auditoría", corto: "Actividad", href: `${ADMIN}/actividad`, icon: Activity,
        rutas: [`${ADMIN}/auditoria`, `${ADMIN}/metricas`],
      },
      {
        id: "configuracion", label: "Configuración", href: `${ADMIN}/firma`, icon: Settings,
        rutas: [`${ADMIN}/finanzas`, `${ADMIN}/almacenamiento`, `${ADMIN}/chat/limpiar`],
      },
      { id: "contenido", label: "Contenido del sitio", corto: "Sitio", href: `${ADMIN}/contenido`, icon: Globe, recargar: true },
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

/** Páginas de cada sección, como pestañas sobre el contenido. */
const SECCIONES: { titulo: string; pestanas: { label: string; href: string }[] }[] = [
  {
    titulo: "Expedientes",
    pestanas: [
      { label: "Procesos", href: `${ADMIN}/procesos` },
      { label: "Radicados", href: `${ADMIN}/radicados` },
      { label: "Tareas", href: `${ADMIN}/tareas` },
      { label: "Agenda", href: `${ADMIN}/agenda` },
      { label: "Documentos", href: `${ADMIN}/documentos` },
      { label: "Contratos", href: `${ADMIN}/contratos` },
    ],
  },
  {
    titulo: "Usuarios",
    pestanas: [
      { label: "Cuentas", href: `${ADMIN}/usuarios` },
      { label: "Solicitudes de perfil", href: `${ADMIN}/solicitudes-perfil` },
    ],
  },
  {
    titulo: "Consultas y envíos",
    pestanas: [
      { label: "Consultas judiciales", href: `${ADMIN}/operacion/consultas` },
      { label: "Envíos de avisos", href: `${ADMIN}/operacion/notificaciones` },
    ],
  },
  {
    titulo: "Plantillas y glosario",
    pestanas: [
      { label: "Plantillas de avisos", href: `${ADMIN}/operacion/mensajes` },
      { label: "Glosario", href: `${ADMIN}/operacion/glosario` },
    ],
  },
  {
    titulo: "Actividad y auditoría",
    pestanas: [
      { label: "Actividad", href: `${ADMIN}/actividad` },
      { label: "Auditoría técnica", href: `${ADMIN}/auditoria` },
      { label: "Carga de trabajo", href: `${ADMIN}/metricas` },
    ],
  },
  {
    titulo: "Configuración",
    pestanas: [
      { label: "Datos de la firma", href: `${ADMIN}/firma` },
      { label: "Cobros y pagos", href: `${ADMIN}/finanzas` },
      { label: "Almacenamiento", href: `${ADMIN}/almacenamiento` },
      { label: "Limpieza de chats", href: `${ADMIN}/chat/limpiar` },
    ],
  },
];

function PestanasSeccion({ ruta }: { ruta: string }) {
  const seccion = SECCIONES.find((s) => s.pestanas.some((p) => estaActiva(ruta, p.href, ADMIN)));
  if (!seccion) return null;
  const activa = itemActivo(ruta, seccion.pestanas.map((p) => ({ id: p.href, label: p.label, href: p.href, icon: Activity })), ADMIN);
  return (
    <nav aria-label={seccion.titulo} className="-mx-4 mb-5 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {seccion.pestanas.map((p) => {
          const actual = activa?.href === p.href;
          return (
            <li key={p.href}>
              <Link
                href={p.href}
                aria-current={actual ? "page" : undefined}
                className={cx(
                  "relative flex h-11 items-center whitespace-nowrap rounded-t-md px-3 text-[14px] font-semibold transition-colors duration-150",
                  actual ? "text-ink" : "text-ink-2 hover:bg-manila hover:text-ink",
                )}
              >
                {p.label}
                {actual && <span aria-hidden="true" className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-gold" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const todos = grupos.flatMap((grupo) => grupo.items);
const PESTANAS = ["resumen", "expedientes", "cobros", "usuarios"];
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
        {!enChat && <PestanasSeccion ruta={ruta} />}
        {children}
      </main>
      {!enChat && <MobileTabBar pestanas={pestanas} resto={resto} gruposResto={restoAgrupado} inicio={ADMIN} />}
      {!enChat && <ChatFloatingButton />}
      <BusquedaGlobal area="admin" />
    </div>
  );
}
