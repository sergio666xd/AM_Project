"use client";

import Link from "next/link";
import { usePortalPathname } from "@/lib/usePortalPathname";
import { useEffect, useState } from "react";
import { useSession } from "@/context/SessionContext";
import { apiRequest } from "@/lib/api";
import { api } from "@/lib/api-v2/cliente";
import { RUTA_MENSAJES, claveDeRuta, partesDeRuta } from "@/lib/mensajes";

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
  alertas: "Alertas",
  actividad: "Actividad",
  folios: "Folios",
  almacenamiento: "Almacenamiento",
  firma: "Datos generales",
  metricas: "Métricas",
  calendario: "Calendario",
  ayuda: "Ayuda",
  mensajes: "Mensajes",
  entregas: "Envíos",
  plantillas: "Plantillas",
};

function labelFor(segment: string) {
  if (/^\d+$/.test(segment) || /^[0-9a-f-]{16,}$/i.test(segment)) return "Detalle";
  return labels[segment] ?? decodeURIComponent(segment).replace(/-/g, " ");
}

export default function Breadcrumbs() {
  const pathname = usePortalPathname();
  const { token } = useSession();
  const [chatLabel, setChatLabel] = useState<{ href: string; titulo: string; subtitulo: string } | null>(null);
  const segments = pathname.split("/").filter(Boolean);
  const chatIndex = segments.indexOf("chat");

  const mensajesAbogado = chatIndex > 0 && segments[chatIndex - 1] === "abogado";
  const claveChat = mensajesAbogado ? claveDeRuta(partesDeRuta(pathname)) : null;

  // Mensajes del abogado (API v2): «Mensajes / Proceso / Persona».
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

  useEffect(() => {
    if (chatIndex < 0 || !token || mensajesAbogado) return;
    let cancelled = false;
    apiRequest("/api/chat/conversaciones", { token })
      .then((response) => response.json())
      .then((items: { href: string; titulo: string; subtitulo: string; proceso_id?: number | null }[]) => {
        if (cancelled) return;
        const currentPath = pathname.replace(/\/$/, "");
        const match = items.find((item) => item.href.replace(/\/$/, "") === currentPath);
        if (match) setChatLabel({ href: currentPath, titulo: match.titulo, subtitulo: match.subtitulo });
        else {
          const processRoute = currentPath.match(/\/chat\/(\d+)$/);
          const processChat = processRoute && items.find((item) => Number(item.proceso_id) === Number(processRoute[1]));
          setChatLabel(processChat
            ? { href: currentPath, titulo: processChat.subtitulo, subtitulo: "" }
            : { href: currentPath, titulo: "Chats", subtitulo: "" });
        }
      })
      .catch(() => { if (!cancelled) setChatLabel(null); });
    return () => { cancelled = true; };
  }, [chatIndex, mensajesAbogado, pathname, token]);

  if (segments.length === 0) return null;

  if (mensajesAbogado) {
    const currentPath = pathname.replace(/\/$/, "");
    const actual = claveChat && chatLabel?.href === currentPath ? chatLabel : null;
    const finales = claveChat ? (actual ? [actual.subtitulo, actual.titulo].filter(Boolean) : ["…"]) : [];
    return (
      <nav aria-label="Ruta de navegación" className="min-w-0">
        <ol className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[13px] text-ink-3">
          <li className="flex min-w-0 items-center gap-1.5"><Link href={RUTA_MENSAJES.replace(/\/chat$/, "")} className="truncate transition-colors hover:text-ink">Mi trabajo</Link></li>
          <li className="flex min-w-0 items-center gap-1.5">
            <span aria-hidden="true" className="text-line-strong">/</span>
            {finales.length ? <Link href={RUTA_MENSAJES} className="truncate transition-colors hover:text-ink">Mensajes</Link> : <span aria-current="page" className="truncate font-semibold text-ink">Mensajes</span>}
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

  if (chatIndex >= 0) {
    const prefix = segments.slice(0, chatIndex + 1);
    const chatTail = segments.slice(chatIndex + 1);
    const processGroupRoute = chatTail.length === 1 && /^\d+$/.test(chatTail[0]);
    const processChat = chatTail.length >= 2 && chatTail[0] !== "directo";
    const currentPath = pathname.replace(/\/$/, "");
    const currentChatLabel = chatLabel?.href === currentPath ? chatLabel : null;
    const labelsToShow = currentChatLabel
      ? processGroupRoute
        ? [currentChatLabel.titulo]
        : [...(processChat && currentChatLabel.subtitulo !== "Conversación directa" ? [currentChatLabel.subtitulo] : []), currentChatLabel.titulo]
      : chatTail.length ? ["Abriendo chat..."] : [];
    return <nav aria-label="Ruta de navegación" className="min-w-0"><ol className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[13px] text-ink-3">
      {prefix.map((segment, index) => <li key={index} className="flex min-w-0 items-center gap-1.5">{index > 0 && <span aria-hidden="true" className="text-line-strong">/</span>}{index === prefix.length - 1 ? <span className="truncate font-semibold text-ink">Chats</span> : <Link href={`/${prefix.slice(0, index + 1).join("/")}`} className="truncate transition-colors hover:text-ink">{labelFor(segment)}</Link>}</li>)}
      {labelsToShow.map((label, index) => <li key={`${label}-${index}`} className="flex min-w-0 items-center gap-1.5"><span aria-hidden="true" className="text-line-strong">/</span><span aria-current={index === labelsToShow.length - 1 ? "page" : undefined} className={`truncate ${index === labelsToShow.length - 1 ? "font-semibold text-ink" : ""}`}>{label}</span></li>)}
    </ol></nav>;
  }

  return (
    <nav aria-label="Ruta de navegación" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[13px] text-ink-3">
        {segments.map((segment, index) => {
          // «Gestión de procesos» no aporta dentro de los paneles: la ruta empieza en el área.
          if (index === 0 && segment === "gestion-procesos" && segments.length > 1) return null;
          const href = `/${segments.slice(0, index + 1).join("/")}`;
          const current = index === segments.length - 1;
          const label = labelFor(segment);
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
