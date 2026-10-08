import type { NextConfig } from "next";
import { withWorkflow } from "@workflow/next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.78.226"],
};

export default withWorkflow(nextConfig);