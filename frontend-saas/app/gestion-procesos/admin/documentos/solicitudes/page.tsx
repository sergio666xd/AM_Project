import { redirect } from "next/navigation";

// Las solicitudes son una vista de Documentos.
export default function SolicitudesDocumentosRoute() {
  redirect("/gestion-procesos/admin/documentos");
}
