import { redirect } from "next/navigation";

// Dirección anterior del editor de contenido.
export default function ContenidoPage() {
  redirect("/gestion-procesos/admin/sitio/contenido");
}
