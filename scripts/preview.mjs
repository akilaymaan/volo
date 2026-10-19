// Optimized local app, isolated from next dev and test-provider builds. Never migrates data.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const next = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const env = { ...process.env, NODE_ENV: "production", NEXT_BUILD_DIR: ".next-preview", VOLO_E2E_BUILD: "0" };
const port = process.env.PORT || "3000";
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error("PORT must be between 1 and 65535.");

let child;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { child?.kill(signal); });
function run(args) {
  return new Promise((resolve) => {
    child = spawn(process.execPath, [next, ...args], { cwd: root, env, stdio: "inherit", windowsHide: true });
    child.once("error", () => resolve(1));
    child.once("exit", (code) => resolve(code ?? 1));
  });
}
const built = await run(["build"]);
process.exitCode = built === 0 ? await run(["start", "--port", port]) : built;
