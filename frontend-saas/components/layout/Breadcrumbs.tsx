"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/context/SessionContext";
import { apiRequest } from "@/lib/api";

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
  contratos: "Contratos y Documentos Legales",
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
  const { token } = useSession();
  const [chatLabel, setChatLabel] = useState<{ href: string; titulo: string; subtitulo: string } | null>(null);
  const segments = pathname.split("/").filter(Boolean);
  const chatIndex = segments.indexOf("chat");

  useEffect(() => {
    if (chatIndex < 0 || !token) return;
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
  }, [chatIndex, pathname, token]);

  if (segments.length === 0) return null;

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
    return <nav aria-label="Ruta de navegación" className="min-w-0"><ol className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-foreground-muted">
      {prefix.map((segment, index) => <li key={index} className="flex min-w-0 items-center gap-1.5">{index > 0 && <span aria-hidden="true">/</span>}{index === prefix.length - 1 ? <span className="truncate font-medium text-foreground">Chats</span> : <Link href={`/${prefix.slice(0, index + 1).join("/")}`} className="truncate transition-colors hover:text-foreground">{labelFor(segment)}</Link>}</li>)}
      {labelsToShow.map((label, index) => <li key={`${label}-${index}`} className="flex min-w-0 items-center gap-1.5"><span aria-hidden="true">/</span><span aria-current={index === labelsToShow.length - 1 ? "page" : undefined} className={`truncate ${index === labelsToShow.length - 1 ? "font-medium text-foreground" : ""}`}>{label}</span></li>)}
    </ol></nav>;
  }

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
