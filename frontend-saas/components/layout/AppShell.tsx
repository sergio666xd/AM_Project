"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Breadcrumbs from "./Breadcrumbs";
import GlobalSearch from "./GlobalSearch";
import ChatFloatingButton from "@/components/chat/ChatFloatingButton";
import ChatPresenceHeartbeat from "@/components/chat/ChatPresenceHeartbeat";
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
      <Sidebar variant={variant} />

      <main className={`${isChatPage ? "flex h-full min-h-0 flex-col overflow-hidden" : "min-h-screen"} pt-[var(--header-height)] md:ml-[260px] md:pt-0`}>
        <header className={`${isChatPage ? "relative flex-none" : "sticky top-0"} z-30 border-b border-border bg-surface/95 px-5 py-3 backdrop-blur md:px-8`}>
          <div className="flex items-center justify-between gap-4"><Breadcrumbs /><GlobalSearch /></div>
        </header>
        <div className={isChatPage ? "min-h-0 flex-1 p-0" : "p-5 sm:p-6 lg:p-8"}>
          {children}
        </div>
      </main>
      {!isChatPage && <ChatFloatingButton />}
    </div>
  );
}
