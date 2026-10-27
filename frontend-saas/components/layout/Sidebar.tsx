"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { usePortalPathname } from "@/lib/usePortalPathname";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSession } from "@/context/SessionContext";

import { MobileTabBar, OPEN_MOBILE_NAV_EVENT, type MobileTab } from "./MobileTabBar";
import {
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  FileText,
  FolderOpen,
  HelpCircle,
  Home,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MessageCircle,
  Moon,
  RefreshCw,
  Scale,
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
      title: "",
      items: [
        { label: "Hoy", href: "/gestion-procesos/abogado", icon: Home },
        { label: "Mensajes", href: "/gestion-procesos/abogado/chat", icon: MessageCircle },
        { label: "Notificaciones", href: "/gestion-procesos/abogado/notificaciones", icon: Bell },
      ],
    },
    {
      title: "Trabajo",
      items: [
        { label: "Procesos", href: "/gestion-procesos/abogado/procesos", icon: FolderOpen },
        { label: "Tareas", href: "/gestion-procesos/abogado/tareas", icon: ListChecks },
        { label: "Agenda", href: "/gestion-procesos/abogado/agenda", icon: CalendarDays },
        { label: "Radicados", href: "/gestion-procesos/abogado/radicados", icon: Scale },
      ],
    },
    {
      title: "Firma",
      items: [
        { label: "Clientes", href: "/gestion-procesos/abogado/clientes", icon: Users },
        { label: "Documentos", href: "/gestion-procesos/abogado/documentos", icon: FileText },
        ...(isFirmAdmin ? [{ label: "Contratos", href: "/gestion-procesos/abogado/contratos", icon: ScrollText }] : []),
        { label: "Cambios de perfil", href: "/gestion-procesos/abogado/solicitudes-perfil", icon: UserCheck },
        ...(isFirmAdmin ? [{ label: "Métricas", href: "/gestion-procesos/abogado/metricas", icon: BarChart3 }] : []),
      ],
    },
  ];
}

// Perfil y configuración viven en el menú de cuenta (pie de la barra lateral).
const clientSections: MenuSection[] = [
  {
    title: "",
    items: [
      { label: "Inicio", href: "/gestion-procesos/cliente", icon: Home },
      { label: "Mis procesos", href: "/gestion-procesos/cliente/procesos", icon: FolderOpen },
      { label: "Documentos", href: "/gestion-procesos/cliente/documentos", icon: FileText },
      { label: "Tareas", href: "/gestion-procesos/cliente/tareas", icon: ListChecks },
      { label: "Calendario", href: "/gestion-procesos/cliente/calendario", icon: CalendarDays },
    ],
  },
  {
    title: "Comunicación",
    items: [
      { label: "Mensajes", href: "/gestion-procesos/cliente/chat", icon: MessageCircle },
      { label: "Notificaciones", href: "/gestion-procesos/cliente/notificaciones", icon: Bell },
      { label: "Ayuda", href: "/gestion-procesos/cliente/ayuda", icon: HelpCircle },
    ],
  },
];

const lawyerTabs: MobileTab[] = [
  { label: "Hoy", href: "/gestion-procesos/abogado", icon: Home },
  { label: "Procesos", href: "/gestion-procesos/abogado/procesos", icon: FolderOpen },
  { label: "Agenda", href: "/gestion-procesos/abogado/agenda", icon: CalendarDays },
  { label: "Mensajes", href: "/gestion-procesos/abogado/chat", icon: MessageCircle },
];

const clientTabs: MobileTab[] = [
  { label: "Inicio", href: "/gestion-procesos/cliente", icon: Home },
  { label: "Procesos", href: "/gestion-procesos/cliente/procesos", icon: FolderOpen },
  { label: "Documentos", href: "/gestion-procesos/cliente/documentos", icon: FileText },
  { label: "Mensajes", href: "/gestion-procesos/cliente/chat", icon: MessageCircle },
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
  const pathname = usePortalPathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const darkMode = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
  const { user, logout } = useSession();

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
        className={`group relative flex min-h-10 w-full items-center gap-3 rounded-[var(--radius-md)] px-3 text-sm font-medium transition-colors ${
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
        className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-[var(--sidebar-width)] flex-col bg-nav text-white transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {/* Brand */}
        <div className="flex h-[var(--header-height)] items-center justify-between px-5">
          <Link href={homeHref} className="flex min-w-0 items-center gap-2.5">
            <Image src="/AM_logo_Full_White.svg" alt="" width={36} height={36} className="size-9 shrink-0" />
            <span className="min-w-0 leading-tight"><span className="block truncate font-display text-[17px] text-white">Alejandra Muñoz</span><span className="block truncate text-[10px] uppercase tracking-[0.14em] text-white/55">Abogada y Asociados</span></span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="grid size-11 place-items-center rounded-[var(--radius-md)] text-white/70 hover:bg-white/10 hover:text-white md:hidden"
            aria-label="Cerrar menú"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav aria-label="Navegación principal" className="flex-1 overflow-y-auto px-3 pb-4">
          {menuSections.map((section) => (
            <section key={section.title || "inicio"} aria-label={section.title || "Inicio"} className="space-y-0.5 pt-2">
              {section.title && (
                <h2 className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
                  {section.title}
                </h2>
              )}
              {section.items.map(renderNavItem)}
            </section>
          ))}
        </nav>

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
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{user?.nombre_completo || "Cargando..."}</p>
              <p className="truncate text-xs text-white/55">{roleLabel}</p>
            </div>
            <ChevronDown className={`size-3.5 shrink-0 text-white/50 transition-transform ${userMenuOpen ? "rotate-180" : ""}`} />
          </button>

          {userMenuOpen && (
            <div className="absolute bottom-full left-3 right-3 mb-2 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface text-foreground shadow-lg">
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
