import { redirect } from "next/navigation";

// Los contratos firmados están en su propia pestaña.
export default function ContratosCargadosRoute() {
  redirect("/gestion-procesos/admin/contratos");
}
