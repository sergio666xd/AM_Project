"use client";

import { useParams } from "next/navigation";

import { DetalleTarea } from "@/components/tareas/DetalleTarea";

export default function TareaDetalleAbogadoPage() {
  const { id } = useParams<{ id: string }>();
  return <DetalleTarea key={id} tareaId={Number(id)} />;
}
