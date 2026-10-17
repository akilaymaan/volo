import { spawn } from "node:child_process";
import path from "node:path";

export const root = path.resolve(import.meta.dirname, "../../..");

export function runMigration(cwd: string, env: Partial<NodeJS.ProcessEnv>, args: string[] = []) {
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts/migrate.mjs"), ...args], {
      cwd, env: { ...process.env, NODE_ENV: "test", ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (data) => { output += data.toString(); });
    child.stderr.on("data", (data) => { output += data.toString(); });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, output }));
  });
}
