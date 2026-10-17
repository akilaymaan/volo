import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { postgresConfig } from "@/lib/db/config.mjs";
import * as schema from "@/lib/db/schema";
import { runMigration } from "./migration-cli";
import { MIGRATION_LOCK } from "../../../scripts/database-migrations.mjs";

const raw = process.env.TEST_POSTGRES_URL;

describe.skipIf(!raw)("disposable PostgreSQL deployment", () => {
  let client: ReturnType<typeof postgres>;
  let temp: string;
  const userId = `deployment-${randomUUID()}`;
  beforeAll(async () => {
    const target = new URL(raw!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || target.pathname !== "/volo_deploy_test")
      throw new Error("TEST_POSTGRES_URL must point to the loopback-only disposable volo_deploy_test database. Remote databases are never tested.");
    const { url, ...options } = postgresConfig(raw);
    client = postgres(url, { ...options, max: 1 });
    temp = await mkdtemp(path.join(os.tmpdir(), "volo-postgres-test-"));
  });
  afterAll(async () => {
    if (client) await client.end();
    if (temp) await rm(temp, { recursive: true, force: true });
  });

  it("deploys all six migrations, seeds presets and preserves data on a second run", async () => {
    const first = await runMigration(temp, { DATABASE_URL: raw });
    expect(first, first.output).toMatchObject({ code: 0 });
    expect(first.output).not.toContain(raw!);
    expect(await client`select * from drizzle.__drizzle_migrations`).toHaveLength(6);
    expect(await client`select * from interviewer`).toHaveLength(4);
    await client`insert into "user" (id, name, email) values (${userId}, 'Deployment fixture', ${`${userId}@example.test`})`;
    const repeated = await runMigration(temp, { DATABASE_URL: raw });
    expect(repeated, repeated.output).toMatchObject({ code: 0 });
    expect(await client`select id from "user" where id = ${userId}`).toHaveLength(1);
    expect(await client`select * from drizzle.__drizzle_migrations`).toHaveLength(6);
  }, 30_000);

  it("runs the rate-limit upsert through the app db layer against real PostgreSQL", async () => {
    // postgres.js prepare:false cannot serialize raw Date params in sql`` fragments;
    // PGlite tolerated them, so this only fails against real PostgreSQL.
    process.env.DATABASE_URL = raw;
    delete process.env.DATABASE_MODE;
    const { takeRateLimit } = await import("@/lib/rate-limit");
    const key = `deploy-${randomUUID()}`;
    expect(await takeRateLimit(key, 2)).toBe(true);
    expect(await takeRateLimit(key, 2)).toBe(true);
    expect(await takeRateLimit(key, 2)).toBe(false);
  });

  it("rejects a second migration process while the direct connection lock is held", async () => {
    await client`select pg_advisory_lock(${MIGRATION_LOCK[0]}, ${MIGRATION_LOCK[1]})`;
    try {
      const blocked = await runMigration(temp, { DATABASE_URL: raw });
      expect(blocked.code).toBe(1);
      expect(blocked.output).toContain("Another Volo migration is running");
    } finally {
      await client`select pg_advisory_unlock(${MIGRATION_LOCK[0]}, ${MIGRATION_LOCK[1]})`;
    }
    const released = await runMigration(temp, { DATABASE_URL: raw });
    expect(released, released.output).toMatchObject({ code: 0 });
  }, 30_000);

  it("supports the existing Drizzle transactions, JSONB and BYTEA mapping", async () => {
    const db = drizzle(client, { schema });
    const interviewId = `interview-${randomUUID()}`;
    const responseId = `response-${randomUUID()}`;
    const turns = [{ role: "user" as const, text: "Job-relevant example", at: 123 }];
    await db.transaction(async (tx) => {
      await tx.insert(schema.interview).values({ id: interviewId, ownerId: userId, interviewerId: "preset-bob", name: "Deployment test", objective: "Check storage" });
      await tx.insert(schema.response).values({ id: responseId, interviewId, transcript: turns });
      await tx.insert(schema.recording).values({ responseId, mime: "audio/wav", data: Buffer.from("disposable-audio") });
    });
    expect((await db.select().from(schema.response).where(eq(schema.response.id, responseId)))[0].transcript).toEqual(turns);
    expect((await db.select().from(schema.recording).where(eq(schema.recording.responseId, responseId)))[0].data.toString()).toBe("disposable-audio");
  });
});
