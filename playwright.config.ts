import { defineConfig, devices } from "@playwright/test";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.E2E_PORT || 3100);

// Uses an isolated test build; ordinary production builds always use real providers.
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
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
      args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
    },
    permissions: ["microphone"],
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run db:local && node e2e/seed-admin.mjs && npm start -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_BUILD_DIR: ".next-e2e",
      VOLO_E2E_BUILD: "1",
      PGLITE_DIR: `.data/e2e-${randomUUID()}`,
      DATABASE_URL: "",
      DATABASE_MODE: "pglite",
      BETTER_AUTH_SECRET: "e2e-only-secret-not-for-production-use",
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      ANTHROPIC_API_KEY: "test-only-not-a-provider-key",
      SARVAM_API_KEY: "test-only-not-a-provider-key",
      RESEND_API_KEY: "test-only-not-a-provider-key",
      EMAIL_FROM: "test@example.test",
      RETENTION_CRON_SECRET: "e2e-maintenance-secret-not-for-production",
      RETENTION_ENABLED: "0",
      ADMIN_USER_IDS: "e2e-platform-admin",
    },
  },
});
