import { redirect } from "next/navigation";

// Los envíos de avisos viven ahora en Operación.
export default function EntregasRoute() {
  redirect("/gestion-procesos/admin/operacion/notificaciones");
}
