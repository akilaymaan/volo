import { eq } from "drizzle-orm";
import { json, loadCall } from "@/lib/call";
import { LIMITS } from "@/lib/constants";
import { db } from "@/lib/db";
import { recording, response } from "@/lib/db/schema";
import { applyRecordingTimeline, parseRecordingTimeline } from "@/lib/recording-timeline";
import { PublicError } from "@/lib/errors";

export const maxDuration = 60;

const AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"] as const;

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File) || file.size === 0) return json({ error: "No file" }, 400);
  if (file.size > LIMITS.maxRecordingBytes) return json({ error: "Recording too large" }, 413);
  // Exact allowlist: the stored type is served back to recruiters, so it must never be attacker-shaped
  const mime = AUDIO_TYPES.find((t) => file.type.split(";")[0].trim().toLowerCase() === t);
  if (!mime) return json({ error: "Unsupported type" }, 415);

  const call = await loadCall(String(form.get("responseId") ?? ""), req);
  if (!call) return json({ error: "Not found" }, 404);
  if (call.response.status !== "completed") return json({ error: "Finish the interview before uploading a recording" }, 409);
  // Only accept the upload shortly after the call, with its separate session credential.
  if (Date.now() - call.response.createdAt.getTime() > 3 * 60 * 60 * 1000)
    return json({ error: "Upload window closed" }, 410);

  let transcript;
  try {
    transcript = applyRecordingTimeline(call.response.transcript,
      parseRecordingTimeline(form.get("timeline"), call.response.transcript.length, Date.now() - call.response.createdAt.getTime()));
  } catch (error) {
    if (error instanceof PublicError) return json({ error: error.message }, 400);
    throw error;
  }
  const data = Buffer.from(await file.arrayBuffer());
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(recording)
      .values({ responseId: call.response.id, mime, data })
      .onConflictDoNothing({ target: recording.responseId }).returning({ id: recording.responseId });
    // Recording bytes and cues are one write-once pair; retries cannot retime an existing upload.
    if (inserted.length) await tx.update(response).set({ hasRecording: true, transcript }).where(eq(response.id, call.response.id));
  });
  return json({ ok: true });
}
