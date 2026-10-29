import { RoleGate } from "@/components/auth/RoleGate";
import { MensajesCliente } from "@/components/portal-cliente/MensajesCliente";

export default function MensajesClientePage() {
  return <RoleGate roles={["CLIENTE"]}><MensajesCliente /></RoleGate>;
}
