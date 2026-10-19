import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { db, schema } from "@/lib/db";
import { isAdminUser, requireAdmin } from "@/lib/admin";
import { adminUsage } from "@/lib/admin-usage";

const identity = vi.hoisted(() => ({ id: "admin" as string | null }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => {
  if (!identity.id) throw new Error("SIGN_IN");
  return { id: identity.id };
} }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
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

beforeAll(async () => {
  await db.insert(schema.user).values([
    { id: "admin", name: "Admin", email: "admin@example.test" },
    { id: "recruiter", name: "Recruiter", email: "recruiter@example.test" },
  ]);
  await db.insert(schema.usageEvent).values([
    { id: "one", accountId: "admin", operation: "generate", model: "model", units: { inputTokens: 100 }, estimatedCostMicrousd: 1_000_000 },
    { id: "two", accountId: "recruiter", operation: "speak", model: "voice", units: { characters: 5 }, estimatedCostMicrousd: 200_000 },
    { id: "three", accountId: "recruiter", operation: "transcribe", model: "stt", units: { audioBytes: 50 } },
  ]);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); identity.id = "admin"; });
afterAll(async () => {
  const { client } = await import("@/lib/db") as unknown as { client: { close(): Promise<void> } };
  await client.close();
});

it("denies all access by default and only matches exact server-configured IDs", () => {
  vi.stubEnv("ADMIN_USER_IDS", "");
  expect(isAdminUser({ id: "admin" })).toBe(false);
  vi.stubEnv("ADMIN_USER_IDS", " admin, second, , ");
  expect(isAdminUser({ id: "admin" })).toBe(true);
  expect(isAdminUser({ id: "second" })).toBe(true);
  for (const id of ["adm", "ADMIN", "admin@example.test", "recruiter", "*"])
    expect(isAdminUser({ id })).toBe(false);
  expect(isAdminUser(null)).toBe(false);
  expect(isAdminUser({ id: "" })).toBe(false);
});

it("denies anonymous and recruiter requests before reading any ledger rows", async () => {
  vi.stubEnv("ADMIN_USER_IDS", "admin");
  const select = vi.spyOn(db, "select");
  identity.id = null;
  await expect(adminUsage()).rejects.toThrow("SIGN_IN");
  identity.id = "recruiter";
  await expect(adminUsage()).rejects.toThrow("NOT_FOUND");
  expect(select).not.toHaveBeenCalled();
});

it("checks permissions afresh rather than retaining a previously granted admin role", async () => {
  vi.stubEnv("ADMIN_USER_IDS", "admin");
  await expect(requireAdmin()).resolves.toEqual({ id: "admin" });
  vi.stubEnv("ADMIN_USER_IDS", "");
  await expect(adminUsage()).rejects.toThrow("NOT_FOUND");
});

it("shows platform-wide totals only to admins, keeping unpriced activity distinct", async () => {
  vi.stubEnv("ADMIN_USER_IDS", "admin");
  const { total, recent } = await adminUsage();
  expect(total).toEqual({ calls: 3, priced: 2, microusd: 1_200_000 });
  expect(new Set(recent.map((row) => row.accountId))).toEqual(new Set(["admin", "recruiter"]));
  expect(recent.find((row) => row.id === "three")?.estimatedCostMicrousd).toBeNull();
  expect(recent.every((row) => !("responseId" in row))).toBe(true);
});

it("bounds recent activity to 100 rows without truncating all-time totals", async () => {
  vi.stubEnv("ADMIN_USER_IDS", "admin");
  await db.insert(schema.usageEvent).values(Array.from({ length: 105 }, (_, i) => ({
    id: `bounded-${i}`, accountId: "recruiter", operation: "generate", model: "model", units: {},
    createdAt: new Date(Date.UTC(2030, 0, 1, 0, 0, i)),
  })));
  const { total, recent } = await adminUsage();
  expect(total.calls).toBe(108);
  expect(recent).toHaveLength(100);
  expect(recent[0].id).toBe("bounded-104");
  expect(recent.at(-1)?.id).toBe("bounded-5");
});
