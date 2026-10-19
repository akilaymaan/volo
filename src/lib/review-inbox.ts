import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { interview, response } from "@/lib/db/schema";
import { PublicError } from "@/lib/errors";
import { analysisState } from "@/lib/format";
import { takeRateLimit } from "@/lib/rate-limit";
import { INBOX_PAGE_SIZE, parseInboxFilters } from "@/lib/review-inbox-filters";

function failedAnalysis(now: Date) {
  return or(eq(response.analysisStatus, "failed"), and(inArray(response.analysisStatus, ["pending", "running"]),
    or(isNull(response.analysisStartedAt), lte(response.analysisStartedAt, new Date(now.getTime() - 300_000)))))!;
}

export async function inboxInterviews(ownerId: string) {
  return db.select({ id: interview.id, name: interview.name }).from(interview)
    .where(eq(interview.ownerId, ownerId)).orderBy(asc(interview.name), asc(interview.id));
}

/** Read-only owner-scoped projection. Never loads audio, transcripts, analytics or credentials. */
export async function getReviewInbox(ownerId: string, raw: unknown) {
  const filters = parseInboxFilters(raw);
  const now = new Date();
  const failed = failedAnalysis(now);
  const unopened = eq(response.isViewed, false);
  const decision = eq(response.candidateStatus, "none");
  const missing = eq(response.hasRecording, false);
  const attention = or(unopened, decision, failed, missing)!;
  const category = { attention, unopened, decision, failed, recording: missing }[filters.category];
  const base = and(eq(interview.ownerId, ownerId), eq(response.status, "completed"),
    filters.interviewId ? eq(interview.id, filters.interviewId) : undefined,
    filters.candidateStatus !== "all" ? eq(response.candidateStatus, filters.candidateStatus) : undefined,
    filters.from ? gte(response.createdAt, new Date(`${filters.from}T00:00:00Z`)) : undefined,
    filters.to ? lt(response.createdAt, new Date(Date.parse(`${filters.to}T00:00:00Z`) + 86_400_000)) : undefined);
  const [counts] = await db.select({
    attention: sql<number>`count(*) filter (where ${attention})::int`,
    unopened: sql<number>`count(*) filter (where ${unopened})::int`,
    decision: sql<number>`count(*) filter (where ${decision})::int`,
    failed: sql<number>`count(*) filter (where ${failed})::int`,
    recording: sql<number>`count(*) filter (where ${missing})::int`,
    matching: sql<number>`count(*) filter (where ${category})::int`,
    processing: sql<number>`count(*) filter (where ${inArray(response.analysisStatus, ["pending", "running"])} and not (${failed}))::int`,
  }).from(response).innerJoin(interview, eq(response.interviewId, interview.id)).where(base);
  const rows = await db.select({
    id: response.id, interviewId: interview.id, interviewName: interview.name,
    name: response.name, email: response.email, createdAt: response.createdAt,
    candidateStatus: response.candidateStatus, isViewed: response.isViewed,
    analysisStatus: response.analysisStatus, analysisStartedAt: response.analysisStartedAt,
    hasRecording: response.hasRecording,
  }).from(response).innerJoin(interview, eq(response.interviewId, interview.id))
    .where(and(base, category)).orderBy(desc(response.createdAt), desc(response.id))
    .limit(INBOX_PAGE_SIZE + 1).offset((filters.page - 1) * INBOX_PAGE_SIZE);
  return { filters, counts, rows: rows.slice(0, INBOX_PAGE_SIZE).map((row) => ({ ...row,
    analysisState: analysisState(row, now.getTime()), recordingPending: now.getTime() - row.createdAt.getTime() < 3 * 60 * 60_000,
  })), hasNext: rows.length > INBOX_PAGE_SIZE };
}

/** Explicit paid-operation queueing, protected against stale or concurrent inbox clicks. */
export async function queueInboxAnalysis(ownerId: string, responseId: string) {
  const [owned] = await db.select({
    id: response.id, interviewId: response.interviewId, status: response.status,
    analysisStatus: response.analysisStatus, analysisStartedAt: response.analysisStartedAt,
  }).from(response).innerJoin(interview, eq(response.interviewId, interview.id))
    .where(and(eq(interview.ownerId, ownerId), eq(response.id, responseId)));
  if (!owned) throw new PublicError("Response not found or unavailable.");
  if (owned.status !== "completed" || analysisState(owned) !== "failed")
    throw new PublicError("Only failed or stalled completed analyses can be retried. Refresh the inbox.");
  if (!(await takeRateLimit(`analysis:${ownerId}`, 30))) throw new PublicError("Analysis limit reached. Please wait ten minutes.");
  const [queued] = await db.update(response).set({ analysisStatus: "pending", analysisStartedAt: new Date() })
    .where(and(eq(response.id, responseId), eq(response.status, "completed"), failedAnalysis(new Date()),
      inArray(response.interviewId, db.select({ id: interview.id }).from(interview).where(eq(interview.ownerId, ownerId)))))
    .returning({ interviewId: response.interviewId });
  if (!queued) throw new PublicError("Analysis state changed. Refresh the inbox before retrying.");
  return queued;
}
