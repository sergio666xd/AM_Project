"use client";

import { ReactNode, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bell,
  BookOpenText,
  CalendarDays,
  ChevronRight,
  CreditCard,
  FileText,
  FolderOpen,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  MessageCircle,
  ScrollText,
  Settings,
  ServerCog,
  Users,
  UserCheck,
  UserRound,
  X,
} from "lucide-react";
import { useSession } from "@/context/SessionContext";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import { AdminAlertBell } from "@/components/admin/console/AdminAlertBell";
import GlobalSearch from "@/components/layout/GlobalSearch";
import ChatFloatingButton from "@/components/chat/ChatFloatingButton";

type Item = { label: string; href: string; icon: typeof LayoutDashboard };
type Section = { title: string; scope: string; links: Item[] };

const operationsLinks: Item[] = [
  { label: "Resumen", href: "/gestion-procesos/admin/operacion", icon: Activity },
  { label: "Consultas judiciales", href: "/gestion-procesos/admin/operacion/consultas", icon: CalendarDays },
  { label: "Integraciones", href: "/gestion-procesos/admin/operacion/integraciones", icon: ServerCog },
  { label: "Notificaciones", href: "/gestion-procesos/admin/operacion/notificaciones", icon: Bell },
  { label: "Mensajes del sistema", href: "/gestion-procesos/admin/operacion/mensajes", icon: FileText },
];
const documentLinks: Item[] = [
  { label: "Archivos recibidos", href: "/gestion-procesos/admin/documentos", icon: BookOpenText },
  { label: "Contratos cargados", href: "/gestion-procesos/admin/documentos/contratos", icon: FileText },
  { label: "Solicitudes documentales", href: "/gestion-procesos/admin/documentos/solicitudes", icon: FileText },
];
const auditLinks: Item[] = [
  { label: "Actividad", href: "/gestion-procesos/admin/actividad", icon: Activity },
  { label: "Auditoría técnica", href: "/gestion-procesos/admin/auditoria", icon: ScrollText },
];

const sections: Section[] = [
  {
    title: "Visión global",
    scope: "Global",
    links: [
      {
        label: "Resumen",
        href: "/gestion-procesos/admin",
        icon: LayoutDashboard,
      },
      { label: "Métricas y carga", href: "/gestion-procesos/admin/metricas", icon: Activity },
      {
        label: "Alertas",
        href: "/gestion-procesos/admin/alertas",
        icon: Bell,
      },
      {
        label: "Notificaciones",
        href: "/gestion-procesos/admin/notificaciones",
        icon: Bell,
      },
      {
        label: "Usuarios",
        href: "/gestion-procesos/admin/usuarios",
        icon: Users,
      },
      {
        label: "Solicitudes de perfil",
        href: "/gestion-procesos/admin/solicitudes-perfil",
        icon: UserRound,
      },
      {
        label: "Radicados globales",
        href: "/gestion-procesos/admin/global/radicados",
        icon: FileText,
      },
      {
        label: "Mi cuenta",
        href: "/gestion-procesos/admin/cuenta",
        icon: UserRound,
      },
      {
        label: "Chat",
        href: "/gestion-procesos/admin/chat",
        icon: MessageCircle,
      },
      {
        label: "Auditoría",
        href: "/gestion-procesos/admin/auditoria",
        icon: ScrollText,
      },
      {
        label: "Operación",
        href: "/gestion-procesos/admin/operacion",
        icon: Activity,
      },
    ],
  },
  {
    title: "Firma",
    scope: "Firma · Alejandra Muñoz Abogada y Asociados",
    links: [
      {
        label: "Procesos",
        href: "/gestion-procesos/admin/procesos",
        icon: FolderOpen,
      },
      {
        label: "Radicados",
        href: "/gestion-procesos/admin/radicados",
        icon: FileText,
      },
      {
        label: "Tareas",
        href: "/gestion-procesos/admin/tareas",
        icon: ListChecks,
      },
      {
        label: "Agenda",
        href: "/gestion-procesos/admin/agenda",
        icon: CalendarDays,
      },
      {
        label: "Documentos",
        href: "/gestion-procesos/admin/documentos",
        icon: BookOpenText,
      },
      {
        label: "Contratos y Documentos Legales",
        href: "/gestion-procesos/admin/contratos",
        icon: FileText,
      },
      {
        label: "Configuración de firma",
        href: "/gestion-procesos/admin/firma",
        icon: Settings,
      },
    ],
  },
  {
    title: "SaaS individual",
    scope: "SaaS · abogados externos",
    links: [
      {
        label: "Solicitudes",
        href: "/gestion-procesos/admin/solicitudes",
        icon: UserCheck,
      },
      {
        label: "Planes",
        href: "/gestion-procesos/admin/planes",
        icon: CreditCard,
      },
      {
        label: "Procesos",
        href: "/gestion-procesos/admin/saas/procesos",
        icon: FolderOpen,
      },
      {
        label: "Radicados",
        href: "/gestion-procesos/admin/saas/radicados",
        icon: FileText,
      },
      {
        label: "Tareas",
        href: "/gestion-procesos/admin/saas/tareas",
        icon: ListChecks,
      },
      {
        label: "Documentos",
        href: "/gestion-procesos/admin/saas/documentos",
        icon: BookOpenText,
      },
    ],
  },
  {
    title: "Sitio público",
    scope: "Contenido institucional",
    links: [
      {
        label: "Páginas del sitio",
        href: "/gestion-procesos/admin/contenido",
        icon: FileText,
      },
    ],
  },
];

function activeScope(pathname: string) {
  if (pathname.startsWith("/gestion-procesos/admin/contenido"))
    return "Contenido institucional";
  if (pathname.startsWith("/gestion-procesos/admin/saas"))
    return "SaaS · abogados externos";
  if (pathname.startsWith("/gestion-procesos/admin/global"))
    return "Global · todas las modalidades";
  if (/\/admin\/(planes|solicitudes)(\/|$)/.test(pathname))
    return "SaaS · abogados externos";
  if (/\/admin\/(notificaciones|alertas|actividad|auditoria|operacion|chat)(\/|$)/.test(pathname))
    return "Global · todas las modalidades";
  if (/\/admin\/(procesos|radicados|tareas|documentos|agenda|firma)(\/|$)/.test(pathname))
    return "Firma · Alejandra Muñoz Abogada y Asociados";
  return "Global · todas las modalidades";
}

export default function AdminConsoleShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { user, logout, token } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isChatRoute = pathname.split("/").includes("chat");
  const scope = activeScope(pathname);

  function renderNav() {
    return sections.map((section) => (
      <section
        key={section.title}
        aria-label={section.title}
        className="space-y-1"
      >
        <h2 className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-(--foreground-muted)">
          {section.title}
        </h2>
        {section.links.map(({ label, href, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <div key={`${section.title}-${href}`}>
              <Link
                href={href}
                prefetch={href !== "/gestion-procesos/admin/contenido"}
                onClick={(event) => {
                  setMobileOpen(false);
                  if (href === "/gestion-procesos/admin/contenido") {
                    // Bypass the App Router transition for the CMS route. Next 16.3
                    // can fail while consuming a prefetched RSC navigation payload.
                    event.preventDefault();
                    window.location.assign(href);
                  }
                }}
                aria-current={pathname === href ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${isActive ? "bg-primary/10 text-primary" : "text-(--foreground-secondary) hover:bg-surface-hover"}`}
              >
                <Icon className="size-4 shrink-0" />
                {label}
                {isActive && <ChevronRight className="ml-auto size-4" />}
              </Link>
              {href === "/gestion-procesos/admin/operacion" && isActive && (
                <div className="ml-5 space-y-1 border-l border-border py-1 pl-3">
                  {operationsLinks.map(({ label: childLabel, href: childHref, icon: ChildIcon }) => {
                    const childActive = pathname === childHref;
                    return (
                      <Link
                        key={childHref}
                        href={childHref}
                        onClick={() => setMobileOpen(false)}
                        aria-current={childActive ? "page" : undefined}
                        className={`flex items-center gap-2 rounded-md px-2 py-2 text-xs font-medium transition ${childActive ? "bg-primary/10 text-primary" : "text-(--foreground-secondary) hover:bg-surface-hover"}`}
                      >
                        <ChildIcon className="size-3.5 shrink-0" />
                        {childLabel}
                      </Link>
                    );
                  })}
                </div>
              )}
              {href === "/gestion-procesos/admin/documentos" && isActive && <div className="ml-5 space-y-1 border-l border-border py-1 pl-3">{documentLinks.map(({ label: childLabel, href: childHref, icon: ChildIcon }) => <Link key={childHref} href={childHref} onClick={() => setMobileOpen(false)} aria-current={pathname === childHref ? "page" : undefined} className={`flex items-center gap-2 rounded-md px-2 py-2 text-xs font-medium ${pathname === childHref ? "bg-primary/10 text-primary" : "text-(--foreground-secondary) hover:bg-surface-hover"}`}><ChildIcon className="size-3.5" />{childLabel}</Link>)}</div>}
              {href === "/gestion-procesos/admin/auditoria" && (pathname.startsWith("/gestion-procesos/admin/auditoria") || pathname.startsWith("/gestion-procesos/admin/actividad")) && <div className="ml-5 space-y-1 border-l border-border py-1 pl-3">{auditLinks.map(({ label: childLabel, href: childHref, icon: ChildIcon }) => <Link key={childHref} href={childHref} onClick={() => setMobileOpen(false)} aria-current={pathname === childHref ? "page" : undefined} className={`flex items-center gap-2 rounded-md px-2 py-2 text-xs font-medium ${pathname === childHref ? "bg-primary/10 text-primary" : "text-(--foreground-secondary) hover:bg-surface-hover"}`}><ChildIcon className="size-3.5" />{childLabel}</Link>)}</div>}
            </div>
          );
        })}
      </section>
    ));
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-surface px-4 md:hidden">
        <button
          type="button"
          aria-label="Abrir navegación administrativa"
          onClick={() => setMobileOpen(true)}
          className="grid size-10 place-items-center rounded-lg hover:bg-surface-hover"
        >
          <Menu className="size-5" />
        </button>
        <Link
          href="/gestion-procesos/admin"
          className="flex items-center gap-2"
        >
          <Image
            src="/AM_logo_Full_Black.svg"
            alt="AM Abogada"
            width={120}
            height={32}
            className="h-7 w-auto"
          />
          <span className="text-sm font-semibold">Panel Administrativo</span>
        </Link>
        <span className="size-10" />
      </header>
      {mobileOpen && (
        <button
          aria-label="Cerrar navegación"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-70 flex-col border-r border-border bg-surface transition-transform md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-16 items-center justify-between border-b border-border px-5">
          <Link
            href="/gestion-procesos/admin"
            className="flex items-center gap-3"
          >
            <Image
              src="/AM_logo_Full_Black.svg"
              alt="AM Abogada"
              width={145}
              height={38}
              className="h-8 w-auto"
            />
            <span className="rounded bg-primary px-2 py-1 text-[10px] font-bold uppercase text-white">
              ADMIN
            </span>
          </Link>
          <button
            type="button"
            aria-label="Cerrar navegación"
            onClick={() => setMobileOpen(false)}
            className="grid size-9 place-items-center rounded-lg hover:bg-surface-hover md:hidden"
          >
            <X className="size-4" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4">{renderNav()}</nav>
        <div className="border-t border-border p-3">
          <div className="mb-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-(--foreground-muted)">
              Ámbito actual
            </p>
            <p className="mt-0.5 text-xs font-semibold text-foreground">
              {scope}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-white">
              {user?.nombre_completo
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0])
                .join("")
                .toUpperCase() || "AD"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {user?.nombre_completo || "Administrador"}
              </p>
              <p className="truncate text-xs text-(--foreground-muted)">
                Administrador global
              </p>
            </div>
            <button
              type="button"
              onClick={logout}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className="grid size-9 place-items-center rounded-lg text-(--foreground-muted) hover:bg-surface-hover"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>
      <main className={isChatRoute ? "h-dvh overflow-hidden pt-16 md:ml-70 md:pt-0" : "min-h-screen pt-16 md:ml-70 md:pt-0"}>
        {!isChatRoute && <header className="sticky top-0 z-30 border-b border-border bg-surface/95 px-5 py-3 backdrop-blur md:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Breadcrumbs />
              <p className="mt-0.5 text-sm font-semibold text-foreground">{scope}</p>
            </div>
            <div className="flex items-center gap-2"><GlobalSearch /><AdminAlertBell token={token} /></div>
          </div>
        </header>}
        <div className={isChatRoute ? "h-[calc(100dvh-4rem)] min-h-0 md:h-dvh" : "p-5 md:p-8"}>{children}</div>
      </main>
      {!isChatRoute && <ChatFloatingButton />}
    </div>
  );
}
