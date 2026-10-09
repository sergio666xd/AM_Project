import ChatWorkspace from "@/components/chat/ChatWorkspace";
import { RoleGate } from "@/components/auth/RoleGate";

export default function LawyerConversationPage() {
  return <RoleGate roles={["ABOGADO", "ABOGADO_ADMIN", "ADMIN"]}><ChatWorkspace /></RoleGate>;
}
