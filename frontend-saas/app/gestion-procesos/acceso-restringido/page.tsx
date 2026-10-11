import { Suspense } from "react";
import { AccessRestrictedPage } from "@/components/auth/AccessRestrictedPage";
import { LoadingState } from "@/components/ui/LoadingState";

export default function RestrictedPage() {
  return <Suspense fallback={<main className="mx-auto max-w-xl px-5 py-16"><LoadingState label="Preparando información de acceso" rows={2} /></main>}><AccessRestrictedPage /></Suspense>;
}
