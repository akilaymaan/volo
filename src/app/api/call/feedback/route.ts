import { z } from "zod";
import { json, loadCall } from "@/lib/call";
import { db } from "@/lib/db";
import { feedback } from "@/lib/db/schema";

const Body = z.object({
  responseId: z.string().min(1).max(64),
  satisfaction: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).default(""),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid request" }, 400);
  const call = await loadCall(parsed.data.responseId);
  if (!call || call.response.status !== "completed") return json({ error: "Not found" }, 404);
  // One rating per interview attempt
  await db.insert(feedback).values({
    interviewId: call.interview.id,
    responseId: call.response.id,
    satisfaction: parsed.data.satisfaction,
    comment: parsed.data.comment,
  }).onConflictDoNothing({ target: feedback.responseId });
  return json({ ok: true });
}
