import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // The real package throws outside Next's server bundle
      "server-only": path.resolve(import.meta.dirname, "src/lib/__tests__/empty.ts"),
    },
  },
  test: { include: ["src/**/*.test.ts"] },
});
