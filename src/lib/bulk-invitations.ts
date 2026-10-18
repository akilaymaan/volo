import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { candidateAttempt, invitation } from "@/lib/db/schema";
import { getOwnedInterview } from "@/lib/data";
import { PublicError } from "@/lib/errors";
import { parseInvitationCsv, reminderBlockReason, type ImportMode } from "@/lib/invitation-import";

/** Read-only eligibility preview; every send rechecks these rules on the server. */
export async function previewInvitationImport(ownerId: string, interviewId: string, csv: string, mode: ImportMode) {
  const iv = await getOwnedInterview(interviewId, ownerId);
  if (!iv.isActive) throw new PublicError("Enable the interview before sending invitations.");
  if (iv.isAnonymous) throw new PublicError("Email invitations require named candidate intake.");
  const rows = parseInvitationCsv(csv);
  const emails = rows.filter((r) => r.status === "ready").map((r) => r.email);
  if (!emails.length) return rows;
  const [invites, attempts] = await Promise.all([
    db.select().from(invitation).where(and(eq(invitation.interviewId, interviewId), inArray(invitation.email, emails))),
    db.select({ email: candidateAttempt.email }).from(candidateAttempt)
      .where(and(eq(candidateAttempt.interviewId, interviewId), inArray(candidateAttempt.email, emails))),
  ]);
  const byEmail = new Map(invites.map((i) => [i.email, i]));
  const started = new Set(attempts.map((a) => a.email));
  return rows.map((r) => {
    if (r.status !== "ready") return r;
    const inv = byEmail.get(r.email);
    const reason = iv.allowedEmails.length && !iv.allowedEmails.includes(r.email)
      ? "Not on this interview's allowlist."
      : mode === "reminder" ? reminderBlockReason(inv, started.has(r.email))
      : started.has(r.email) ? "Candidate has already started or completed."
      : inv ? "Invitation already exists. Review it in the invitation list." : null;
    return reason ? { ...r, status: "blocked" as const, reason } : r;
  });
}
