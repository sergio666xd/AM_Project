import { redirect } from "next/navigation";

export default function LegacyAdminUserCreateRoute() {
  redirect("/gestion-procesos/admin/usuarios");
}
