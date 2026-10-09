import ChatWorkspace from "@/components/chat/ChatWorkspace";
import { RoleGate } from "@/components/auth/RoleGate";

export default function ClientConversationPage() {
  return <RoleGate roles={["CLIENTE"]}><ChatWorkspace /></RoleGate>;
}
