import type { Metadata } from "next";
import { SessionProvider } from "@/context/SessionContext";
import { ToastProvider } from "@/components/ui/ToastProvider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Alejandra Muñoz | Abogada y Asociados",
  description:
    "Asesoría jurídica integral con enfoque en prevención, estrategia y representación. Atención desde Sabaneta a todo Colombia.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es" suppressHydrationWarning><body><SessionProvider><ToastProvider>{children}</ToastProvider></SessionProvider></body></html>;
}
