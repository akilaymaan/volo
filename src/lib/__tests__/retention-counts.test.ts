import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { db, schema } from "@/lib/db";
import { accountRetentionCounts, expireAccountData } from "@/lib/retention";

vi.mock("@/lib/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const schema = await import("@/lib/db/schema");
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return { db, schema, client };
});

const now = new Date("2026-10-20T12:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  await db.insert(schema.user).values([
    { id: "a", name: "A", email: "a@example.test" },
    { id: "b", name: "B", email: "b@example.test" },
  ]);
  const [persona] = await db.select().from(schema.interviewer).limit(1);
  await db.insert(schema.interview).values([
    { id: "short", ownerId: "a", interviewerId: persona.id, name: "Short", objective: "Skills", retentionDays: 7 },
    { id: "long", ownerId: "a", interviewerId: persona.id, name: "Long", objective: "Skills", retentionDays: 30 },
    { id: "foreign", ownerId: "b", interviewerId: persona.id, name: "Foreign", objective: "Skills", retentionDays: 7 },
  ]);
  await db.insert(schema.response).values([
    { id: "past", interviewId: "short", deleteAfter: daysAgo(1) },
    { id: "boundary", interviewId: "long", deleteAfter: now },
    { id: "future", interviewId: "short", deleteAfter: daysAgo(-1) },
    { id: "legacy", interviewId: "short", deleteAfter: null },
    { id: "foreign", interviewId: "foreign", deleteAfter: daysAgo(1) },
  ]);
  await db.insert(schema.invitation).values([
    { id: "expired-short", interviewId: "short", email: "one@example.test", expiresAt: daysAgo(8) },
    { id: "boundary", interviewId: "short", email: "two@example.test", expiresAt: daysAgo(7) },
    { id: "retained-long", interviewId: "long", email: "three@example.test", expiresAt: daysAgo(8) },
    { id: "expired-long", interviewId: "long", email: "four@example.test", expiresAt: daysAgo(31) },
    { id: "foreign", interviewId: "foreign", email: "five@example.test", expiresAt: daysAgo(31) },
  ]);
});
afterAll(async () => {
  vi.useRealTimers();
  const { client } = await import("@/lib/db") as unknown as { client: { close(): Promise<void> } };
  await client.close();
});

it("counts only the owner's due data using each interview's retention and exact date boundaries", async () => {
  expect(await accountRetentionCounts("a")).toEqual({ responses: 2, invitations: 2, applied: false });
  expect(await accountRetentionCounts("b")).toEqual({ responses: 1, invitations: 1, applied: false });
  expect(await accountRetentionCounts("missing")).toEqual({ responses: 0, invitations: 0, applied: false });
});

it("the default dry run returns counts without changing any records", async () => {
  expect(await expireAccountData("a")).toEqual({ responses: 2, invitations: 2, applied: false });
  expect(await db.select().from(schema.response)).toHaveLength(5);
  expect(await db.select().from(schema.invitation)).toHaveLength(5);
});
