import { redirect } from "next/navigation";

// La plataforma para abogados externos se retiró: esta dirección lleva al portal.
export default function GestionProcesosPage() {
  redirect("/gestion-procesos/auth/login");
}
