"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { homeByRole } from "@/components/auth/RoleGate";
import { useSession } from "@/context/SessionContext";

export default function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;
    if (user.debe_cambiar_password) {
      router.replace("/gestion-procesos/auth/cambiar-password");
      return;
    }
    const home = homeByRole[user.rol as keyof typeof homeByRole];
    router.replace(home || "/gestion-procesos/auth/login");
  }, [loading, router, user]);

  if (loading || user) {
    return (
      <main role="status" className="grid min-h-screen place-items-center bg-[#f7f3e8] text-sm text-[#002060]/70">
        Verificando sesión...
      </main>
    );
  }

  return <>{children}</>;
}
