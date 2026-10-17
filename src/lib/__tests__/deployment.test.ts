import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { root, runMigration } from "./migration-cli";

let temp: string;
beforeAll(async () => { temp = await mkdtemp(path.join(os.tmpdir(), "volo-deploy-test-")); });
afterAll(async () => { if (temp) await rm(temp, { recursive: true, force: true }); });

it("keeps dev/build/start migration-free and exposes an explicit PostgreSQL command", async () => {
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  expect(pkg.scripts.dev).toBe("next dev");
  expect(pkg.scripts.build).toBe("next build");
  expect(pkg.scripts.start).toBe("next start");
  expect(pkg.scripts.db).toBe("node scripts/migrate.mjs");
  expect(pkg.scripts["db:local"]).toBe("node scripts/migrate.mjs --local");
});

it("fails the PostgreSQL command clearly when DATABASE_URL is missing, even in local mode", async () => {
  const unused = path.join(temp, "must-not-exist");
  const result = await runMigration(temp, { DATABASE_URL: "", DATABASE_MODE: "pglite", PGLITE_DIR: unused });
  expect(result.code).toBe(1);
  expect(result.output).toContain("DATABASE_URL is required");
  await expect(access(unused)).rejects.toThrow();
});

it("rejects pooled Neon migrations and unsupported parameters before connecting, without leaking secrets", async () => {
  for (const url of [
    "postgresql://user:never-print-this@ep-example-pooler.us-east-2.aws.neon.tech/neondb",
    "postgresql://user:never-print-this@ep-example.us-east-2.aws.neon.tech/neondb?channel_binding=require",
  ]) {
    const result = await runMigration(temp, { DATABASE_URL: url });
    expect(result.code).toBe(1);
    expect(result.output).not.toContain("never-print-this");
    expect(result.output).not.toContain(url);
  }
});

it("applies the original history to explicit disposable PGlite and reruns without duplicating seeds", async () => {
  const dir = path.join(temp, "pglite");
  const env = { DATABASE_URL: "", DATABASE_MODE: "pglite", PGLITE_DIR: dir, VERCEL: "", RENDER: "" };
  expect((await runMigration(temp, env, ["--local"])).code).toBe(0);
  expect((await runMigration(temp, env, ["--local"])).code).toBe(0);
  const db = new PGlite(dir);
  try {
    expect((await db.query("select * from drizzle.__drizzle_migrations")).rows).toHaveLength(6);
    expect((await db.query("select * from interviewer")).rows).toHaveLength(4);
    expect((await db.query("select * from usage_event")).rows).toHaveLength(0);
  } finally { await db.close(); }
}, 30_000);

it("preserves all six existing SQL migrations across checkout line endings", async () => {
  const original = {
    "0000_init": "cf5a56ec586abe6171ac3278b5535ccba177f0f93adcc1da1e0cb3c58c1d3a54",
    "0001_seed_interviewers": "ea06ca80589949bb8f70cc44ffb6ed8a5fbdc2070615886dd4ef21bb53d5eabc",
    "0002_review_hardening": "d248b206ebe3ddf7a55b0e829320b46bbde3e2c8883ed0383730459280949a48",
    "0003_production_foundation": "1055f6a4f01f2b001b393b0ffb3f25e10c4e9f67f08c6403ef3e7b8a726586ae",
    "0004_email_invitations": "04b890bc6fef3c29afbc8e816176ee6259f5bd1b3e7e71a0171c080338a2ab40",
    "0005_usage_and_retention_indexes": "f81243221dff61e62cb1707f1eed5336fabcc0d41ae4ddab8cfb76a22a798081",
  };
  for (const [name, hash] of Object.entries(original)) {
    // Normalize checkout line endings; git may convert LF to CRLF on Windows.
    const sql = (await readFile(path.join(root, `drizzle/${name}.sql`), "utf8")).replace(/\r\n/g, "\n");
    expect(createHash("sha256").update(sql).digest("hex")).toBe(hash);
  }
});
