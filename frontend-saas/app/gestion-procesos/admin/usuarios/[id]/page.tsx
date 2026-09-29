import { redirect } from "next/navigation";

export default function LegacyAdminUserDetailRoute() {
  redirect("/gestion-procesos/admin/usuarios");
}
