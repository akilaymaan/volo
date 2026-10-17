import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { json } from "@/lib/call";
import { db } from "@/lib/db";
import { candidateAttempt, interview, interviewer, invitation, response } from "@/lib/db/schema";
import { CONSENT_VERSION } from "@/lib/privacy";
import { takeRateLimit } from "@/lib/rate-limit";
import { newToken, secureCallCookie, sessionCookie, tokenHash, validToken } from "@/lib/security";

const Body = z.object({
  interviewId: z.string().min(1).max(64),
  name: z.string().trim().max(80).default(""),
  email: z.string().trim().toLowerCase().max(200).default(""),
  consentVersion: z.literal(CONSENT_VERSION),
  invitationToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid request" }, 400);
  const { interviewId, name, email } = parsed.data;
  if (!(await takeRateLimit("start:global", 1000)))
    return json({ error: "Too many attempts. Please wait ten minutes." }, 429);

  const [iv] = await db.select().from(interview).where(eq(interview.id, interviewId));
  if (!iv) return json({ error: "This interview link is invalid." }, 404);
  if (!iv.isActive) return json({ error: "This interview is no longer accepting responses." }, 410);
  if (!(await takeRateLimit(`start:${interviewId}`, 60)) ||
      !(await takeRateLimit(`start:${interviewId}:${email}`, 5)))
    return json({ error: "Too many attempts. Please wait ten minutes." }, 429);

  if (!iv.isAnonymous) {
    if (!name) return json({ error: "Please enter your name." }, 400);
    if (!z.string().email().safeParse(email).success)
      return json({ error: "Please enter a valid email address." }, 400);
  }
  let invitationId: string | null = null;
  if (iv.allowedEmails.length || iv.invitationOnly || parsed.data.invitationToken) {
    if (iv.allowedEmails.length && !iv.allowedEmails.includes(email))
      return json({ error: "Use a valid, unexpired personal email invitation. Contact the hiring team for a new link." }, 403);
    const suppliedToken = parsed.data.invitationToken ?? "";
    const [inv] = await db.select().from(invitation).where(and(
      eq(invitation.interviewId, interviewId), eq(invitation.email, email),
      eq(invitation.tokenHash, tokenHash(suppliedToken)),
    ));
    if (!inv || inv.revokedAt || !validToken(suppliedToken, inv.tokenHash, inv.expiresAt))
      return json({ error: "Use a valid, unexpired personal email invitation. Contact the hiring team for a new link." }, 403);
    if (["started", "completed"].includes(inv.status))
      return json({ error: "This invitation has already been used." }, 409);
    invitationId = inv.id;
  }

  const id = nanoid(24);
  const token = newToken();
  const [persona] = await db.select({
    id: interviewer.id, name: interviewer.name, description: interviewer.description, voice: interviewer.voice,
    color: interviewer.color, empathy: interviewer.empathy, exploration: interviewer.exploration,
    rapport: interviewer.rapport, speed: interviewer.speed,
  }).from(interviewer).where(eq(interviewer.id, iv.interviewerId));
  try {
    await db.transaction(async (tx) => {
      await tx.insert(response).values({
        id, interviewId: iv.id, invitationId, name: iv.isAnonymous ? "" : name, email: iv.isAnonymous ? "" : email,
        sessionHash: tokenHash(token),
        sessionExpiresAt: new Date(Date.now() + 3 * 60 * 60_000),
        consentVersion: CONSENT_VERSION, consentedAt: new Date(),
        deleteAfter: new Date(Date.now() + iv.retentionDays * 86_400_000),
        interviewSnapshot: {
          name: iv.name, objective: iv.objective, questions: iv.questions,
          language: iv.language, durationMins: iv.durationMins,
          persona,
        },
      });
      if (!iv.isAnonymous) {
        const claimed = await tx.insert(candidateAttempt).values({ interviewId: iv.id, email, responseId: id })
          .onConflictDoNothing().returning();
        if (!claimed.length) throw new Error("ATTEMPT_EXISTS");
      }
      if (invitationId) {
        const consumed = await tx.update(invitation).set({ status: "started" }).where(and(
          eq(invitation.id, invitationId), eq(invitation.tokenHash, tokenHash(parsed.data.invitationToken!)),
          isNull(invitation.revokedAt), gt(invitation.expiresAt, new Date()),
          inArray(invitation.status, ["pending", "sent", "failed"]),
        )).returning({ id: invitation.id });
        if (!consumed.length) throw new Error("ATTEMPT_EXISTS");
      }
    });
  } catch (err) {
    if (err instanceof Error && err.message === "ATTEMPT_EXISTS")
      return json({ error: "You've already started or completed this interview. Contact the hiring team if you need a new attempt." }, 409);
    console.error("[call:start] database failure");
    return json({ error: "Could not start your interview. Please try again." }, 503);
  }
  const res = json({ responseId: id });
  res.headers.set("set-cookie", sessionCookie(id, token, secureCallCookie(req.url)));
  return res;
}
