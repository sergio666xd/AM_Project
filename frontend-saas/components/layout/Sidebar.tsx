"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSession } from "@/context/SessionContext";

import { MobileTabBar, OPEN_MOBILE_NAV_EVENT, type MobileTab } from "./MobileTabBar";
import {
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderOpen,
  HelpCircle,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MessageCircle,
  Moon,
  RefreshCw,
  ScrollText,
  Settings,
  Sun,
  User,
  UserCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

/* ─── Theme ─── */
function subscribeToTheme(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("themechange", onChange);
  return () => { window.removeEventListener("storage", onChange); window.removeEventListener("themechange", onChange); };
}
function getThemeSnapshot() { return localStorage.getItem("theme") === "dark"; }
function getServerThemeSnapshot() { return false; }

/* ─── Types ─── */
type MenuItem = { label: string; href: string; icon: LucideIcon };
type MenuSection = { title: string; items: MenuItem[] };

interface SidebarProps {
  variant: "saas" | "platform-admin" | "lawyer" | "client";
}

/* ─── Navigation definitions ─── */
function getLawyerSections(isFirmAdmin: boolean): MenuSection[] {
  return [
    {
      title: "Mi día",
      items: [
        { label: "Resumen", href: "/gestion-procesos/abogado", icon: LayoutDashboard },
        { label: "Agenda", href: "/gestion-procesos/abogado/agenda", icon: CalendarDays },
        { label: "Tareas", href: "/gestion-procesos/abogado/tareas", icon: ListChecks },
      ],
    },
    {
      title: "Expedientes",
      items: [
        { label: "Procesos", href: "/gestion-procesos/abogado/procesos", icon: FolderOpen },
        { label: "Radicados", href: "/gestion-procesos/abogado/radicados", icon: RefreshCw },
        { label: "Documentos", href: "/gestion-procesos/abogado/documentos", icon: FileText },
        ...(isFirmAdmin ? [{ label: "Contratos", href: "/gestion-procesos/abogado/contratos", icon: ScrollText }] : []),
      ],
    },
    {
      title: "Clientes",
      items: [
        { label: "Clientes", href: "/gestion-procesos/abogado/clientes", icon: Users },
        { label: "Solicitudes de perfil", href: "/gestion-procesos/abogado/solicitudes-perfil", icon: UserCheck },
      ],
    },
    {
      title: "Comunicación",
      items: [
        { label: "Chat", href: "/gestion-procesos/abogado/chat", icon: MessageCircle },
        { label: "Notificaciones", href: "/gestion-procesos/abogado/notificaciones", icon: Bell },
      ],
    },
    {
      title: "Cuenta",
      items: [
        ...(isFirmAdmin ? [{ label: "Métricas", href: "/gestion-procesos/abogado/metricas", icon: BarChart3 }] : []),
        { label: "Perfil", href: "/gestion-procesos/abogado/perfil", icon: User },
        { label: "Configuración", href: "/gestion-procesos/abogado/configuracion", icon: Settings },
      ],
    },
  ];
}

const clientSections: MenuSection[] = [
  {
    title: "Mi caso",
    items: [
      { label: "Inicio", href: "/gestion-procesos/cliente", icon: LayoutDashboard },
      { label: "Mis procesos", href: "/gestion-procesos/cliente/procesos", icon: FolderOpen },
      { label: "Mis tareas", href: "/gestion-procesos/cliente/tareas", icon: ListChecks },
      { label: "Documentos", href: "/gestion-procesos/cliente/documentos", icon: FileText },
      { label: "Calendario", href: "/gestion-procesos/cliente/calendario", icon: CalendarDays },
    ],
  },
  {
    title: "Comunicación",
    items: [
      { label: "Chat", href: "/gestion-procesos/cliente/chat", icon: MessageCircle },
      { label: "Notificaciones", href: "/gestion-procesos/cliente/notificaciones", icon: Bell },
    ],
  },
  {
    title: "Mi cuenta",
    items: [
      { label: "Perfil", href: "/gestion-procesos/cliente/perfil", icon: User },
      { label: "Configuración", href: "/gestion-procesos/cliente/configuracion", icon: Settings },
      { label: "Ayuda", href: "/gestion-procesos/cliente/ayuda", icon: HelpCircle },
    ],
  },
];

const lawyerTabs: MobileTab[] = [
  { label: "Inicio", href: "/gestion-procesos/abogado", icon: LayoutDashboard },
  { label: "Procesos", href: "/gestion-procesos/abogado/procesos", icon: FolderOpen },
  { label: "Tareas", href: "/gestion-procesos/abogado/tareas", icon: ListChecks },
  { label: "Agenda", href: "/gestion-procesos/abogado/agenda", icon: CalendarDays },
];

const clientTabs: MobileTab[] = [
  { label: "Inicio", href: "/gestion-procesos/cliente", icon: LayoutDashboard },
  { label: "Procesos", href: "/gestion-procesos/cliente/procesos", icon: FolderOpen },
  { label: "Tareas", href: "/gestion-procesos/cliente/tareas", icon: ListChecks },
  { label: "Chat", href: "/gestion-procesos/cliente/chat", icon: MessageCircle },
];

const saasMenuItems: MenuItem[] = [
  { label: "Resumen", href: "/gestion-procesos/dashboard", icon: LayoutDashboard },
  { label: "Radicados", href: "/gestion-procesos/dashboard/radicados", icon: RefreshCw },
  { label: "Tareas", href: "/gestion-procesos/dashboard/tareas", icon: ListChecks },
];
const saasTabs: MobileTab[] = saasMenuItems;

function normalizePath(path: string): string {
  if (!path) return "/";
  const withoutTrailing = path.replace(/\/+$/, "");
  return withoutTrailing || "/";
}

function getIsActive(pathname: string, href: string): boolean {
  const current = normalizePath(pathname);
  const target = normalizePath(href);

  // Exact match
  if (current === target) return true;

  // Root dashboards must only match exact path (or dashboard/abogado alias)
  const roots = [
    "/gestion-procesos/dashboard",
    "/gestion-procesos/abogado",
    "/gestion-procesos/cliente",
    "/gestion-procesos/admin",
  ];
  if (roots.includes(target)) {
    if (target === "/gestion-procesos/abogado" && current === "/gestion-procesos/dashboard") {
      return true;
    }
    return current === target;
  }

  // Sub-routes match if current starts with target + "/"
  return current.startsWith(`${target}/`);
}

/* ─── Component ─── */
export default function Sidebar({ variant }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const darkMode = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
  const { user, logout } = useSession();

  const logoSrc = darkMode ? "/AM_logo_Full_White.svg" : "/AM_logo_Full_Black.svg";
  const isFirmAdmin = user?.rol === "ABOGADO_ADMIN";

  const menuSections: MenuSection[] =
    variant === "client"
      ? clientSections
      : variant === "lawyer"
        ? getLawyerSections(isFirmAdmin)
        : [{ title: "Panel", items: saasMenuItems }];

  const homeHref =
    variant === "platform-admin"
      ? "/gestion-procesos/admin"
      : variant === "client"
        ? "/gestion-procesos/cliente"
        : "/gestion-procesos/abogado";

  const accountBaseHref =
    variant === "platform-admin"
      ? "/gestion-procesos/admin"
      : variant === "client"
        ? "/gestion-procesos/cliente"
        : "/gestion-procesos/abogado";

  const roleLabel =
    user?.rol === "ADMIN"
      ? "Administrador"
      : user?.rol === "ABOGADO_ADMIN"
        ? "Abogado de la firma"
        : user?.rol === "ABOGADO"
          ? "Abogado"
          : "Cliente";

  const userInitials =
    user?.nombre_completo
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((word: string) => word[0])
      .join("")
      .toUpperCase() || "U";

  const tabs = variant === "client" ? clientTabs : variant === "lawyer" ? lawyerTabs : saasTabs;
  const isChatPage = pathname.split("/").includes("chat");

  useEffect(() => { document.documentElement.classList.toggle("dark", darkMode); }, [darkMode]);

  useEffect(() => {
    const open = () => setMobileOpen(true);
    window.addEventListener(OPEN_MOBILE_NAV_EVENT, open);
    return () => window.removeEventListener(OPEN_MOBILE_NAV_EVENT, open);
  }, []);

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

  function renderNavItem(item: MenuItem) {
    const active = getIsActive(pathname, item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        aria-current={active ? "page" : undefined}
        className={`group relative flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-[13px] font-medium transition-all ${
          active
            ? "bg-brand-900 text-white font-semibold shadow-xs dark:bg-brand-800 dark:text-white dark:ring-1 dark:ring-brand-700/50"
            : "text-foreground-secondary hover:bg-surface-hover hover:text-foreground"
        }`}
      >
        {active && (
          <span
            className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-gold-400"
            aria-hidden="true"
          />
        )}
        <Icon
          className={`size-4 shrink-0 transition-colors ${
            active ? "text-gold-400 dark:text-gold-300" : "text-foreground-muted group-hover:text-foreground"
          }`}
          aria-hidden="true"
        />
        <span className="truncate">{item.label}</span>
        {active && <ChevronRight className="ml-auto size-3.5 text-gold-400/80 dark:text-gold-300/80" />}
      </Link>
    );
  }

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-brand-950/40 backdrop-blur-[2px] md:hidden"
        />
      )}

      {/* Sidebar panel */}
      <aside
        id="app-navigation"
        aria-label="Navegación principal"
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-[var(--sidebar-width)] flex-col border-r border-border bg-surface transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {/* Brand */}
        <div className="flex h-[var(--header-height)] items-center justify-between border-b border-border px-4">
          <Link href={homeHref} className="flex items-center gap-2">
            <Image src={logoSrc} alt="AM" width={130} height={34} className="h-7 w-auto" />
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="grid size-8 place-items-center rounded-[var(--radius-sm)] text-foreground-muted hover:bg-surface-hover md:hidden"
            aria-label="Cerrar menú"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav aria-label="Navegación principal" className="flex-1 overflow-y-auto px-3 pb-4">
          {menuSections.map((section) => (
            <section key={section.title} aria-label={section.title} className="space-y-0.5">
              <h2 className="px-3 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">
                {section.title}
              </h2>
              {section.items.map(renderNavItem)}
            </section>
          ))}
        </nav>

        {/* User section */}
        <div ref={userMenuRef} className="relative border-t border-border p-3">
          <button
            type="button"
            onClick={() => setUserMenuOpen((prev) => !prev)}
            className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-2 py-2 text-left transition-colors hover:bg-surface-hover"
          >
            <div className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-900 text-xs font-bold text-white">
              {userInitials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{user?.nombre_completo || "Cargando..."}</p>
              <p className="truncate text-xs text-foreground-muted">{roleLabel}</p>
            </div>
            <ChevronDown className={`size-3.5 shrink-0 text-foreground-muted transition-transform ${userMenuOpen ? "rotate-180" : ""}`} />
          </button>

          {userMenuOpen && (
            <div className="absolute bottom-full left-3 right-3 mb-2 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-md">
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-semibold text-foreground">{user?.nombre_completo || "Cargando..."}</p>
                <p className="text-xs text-foreground-muted">{roleLabel}</p>
                {user?.email && <p className="mt-0.5 truncate text-xs text-foreground-muted">{user.email}</p>}
              </div>
              <div className="p-1">
                <button type="button" onClick={() => { setUserMenuOpen(false); router.push(`${accountBaseHref}/perfil`); }}
                  className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm text-foreground-secondary hover:bg-surface-hover">
                  <User className="size-4" />Mi perfil
                </button>
                <button type="button" onClick={() => { setUserMenuOpen(false); router.push(`${accountBaseHref}/configuracion`); }}
                  className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm text-foreground-secondary hover:bg-surface-hover">
                  <Settings className="size-4" />Configuración
                </button>
              </div>
              <div className="border-t border-border p-1">
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
      </aside>

      {!isChatPage && <MobileTabBar tabs={tabs} homeHref={tabs[0].href} />}
    </>
  );
}
