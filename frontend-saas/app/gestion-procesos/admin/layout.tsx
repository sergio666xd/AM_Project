import type { ReactNode } from "react";
import { RoleGate } from "@/components/auth/RoleGate";
import AdminConsoleShell from "@/components/admin/console/AdminConsoleShell";

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <RoleGate roles={["ADMIN"]}><AdminConsoleShell>{children}</AdminConsoleShell></RoleGate>;
}
