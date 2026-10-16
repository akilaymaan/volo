import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Embedded Postgres ships WASM + data files that must not be bundled
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    // Job-description PDFs are sent to a server action
    serverActions: { bodySizeLimit: "10mb" },
  },
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
