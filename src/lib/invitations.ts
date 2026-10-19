import "server-only";
import { and, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { candidateAttempt, invitation } from "@/lib/db/schema";
import { getOwnedInterview } from "@/lib/data";
import { sendInvitationMail } from "@/lib/mail";
import { EmailDeliveryError, emailConfiguration } from "@/lib/email-config";
import { takeRateLimit } from "@/lib/rate-limit";
import { newToken, tokenHash } from "@/lib/security";
import { PublicError } from "@/lib/errors";
import { MAX_REMINDER_SEND_ATTEMPTS, REMINDER_WAIT_MS, reminderBlockReason } from "@/lib/invitation-import";

export function publicOrigin() {
  const url = new URL(process.env.BETTER_AUTH_URL || "http://localhost:3000");
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      (process.env.NODE_ENV === "production" && url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)))
    throw new PublicError("Configure BETTER_AUTH_URL as the public HTTPS origin.");
  return url.origin;
}

export async function sendInvite(ownerId: string, interviewId: string, email: string, mode: "resend" | "new" | "reminder" = "resend") {
  const iv = await getOwnedInterview(interviewId, ownerId);
  if (!iv.isActive) throw new PublicError("Enable the interview before sending invitations.");
  if (iv.isAnonymous) throw new PublicError("Email invitations require named candidate intake.");
  if (iv.allowedEmails.length && !iv.allowedEmails.includes(email))
    throw new PublicError("Add this email to the interview allowlist first, or clear the allowlist.");
  // Reject known setup problems before creating/rotating a token or consuming a send attempt.
  emailConfiguration();
  const origin = publicOrigin();
  const [attempt] = await db.select().from(candidateAttempt)
    .where(and(eq(candidateAttempt.interviewId, interviewId), eq(candidateAttempt.email, email)));
  if (attempt) throw new PublicError("This candidate has already started or completed the interview.");
  if (mode === "reminder") {
    const [existing] = await db.select().from(invitation)
      .where(and(eq(invitation.interviewId, interviewId), eq(invitation.email, email)));
    const reason = reminderBlockReason(existing, false);
    if (reason) throw new PublicError(reason);
  }
  if (!(await takeRateLimit(`email:${ownerId}`, 100, 3_600_000)))
    throw new PublicError("Account email limit reached. Try again in an hour.");
  if (mode !== "reminder") {
    const inserted = await db.insert(invitation).values({
      id: nanoid(24), interviewId, email, expiresAt: new Date(Date.now() + 7 * 86_400_000),
    }).onConflictDoNothing().returning({ id: invitation.id });
    // Bulk new sends never rotate an existing token, including after a lost response.
    if (mode === "new" && !inserted.length) throw new PublicError("Invitation already exists. Refresh the preview before retrying.");
  }
  const token = newToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 86_400_000);
  // Lock resends atomically, rotate the old link, and exclude already consumed links.
  const [sent] = await db.update(invitation).set({
    tokenHash: tokenHash(token), expiresAt, revokedAt: null, status: "pending",
    lastAttemptAt: now, sendCount: sql`${invitation.sendCount} + 1`, providerId: null,
  }).where(and(eq(invitation.interviewId, interviewId), eq(invitation.email, email),
    mode === "reminder" ? and(
      eq(invitation.status, "sent"), isNull(invitation.revokedAt), gt(invitation.expiresAt, now),
      lt(invitation.sendCount, MAX_REMINDER_SEND_ATTEMPTS),
      lt(invitation.lastAttemptAt, new Date(now.getTime() - REMINDER_WAIT_MS)),
    ) : and(
      inArray(invitation.status, ["pending", "sent", "failed", "revoked"]),
      or(isNull(invitation.lastAttemptAt), lt(invitation.lastAttemptAt, new Date(now.getTime() - 60_000))),
    ),
  )).returning();
  if (!sent) throw new PublicError(mode === "reminder" ? "Reminder eligibility changed. Refresh the preview." : "Wait one minute before resending, or check whether this candidate has already started.");
  try {
    const result = await sendInvitationMail({
      email, interviewName: iv.name, url: `${origin}/i/${interviewId}#invite=${token}`, expiresAt,
      deliveryKey: `invite/${sent.id}/${sent.sendCount}`,
      reminder: mode === "reminder",
    });
    await db.update(invitation).set({ status: "sent", sentAt: now, providerId: result.id })
      .where(and(eq(invitation.id, sent.id), eq(invitation.tokenHash, tokenHash(token)), eq(invitation.status, "pending")));
  } catch (error) {
    await db.update(invitation).set({ status: "failed" })
      .where(and(eq(invitation.id, sent.id), eq(invitation.tokenHash, tokenHash(token)), eq(invitation.status, "pending")));
    console.error("[invitation:send] delivery failed", {
      invitationId: sent.id,
      code: error instanceof EmailDeliveryError ? error.code : "unconfirmed",
      status: error instanceof EmailDeliveryError ? error.status : undefined,
    });
    if (error instanceof EmailDeliveryError) throw error;
    throw new PublicError("Could not confirm email delivery. Check email configuration and resend after one minute.");
  }
}

export async function revokeInvite(ownerId: string, interviewId: string, id: string) {
  await getOwnedInterview(interviewId, ownerId);
  await db.update(invitation).set({ revokedAt: new Date(), tokenHash: null, status: "revoked" })
    .where(and(eq(invitation.id, id), eq(invitation.interviewId, interviewId)));
}
