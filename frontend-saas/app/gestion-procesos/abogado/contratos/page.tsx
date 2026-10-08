import AllContractsPage from "@/components/contracts/AllContractsPage";
import { RoleGate } from "@/components/auth/RoleGate";

export default function LawyerContractsRoute() {
  return <RoleGate roles={["ABOGADO_ADMIN"]}><AllContractsPage /></RoleGate>;
}
