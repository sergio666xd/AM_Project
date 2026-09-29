import type { ReactNode } from "react";
import { RoleGate } from "@/components/auth/RoleGate";
import AppShell from "@/components/layout/AppShell";

export default function AbogadoLayout({ children }: { children: ReactNode }) {
  return <RoleGate roles={["ABOGADO", "ABOGADO_ADMIN"]}><AppShell variant="lawyer">{children}</AppShell></RoleGate>;
}
