import { MensajesWorkspace } from "@/components/mensajes/MensajesWorkspace";

export default function MensajesAdminPage() {
  return <MensajesWorkspace base="/gestion-procesos/admin/chat" prefijoMio="Usted: " />;
}
