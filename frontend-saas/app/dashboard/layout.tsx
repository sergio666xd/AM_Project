import { ReactNode } from "react";
import AppShell from "@/components/layout/AppShell";

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <AppShell variant="user">{children}</AppShell>;
}