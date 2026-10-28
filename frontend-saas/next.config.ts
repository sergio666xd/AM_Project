import type { NextConfig } from "next";
import { withWorkflow } from "@workflow/next";

// Orígenes extra que pueden abrir `next dev`, como la IP del equipo en la red
// local para probar desde el celular. Separados por comas.
const allowedDevOrigins = (process.env.NEXT_ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// En Vercel `/api` llega al backend por las reglas de vercel.json. En
// desarrollo la API v2 se sirve por el mismo origen que Next para que la
// cookie de sesión (SameSite=Lax) viaje igual que en producción.
const backendDev = process.env.BACKEND_DEV_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  allowedDevOrigins,
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [{ source: "/api/v2/:ruta*", destination: `${backendDev}/api/v2/:ruta*` }];
  },
};

export default withWorkflow(nextConfig);
