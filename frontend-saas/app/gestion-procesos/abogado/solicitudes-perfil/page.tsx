"use client";

import { CambiosPerfil } from "@/components/clientes/CambiosPerfil";

const BASE = "/gestion-procesos/abogado";

export default function CambiosPerfilAbogadoPage() {
  return <CambiosPerfil trato="tu" rutaProceso={(id) => `${BASE}/procesos/${id}`} rutaCliente={(id) => `${BASE}/clientes/${id}`} />;
}
