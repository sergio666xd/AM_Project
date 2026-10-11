"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSession } from "@/context/SessionContext";

import {
  LayoutDashboard,
  Users,
  UserCheck,
  CreditCard,
  FolderOpen,
  RefreshCw,
  User,
  Settings,
  Sun,
  Moon,
  LogOut,
  ChevronUp,
  Menu,
  X,
  ListChecks,
  FileText,
  Bell,
  ScrollText,
  CalendarDays,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";

function getIsActive(
  pathname: string,
  href: string,
  variant: "saas" | "platform-admin" | "lawyer" | "client"
) {
  if (
    href === "/gestion-procesos/dashboard" ||
    href === "/gestion-procesos/admin" ||
    href === "/gestion-procesos/abogado" ||
    href === "/gestion-procesos/cliente"
  ) {
    return pathname === href;
  }

  if (variant === "platform-admin") {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

interface SidebarProps {
  variant: "saas" | "platform-admin" | "lawyer" | "client";
}

function subscribeToTheme(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("themechange", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("themechange", onChange);
  };
}

function getThemeSnapshot() {
  return localStorage.getItem("theme") === "dark";
}

function getServerThemeSnapshot() {
  return false;
}

type MenuItem = { label: string; href: string; icon: LucideIcon };

const platformAdminSections: { label: string; items: MenuItem[] }[] = [
  {
    label: "Control global",
    items: [
      { label: "Resumen", href: "/gestion-procesos/admin", icon: LayoutDashboard },
      { label: "Usuarios · firma y SaaS", href: "/gestion-procesos/admin/usuarios", icon: Users },
      { label: "Auditoría", href: "/gestion-procesos/admin/auditoria", icon: ScrollText },
      { label: "Operación", href: "/gestion-procesos/admin/operacion", icon: Settings },
      { label: "Chat del equipo", href: "/gestion-procesos/abogado/chat", icon: MessageCircle },
    ],
  },
  {
    label: "Firma",
    items: [
      { label: "Procesos", href: "/gestion-procesos/admin/procesos", icon: FolderOpen },
      { label: "Radicados", href: "/gestion-procesos/admin/radicados", icon: RefreshCw },
      { label: "Tareas", href: "/gestion-procesos/admin/tareas", icon: ListChecks },
      { label: "Documentos", href: "/gestion-procesos/admin/documentos", icon: FileText },
    ],
  },
  {
    label: "SaaS individual",
    items: [
      { label: "Solicitudes", href: "/gestion-procesos/admin/solicitudes", icon: UserCheck },
      { label: "Planes", href: "/gestion-procesos/admin/planes", icon: CreditCard },
      { label: "Procesos", href: "/gestion-procesos/admin/saas/procesos", icon: FolderOpen },
      { label: "Radicados", href: "/gestion-procesos/admin/saas/radicados", icon: RefreshCw },
      { label: "Tareas", href: "/gestion-procesos/admin/saas/tareas", icon: ListChecks },
      { label: "Documentos", href: "/gestion-procesos/admin/saas/documentos", icon: FileText },
    ],
  },
  {
    label: "Contenido público",
    items: [
      { label: "Páginas del sitio", href: "/gestion-procesos/admin/contenido", icon: FileText },
    ],
  },
];

const lawyerMenuItems = (isSaas: boolean, isFirmAdmin: boolean) => [
  { label: "Resumen", href: "/gestion-procesos/abogado", icon: LayoutDashboard },
  { label: "Procesos", href: "/gestion-procesos/abogado/procesos", icon: FolderOpen },
  { label: "Solicitudes de clientes", href: "/gestion-procesos/abogado/solicitudes-perfil", icon: UserCheck },
  { label: "Radicados", href: isSaas ? "/gestion-procesos/dashboard/radicados" : "/gestion-procesos/abogado/radicados", icon: RefreshCw },
  { label: "Clientes", href: "/gestion-procesos/abogado/clientes", icon: Users },
  { label: "Tareas", href: isSaas ? "/gestion-procesos/dashboard/tareas" : "/gestion-procesos/abogado/tareas", icon: ListChecks },
  { label: "Agenda", href: "/gestion-procesos/abogado/agenda", icon: CalendarDays },
  { label: "Chat", href: "/gestion-procesos/abogado/chat", icon: MessageCircle },
  { label: "Documentos", href: "/gestion-procesos/abogado/documentos", icon: FileText },
  ...(isFirmAdmin ? [{ label: "Contratos y Documentos Legales", href: "/gestion-procesos/abogado/contratos", icon: FileText }] : []),
  { label: "Notificaciones", href: "/gestion-procesos/abogado/notificaciones", icon: Bell },
  ...(isFirmAdmin ? [{ label: "Métricas y carga", href: "/gestion-procesos/abogado/metricas", icon: LayoutDashboard }] : []),
];

const saasMenuItems: MenuItem[] = [
  { label: "Resumen", href: "/gestion-procesos/dashboard", icon: LayoutDashboard },
  { label: "Radicados", href: "/gestion-procesos/dashboard/radicados", icon: RefreshCw },
  { label: "Tareas", href: "/gestion-procesos/dashboard/tareas", icon: ListChecks },
];

  const clientMenuItems: MenuItem[] = [
    { label: "Inicio", href: "/gestion-procesos/cliente", icon: LayoutDashboard },
    { label: "Mis procesos", href: "/gestion-procesos/cliente/procesos", icon: FolderOpen },
    { label: "Mis tareas", href: "/gestion-procesos/cliente/tareas", icon: ListChecks },
    { label: "Documentos y solicitudes", href: "/gestion-procesos/cliente/documentos", icon: FileText },
    { label: "Calendario", href: "/gestion-procesos/cliente/calendario", icon: CalendarDays },
    { label: "Notificaciones", href: "/gestion-procesos/cliente/notificaciones", icon: Bell },
    { label: "Chat", href: "/gestion-procesos/cliente/chat", icon: MessageCircle },
    { label: "Ayuda", href: "/gestion-procesos/cliente/ayuda", icon: ScrollText },
    { label: "Mi perfil", href: "/gestion-procesos/cliente/perfil", icon: User },
    { label: "Configuración", href: "/gestion-procesos/cliente/configuracion", icon: Settings },
  ];

export default function Sidebar({ variant }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const darkMode = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
  const { user, logout } = useSession();

  const userInitials =
    user?.nombre_completo
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((word: string) => word[0])
      .join("")
      .toUpperCase() || "U";

  const menuRef = useRef<HTMLDivElement>(null);

  const menuItems: MenuItem[] = variant === "client" ? clientMenuItems : user?.rol === "ABOGADO" ? saasMenuItems : lawyerMenuItems(false, user?.rol === "ABOGADO_ADMIN");
  const homeHref = variant === "platform-admin" ? "/gestion-procesos/admin" : user?.rol === "ABOGADO" ? "/gestion-procesos/dashboard" : variant === "lawyer" || variant === "saas" ? "/gestion-procesos/abogado" : "/gestion-procesos/cliente";
  const accountBaseHref = variant === "platform-admin" ? "/gestion-procesos/admin" : variant === "lawyer" || variant === "saas" ? "/gestion-procesos/abogado" : "/gestion-procesos/cliente";
  const roleLabel = user?.rol === "ADMIN" ? "Administrador de plataforma" : user?.rol === "ABOGADO_ADMIN" ? "Abogado de la firma" : user?.rol === "ABOGADO" ? "Abogado SaaS" : "Cliente";
  const adminArea = pathname.startsWith("/gestion-procesos/admin/contenido")
    ? "Contenido público"
    : pathname.startsWith("/gestion-procesos/admin/saas")
      ? "SaaS individual"
      : pathname.startsWith("/gestion-procesos/admin/global")
        ? "Global"
    : pathname.startsWith("/gestion-procesos/admin/planes") || pathname.startsWith("/gestion-procesos/admin/solicitudes")
      ? "SaaS individual"
      : pathname.startsWith("/gestion-procesos/admin/procesos") || pathname.startsWith("/gestion-procesos/admin/radicados") || pathname.startsWith("/gestion-procesos/admin/tareas") || pathname.startsWith("/gestion-procesos/admin/documentos")
        ? "Firma"
        : pathname.startsWith("/gestion-procesos/admin/usuarios")
          ? "Usuarios: alcance global"
          : "Control global";

  // Logo según el tema actual
  const logoSrc = darkMode
    ? "/AM_logo_Full_White.svg"
    : "/AM_logo_Full_Black.svg";

  // Keep the document theme synchronized with the external preference.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  // Cerrar menú del usuario al hacer click fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  function toggleTheme() {
    const newDarkMode = !darkMode;
    localStorage.setItem("theme", newDarkMode ? "dark" : "light");
    window.dispatchEvent(new Event("themechange"));
  }

  function renderNavigation() {
    const renderItem = (item: MenuItem) => {
      const isActive = getIsActive(pathname, item.href, variant);
      const Icon = item.icon;
      return (
        <Link key={item.href} href={item.href} prefetch={item.href !== "/gestion-procesos/admin/contenido"} onClick={(event) => { setMobileOpen(false); if (item.href === "/gestion-procesos/admin/contenido") { event.preventDefault(); window.location.assign(item.href); } }} aria-current={isActive ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? "bg-primary/10 text-primary" : "text-foreground-secondary hover:bg-surface-hover"}`}>
          <Icon className="size-4 shrink-0" />{item.label}
        </Link>
      );
    };

    if (variant === "platform-admin") {
      return (
        <nav aria-label="Administración global" className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
          <div aria-live="polite" className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Ámbito actual</p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">{adminArea}</p>
          </div>
          {platformAdminSections.map((section) => (
            <section key={section.label} aria-label={section.label} className="space-y-1">
              <h2 className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">{section.label}</h2>
              {section.items.map(renderItem)}
            </section>
          ))}
        </nav>
      );
    }

    return (
      <nav aria-label="Navegación principal" className="flex-1 space-y-1 p-4">
        {menuItems.map(renderItem)}
      </nav>
    );
  }

  function renderUserSection() {
    return (
      <div
        ref={menuRef}
        className="relative border-t border-border p-3"
      >
        {/* Botón usuario */}
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-hover"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {userInitials}
          </div>

          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">
              {user?.nombre_completo || "Cargando..."}
            </div>

            <div className="truncate text-xs text-foreground-muted">
              {roleLabel}
            </div>
          </div>

          <ChevronUp
            className={`h-4 w-4 shrink-0 text-foreground-muted transition-transform ${
              menuOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {/* Menú desplegable */}
        {menuOpen && (
          <div className="absolute bottom-full left-3 right-3 mb-2 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-semibold text-foreground">
                {user?.nombre_completo || "Cargando..."}
              </p>

              <p className="text-xs text-foreground-muted">
                {roleLabel}
              </p>

              {user?.email && (
                <p className="mt-1 truncate text-xs text-foreground-muted">
                  {user.email}
                </p>
              )}
            </div>

            <div className="p-1">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  router.push(`${accountBaseHref}/perfil`);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground-secondary transition-colors hover:bg-surface-hover"
              >
                <User className="h-4 w-4" />
                Mi perfil
              </button>

              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  router.push(`${accountBaseHref}/configuracion`);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground-secondary transition-colors hover:bg-surface-hover"
              >
                <Settings className="h-4 w-4" />
                Configuración
              </button>
            </div>

            <div className="border-t border-border p-1">
              <button
                type="button"
                onClick={toggleTheme}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground-secondary transition-colors hover:bg-surface-hover"
              >
                {darkMode ? (
                  <Moon className="h-4 w-4" />
                ) : (
                  <Sun className="h-4 w-4" />
                )}

                {darkMode ? "Tema oscuro" : "Tema claro"}
              </button>
            </div>

            <div className="border-t border-border p-1">
              <button
                type="button"
                onClick={logout}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-danger transition-colors hover:bg-danger-light"
              >
                <LogOut className="h-4 w-4" />
                Cerrar sesión
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Barra móvil */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-[var(--header-height)] items-center border-b border-border bg-surface px-4 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-expanded={mobileOpen}
          aria-controls="app-navigation"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-foreground-secondary transition-colors hover:bg-surface-hover"
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </button>

        <Link
          href={homeHref}
          className="ml-3 flex items-center gap-2"
        >
          <Image
            src={logoSrc}
            alt="AM"
            width={180}
            height={40}
            className="h-8 w-auto object-contain"
          />

          <span className="text-sm font-medium text-foreground">
            Gestión de Procesos
          </span>
        </Link>
      </div>

      {/* Fondo móvil */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        id="app-navigation"
        aria-label={variant === "platform-admin" ? "Navegación administrativa" : "Navegación principal"}
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-[var(--sidebar-width)] flex-col border-r border-border bg-surface transition-transform duration-200 ${
          mobileOpen
            ? "translate-x-0"
            : "-translate-x-full md:translate-x-0"
        }`}
      >
        {/* Marca */}
        <div className="flex h-[var(--header-height)] items-center justify-between border-b border-border px-6">
          <Link
            href={homeHref}
            className="flex items-center gap-2"
          >
            <Image
              src={logoSrc}
              alt="AM"
              width={180}
              height={40}
              className="h-9 w-auto object-contain"
            />

            <span className="text-sm font-medium text-foreground">
              Gestión de Procesos
            </span>
          </Link>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground-muted hover:bg-surface-hover md:hidden"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Área */}
        <div className="px-4 pt-5">
          <div className="px-2 text-xs font-semibold uppercase tracking-wider text-foreground-muted">
            {variant === "platform-admin"
              ? "Administración"
              : "Mi cuenta"}
          </div>
        </div>

        {/* Navegación */}
        {renderNavigation()}

        {/* Usuario */}
        {renderUserSection()}

        {/* Pie */}
        <div className="border-t border-border p-3">
          <div className="rounded-lg px-3 py-2 text-xs text-foreground-muted">
            {variant === "platform-admin"
              ? "Panel administrativo"
              : "Gestión de procesos judiciales"}
          </div>
        </div>
      </aside>
    </>
  );
}
