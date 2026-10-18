import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
  stdio: "inherit",
  env: { ...process.env, VOLO_E2E_BUILD: "1", NEXT_BUILD_DIR: ".next-e2e", DATABASE_MODE: "postgres", DATABASE_URL: "" },
});
child.once("error", () => { console.error("Test build could not start"); process.exitCode = 1; });
child.once("exit", (code) => { process.exitCode = code ?? 1; });
