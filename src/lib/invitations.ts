import "server-only";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { candidateAttempt, invitation } from "@/lib/db/schema";
import { getOwnedInterview } from "@/lib/data";
import { sendInvitationMail } from "@/lib/mail";
import { takeRateLimit } from "@/lib/rate-limit";
import { newToken, tokenHash } from "@/lib/security";
import { PublicError } from "@/lib/errors";

export function publicOrigin() {
  const url = new URL(process.env.BETTER_AUTH_URL || "http://localhost:3000");
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      (process.env.NODE_ENV === "production" && url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)))
    throw new PublicError("Configure BETTER_AUTH_URL as the public HTTPS origin.");
  return url.origin;
}

export async function sendInvite(ownerId: string, interviewId: string, email: string) {
  const iv = await getOwnedInterview(interviewId, ownerId);
  if (!iv.isActive) throw new PublicError("Enable the interview before sending invitations.");
  if (iv.isAnonymous) throw new PublicError("Email invitations require named candidate intake.");
  if (iv.allowedEmails.length && !iv.allowedEmails.includes(email))
    throw new PublicError("Add this email to the interview allowlist first, or clear the allowlist.");
  if (!(await takeRateLimit(`email:${ownerId}`, 100, 3_600_000)))
    throw new PublicError("Account email limit reached. Try again in an hour.");
  const origin = publicOrigin();
  const [attempt] = await db.select().from(candidateAttempt)
    .where(and(eq(candidateAttempt.interviewId, interviewId), eq(candidateAttempt.email, email)));
  if (attempt) throw new PublicError("This candidate has already started or completed the interview.");
  await db.insert(invitation).values({
    id: nanoid(24), interviewId, email, expiresAt: new Date(Date.now() + 7 * 86_400_000),
  }).onConflictDoNothing();
  const token = newToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 86_400_000);
  // Lock resends atomically, rotate the old link, and exclude already consumed links.
  const [sent] = await db.update(invitation).set({
    tokenHash: tokenHash(token), expiresAt, revokedAt: null, status: "pending",
    lastAttemptAt: now, sendCount: sql`${invitation.sendCount} + 1`, providerId: null,
  }).where(and(eq(invitation.interviewId, interviewId), eq(invitation.email, email),
    inArray(invitation.status, ["pending", "sent", "failed", "revoked"]),
    or(isNull(invitation.lastAttemptAt), lt(invitation.lastAttemptAt, new Date(now.getTime() - 60_000))),
  )).returning();
  if (!sent) throw new PublicError("Wait one minute before resending, or check whether this candidate has already started.");
  try {
    const result = await sendInvitationMail({
      email, interviewName: iv.name, url: `${origin}/i/${interviewId}#invite=${token}`, expiresAt,
      deliveryKey: `invite/${sent.id}/${sent.sendCount}`,
    });
    await db.update(invitation).set({ status: "sent", sentAt: now, providerId: result.id })
      .where(and(eq(invitation.id, sent.id), eq(invitation.tokenHash, tokenHash(token)), eq(invitation.status, "pending")));
  } catch {
    await db.update(invitation).set({ status: "failed" })
      .where(and(eq(invitation.id, sent.id), eq(invitation.tokenHash, tokenHash(token)), eq(invitation.status, "pending")));
    console.error("[invitation:send] delivery failed", { invitationId: sent.id });
    throw new PublicError("Could not confirm email delivery. Check email configuration and resend after one minute.");
  }
}

export async function revokeInvite(ownerId: string, interviewId: string, id: string) {
  await getOwnedInterview(interviewId, ownerId);
  await db.update(invitation).set({ revokedAt: new Date(), tokenHash: null, status: "revoked" })
    .where(and(eq(invitation.id, id), eq(invitation.interviewId, interviewId)));
}
