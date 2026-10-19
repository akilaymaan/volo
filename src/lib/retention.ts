import "server-only";
import { and, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { interview, invitation, response, user } from "@/lib/db/schema";

/** One round-trip, bounded result: the privacy page must not load every expired identity. */
export async function accountRetentionCounts(accountId: string) {
  const now = new Date().toISOString();
  const [counts] = await db.select({
    responses: sql<number>`(select count(*)::int from ${response} r inner join ${interview} i on r.interview_id = i.id
      where i.owner_id = ${accountId} and r.delete_after <= ${now}::timestamptz)`,
    invitations: sql<number>`(select count(*)::int from ${invitation} v inner join ${interview} i on v.interview_id = i.id
      where i.owner_id = ${accountId} and v.expires_at < ${now}::timestamptz - (i.retention_days * interval '1 day'))`,
  }).from(user).where(eq(user.id, accountId));
  return { responses: counts?.responses ?? 0, invitations: counts?.invitations ?? 0, applied: false as const };
}

/** Owner scope is required, including for scheduled maintenance. Legacy null dates are untouched. */
export async function expireAccountData(accountId: string, apply = false) {
  if (!apply) return accountRetentionCounts(accountId);
  const now = new Date();
  const due = await db.select({ id: response.id, interviewId: response.interviewId, email: response.email })
    .from(response).innerJoin(interview, eq(response.interviewId, interview.id))
    .where(and(eq(interview.ownerId, accountId), lte(response.deleteAfter, now)));
  const oldInvites = await db.select({ id: invitation.id }).from(invitation)
    .innerJoin(interview, eq(invitation.interviewId, interview.id))
    .where(and(eq(interview.ownerId, accountId),
      lt(invitation.expiresAt, sql`${now.toISOString()}::timestamptz - (${interview.retentionDays} * interval '1 day')`)));
  await db.transaction(async (tx) => {
    if (due.length) {
      await tx.delete(response).where(inArray(response.id, due.map((r) => r.id)));
      // Also remove the email/link record for every erased response.
      for (const r of due) if (r.email) await tx.delete(invitation)
        .where(and(eq(invitation.interviewId, r.interviewId), eq(invitation.email, r.email)));
      await tx.update(interview).set({ insights: [], insightsUpdatedAt: null })
        .where(inArray(interview.id, [...new Set(due.map((r) => r.interviewId))]));
    }
    if (oldInvites.length) await tx.delete(invitation).where(inArray(invitation.id, oldInvites.map((r) => r.id)));
  });
  return { responses: due.length, invitations: oldInvites.length, applied: true };
}
