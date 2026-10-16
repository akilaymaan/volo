import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { json } from "@/lib/call";
import { db } from "@/lib/db";
import { interview, response } from "@/lib/db/schema";

const Body = z.object({
  interviewId: z.string().min(1).max(64),
  name: z.string().trim().max(80).default(""),
  email: z.string().trim().toLowerCase().max(200).default(""),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid request" }, 400);
  const { interviewId, name, email } = parsed.data;

  const [iv] = await db.select().from(interview).where(eq(interview.id, interviewId));
  if (!iv) return json({ error: "This interview link is invalid." }, 404);
  if (!iv.isActive) return json({ error: "This interview is no longer accepting responses." }, 410);

  if (!iv.isAnonymous) {
    if (!name) return json({ error: "Please enter your name." }, 400);
    if (!z.string().email().safeParse(email).success)
      return json({ error: "Please enter a valid email address." }, 400);
    if (iv.allowedEmails.length && !iv.allowedEmails.includes(email))
      return json({ error: "This email isn't on the invite list for this interview." }, 403);
    const [done] = await db
      .select({ id: response.id })
      .from(response)
      .where(
        and(
          eq(response.interviewId, iv.id),
          eq(response.email, email),
          eq(response.status, "completed"),
        ),
      )
      .limit(1);
    if (done) return json({ error: "You've already completed this interview. Thank you!" }, 409);
  }

  const id = nanoid(24); // unguessable: it is the candidate's capability token for this call
  await db.insert(response).values({ id, interviewId: iv.id, name, email });
  return json({ responseId: id });
}
