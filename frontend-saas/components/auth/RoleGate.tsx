"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import { LoadingState } from "@/components/ui/LoadingState";
import { loginUrlForRedirect } from "@/lib/authRedirect";

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
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      const currentUrl = typeof window === "undefined"
        ? pathname
        : `${pathname}${window.location.search}${window.location.hash}`;
      router.replace(loginUrlForRedirect(currentUrl));
      return;
    }
    if (user.debe_cambiar_password) { router.replace("/gestion-procesos/auth/cambiar-password"); return; }
    if (!roles.includes(user.rol as Role)) router.replace(homeByRole[user.rol as Role] || "/gestion-procesos/auth/login");
  }, [loading, pathname, roles, router, user]);

  if (loading || !user || user.debe_cambiar_password || !roles.includes(user.rol as Role)) {
    return <div className="grid min-h-screen place-items-center px-6"><div className="w-full max-w-sm"><LoadingState label="Validando tu acceso" rows={2} /></div></div>;
  }
  return <>{children}</>;
}

export { homeByRole };
