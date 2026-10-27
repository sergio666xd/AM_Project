"use client";

import { ReactNode } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { OPEN_MOBILE_NAV_EVENT } from "./MobileTabBar";
import Sidebar from "./Sidebar";
import Breadcrumbs from "./Breadcrumbs";
import GlobalSearch from "./GlobalSearch";
import ChatFloatingButton from "@/components/chat/ChatFloatingButton";
import ChatPresenceHeartbeat from "@/components/chat/ChatPresenceHeartbeat";
import PushNotificationPrompt from "@/components/chat/PushNotificationPrompt";
import { useChatViewport } from "@/components/chat/useChatViewport";

interface AppShellProps {
  children: ReactNode;
  variant?: "saas" | "platform-admin" | "lawyer" | "client";
}

export default function AppShell({
  children,
  variant = "saas",
}: AppShellProps) {
  const pathname = usePathname();
  const isChatPage = pathname.split("/").includes("chat");
  const chatViewport = useChatViewport();

  return (
    <div
      className={`${isChatPage ? "h-dvh overflow-hidden" : "min-h-screen"} bg-background text-foreground`}
      style={isChatPage && chatViewport.height ? { height: `${chatViewport.height}px` } : undefined}
      data-area={variant}
    >
      <ChatPresenceHeartbeat />
      {variant !== "saas" && <PushNotificationPrompt />}
      <Sidebar variant={variant} />

      <main className={`${isChatPage ? "flex h-full min-h-0 flex-col overflow-hidden" : "min-h-screen"} md:ml-[var(--sidebar-width)]`}>
        {/* Una sola barra superior: en móvil, menú y logo; en escritorio, migas de pan. */}
        <header className={`${isChatPage ? "relative flex-none" : "sticky top-0"} z-30 flex h-[var(--header-height)] items-center border-b border-border bg-surface/95 px-3 backdrop-blur sm:px-5 md:px-8`}>
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 md:hidden">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event(OPEN_MOBILE_NAV_EVENT))}
                aria-label="Abrir menú"
                className="grid size-10 place-items-center rounded-[var(--radius-md)] text-foreground-secondary hover:bg-surface-hover"
              >
                <Menu aria-hidden="true" className="size-5" />
              </button>
              <Image src="/AM_logo_Full_Black.svg" alt="" width={32} height={32} className="size-8 dark:hidden" />
              <Image src="/AM_logo_Full_White.svg" alt="" width={32} height={32} className="hidden size-8 dark:block" />
              <span className="truncate font-display text-[17px] text-foreground">Alejandra Muñoz</span>
            </div>
            <div className="hidden min-w-0 md:block"><Breadcrumbs /></div>
            <GlobalSearch />
          </div>
        </header>
        <div className={isChatPage ? "min-h-0 flex-1 p-0" : "p-4 pb-24 sm:p-6 sm:pb-24 md:pb-6 lg:p-8"}>
          {children}
        </div>
      </main>
      {!isChatPage && <ChatFloatingButton />}
    </div>
  );
}
