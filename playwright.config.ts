import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

// Runs against a production build (`npm run build` first) with fake AI/voice and a throwaway database.
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: {
      args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
    },
    permissions: ["microphone"],
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `node -e "require('fs').rmSync('.data/e2e',{recursive:true,force:true})" && node scripts/migrate.mjs && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      AI_MOCK: "1",
      PGLITE_DIR: ".data/e2e",
      DATABASE_URL: "",
      BETTER_AUTH_SECRET: "e2e-only-secret-not-for-production-use",
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
    },
  },
});
