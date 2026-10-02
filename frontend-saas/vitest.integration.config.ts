import { defineConfig } from "vitest/config";
import { workflow } from "@workflow/vitest";

export default defineConfig({
  plugins: [workflow()],
  test: {
    include: ["workflows/**/*.integration.test.ts"],
    testTimeout: 60_000,
  },
});