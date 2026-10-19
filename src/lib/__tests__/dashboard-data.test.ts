import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { db, schema } from "@/lib/db";
import { dashboardAnalytics } from "@/lib/dashboard-data";
import { dashboardMonths, parseDashboardFilters } from "@/lib/dashboard-filters";
import type { Analytics } from "@/lib/db/schema";

vi.mock("@/lib/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const schema = await import("@/lib/db/schema");
  const client = new PGlite(); const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return { db, schema, client };
});

const range = { from: "2026-01-01", to: "2026-02-28" };
beforeAll(async () => {
  await db.insert(schema.user).values([
    { id: "owner", name: "Owner", email: "owner@example.test" },
    { id: "other", name: "Other", email: "other@example.test" },
  ]);
  await db.insert(schema.interview).values([
    { id: "role", name: "React Engineer", objective: "Skills", ownerId: "owner", interviewerId: "preset-bob" },
    { id: "paused", name: "Designer", objective: "Skills", ownerId: "owner", interviewerId: "preset-bob", isActive: false },
    { id: "foreign", name: "Private role", objective: "Private", ownerId: "other", interviewerId: "preset-bob" },
  ]);
  const base = { interviewId: "role", status: "completed" as const, analysisStatus: "done" as const, durationSec: 60 };
  await db.insert(schema.response).values([
    { ...base, id: "a", candidateStatus: "shortlisted", analytics: { overallScore: 80 } as Analytics, createdAt: new Date("2026-01-01T00:00:00Z") },
    { ...base, id: "b", durationSec: 120, createdAt: new Date("2026-02-28T23:59:59.999Z") },
    { ...base, id: "c", createdAt: new Date("2026-03-01T00:00:00Z") },
    { ...base, id: "d", status: "in_progress", analytics: { overallScore: 100 } as Analytics, createdAt: new Date("2026-01-02T00:00:00Z") },
    { ...base, id: "e", candidateStatus: "maybe", analysisStatus: "failed", durationSec: 180, analytics: { overallScore: 99 } as Analytics, createdAt: new Date("2026-02-01T00:00:00Z") },
    { ...base, id: "p", interviewId: "paused", candidateStatus: "rejected", durationSec: 240, analytics: { overallScore: 60 } as Analytics, createdAt: new Date("2026-01-15T00:00:00Z") },
    { ...base, id: "f", interviewId: "foreign", analytics: { overallScore: 100 } as Analytics, createdAt: new Date("2026-01-15T00:00:00Z") },
    { ...base, id: "before", createdAt: new Date("2025-12-31T23:59:59.999Z") },
  ]);
});
afterAll(async () => {
  const { client } = await import("@/lib/db") as unknown as { client: { close(): Promise<void> } };
  await client.close();
});

it("aggregates only owned responses within inclusive UTC dates and keeps human decisions separate", async () => {
  const result = await dashboardAnalytics("owner", range);
  expect(result.totals).toEqual({ started: 5, completed: 4, avgDuration: 150, avgScore: 70, none: 1, shortlisted: 1, maybe: 1, rejected: 1 });
  expect(result.months).toEqual([{ month: "2026-01", count: 2 }, { month: "2026-02", count: 2 }]);
  expect((await dashboardAnalytics("other", range)).totals.completed).toBe(1);
});

it("applies live/paused and literal case-insensitive name filters to all analytics", async () => {
  const live = await dashboardAnalytics("owner", { ...range, q: "rEaCt", status: "live" });
  expect(live.totals).toMatchObject({ started: 4, completed: 3, avgScore: 80, avgDuration: 120 });
  expect((await dashboardAnalytics("owner", { ...range, status: "paused" })).totals).toMatchObject({ completed: 1, avgScore: 60 });
  for (const q of ["%", "_", "\\", "Private role", "' OR 1=1 --"])
    expect((await dashboardAnalytics("owner", { ...range, q })).totals.started).toBe(0);
});

it("zero-fills absent months with actual zero counts and leaves unavailable averages null", async () => {
  const empty = await dashboardAnalytics("missing-owner", range);
  expect(empty.totals).toMatchObject({ started: 0, completed: 0, avgDuration: null, avgScore: null });
  expect(empty.months).toEqual([{ month: "2026-01", count: 0 }, { month: "2026-02", count: 0 }]);
});

it("does not load candidate payloads or mutate response state during analytics reads", async () => {
  const before = await db.select().from(schema.response);
  const result = await dashboardAnalytics("owner", range);
  expect(await db.select().from(schema.response)).toEqual(before);
  for (const key of ["transcript", "email", "name", "sessionHash", "analytics", "recording"])
    expect(JSON.stringify(result)).not.toContain(`"${key}":`);
});

it("validates ranges, repeated parameters, bounded search and status without falling back to broad queries", async () => {
  for (const filters of [
    { from: "2026-02-30" }, { from: "2026-02-01", to: "2026-01-01" },
    { from: "2020-01-01", to: "2026-01-01" }, { from: ["2026-01-01"] },
    { q: ["React", "Private"] }, { q: "x".repeat(101) }, { status: "unknown" }, { status: ["live", "paused"] },
  ]) await expect(dashboardAnalytics("owner", filters)).rejects.toThrow("Invalid dashboard filters");
});

it("defaults to twelve UTC calendar months through today and supports leap dates and one-month ranges", () => {
  expect(parseDashboardFilters({}, new Date("2026-10-20T12:00:00Z"))).toEqual({ from: "2025-11-01", to: "2026-10-20", q: "", status: "all" });
  expect(parseDashboardFilters({ from: "2024-02-29", to: "2024-02-29" }).from).toBe("2024-02-29");
  expect(dashboardMonths("2024-12-31", "2025-02-01")).toEqual(["2024-12", "2025-01", "2025-02"]);
  expect(dashboardMonths("2026-01-02", "2026-01-02")).toEqual(["2026-01"]);
});
