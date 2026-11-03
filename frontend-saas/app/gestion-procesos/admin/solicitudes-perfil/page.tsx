"use client";

import { CambiosPerfil } from "@/components/clientes/CambiosPerfil";

export default function CambiosPerfilAdminPage() {
  return <CambiosPerfil trato="usted" rutaProceso={(id) => `/gestion-procesos/admin/procesos/${id}`} />;
}
