"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import ChatFloatingButton from "@/components/chat/ChatFloatingButton";
import ChatPresenceHeartbeat from "@/components/chat/ChatPresenceHeartbeat";
import PushNotificationPrompt from "@/components/chat/PushNotificationPrompt";
import { useChatViewport } from "@/components/chat/useChatViewport";
import { Logo } from "@/components/ui/Logo";
import { useSession } from "@/context/SessionContext";
import { cx } from "@/lib/cx";
import { usePortalPathname } from "@/lib/usePortalPathname";
import { BarraSuperior } from "./BarraSuperior";
import { BusquedaGlobal } from "./BusquedaGlobal";
import { Campana } from "./Campana";
import { MenuCuenta } from "./MenuCuenta";
import { MobileTabBar } from "./MobileTabBar";
import Sidebar from "./Sidebar";
import { estaActiva, navegacion, rutaAreaCuenta, type Variante } from "./navegacion";

interface AppShellProps {
  children: ReactNode;
  variant?: Exclude<Variante, "platform-admin">;
}

/**
 * Estructura de los paneles. Abogado: riel azul en escritorio, barra superior
 * con búsqueda y avisos, y barra inferior en celular. Cliente: encabezado
 * blanco con el logo completo, letra más grande y pestañas inferiores altas.
 */
export default function AppShell({ children, variant = "saas" }: AppShellProps) {
  const { user } = useSession();
  const nav = navegacion(variant, user?.rol === "ABOGADO_ADMIN");
  const areaHref = rutaAreaCuenta(variant);
  const enChat = usePathname().split("/").includes("chat");
  const chatViewport = useChatViewport();
  const estiloChat = enChat && chatViewport.height ? { height: `${chatViewport.height}px` } : undefined;

  const comunes = (
    <>
      <ChatPresenceHeartbeat />
      {variant !== "saas" && <PushNotificationPrompt />}
    </>
  );

  if (variant === "client") {
    return (
      <div
        data-area={variant}
        className={cx("lectura bg-ground text-ink", enChat ? "flex h-dvh flex-col overflow-hidden" : "min-h-dvh")}
        style={{ ...estiloChat, "--alto-barra": "64px" } as CSSProperties}
      >
        {comunes}
        <EncabezadoCliente nav={nav} areaHref={areaHref} />
        <main className={cx("mx-auto w-full max-w-[1080px]", enChat ? "min-h-0 flex-1" : "px-4 pb-32 pt-6 sm:px-6 lg:pb-16 lg:pt-10")}>
          {children}
        </main>
        {!enChat && <MobileTabBar pestanas={nav.pestanas} resto={nav.resto} inicio={nav.inicio} grande />}
        {!enChat && <ChatFloatingButton />}
      </div>
    );
  }

  return (
    <div
      data-area={variant}
      className={cx("bg-ground text-ink lg:pl-[248px]", enChat ? "flex h-dvh flex-col overflow-hidden" : "min-h-dvh")}
      style={{ ...estiloChat, "--alto-barra": "56px" } as CSSProperties}
    >
      {comunes}
      <Sidebar grupos={nav.grupos} inicio={nav.inicio} areaHref={areaHref} />
      <BarraSuperior inicio={nav.inicio} areaHref={areaHref} fija={!enChat} />
      <main className={cx("mx-auto w-full max-w-[1280px]", enChat ? "min-h-0 flex-1" : "px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-7")}>
        {children}
      </main>
      {!enChat && <MobileTabBar pestanas={nav.pestanas} resto={nav.resto} inicio={nav.inicio} />}
      {!enChat && <ChatFloatingButton />}
      <BusquedaGlobal area="abogado" />
    </div>
  );
}

function EncabezadoCliente({ nav, areaHref }: { nav: ReturnType<typeof navegacion>; areaHref: string }) {
  const ruta = usePortalPathname();
  return (
    <header className="sticky top-0 z-20 shrink-0 border-b border-line bg-sheet/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1080px] items-center gap-3 px-4 sm:h-[72px] sm:px-6">
        <Link href={nav.inicio} aria-label="Ir al inicio" className="flex shrink-0 items-center gap-2.5 rounded-lg">
          <Logo variante="horizontal" className="hidden h-12 w-auto sm:block dark:sm:hidden" />
          <Logo variante="horizontal-inversa" className="hidden h-12 w-auto dark:sm:block" />
          <Logo variante="emblema" className="size-10 sm:hidden dark:hidden" />
          <Logo variante="emblema-inverso" className="hidden size-10 dark:block dark:sm:hidden" />
          <span className="font-display text-[19px] text-ink sm:hidden">Su portal</span>
        </Link>
        <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Principal">
          {nav.todos.slice(0, 5).map((item) => {
            const activa = estaActiva(ruta, item.href, nav.inicio);
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={activa ? "page" : undefined}
                className={cx(
                  "relative flex h-11 items-center rounded-lg px-3 text-[16px] font-semibold transition-colors",
                  activa ? "text-navy-ink" : "text-ink-2 hover:bg-manila hover:text-ink",
                )}
              >
                {item.label}
                {activa && <span aria-hidden="true" className="absolute inset-x-3 -bottom-[14px] h-[3px] rounded-t bg-gold" />}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <Campana todosHref={`${areaHref}/notificaciones`} />
          <MenuCuenta areaHref={areaHref} />
        </div>
      </div>
    </header>
  );
}
