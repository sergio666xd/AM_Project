import { ReactNode } from "react";
import AppShell from "@/components/layout/AppShell";
import { RoleGate } from "@/components/auth/RoleGate";

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <RoleGate roles={["ABOGADO"]}><AppShell variant="lawyer">{children}</AppShell></RoleGate>;
}
