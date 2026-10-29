import { redirect } from "next/navigation";

// La configuración del cliente (avisos y seguridad) vive ahora en su perfil.
export default function ConfiguracionClientePage() {
  redirect("/gestion-procesos/cliente/perfil#avisos");
}
