"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";

type Role = "ADMIN" | "ABOGADO" | "ABOGADO_ADMIN" | "CLIENTE";

const homeByRole: Record<Role, string> = {
  ADMIN: "/gestion-procesos/admin",
  ABOGADO: "/gestion-procesos/abogado",
  ABOGADO_ADMIN: "/gestion-procesos/abogado",
  CLIENTE: "/gestion-procesos/cliente",
};

export function RoleGate({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/gestion-procesos/auth/login"); return; }
    if (user.debe_cambiar_password) { router.replace("/gestion-procesos/auth/cambiar-password"); return; }
    if (!roles.includes(user.rol as Role)) router.replace(homeByRole[user.rol as Role] || "/gestion-procesos/auth/login");
  }, [loading, roles, router, user]);

  if (loading || !user || user.debe_cambiar_password || !roles.includes(user.rol as Role)) {
    return <div className="grid min-h-screen place-items-center text-sm text-[#002060]/70">Validando acceso…</div>;
  }
  return <>{children}</>;
}

export { homeByRole };
