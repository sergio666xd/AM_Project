import { redirect } from "next/navigation";

// Las alertas viven ahora en el resumen de la administración.
export default function AlertasRoute() {
  redirect("/gestion-procesos/admin");
}
