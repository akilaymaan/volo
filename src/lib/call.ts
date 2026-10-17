import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { interview, interviewer, invitation, response, type TranscriptTurn } from "@/lib/db/schema";
import { readSessionCookie, validToken } from "@/lib/security";

export async function loadCall(responseId: string, req: Request) {
  if (!responseId || responseId.length > 64) return null;
  const [row] = await db
    .select({ response, interview, interviewer })
    .from(response)
    .innerJoin(interview, eq(response.interviewId, interview.id))
    .innerJoin(interviewer, eq(interview.interviewerId, interviewer.id))
    .where(eq(response.id, responseId));
  if (!row || !validToken(readSessionCookie(req, responseId), row.response.sessionHash, row.response.sessionExpiresAt))
    return null;
  if (row.response.invitationId) {
    const [inv] = await db.select({ revokedAt: invitation.revokedAt }).from(invitation)
      .where(eq(invitation.id, row.response.invitationId));
    if (!inv || inv.revokedAt) return null;
  }
  return {
    ...row, interview: { ...row.interview, ...row.response.interviewSnapshot },
    interviewer: { ...row.interviewer, ...row.response.interviewSnapshot?.persona },
  };
}

/** Seconds since the call started, measured on the server (clients can't stretch it). */
export const serverElapsed = (startedAt: Date) =>
  Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 1000));

/**
 * Appends turns only if the transcript still has `expectedLen` entries and the call is live,
 * so retried or overlapping requests can never write a turn twice. Returns false if nothing was written.
 */
export async function appendTurns(responseId: string, turns: TranscriptTurn[], expectedLen: number, end: boolean, lease: Date) {
  const rows = await db
    .update(response)
    .set({ transcript: sql`${response.transcript} || ${JSON.stringify(turns)}::jsonb`, lastReplyEnd: end })
    .where(
      and(
        eq(response.id, responseId),
        eq(response.status, "in_progress"),
        eq(response.turnLeaseUntil, lease),
        sql`jsonb_array_length(${response.transcript}) = ${expectedLen}`,
      ),
    )
    .returning({ id: response.id });
  return rows.length > 0;
}

export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });
