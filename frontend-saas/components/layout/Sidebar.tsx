"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
} from "lucide-react";

function getIsActive(
  pathname: string,
  href: string,
  variant: "user" | "admin"
) {
  if (
    href === "/gestion-procesos/dashboard" ||
    href === "/gestion-procesos/admin"
  ) {
    return pathname === href;
  }

  if (variant === "admin") {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

interface SidebarProps {
  variant: "user" | "admin";
}

const userMenuItems = [
  {
    label: "Dashboard",
    href: "/gestion-procesos/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Radicados",
    href: "/gestion-procesos/dashboard/radicados",
    icon: FolderOpen,
  },
  {
    label: "Tareas",
    href: "/gestion-procesos/dashboard/tareas",
    icon: ListChecks,
  },
  {
    label: "Consultas",
    href: "/gestion-procesos/dashboard/consultas",
    icon: RefreshCw,
  },
];

const adminMenuItems = [
  {
    label: "Dashboard",
    href: "/gestion-procesos/admin",
    icon: LayoutDashboard,
  },
  {
    label: "Usuarios",
    href: "/gestion-procesos/admin/usuarios",
    icon: Users,
  },
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
];

export default function Sidebar({ variant }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
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

  const menuItems =
    variant === "admin" ? adminMenuItems : userMenuItems;

  // Logo según el tema actual
  const logoSrc = darkMode
    ? "/AM_logo_Full_White.svg"
    : "/AM_logo_Full_Black.svg";

  // Cargar tema actual
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");

    if (savedTheme === "dark") {
      setDarkMode(true);
      document.documentElement.classList.add("dark");
    } else {
      setDarkMode(false);
      document.documentElement.classList.remove("dark");
    }
  }, []);

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

  // Cerrar navegación móvil al cambiar de ruta
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function toggleTheme() {
    const newDarkMode = !darkMode;

    setDarkMode(newDarkMode);

    if (newDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }

  function renderNavigation() {
    return (
      <nav className="flex-1 space-y-1 p-4">
        {menuItems.map((item) => {
          const isActive = getIsActive(
            pathname,
            item.href,
            variant
          );

          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 font-medium transition-colors ${
                isActive
                  ? "bg-gray-100 !text-white hover:bg-gray-50 hover:!text-white dark:bg-slate-700 dark:hover:bg-slate-700 dark:!text-white dark:hover:!text-white"
                  : "text-gray-600 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-300"
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
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
              {user?.rol === "ADMIN"
                ? "Administrador"
                : "Abogado"}
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
                {user?.rol === "ADMIN"
                  ? "Administrador"
                  : "Abogado"}
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
                  router.push("/perfil");
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
                  router.push("/configuracion");
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
          className="flex h-10 w-10 items-center justify-center rounded-lg text-foreground-secondary transition-colors hover:bg-surface-hover"
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </button>

        <Link
          href={variant === "admin" ? "/gestion-procesos/admin" : "/gestion-procesos/dashboard"}
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
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-[var(--sidebar-width)] flex-col border-r border-border bg-surface transition-transform duration-200 ${
          mobileOpen
            ? "translate-x-0"
            : "-translate-x-full md:translate-x-0"
        }`}
      >
        {/* Marca */}
        <div className="flex h-[var(--header-height)] items-center justify-between border-b border-border px-6">
          <Link
            href={variant === "admin" ? "/gestion-procesos/admin" : "/gestion-procesos/dashboard"}
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
            {variant === "admin"
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
            {variant === "admin"
              ? "Panel administrativo"
              : "Gestión de procesos judiciales"}
          </div>
        </div>
      </aside>
    </>
  );
}
