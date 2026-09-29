"use client";

import { ReactNode } from "react";
import Sidebar from "./Sidebar";

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
        <div className="p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
