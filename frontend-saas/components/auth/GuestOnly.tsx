"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import { safeInternalRedirect } from "@/lib/authRedirect";
import { homePathForRole, portalHrefForRole } from "@/lib/portalHosts";

function navigateToPortal(router: ReturnType<typeof useRouter>, role: string, path: string) {
  const destination = portalHrefForRole(role, path);
  if (/^https?:\/\//.test(destination) && new URL(destination).origin !== window.location.origin) {
    window.location.assign(destination);
    return;
  }
  router.replace(destination);
}

export default function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;
    const redirect = safeInternalRedirect(new URLSearchParams(window.location.search).get("redirect"));
    if (user.debe_cambiar_password) {
      const params = new URLSearchParams();
      if (user.email) params.set("email", user.email);
      if (redirect) params.set("redirect", redirect);
      const query = params.toString();
      const changePassword = query ? `/cambiar-password?${query}` : "/cambiar-password";
      navigateToPortal(router, user.rol, changePassword);
      return;
    }
    navigateToPortal(router, user.rol, redirect || homePathForRole(user.rol));
  }, [loading, router, user]);

  if (loading || user) {
    return <main role="status" aria-live="polite" className="grid min-h-screen place-items-center bg-[#f7f3e8] text-sm text-[#002060]/80">Verificando sesión…</main>;
  }

  return <>{children}</>;
}
