import type { NextConfig } from "next";

// Provider doubles exist only in a separate, explicitly requested local test build.
// Production builds have no provider aliases and no runtime mock switches.
const e2eBuild = process.env.VOLO_E2E_BUILD === "1";
if (e2eBuild && (process.env.NEXT_BUILD_DIR !== ".next-e2e" || process.env.VERCEL || process.env.RENDER))
  throw new Error("Test provider aliases require the isolated local .next-e2e build.");

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_BUILD_DIR || ".next",
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ],
    }];
  },
  // Embedded Postgres ships WASM + data files that must not be bundled
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    // Job-description PDFs are sent to a server action
    serverActions: { bodySizeLimit: "10mb" },
  },
  turbopack: {
    root: process.cwd(),
    ...(e2eBuild ? { resolveAlias: {
      "@/lib/ai/tasks": "./e2e/stubs/tasks.ts",
      "@/lib/ai/sarvam": "./e2e/stubs/sarvam.ts",
      "@/lib/mail": "./e2e/stubs/mail.ts",
    } } : {}),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
