"use client";

import { HoyPanel } from "@/components/lawyer/HoyPanel";
import { useSession } from "@/context/SessionContext";

export default function AbogadoPage() {
  const { user, loading } = useSession();
  if (loading || !user) return <div aria-busy="true" className="skeleton h-64 rounded-xl" />;
  return <HoyPanel firstName={user.nombre.split(" ")[0] || ""} />;
}
