"use client";

import { useParams } from "next/navigation";

import { Expediente } from "@/components/expediente/Expediente";

export default function ProcesoDetallePage() {
  const { id } = useParams<{ id: string }>();
  return <Expediente key={id} procesoId={Number(id)} />;
}
