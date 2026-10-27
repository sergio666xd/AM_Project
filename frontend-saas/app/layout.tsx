import type { Metadata, Viewport } from "next";
import { Figtree, JetBrains_Mono, Newsreader } from "next/font/google";
import { SessionProvider } from "@/context/SessionContext";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { SITE_URL } from "@/lib/siteUrl";

import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  metadataBase: SITE_URL,
  title: "Abogada en Sabaneta | Alejandra Mu\u00f1oz",
  description:
    "Asesoría jurídica integral con enfoque en prevención, estrategia y representación. Atención desde Sabaneta a todo Colombia.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AM Panel",
  },
};

export const viewport: Viewport = {
  themeColor: "#002060",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es" suppressHydrationWarning className={`${figtree.variable} ${newsreader.variable} ${jetbrains.variable}`}><body><SessionProvider><ToastProvider>{children}</ToastProvider></SessionProvider></body></html>;
}
