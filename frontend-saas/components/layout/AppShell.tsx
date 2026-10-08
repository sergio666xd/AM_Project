"use client";

import { ReactNode } from "react";
import Sidebar from "./Sidebar";
import Breadcrumbs from "./Breadcrumbs";
import GlobalSearch from "./GlobalSearch";

interface AppShellProps {
  children: ReactNode;
  variant?: "saas" | "platform-admin" | "lawyer" | "client";
}

export default function AppShell({
  children,
  variant = "saas",
}: AppShellProps) {
  return (
    <div
      className="min-h-screen bg-background text-foreground"
      data-area={variant}
    >
      <Sidebar variant={variant} />

      <main className="min-h-screen pt-[var(--header-height)] md:ml-[260px] md:pt-0">
        <header className="sticky top-0 z-30 border-b border-border bg-surface/95 px-5 py-3 backdrop-blur md:px-8">
          <div className="flex items-center justify-between gap-4"><Breadcrumbs /><GlobalSearch /></div>
        </header>
        <div className="p-5 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
