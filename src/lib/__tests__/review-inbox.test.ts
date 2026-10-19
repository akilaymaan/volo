import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getReviewInbox, inboxInterviews } from "@/lib/review-inbox";
import { inboxHref, parseInboxFilters } from "@/lib/review-inbox-filters";
import { retryInboxAnalysisAction } from "@/app/actions";
import { requireUser } from "@/lib/auth";
import { tokenHash } from "@/lib/security";

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
vi.mock("next/server", () => ({ after: vi.fn() }));

const now = new Date("2026-10-20T12:00:00Z");
const recent = new Date(now.getTime() - 30_000);
const old = new Date(now.getTime() - 300_000);
const ids = async (filters = {}, owner = "owner") => (await getReviewInbox(owner, filters)).rows.map((r) => r.id);

beforeAll(async () => {
  await db.insert(schema.user).values([
    { id: "owner", name: "Owner", email: "owner@example.test" },
    { id: "other", name: "Other", email: "other@example.test" },
  ]);
  await db.insert(schema.interview).values([
    { id: "role", name: "Engineer", objective: "Skills", ownerId: "owner", interviewerId: "preset-bob" },
    { id: "paused", name: "Paused role", objective: "Skills", ownerId: "owner", interviewerId: "preset-bob", isActive: false },
    { id: "foreign-role", name: "Private role", objective: "Private", ownerId: "other", interviewerId: "preset-bob" },
  ]);
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  vi.mocked(requireUser).mockReset().mockResolvedValue({ id: "owner" } as Awaited<ReturnType<typeof requireUser>>);
  vi.mocked(after).mockClear(); vi.mocked(revalidatePath).mockClear();
  await db.delete(schema.response); await db.delete(schema.rateLimit);
  const base = { interviewId: "role", status: "completed" as const, candidateStatus: "shortlisted" as const,
    isViewed: true, hasRecording: true, analysisStatus: "done" as const, createdAt: new Date("2026-10-19T12:00:00Z") };
  await db.insert(schema.response).values([
    { ...base, id: "unopened", isViewed: false },
    { ...base, id: "decision", candidateStatus: "none" },
    { ...base, id: "failed", analysisStatus: "failed" },
    { ...base, id: "stalled", analysisStatus: "running", analysisStartedAt: old },
    { ...base, id: "stale-pending", analysisStatus: "pending", analysisStartedAt: null },
    { ...base, id: "processing", analysisStatus: "running", analysisStartedAt: recent, isViewed: false },
    { ...base, id: "pending", analysisStatus: "pending", analysisStartedAt: recent, isViewed: false },
    { ...base, id: "missing", hasRecording: false },
    { ...base, id: "resolved" },
    { ...base, id: "live", status: "in_progress", isViewed: false },
    { ...base, id: "paused-item", interviewId: "paused", candidateStatus: "none" },
    { ...base, id: "foreign", interviewId: "foreign-role", isViewed: false, hasRecording: false, analysisStatus: "failed" },
  ]);
});

afterAll(async () => {
  const { client } = await import("@/lib/db") as unknown as { client: { close(): Promise<void> } };
  await client.close(); vi.useRealTimers();
});

it("lists completed attention items across owned active/paused interviews without returning private payloads", async () => {
  const result = await getReviewInbox("owner", {});
  expect(result.rows.map((r) => r.id)).toHaveLength(9);
  for (const excluded of ["live", "foreign", "resolved"]) expect(result.rows.map((r) => r.id)).not.toContain(excluded);
  expect(result.counts).toEqual({ attention: 9, unopened: 3, decision: 2, failed: 3, recording: 1, matching: 9, processing: 2 });
  expect(await inboxInterviews("owner")).toEqual([{ id: "role", name: "Engineer" }, { id: "paused", name: "Paused role" }]);
  for (const row of result.rows) for (const key of ["transcript", "analytics", "sessionHash", "sessionExpiresAt", "data", "invitationId"])
    expect(row).not.toHaveProperty(key);
});

it("does not mark reports viewed, queue analysis or change any response by reading or filtering", async () => {
  const before = await db.select().from(schema.response);
  await getReviewInbox("owner", {}); await getReviewInbox("owner", { category: "failed" });
  expect(await db.select().from(schema.response)).toEqual(before);
  expect(after).not.toHaveBeenCalled();
  expect(await db.select().from(schema.rateLimit)).toEqual([]);
});

it("scopes every facet, result and interview option to the account even with a foreign interview ID", async () => {
  expect(await ids({ interviewId: "foreign-role" })).toEqual([]);
  const result = await getReviewInbox("other", {});
  expect(result.rows.map((r) => r.id)).toEqual(["foreign"]);
  expect(result.counts).toMatchObject({ attention: 1, unopened: 1, failed: 1, recording: 1 });
  expect(await inboxInterviews("other")).toEqual([{ id: "foreign-role", name: "Private role" }]);
  expect(await ids({ ownerId: "other" })).not.toContain("foreign");
});

it("distinguishes failed/stale analysis, unopened reports, decision needs and missing recordings", async () => {
  expect(await ids({ category: "failed" })).toEqual(["stalled", "stale-pending", "failed"]);
  expect(await ids({ category: "unopened" })).toEqual(["unopened", "processing", "pending"]);
  expect(await ids({ category: "decision" })).toEqual(["paused-item", "decision"]);
  expect(await ids({ category: "recording" })).toEqual(["missing"]);
  expect(await ids({ category: "failed", candidateStatus: "none" })).toEqual([]);
  expect(await ids({ interviewId: "paused", candidateStatus: "none" })).toEqual(["paused-item"]);
});

it("filters UTC start dates with an inclusive through date and preserves filters in page links", async () => {
  await db.update(schema.response).set({ createdAt: new Date("2026-10-20T00:00:00Z") }).where(eq(schema.response.id, "unopened"));
  expect(await ids({ from: "2026-10-19", to: "2026-10-19", category: "unopened" })).toEqual(["processing", "pending"]);
  expect(await ids({ from: "2026-10-20", to: "2026-10-20" })).toEqual(["unopened"]);
  const filters = parseInboxFilters({ category: "failed", interviewId: "role", candidateStatus: "shortlisted", from: "2026-10-19", to: "2026-10-20" });
  const url = new URL(inboxHref(filters, { page: 2 }), "https://example.test");
  expect(parseInboxFilters(Object.fromEntries(url.searchParams))).toEqual({ ...filters, page: 2 });
});

it("validates untrusted and duplicated filter fields without broadening the query", async () => {
  for (const invalid of [{ category: "all" }, { category: ["failed", "unopened"] }, { interviewId: "' OR 1=1" }, { candidateStatus: "hired" },
    { from: "2026-02-30" }, { from: "2026-10-20", to: "2026-10-19" }, { page: 0 }, { page: "1001" }, { page: ["2"] }, { page: true }])
    await expect(getReviewInbox("owner", invalid)).rejects.toThrow("Invalid inbox filters");
});

it("uses bounded stable pagination without dropping equal-timestamp records", async () => {
  await db.delete(schema.response);
  await db.insert(schema.response).values(Array.from({ length: 31 }, (_, i) => ({ id: `page-${String(i).padStart(2, "0")}`, interviewId: "role", status: "completed" as const, createdAt: recent })));
  const first = await getReviewInbox("owner", {});
  const second = await getReviewInbox("owner", { page: 2 });
  expect(first.rows).toHaveLength(25); expect(first.hasNext).toBe(true);
  expect(second.rows).toHaveLength(6); expect(second.hasNext).toBe(false);
  expect(first.counts.matching).toBe(31);
  expect(new Set([...first.rows, ...second.rows].map((r) => r.id)).size).toBe(31);
  expect((await getReviewInbox("owner", { page: 3 })).rows).toEqual([]);
});

it("queues only an explicit failed-analysis retry and refreshes inbox/report data", async () => {
  expect(await retryInboxAnalysisAction("failed")).toEqual({ ok: true });
  expect(after).toHaveBeenCalledTimes(1);
  const [r] = await db.select().from(schema.response).where(eq(schema.response.id, "failed"));
  expect(r).toMatchObject({ analysisStatus: "pending", candidateStatus: "shortlisted", isViewed: true, hasRecording: true });
  expect(revalidatePath).toHaveBeenCalledWith("/dashboard/inbox");
  expect(revalidatePath).toHaveBeenCalledWith("/dashboard/interviews/role", "layout");
  expect((await retryInboxAnalysisAction("failed")).ok).toBe(false);
  expect(after).toHaveBeenCalledTimes(1);
});

it.each(["stalled", "stale-pending"])("permits recovery of %s analysis", async (id) => {
  expect((await retryInboxAnalysisAction(id)).ok).toBe(true);
  expect(after).toHaveBeenCalledTimes(1);
});

it("rejects fresh pending/running, completed analysis, live calls, bad IDs and foreign responses", async () => {
  for (const id of ["pending", "processing", "resolved", "live", "foreign", "missing-id", "../bad"])
    expect((await retryInboxAnalysisAction(id)).ok).toBe(false);
  expect(after).not.toHaveBeenCalled();
  expect(await db.select().from(schema.rateLimit)).toEqual([]);
});

it("authenticates retry actions and enforces the existing per-account rate limit", async () => {
  vi.mocked(requireUser).mockRejectedValueOnce(new Error("Not signed in"));
  expect((await retryInboxAnalysisAction("failed")).ok).toBe(false);
  await db.insert(schema.rateLimit).values({ key: tokenHash("analysis:owner"), count: 30, windowStart: now });
  expect(await retryInboxAnalysisAction("failed")).toMatchObject({ ok: false, error: expect.stringContaining("limit reached") });
  expect(after).not.toHaveBeenCalled();
});

it("concurrent retry actions cannot queue duplicate work", async () => {
  const results = await Promise.all([retryInboxAnalysisAction("failed"), retryInboxAnalysisAction("failed")]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(after).toHaveBeenCalledTimes(1);
});

it("completed queued work leaves the failure inbox without changing a human decision", async () => {
  expect((await retryInboxAnalysisAction("failed")).ok).toBe(true);
  const task = vi.mocked(after).mock.calls[0][0] as () => Promise<unknown>;
  await task(); // Empty transcript is finalized without a provider call.
  const [saved] = await db.select().from(schema.response).where(eq(schema.response.id, "failed"));
  expect(saved).toMatchObject({ analysisStatus: "done", candidateStatus: "shortlisted", isViewed: true, hasRecording: true });
  expect(await ids({ category: "failed" })).not.toContain("failed");
  expect(await ids()).not.toContain("failed");
});
