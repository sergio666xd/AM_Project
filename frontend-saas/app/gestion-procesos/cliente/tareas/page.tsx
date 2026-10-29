import { redirect } from "next/navigation";

// Las tareas del cliente viven ahora en Pendientes, junto a los documentos por enviar.
// Los avisos ya enviados traen ?tarea=N y siguen llegando a su tarjeta.
export default async function TareasClientePage({ searchParams }: { searchParams: Promise<{ tarea?: string }> }) {
  const { tarea } = await searchParams;
  redirect(`/gestion-procesos/cliente/pendientes${tarea && /^\d+$/.test(tarea) ? `#tarea-${tarea}` : ""}`);
}
