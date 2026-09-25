import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.78.226"],
  async rewrites() {
    return [
      { source: "/gestion-procesos/auth/:path*", destination: "/auth/:path*" },
      { source: "/gestion-procesos/dashboard/:path*", destination: "/dashboard/:path*" },
      { source: "/gestion-procesos/admin/:path*", destination: "/admin/:path*" },
    ];
  },
};

export default nextConfig;
