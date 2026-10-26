import type { ReactNode } from "react";
import { RoleGate } from "@/components/auth/RoleGate";
import AppShell from "@/components/layout/AppShell";

export default function ClienteLayout({ children }: { children: ReactNode }) {
  return <RoleGate roles={["CLIENTE"]} restrictedBehavior="page"><AppShell variant="client">{children}</AppShell></RoleGate>;
}
