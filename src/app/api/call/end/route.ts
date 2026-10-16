import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { json, loadCall, serverElapsed } from "@/lib/call";
import { db } from "@/lib/db";
import { response } from "@/lib/db/schema";
import { runAnalysis } from "@/lib/data";

export const maxDuration = 300; // analysis runs in after() within this budget

const Body = z.object({
  responseId: z.string().min(1).max(64),
  tabSwitches: z.number().int().min(0).max(10_000).default(0),
});

/** Marks the call finished and analyzes it in the background. Also sent via sendBeacon on tab close. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid request" }, 400);
  const call = await loadCall(parsed.data.responseId);
  if (!call) return json({ error: "Not found" }, 404);
  const { response: r, interview: iv } = call;
  if (r.status !== "in_progress") return json({ ok: true });

  const durationSec = Math.min(serverElapsed(r.createdAt), iv.durationMins * 60 + 300);
  const updated = await db
    .update(response)
    .set({
      status: "completed",
      endedAt: new Date(),
      durationSec,
      tabSwitchCount: parsed.data.tabSwitches,
      analysisStatus: "running",
      analysisStartedAt: new Date(),
    })
    .where(and(eq(response.id, r.id), eq(response.status, "in_progress")))
    .returning({ id: response.id });

  if (updated.length) after(() => runAnalysis(r.id));
  return json({ ok: true });
}
