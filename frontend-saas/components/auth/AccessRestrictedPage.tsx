"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { LoadingState } from "@/components/ui/LoadingState";
import { homePathForRole, portalHrefForRole } from "@/lib/portalHosts";

const roleNames: Record<string, string> = {
  ADMIN: "administración",
  ABOGADO_ADMIN: "abogado administrador",
  ABOGADO: "abogado",
  CLIENTE: "cliente",
};

export function AccessRestrictedPage() {
  const { user, loading } = useSession();
  const params = useSearchParams();
  const required = (params.get("roles") || "").split(",").filter(Boolean);

  if (loading) return <main className="mx-auto max-w-xl px-5 py-16"><LoadingState label="Validando tu cuenta" rows={2} /></main>;

  const destination = user ? portalHrefForRole(user.rol, homePathForRole(user.rol)) : "/gestion-procesos/auth/login";
  const roleLabel = user ? roleNames[user.rol] || "tu cuenta" : "tu cuenta";
  const requiredLabel = required.map((role) => roleNames[role] || role).join(" o ");

  return (
    <main className="grid min-h-screen place-items-center bg-background px-5 py-12 text-foreground">
      <section className="w-full max-w-lg rounded-2xl border border-border bg-surface p-7 text-center shadow-sm sm:p-9">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-warning/10 text-warning"><ShieldAlert aria-hidden="true" className="size-7" /></span>
        <h1 className="mt-5 text-2xl font-semibold">Esta sección no está disponible para tu cuenta</h1>
        <p className="mt-2 text-sm text-foreground-muted">{user ? `Ingresaste como ${roleLabel}.` : "No encontramos una sesión activa."}{requiredLabel ? ` Esta página requiere acceso de ${requiredLabel}.` : ""}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={destination} className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold !text-white">{user ? "Ir a mi panel" : "Iniciar sesión"}</Link>
        </div>
      </section>
    </main>
  );
}
