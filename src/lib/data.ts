import "server-only";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { analyzeTranscript, generateInsights } from "@/lib/ai/tasks";
import { db } from "@/lib/db";
import { feedback, type Interview, interview, interviewer, invitation, response } from "@/lib/db/schema";
import { withUsage } from "@/lib/usage";
import { SILENCE_MARKER } from "@/lib/ai/prompts";

export async function listInterviews(userId: string) {
  return db
    .select({
      id: interview.id,
      name: interview.name,
      language: interview.language,
      durationMins: interview.durationMins,
      isActive: interview.isActive,
      themeColor: interview.themeColor,
      createdAt: interview.createdAt,
      interviewerName: interviewer.name,
      interviewerColor: interviewer.color,
      responses: sql<number>`(select count(*)::int from ${response} r where r.interview_id = ${interview.id} and r.status = 'completed')`,
      unviewed: sql<number>`(select count(*)::int from ${response} r where r.interview_id = ${interview.id} and r.status = 'completed' and not r.is_viewed)`,
      avgScore: sql<number | null>`(select round(avg((r.analytics->>'overallScore')::numeric))::int from ${response} r where r.interview_id = ${interview.id} and r.analytics is not null)`,
    })
    .from(interview)
    .innerJoin(interviewer, eq(interview.interviewerId, interviewer.id))
    .where(eq(interview.ownerId, userId))
    .orderBy(desc(interview.createdAt));
}

export async function getOwnedInterview(id: string, userId: string) {
  const [row] = await db
    .select()
    .from(interview)
    .where(and(eq(interview.id, id), eq(interview.ownerId, userId)));
  if (!row) notFound();
  return row;
}

export async function listInterviewers(userId: string) {
  return db
    .select()
    .from(interviewer)
    .where(or(isNull(interviewer.ownerId), eq(interviewer.ownerId, userId)))
    .orderBy(interviewer.createdAt);
}

export async function getInterviewer(id: string) {
  const [row] = await db.select().from(interviewer).where(eq(interviewer.id, id));
  return row;
}

/** An interviewer the user may use: a preset or one they own. */
export async function getUsableInterviewer(id: string, userId: string) {
  const row = await getInterviewer(id);
  if (!row || (row.ownerId && row.ownerId !== userId)) throw new Error("Interviewer not found");
  return row;
}

export async function listResponses(interviewId: string) {
  return db
    .select()
    .from(response)
    .where(and(eq(response.interviewId, interviewId), eq(response.status, "completed")))
    .orderBy(desc(response.createdAt));
}

export async function getOwnedResponse(id: string, userId: string) {
  const [row] = await db
    .select({ response, interview })
    .from(response)
    .innerJoin(interview, eq(response.interviewId, interview.id))
    .where(and(eq(response.id, id), eq(interview.ownerId, userId)));
  if (!row) notFound();
  return row;
}

/** Runs Claude analysis for a finished response. Safe to call repeatedly. */
export async function runAnalysis(responseId: string) {
  const [row] = await db
    .select({ response, interview })
    .from(response)
    .innerJoin(interview, eq(response.interviewId, interview.id))
    .where(eq(response.id, responseId));
  if (!row) return;
  const { response: r } = row;
  if (r.status !== "completed") return;
  const iv = { ...row.interview, ...r.interviewSnapshot };
  const startedAt = new Date();
  const [claimed] = await db.update(response).set({ analysisStatus: "running", analysisStartedAt: startedAt })
    .where(and(eq(response.id, r.id), eq(response.status, "completed"), or(
      eq(response.analysisStatus, "pending"), eq(response.analysisStatus, "failed"),
      and(eq(response.analysisStatus, "running"), lt(response.analysisStartedAt, new Date(Date.now() - 300_000))),
    ))).returning({ id: response.id });
  if (!claimed) return;
  const currentRun = and(eq(response.id, r.id), eq(response.analysisStartedAt, startedAt));

  if (!r.transcript.some((t) => t.role === "user" && t.text !== SILENCE_MARKER)) {
    await db.update(response).set({ analysisStatus: "done", analytics: null }).where(currentRun);
    return;
  }
  try {
    const persona = r.interviewSnapshot?.persona ?? await getInterviewer(iv.interviewerId);
    const analytics = await withUsage({ accountId: iv.ownerId, responseId: r.id, operation: "analysis" },
      () => analyzeTranscript(iv, r.transcript, persona?.name ?? "Interviewer"));
    await db.update(response).set({ analytics, analysisStatus: "done" }).where(currentRun);
  } catch (err) {
    console.error("[analysis] failed", { responseId: r.id, type: err instanceof Error ? err.name : "unknown" });
    await db.update(response).set({ analysisStatus: "failed" }).where(currentRun);
  }
}

/**
 * Completes calls whose tab was closed before /api/call/end arrived, so they still get analyzed.
 * Returns the ids that need analysis.
 */
export async function finalizeStale(iv: Interview) {
  const duration = sql`coalesce((${response.interviewSnapshot}->>'durationMins')::int, ${iv.durationMins})`;
  const rows = await db
    .update(response)
    .set({
      status: "completed",
      endedAt: new Date(),
      analysisStatus: "pending",
      analysisStartedAt: new Date(),
      durationSec: sql`least(extract(epoch from now() - ${response.createdAt})::int, ${duration} * 60)`,
    })
    .where(
      and(
        eq(response.interviewId, iv.id),
        eq(response.status, "in_progress"),
        lt(response.createdAt, sql`now() - ((${duration} + 15) * interval '1 minute')`),
      ),
    )
    .returning({ id: response.id, invitationId: response.invitationId });
  const inviteIds = rows.flatMap((r) => r.invitationId ? [r.invitationId] : []);
  if (inviteIds.length) await db.update(invitation).set({ status: "completed" })
    .where(and(inArray(invitation.id, inviteIds), isNull(invitation.revokedAt)));
  return rows.map((r) => r.id);
}

export async function interviewStats(interviewId: string) {
  const [s] = await db
    .select({
      started: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${response.status} = 'completed')::int`,
      avgDuration: sql<number | null>`round(avg(${response.durationSec}) filter (where ${response.status} = 'completed'))::int`,
      avgScore: sql<number | null>`round(avg((${response.analytics}->>'overallScore')::numeric))::int`,
      shortlisted: sql<number>`count(*) filter (where ${response.candidateStatus} = 'shortlisted')::int`,
    })
    .from(response)
    .where(eq(response.interviewId, interviewId));
  const [f] = await db
    .select({
      rating: sql<number | null>`round(avg(${feedback.satisfaction}), 1)::float`,
      count: sql<number>`count(*)::int`,
    })
    .from(feedback)
    .where(eq(feedback.interviewId, interviewId));
  return { ...s, rating: f.rating, ratingCount: f.count };
}

export async function refreshInsights(interviewId: string) {
  const [iv] = await db.select().from(interview).where(eq(interview.id, interviewId));
  const candidates = (await listResponses(interviewId))
    .filter((r) => r.analytics?.overallScore != null)
    .slice(0, 60);
  const rows = candidates
    .map((r) => ({
      summary: r.analytics!.callSummary,
      score: r.analytics!.overallScore!,
      recommendation: r.analytics!.recommendation,
    }));
  if (!iv || rows.length === 0) return;
  const insights = await withUsage({ accountId: iv.ownerId, operation: "insights" },
    () => generateInsights(iv, rows));
  await db.transaction(async (tx) => {
    // Deletion also clears this interview row. Lock it before checking sources so
    // a concurrently erased candidate cannot reappear in cached AI insights.
    const [current] = await tx.select().from(interview).where(eq(interview.id, interviewId)).for("update");
    if (!current || current.objective !== iv.objective) return;
    const remaining = await tx.select({ id: response.id }).from(response)
      .where(inArray(response.id, candidates.map((r) => r.id)));
    if (remaining.length !== candidates.length) return;
    await tx.update(interview).set({ insights, insightsUpdatedAt: new Date() }).where(eq(interview.id, interviewId));
  });
}
