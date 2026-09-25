import { ReactNode } from "react";
import AppShell from "@/components/layout/AppShell";

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <AppShell variant="admin">{children}</AppShell>;
}