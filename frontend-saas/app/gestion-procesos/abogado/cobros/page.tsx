"use client";

import { RoleGate } from "@/components/auth/RoleGate";
import { PanelCobros } from "@/components/finanzas/PanelCobros";

export default function CobrosRuta() {
  return <RoleGate roles={["ABOGADO_ADMIN"]}><PanelCobros /></RoleGate>;
}
