import type { Metadata, Viewport } from "next";
import { Figtree, Gelasio, JetBrains_Mono, Newsreader, Public_Sans, Roboto_Mono } from "next/font/google";
import { SessionProvider } from "@/context/SessionContext";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { SITE_URL } from "@/lib/siteUrl";

import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });
// Letras de la app (expediente foliado); el sitio público sigue con las de arriba.
// Gelasio solo se descarga donde falta Georgia, por eso no se precarga.
const publicSans = Public_Sans({ subsets: ["latin"], variable: "--font-public-sans", display: "swap" });
const robotoMono = Roboto_Mono({ subsets: ["latin"], variable: "--font-roboto-mono", display: "swap", preload: false });
const gelasio = Gelasio({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-gelasio", display: "swap", preload: false });

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
  return <html lang="es" suppressHydrationWarning className={`${figtree.variable} ${newsreader.variable} ${jetbrains.variable} ${publicSans.variable} ${robotoMono.variable} ${gelasio.variable}`}><body><SessionProvider><ToastProvider>{children}</ToastProvider></SessionProvider></body></html>;
}
