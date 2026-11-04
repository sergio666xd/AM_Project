"use client";

import { useParams } from "next/navigation";

import { Expediente } from "@/components/expediente/Expediente";

export default function ProcesoSubpagina() {
  const { id, subpagina } = useParams<{ id: string; subpagina: string }>();
  return <Expediente key={id} procesoId={Number(id)} section={subpagina} />;
}
