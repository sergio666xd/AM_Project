"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import { LoadingState } from "@/components/ui/LoadingState";
import { ApiErrorState } from "@/components/ui/ApiErrorState";
import { loginUrlForRedirect } from "@/lib/authRedirect";
import { isLocalPortalHost, portalHrefForRole } from "@/lib/portalHosts";

type Role = "ADMIN" | "ABOGADO" | "ABOGADO_ADMIN" | "CLIENTE";
const homeByRole: Record<Role, string> = {
  ADMIN: "/",
  ABOGADO: "/gestion-procesos/dashboard",
  ABOGADO_ADMIN: "/",
  CLIENTE: "/",
};

export function RoleGate({ roles, children, restrictedBehavior = "redirect" }: { roles: Role[]; children: React.ReactNode; restrictedBehavior?: "redirect" | "page" }) {
  const { user, loading, token, sessionError, retrySession } = useSession();
  // Con token pero sin usuario por un fallo de red o servidor: se ofrece
  // reintentar en lugar de enviar a iniciar sesión.
  const backendUnavailable = !user && Boolean(token && sessionError);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading || backendUnavailable) return;
    if (!user) {
      const currentUrl = typeof window === "undefined"
        ? pathname
        : `${pathname}${window.location.search}${window.location.hash}`;
      if (typeof window !== "undefined" && isLocalPortalHost(window.location.hostname)) {
        const onAdminPortal = window.location.hostname === "admin.localhost"
          || pathname.startsWith("/gestion-procesos/admin");
        if (onAdminPortal) {
          const loginPath = window.location.hostname === "admin.localhost" ? "/login" : "/gestion-procesos/auth/admin";
          router.replace(`${loginPath}?redirect=${encodeURIComponent(currentUrl)}`);
          return;
        }
      }
      router.replace(loginUrlForRedirect(currentUrl));
      return;
    }
    if (user.debe_cambiar_password) {
      const emailQuery = user.email ? `?email=${encodeURIComponent(user.email)}` : "";
      router.replace(`/cambiar-password${emailQuery}`);
      return;
    }
    if (!roles.includes(user.rol as Role)) {
      if (restrictedBehavior === "page") {
        router.replace(`/gestion-procesos/acceso-restringido?roles=${encodeURIComponent(roles.join(","))}`);
      } else {
        const destination = portalHrefForRole(user.rol, homeByRole[user.rol as Role] || "/gestion-procesos/auth/login");
        if (typeof window !== "undefined" && /^https?:\/\//.test(destination) && new URL(destination).origin !== window.location.origin) {
          window.location.assign(destination);
        } else {
          router.replace(destination);
        }
      }
    }
  }, [backendUnavailable, loading, pathname, restrictedBehavior, roles, router, user]);

  if (!loading && backendUnavailable) {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <div className="w-full max-w-md">
          <ApiErrorState error={new Error(sessionError ?? "")} onRetry={() => void retrySession()} />
        </div>
      </div>
    );
  }

  if (loading || !user || user.debe_cambiar_password || !roles.includes(user.rol as Role)) {
    return <div className="grid min-h-screen place-items-center px-6"><div className="w-full max-w-sm"><LoadingState label="Validando tu acceso" rows={2} /></div></div>;
  }
  return <>{children}</>;
}

export { homeByRole };
