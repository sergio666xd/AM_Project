import { redirect } from "next/navigation";

export default function LegacyClientMessagesRoute() {
  redirect("/gestion-procesos/cliente/chat");
}
