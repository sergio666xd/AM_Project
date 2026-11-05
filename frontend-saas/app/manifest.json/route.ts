import { NextRequest, NextResponse } from "next/server";

import { ADMIN_PORTAL_HOST, USER_PORTAL_HOST } from "@/lib/portalHosts";

/**
 * Manifiesto de la app instalable, según el dominio desde el que se instala.
 * Abre siempre en "/": cada dominio decide desde ahí (inicio de sesión, panel o sitio).
 */
export function GET(request: NextRequest) {
  const host = (request.headers.get("host") || request.nextUrl.hostname).split(":")[0].toLowerCase();
  const admin = host === ADMIN_PORTAL_HOST || host === "admin.localhost";
  const panel = host === USER_PORTAL_HOST || host === "panel.localhost";
  const [name, shortName] = admin
    ? ["AM Abogada · Administración", "AM Admin"]
    : panel
      ? ["AM Abogada · Panel", "AM Panel"]
      : ["Alejandra Muñoz | Abogada y Asociados", "AM Abogada"];
  return NextResponse.json(
    {
      id: "/",
      name,
      short_name: shortName,
      description: "Alejandra Muñoz | Abogada y Asociados",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#f7f3e8",
      theme_color: "#002060",
      icons: [{ src: "/am_rounded.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600", Vary: "Host" } },
  );
}
