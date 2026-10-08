"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const labels: Record<string, string> = {
  "gestion-procesos": "Gestión de procesos",
  dashboard: "Panel",
  admin: "Administración",
  abogado: "Mi trabajo",
  cliente: "Portal del cliente",
  procesos: "Procesos",
  radicados: "Radicados",
  tareas: "Tareas",
  documentos: "Documentos",
  contratos: "Contratos",
  clientes: "Clientes",
  agenda: "Agenda",
  notificaciones: "Notificaciones",
  auditoria: "Auditoría",
  operacion: "Operación",
  contenido: "Contenido público",
  usuarios: "Usuarios",
  solicitudes: "Solicitudes",
  "solicitudes-perfil": "Solicitudes de perfil",
  planes: "Planes",
  saas: "SaaS individual",
  global: "Visión global",
  cuenta: "Mi cuenta",
  perfil: "Mi perfil",
  configuracion: "Configuración",
  auth: "Acceso",
};

function labelFor(segment: string) {
  if (/^\d+$/.test(segment) || /^[0-9a-f-]{16,}$/i.test(segment)) return "Detalle";
  return labels[segment] ?? decodeURIComponent(segment).replace(/-/g, " ");
}

export default function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <nav aria-label="Ruta de navegación" className="min-w-0">
      <ol className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-foreground-muted">
        {segments.map((segment, index) => {
          const href = `/${segments.slice(0, index + 1).join("/")}`;
          const current = index === segments.length - 1;
          const label = labelFor(segment);
          return (
            <li key={href} className="flex min-w-0 items-center gap-1.5">
              {index > 0 && <span aria-hidden="true">/</span>}
              {current ? (
                <span aria-current="page" className="truncate font-medium text-foreground">{label}</span>
              ) : (
                <Link href={href} className="truncate transition-colors hover:text-foreground">{label}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
