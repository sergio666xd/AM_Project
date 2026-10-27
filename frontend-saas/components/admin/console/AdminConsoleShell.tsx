"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  FileSignature,
  Inbox,
  Scale,
  Bell,
  BookOpenText,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Eraser,
  FileText,
  FolderOpen,
  HardDrive,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings,
  ServerCog,
  Sun,
  UserCheck,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { MobileTabBar, OPEN_MOBILE_NAV_EVENT, type MobileTab } from "@/components/layout/MobileTabBar";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import { AdminAlertBell } from "@/components/admin/console/AdminAlertBell";
import GlobalSearch from "@/components/layout/GlobalSearch";
import ChatFloatingButton from "@/components/chat/ChatFloatingButton";
import ChatPresenceHeartbeat from "@/components/chat/ChatPresenceHeartbeat";
import PushNotificationPrompt from "@/components/chat/PushNotificationPrompt";
import { useSyncExternalStore } from "react";

/* ─── Theme helpers ─── */
function subscribeToTheme(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("themechange", onChange);
  return () => { window.removeEventListener("storage", onChange); window.removeEventListener("themechange", onChange); };
}
function getThemeSnapshot() { return localStorage.getItem("theme") === "dark"; }
function getServerThemeSnapshot() { return false; }

/* ─── Navigation structure ─── */
type NavItem = { label: string; href: string; icon: typeof LayoutDashboard };
type NavSection = { title: string; items: NavItem[]; defaultOpen?: boolean };

const operationsChildren: NavItem[] = [
  { label: "Resumen", href: "/gestion-procesos/admin/operacion", icon: Activity },
  { label: "Consultas judiciales", href: "/gestion-procesos/admin/operacion/consultas", icon: CalendarDays },
  { label: "Integraciones", href: "/gestion-procesos/admin/operacion/integraciones", icon: ServerCog },
  { label: "Notificaciones", href: "/gestion-procesos/admin/operacion/notificaciones", icon: Bell },
  { label: "Mensajes del sistema", href: "/gestion-procesos/admin/operacion/mensajes", icon: FileText },
];
const sections: NavSection[] = [
  {
    title: "Inicio",
    defaultOpen: true,
    items: [
      { label: "Resumen", href: "/gestion-procesos/admin", icon: LayoutDashboard },
      { label: "Alertas", href: "/gestion-procesos/admin/alertas", icon: Bell },
      { label: "Notificaciones", href: "/gestion-procesos/admin/notificaciones", icon: Inbox },
    ],
  },
  {
    title: "Expedientes",
    defaultOpen: true,
    items: [
      { label: "Procesos", href: "/gestion-procesos/admin/procesos", icon: FolderOpen },
      { label: "Radicados", href: "/gestion-procesos/admin/radicados", icon: Scale },
      { label: "Tareas", href: "/gestion-procesos/admin/tareas", icon: ListChecks },
      { label: "Agenda", href: "/gestion-procesos/admin/agenda", icon: CalendarDays },
      { label: "Documentos", href: "/gestion-procesos/admin/documentos", icon: BookOpenText },
      { label: "Contratos", href: "/gestion-procesos/admin/contratos", icon: FileSignature },
    ],
  },
  {
    title: "Personas",
    defaultOpen: true,
    items: [
      { label: "Usuarios", href: "/gestion-procesos/admin/usuarios", icon: Users },
      { label: "Solicitudes de perfil", href: "/gestion-procesos/admin/solicitudes-perfil", icon: UserRound },
      { label: "Chat del equipo", href: "/gestion-procesos/admin/chat", icon: MessageCircle },
    ],
  },
  {
    title: "Supervisión",
    items: [
      { label: "Métricas", href: "/gestion-procesos/admin/metricas", icon: BarChart3 },
      { label: "Actividad", href: "/gestion-procesos/admin/actividad", icon: Activity },
      { label: "Auditoría técnica", href: "/gestion-procesos/admin/auditoria", icon: ScrollText },
    ],
  },
  {
    title: "Sistema",
    items: [
      { label: "Operación", href: "/gestion-procesos/admin/operacion", icon: ServerCog },
      { label: "Datos de la firma", href: "/gestion-procesos/admin/firma", icon: Settings },
      { label: "Contenido público", href: "/gestion-procesos/admin/contenido", icon: FileText },
      { label: "Almacenamiento", href: "/gestion-procesos/admin/almacenamiento", icon: HardDrive },
      { label: "Limpieza de chats", href: "/gestion-procesos/admin/chat/limpiar", icon: Eraser },
    ],
  },
  {
    title: "Heredado (solo consulta)",
    items: [
      { label: "Registros pendientes", href: "/gestion-procesos/admin/solicitudes", icon: UserCheck },
      { label: "Planes", href: "/gestion-procesos/admin/planes", icon: CreditCard },
      { label: "Procesos SaaS", href: "/gestion-procesos/admin/saas/procesos", icon: FolderOpen },
      { label: "Radicados SaaS", href: "/gestion-procesos/admin/saas/radicados", icon: Scale },
      { label: "Tareas SaaS", href: "/gestion-procesos/admin/saas/tareas", icon: ListChecks },
      { label: "Documentos SaaS", href: "/gestion-procesos/admin/saas/documentos", icon: BookOpenText },
      { label: "Radicados globales", href: "/gestion-procesos/admin/global/radicados", icon: Scale },
    ],
  },
];

const adminTabs: MobileTab[] = [
  { label: "Resumen", href: "/gestion-procesos/admin", icon: LayoutDashboard },
  { label: "Procesos", href: "/gestion-procesos/admin/procesos", icon: FolderOpen },
  { label: "Tareas", href: "/gestion-procesos/admin/tareas", icon: ListChecks },
  { label: "Usuarios", href: "/gestion-procesos/admin/usuarios", icon: Users },
];

function normalizePath(path: string): string {
  if (!path) return "/";
  const withoutTrailing = path.replace(/\/+$/, "");
  return withoutTrailing || "/";
}

function isActive(pathname: string, href: string): boolean {
  const current = normalizePath(pathname);
  const target = normalizePath(href);

  if (target === "/gestion-procesos/admin") {
    return current === "/gestion-procesos/admin";
  }

  if (target === "/operacion" || target === "/gestion-procesos/admin/operacion") {
    return (
      current === "/operacion" ||
      current.startsWith("/operacion/") ||
      current === "/gestion-procesos/admin/operacion" ||
      current.startsWith("/gestion-procesos/admin/operacion/")
    );
  }

  if (current === target) return true;
  if (target === "/gestion-procesos/admin/chat" && current.startsWith("/gestion-procesos/admin/chat/limpiar")) return false;
  return current.startsWith(`${target}/`);
}

function hasChildActive(items: NavItem[], pathname: string) {
  return items.some((item) => isActive(pathname, item.href));
}

/* ─── Collapsible section ─── */
function NavSection({ section, pathname, onNavigate }: { section: NavSection; pathname: string; onNavigate: () => void }) {
  const childActive = hasChildActive(section.items, pathname);
  // La sección con la página activa siempre se muestra abierta.
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const open = childActive || (manualOpen ?? Boolean(section.defaultOpen));
  const setOpen = (update: (previous: boolean) => boolean) => setManualOpen(update(open));

  return (
    <section aria-label={section.title}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex min-h-9 w-full items-center gap-1 px-3 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40 hover:text-white/70"
      >
        <ChevronRight className={`size-3 transition-transform ${open ? "rotate-90" : ""}`} />
        {section.title}
      </button>
      {open && (
        <div className="space-y-0.5">
          {section.items.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            const isCMS = item.href === "/gestion-procesos/admin/contenido";

            return (
              <div key={`${section.title}-${item.href}`}>
                <Link
                  href={item.href}
                  prefetch={!isCMS}
                  onClick={(event) => {
                    onNavigate();
                    if (isCMS) { event.preventDefault(); window.location.assign(item.href); }
                  }}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex min-h-10 items-center gap-3 rounded-[var(--radius-md)] px-3 text-sm font-medium transition-colors ${
                    active
                      ? "bg-white/[0.12] font-semibold text-white"
                      : "text-white/70 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  {active && (
                    <span
                      className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-gold-400"
                      aria-hidden="true"
                    />
                  )}
                  <Icon
                    className={`size-[18px] shrink-0 transition-colors ${active ? "text-gold-400" : "text-white/60 group-hover:text-white"}`}
                    aria-hidden="true"
                  />
                  <span className="truncate">{item.label}</span>
                </Link>

                {/* Sub-navigation for Operations */}
                {item.href === "/gestion-procesos/admin/operacion" && (pathname.startsWith("/gestion-procesos/admin/operacion") || pathname.startsWith("/operacion")) && (
                  <div className="ml-5 space-y-0.5 border-l border-white/15 py-1 pl-3">
                    {operationsChildren.map(({ label, href: childHref, icon: ChildIcon }) => {
                      const childActive2 = normalizePath(pathname) === normalizePath(childHref);
                      return (
                        <Link key={childHref} href={childHref} onClick={onNavigate}
                          aria-current={childActive2 ? "page" : undefined}
                          className={`group flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] px-2.5 text-[13px] font-medium transition-colors ${
                            childActive2
                              ? "bg-white/[0.12] font-semibold text-white"
                              : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                          }`}
                        >
                          <ChildIcon className={`size-3.5 shrink-0 ${childActive2 ? "text-gold-400" : "text-white/50 group-hover:text-white"}`} />
                          <span className="truncate">{label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ─── Main shell ─── */
export default function AdminConsoleShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, logout, token } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const darkMode = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
  const isChatRoute = pathname.split("/").includes("chat") && pathname !== "/gestion-procesos/admin/chat/limpiar";

  const logoSrc = darkMode ? "/AM_logo_Full_White.svg" : "/AM_logo_Full_Black.svg";

  useEffect(() => { document.documentElement.classList.toggle("dark", darkMode); }, [darkMode]);

  useEffect(() => {
    const open = () => setMobileOpen(true);
    window.addEventListener(OPEN_MOBILE_NAV_EVENT, open);
    return () => window.removeEventListener(OPEN_MOBILE_NAV_EVENT, open);
  }, []);

  // Close user menu on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) setUserMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggleTheme() {
    localStorage.setItem("theme", darkMode ? "light" : "dark");
    window.dispatchEvent(new Event("themechange"));
  }

  const userInitials = user?.nombre_completo
    ?.split(/\s+/)
    .slice(0, 2)
    .map((part: string) => part[0])
    .join("")
    .toUpperCase() || "AD";

  const sidebarWidth = collapsed ? "w-[var(--sidebar-collapsed-width)]" : "w-[var(--sidebar-width)]";
  const mainMargin = collapsed ? "md:ml-[var(--sidebar-collapsed-width)]" : "md:ml-[var(--sidebar-width)]";

  function renderSidebarContent() {
    return (
      <>
        {/* Brand header */}
        <div className="flex h-[var(--header-height)] items-center justify-between px-4">
          <Link href="/gestion-procesos/admin" className="flex items-center gap-2 min-w-0">
            <Image src="/AM_logo_Full_White.svg" alt="Alejandra Muñoz | Administración" width={36} height={36} className="size-9 shrink-0" />
            {!collapsed && (
              <span className="min-w-0 leading-tight"><span className="block truncate font-display text-[17px] text-white">Alejandra Muñoz</span><span className="block truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-gold-400">Administración</span></span>
            )}
          </Link>
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setMobileOpen(false)}
            className="grid size-11 place-items-center rounded-[var(--radius-md)] text-white/70 hover:bg-white/10 md:hidden"
          >
            <X className="size-5" />
          </button>
          <button
            type="button"
            aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
            onClick={() => setCollapsed((prev) => !prev)}
            className="hidden size-9 place-items-center rounded-[var(--radius-sm)] text-white/60 hover:bg-white/10 hover:text-white md:grid"
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>

        {/* Navigation */}
        {collapsed ? (
          <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-1" aria-label="Navegación compacta">
            {sections.flatMap((s) => s.items).map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex size-10 mx-auto items-center justify-center rounded-[var(--radius-md)] transition-all ${
                    active
                      ? "bg-white/[0.12] text-white"
                      : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  {active && (
                    <span
                      className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-gold-400"
                      aria-hidden="true"
                    />
                  )}
                  <Icon className={`size-[18px] ${active ? "text-gold-400" : ""}`} />
                </Link>
              );
            })}
          </nav>
        ) : (
          <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Navegación administrativa">
            {sections.map((section) => (
              <NavSection key={section.title} section={section} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            ))}
          </nav>
        )}

        {/* User section */}
        <div ref={userMenuRef} className="relative border-t border-white/10 p-3">
          <button
            type="button"
            onClick={() => setUserMenuOpen((prev) => !prev)}
            className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-2 py-2 text-left transition-colors hover:bg-white/[0.06]"
          >
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-bold text-white">
              {userInitials}
            </div>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{user?.nombre_completo || "Administrador"}</p>
                  <p className="truncate text-xs text-white/55">Administrador</p>
                </div>
                <ChevronDown className={`size-3.5 shrink-0 text-white/50 transition-transform ${userMenuOpen ? "rotate-180" : ""}`} />
              </>
            )}
          </button>

          {userMenuOpen && (
            <div className="absolute bottom-full left-3 right-3 mb-2 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface text-foreground shadow-lg">
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-semibold text-foreground">{user?.nombre_completo || "Administrador"}</p>
                {user?.email && <p className="mt-0.5 truncate text-xs text-foreground-muted">{user.email}</p>}
              </div>
              <div className="p-1">
                <Link href="/gestion-procesos/admin/cuenta" onClick={() => setUserMenuOpen(false)}
                  className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm text-foreground-secondary hover:bg-surface-hover">
                  <UserRound className="size-4" />Mi cuenta
                </Link>
                <button type="button" onClick={toggleTheme}
                  className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm text-foreground-secondary hover:bg-surface-hover">
                  {darkMode ? <Moon className="size-4" /> : <Sun className="size-4" />}
                  {darkMode ? "Tema oscuro" : "Tema claro"}
                </button>
              </div>
              <div className="border-t border-border p-1">
                <button type="button" onClick={logout}
                  className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm text-danger hover:bg-danger-light">
                  <LogOut className="size-4" />Cerrar sesión
                </button>
              </div>
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <div className={`${isChatRoute ? "h-dvh overflow-hidden" : "min-h-screen"} bg-background text-foreground`}>
      <ChatPresenceHeartbeat />
      <PushNotificationPrompt />

      {/* Mobile header bar */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-[var(--header-height)] items-center justify-between border-b border-border bg-surface px-4 md:hidden">
        <button type="button" aria-label="Abrir navegación" onClick={() => setMobileOpen(true)}
          className="grid size-9 place-items-center rounded-[var(--radius-md)] text-foreground-secondary hover:bg-surface-hover">
          <Menu className="size-5" />
        </button>
        <Link href="/gestion-procesos/admin" className="flex items-center gap-2">
          <Image src={logoSrc} alt="AM Abogada" width={110} height={28} className="h-6 w-auto" />
          <span className="text-sm font-semibold text-foreground">Admin</span>
        </Link>
        <div className="flex items-center gap-1">
          <AdminAlertBell token={token} />
        </div>
      </header>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <button aria-label="Cerrar navegación" onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-brand-950/40 backdrop-blur-[2px] md:hidden" />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex ${sidebarWidth} flex-col bg-nav text-white transition-all duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {renderSidebarContent()}
      </aside>

      {/* Main content */}
      <main className={`${isChatRoute ? "h-dvh overflow-hidden" : "min-h-screen"} pt-[var(--header-height)] ${mainMargin} md:pt-0 transition-[margin] duration-200`}>
        {!isChatRoute && (
          <header className="sticky top-0 z-30 hidden border-b border-border bg-surface/95 px-5 py-3 backdrop-blur md:block md:px-8">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <Breadcrumbs />
              </div>
              <div className="hidden items-center gap-2 md:flex">
                <GlobalSearch />
                <AdminAlertBell token={token} />
              </div>
            </div>
          </header>
        )}
        <div className={isChatRoute ? "h-[calc(100dvh-var(--header-height))] min-h-0 md:h-dvh" : "p-4 pb-24 sm:p-6 sm:pb-24 md:p-8"}>
          {children}
        </div>
      </main>

      {!isChatRoute && <ChatFloatingButton />}
      {!isChatRoute && <MobileTabBar tabs={adminTabs} homeHref="/gestion-procesos/admin" />}
    </div>
  );
}
