import { RoleGate } from "@/components/auth/RoleGate";
import { MensajesWorkspace } from "@/components/mensajes/MensajesWorkspace";

export default function MensajesPage() {
  return <RoleGate roles={["ABOGADO", "ABOGADO_ADMIN", "ADMIN"]}><MensajesWorkspace /></RoleGate>;
}
