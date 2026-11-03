"use client";

import { RoleGate } from "@/components/auth/RoleGate";
import { TableroContratos } from "@/components/contratos/TableroContratos";

export default function ContratosRuta() {
  return <RoleGate roles={["ABOGADO_ADMIN"]}><TableroContratos /></RoleGate>;
}
