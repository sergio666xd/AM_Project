import type { NextConfig } from "next";
import { withWorkflow } from "@workflow/next";

// Orígenes extra que pueden abrir `next dev`, como la IP del equipo en la red
// local para probar desde el celular. Separados por comas.
const allowedDevOrigins = (process.env.NEXT_ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins,
};

export default withWorkflow(nextConfig);
