import { eq } from "drizzle-orm";
import { json, loadCall } from "@/lib/call";
import { LIMITS } from "@/lib/constants";
import { db } from "@/lib/db";
import { recording, response } from "@/lib/db/schema";

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

  const call = await loadCall(String(form.get("responseId") ?? ""));
  if (!call) return json({ error: "Not found" }, 404);
  // Only accept the upload shortly after the call (the id is the candidate's token)
  if (Date.now() - call.response.createdAt.getTime() > 3 * 60 * 60 * 1000)
    return json({ error: "Upload window closed" }, 410);

  const data = Buffer.from(await file.arrayBuffer());
  await db
    .insert(recording)
    .values({ responseId: call.response.id, mime, data })
    .onConflictDoUpdate({ target: recording.responseId, set: { mime, data } });
  await db.update(response).set({ hasRecording: true }).where(eq(response.id, call.response.id));
  return json({ ok: true });
}
