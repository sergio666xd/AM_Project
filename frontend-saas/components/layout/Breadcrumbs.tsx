"use client";

import Link from "next/link";
import { usePortalPathname } from "@/lib/usePortalPathname";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-v2/cliente";
import { claveDeRuta, partesDeRuta } from "@/lib/mensajes";

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
  cobros: "Cobros",
  finanzas: "Cobros y pagos",
  pagos: "Pagos",
  clientes: "Clientes",
  agenda: "Agenda",
  notificaciones: "Avisos",
  auditoria: "Auditoría",
  operacion: "Operación",
  contenido: "Contenido",
  usuarios: "Usuarios",
  solicitudes: "Solicitudes",
  "solicitudes-perfil": "Cambios de perfil",
  cuenta: "Mi cuenta",
  perfil: "Mi perfil",
  configuracion: "Configuración",
  auth: "Acceso",
  alertas: "Alertas",
  actividad: "Actividad",
  folios: "Folios",
  almacenamiento: "Almacenamiento",
  firma: "Datos de la firma",
  metricas: "Carga de trabajo",
  calendario: "Calendario",
  ayuda: "Ayuda",
  mensajes: "Mensajes",
  entregas: "Envíos",
  plantillas: "Plantillas",
};

// Segmentos que se llaman distinto según la sección donde aparecen.
const labelsEnSeccion: Record<string, string> = {
  "operacion/consultas": "Consultas judiciales",
  "operacion/notificaciones": "Envíos de avisos",
  "operacion/integraciones": "Integraciones",
  "operacion/mensajes": "Plantillas de avisos",
  "operacion/glosario": "Glosario",
  "operacion/etapas": "Etapas de los procesos",
  "chat/limpiar": "Limpieza de chats",
  "admin/chat": "Chats",
  "admin/auditoria": "Auditoría técnica",
  "admin/sitio": "Sitio público",
  "sitio/mensajes": "Mensajes del sitio",
};

// Pestañas del expediente («/procesos/7/relaciones»).
const seccionesExpediente: Record<string, string> = {
  resumen: "Resumen",
  relaciones: "Clientes y radicados",
  comunicaciones: "Chat",
  equipo: "Equipo",
};

function labelFor(segment: string, anterior?: string, antes?: string) {
  const enSeccion = anterior ? labelsEnSeccion[`${anterior}/${segment}`] : undefined;
  if (enSeccion) return enSeccion;
  if (antes === "procesos" && anterior && /^\d+$/.test(anterior) && seccionesExpediente[segment]) return seccionesExpediente[segment];
  if (anterior === "radicados" && /^\d+$/.test(segment)) return "Radicado";
  if (/^\d+$/.test(segment) || /^[0-9a-f-]{16,}$/i.test(segment)) return "Detalle";
  return labels[segment] ?? decodeURIComponent(segment).replace(/-/g, " ");
}

export default function Breadcrumbs() {
  const pathname = usePortalPathname();
  const [chatLabel, setChatLabel] = useState<{ href: string; titulo: string; subtitulo: string } | null>(null);
  const segments = pathname.split("/").filter(Boolean);
  // «chat/limpiar» es una pantalla de configuración, no una conversación.
  const chatIndex = segments[segments.indexOf("chat") + 1] === "limpiar" ? -1 : segments.indexOf("chat");
  const claveChat = chatIndex >= 0 ? claveDeRuta(partesDeRuta(pathname)) : null;

  // Mensajes: «Área / Mensajes / Proceso / Persona».
  useEffect(() => {
    if (!claveChat) return;
    let cancelled = false;
    const currentPath = pathname.replace(/\/$/, "");
    void api.GET("/api/v2/conversaciones", { params: { query: { sincronizar: false } } }).then(({ data }) => {
      const match = data?.items.find((item) => item.clave === claveChat);
      if (!cancelled && match) setChatLabel({ href: currentPath, titulo: match.titulo, subtitulo: match.proceso?.nombre ?? "" });
    });
    return () => { cancelled = true; };
  }, [claveChat, pathname]);

  if (segments.length === 0) return null;

  if (chatIndex >= 0) {
    const currentPath = pathname.replace(/\/$/, "");
    const actual = claveChat && chatLabel?.href === currentPath ? chatLabel : null;
    const finales = claveChat ? (actual ? [actual.subtitulo, actual.titulo].filter(Boolean) : ["…"]) : [];
    const area = chatIndex > 0 ? segments[chatIndex - 1] : null;
    const rutaMensajes = `/${segments.slice(0, chatIndex + 1).join("/")}`;
    return (
      <nav aria-label="Ruta de navegación" className="min-w-0">
        <ol className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[13px] text-ink-3">
          {area && <li className="flex min-w-0 items-center gap-1.5"><Link href={`/${segments.slice(0, chatIndex).join("/")}`} className="truncate transition-colors hover:text-ink">{labelFor(area)}</Link></li>}
          <li className="flex min-w-0 items-center gap-1.5">
            {area && <span aria-hidden="true" className="text-line-strong">/</span>}
            {finales.length ? <Link href={rutaMensajes} className="truncate transition-colors hover:text-ink">Mensajes</Link> : <span aria-current="page" className="truncate font-semibold text-ink">Mensajes</span>}
          </li>
          {finales.map((label, index) => (
            <li key={`${label}-${index}`} className="flex min-w-0 items-center gap-1.5">
              <span aria-hidden="true" className="text-line-strong">/</span>
              <span aria-current={index === finales.length - 1 ? "page" : undefined} className={`truncate ${index === finales.length - 1 ? "font-semibold text-ink" : ""}`}>{label}</span>
            </li>
          ))}
        </ol>
      </nav>
    );
  }

  return (
    <nav aria-label="Ruta de navegación" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[13px] text-ink-3">
        {segments.map((segment, index) => {
          // «Gestión de procesos» no aporta dentro de los paneles: la ruta empieza en el área.
          if (index === 0 && segment === "gestion-procesos" && segments.length > 1) return null;
          const href = `/${segments.slice(0, index + 1).join("/")}`;
          const current = index === segments.length - 1;
          const label = labelFor(segment, segments[index - 1], segments[index - 2]);
          return (
            <li key={href} className="flex min-w-0 items-center gap-1.5">
              {index > (segments[0] === "gestion-procesos" ? 1 : 0) && <span aria-hidden="true" className="text-line-strong">/</span>}
              {current ? (
                <span aria-current="page" className="truncate font-semibold text-ink">{label}</span>
              ) : (
                <Link href={href} className="truncate transition-colors hover:text-ink">{label}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
