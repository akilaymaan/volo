import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { bulkReviewCandidates } from "@/lib/bulk-review";
import { bulkReviewCandidatesAction } from "@/app/actions";
import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

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
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const candidates = [{ id: "one", status: "none" }, { id: "two", status: "maybe" }];
const input = (patch: Record<string, unknown> = {}) => ({ interviewId: "role", candidates, status: "shortlisted", ...patch });
const statuses = async () => Object.fromEntries((await db.select().from(schema.response)).map((r) => [r.id, r.candidateStatus]));

beforeAll(async () => {
  await db.insert(schema.user).values([
    { id: "owner", name: "Owner", email: "owner@example.test" },
    { id: "other", name: "Other", email: "other@example.test" },
  ]);
  await db.insert(schema.interview).values([
    { id: "role", ownerId: "owner", interviewerId: "preset-bob", name: "Engineer", objective: "Skills" },
    { id: "other-role", ownerId: "other", interviewerId: "preset-bob", name: "Other", objective: "Skills" },
  ]);
});

beforeEach(async () => {
  vi.mocked(requireUser).mockReset().mockResolvedValue({ id: "owner" } as Awaited<ReturnType<typeof requireUser>>);
  vi.mocked(revalidatePath).mockClear();
  await db.delete(schema.response);
  await db.insert(schema.response).values([
    { id: "one", interviewId: "role", status: "completed", transcript: [{ role: "user", text: "Answer", at: 100 }] },
    { id: "two", interviewId: "role", status: "completed", candidateStatus: "maybe", analysisStatus: "failed" },
    { id: "ongoing", interviewId: "role", status: "in_progress" },
    { id: "foreign", interviewId: "other-role", status: "completed" },
  ]);
});

afterAll(async () => {
  const { client } = await import("@/lib/db") as unknown as { client: { close(): Promise<void> } };
  await client.close();
});

it("updates only the selected review statuses and revalidates reports", async () => {
  const before = await db.select().from(schema.response).orderBy(schema.response.id);
  expect(await bulkReviewCandidatesAction(input())).toEqual({ ok: true, count: 2 });
  const after = await db.select().from(schema.response).orderBy(schema.response.id);
  expect(after).toEqual(before.map((r) => ["one", "two"].includes(r.id) ? { ...r, candidateStatus: "shortlisted" } : r));
  expect(revalidatePath).toHaveBeenCalledWith("/dashboard/interviews/role", "layout");
  expect(await db.select().from(schema.invitation)).toEqual([]);
  expect(await db.select().from(schema.usageEvent)).toEqual([]);
});

it.each(["none", "shortlisted", "maybe", "rejected"])("supports the manual %s status", async (status) => {
  await bulkReviewCandidates("owner", input({ status }));
  expect(await statuses()).toMatchObject({ one: status, two: status, foreign: "none", ongoing: "none" });
});

it("requires authentication and ownership at the action boundary", async () => {
  vi.mocked(requireUser).mockRejectedValueOnce(new Error("Not signed in"));
  expect((await bulkReviewCandidatesAction(input())).ok).toBe(false);
  vi.mocked(requireUser).mockResolvedValue({ id: "other" } as Awaited<ReturnType<typeof requireUser>>);
  expect(await bulkReviewCandidatesAction(input())).toMatchObject({ ok: false, error: "Interview not found or unavailable." });
  expect(await statuses()).toMatchObject({ one: "none", two: "maybe" });
  expect(revalidatePath).not.toHaveBeenCalled();
});

it.each(["foreign", "missing", "ongoing"])("rejects a mixed batch containing %s without partial changes", async (id) => {
  await expect(bulkReviewCandidates("owner", input({ candidates: [candidates[0], { id, status: "none" }] }))).rejects.toThrow("No statuses were changed");
  expect(await statuses()).toMatchObject({ one: "none", two: "maybe", foreign: "none", ongoing: "none" });
});

it("protects newer decisions from stale selections and rolls back the entire batch", async () => {
  await db.update(schema.response).set({ candidateStatus: "rejected" }).where(eq(schema.response.id, "two"));
  expect(await bulkReviewCandidatesAction(input())).toMatchObject({ ok: false, error: expect.stringContaining("statuses changed") });
  expect(await statuses()).toMatchObject({ one: "none", two: "rejected" });
  expect(revalidatePath).not.toHaveBeenCalled();
});

it("allows only one conflicting batch from the same expected statuses to succeed", async () => {
  const results = await Promise.allSettled([
    bulkReviewCandidates("owner", input({ status: "shortlisted" })),
    bulkReviewCandidates("owner", input({ status: "rejected" })),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  const saved = await statuses();
  expect(saved.one).toBe(saved.two);
  expect(["shortlisted", "rejected"]).toContain(saved.one);
});

it("rejects malformed, oversized and duplicate selections", async () => {
  for (const patch of [
    { candidates: [] }, { candidates: [candidates[0], candidates[0]] },
    { candidates: Array.from({ length: 101 }, (_, i) => ({ id: String(i), status: "none" })) },
    { candidates: [{ id: "one", status: "hired" }] }, { candidates: [{ id: "one" }] },
    { status: "hired" }, { interviewId: "" },
  ]) expect((await bulkReviewCandidatesAction(input(patch))).ok).toBe(false);
  expect(await statuses()).toMatchObject({ one: "none", two: "maybe" });
});

it("accepts a bounded batch of exactly 100 candidates", async () => {
  const extra = Array.from({ length: 98 }, (_, i) => ({ id: `batch-${i}`, interviewId: "role", status: "completed" as const }));
  await db.insert(schema.response).values(extra);
  const result = await bulkReviewCandidates("owner", input({ candidates: [...candidates, ...extra.map((r) => ({ id: r.id, status: "none" }))] }));
  expect(result.count).toBe(100);
  expect(Object.values(await statuses()).filter((s) => s === "shortlisted")).toHaveLength(100);
});
