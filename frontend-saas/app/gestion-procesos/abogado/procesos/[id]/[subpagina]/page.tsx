"use client";

import { useParams } from "next/navigation";
import ProcesoDetallePage from "../page";

export default function ProcesoSubpagina() {
  const params = useParams<{ subpagina: string }>();
  return <ProcesoDetallePage section={params.subpagina} />;
}
