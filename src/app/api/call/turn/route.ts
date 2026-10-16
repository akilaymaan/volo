import { and, eq, sql } from "drizzle-orm";
import { SILENCE_MARKER } from "@/lib/ai/prompts";
import { paceFor, SarvamError, synthesize, transcribe } from "@/lib/ai/sarvam";
import { interviewerTurn } from "@/lib/ai/tasks";
import { appendTurns, json, loadCall, serverElapsed } from "@/lib/call";
import { LIMITS } from "@/lib/constants";
import { db } from "@/lib/db";
import { response, type TranscriptTurn } from "@/lib/db/schema";

export const maxDuration = 60;

/**
 * One conversational turn: candidate audio → Sarvam STT → Claude interviewer → Sarvam TTS.
 * With no audio (and no silence flag) it produces the opening greeting.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return json({ error: "Invalid request" }, 400);
  // The transcript length the client last saw: makes retries idempotent
  const expectedLen = Number(form.get("len"));
  if (!Number.isInteger(expectedLen) || expectedLen < 0) return json({ error: "Invalid request" }, 400);

  const call = await loadCall(String(form.get("responseId") ?? ""));
  if (!call) return json({ error: "Interview session not found" }, 404);
  const { response: r, interview: iv, interviewer: persona } = call;
  if (r.status !== "in_progress") return json({ error: "This interview has ended" }, 409);

  // Every request (including retries and replays) spends paid API calls, so all of them count
  const [counted] = await db
    .update(response)
    .set({ requestCount: sql`${response.requestCount} + 1` })
    .where(and(eq(response.id, r.id), eq(response.status, "in_progress")))
    .returning({ n: response.requestCount });
  if (!counted) return json({ error: "This interview has ended" }, 409);
  if (counted.n > LIMITS.maxRequests || r.transcript.length >= LIMITS.maxTurns)
    return json({ error: "Turn limit reached" }, 429);

  const elapsed = serverElapsed(r.createdAt);
  if (elapsed > iv.durationMins * 60 + LIMITS.graceSec) {
    return json({ userText: "", say: "", end: true, len: r.transcript.length });
  }

  const chunks = form.getAll("chunk").filter((c): c is File => c instanceof File && c.size > 0);
  if (chunks.length > LIMITS.maxChunks || chunks.some((c) => c.size > LIMITS.maxChunkBytes))
    return json({ error: "Audio too large" }, 413);
  const silent = form.get("silent") === "1";
  const voice = { language: iv.language, voice: persona.voice, pace: paceFor(persona.speed) };

  // The server is ahead of the client (an earlier attempt was saved but its reply got lost): replay it
  const replay = async (transcript: TranscriptTurn[]) => {
    const last = transcript.findLast((t) => t.role === "agent");
    if (!last) return json({ error: "Nothing to replay" }, 409);
    const audio = await synthesize(last.text, voice);
    return json({ userText: "", say: last.text, end: false, audio: audio.toString("base64"), len: transcript.length });
  };

  try {
    if (r.transcript.length > expectedLen) return await replay(r.transcript);
    if (r.transcript.length > 0 && !chunks.length && !silent) return json({ error: "No audio received" }, 400);

    let userText = "";
    if (chunks.length) {
      const parts = await Promise.all(
        chunks.map((c) =>
          transcribe(c, iv.language).catch((err) => {
            // Sarvam couldn't decode this clip (e.g. a near-empty segment): treat it as silence, not an outage.
            // Other 400s (bad type, bad language) are config bugs and must stay loud.
            if (err instanceof SarvamError && err.status === 400 && /failed to read the file/i.test(err.message)) {
              console.warn("[turn] unreadable audio clip", r.id, err.message);
              return "";
            }
            throw err;
          }),
        ),
      );
      userText = parts.filter(Boolean).join(" ").trim();
      // Nothing intelligible — ask the client to keep listening instead of spending an LLM turn
      if (!userText) return json({ retry: true, len: r.transcript.length });
    } else if (silent) {
      userText = SILENCE_MARKER;
    }

    const userTurn: TranscriptTurn[] = userText ? [{ role: "user", text: userText, at: Date.now() }] : [];
    const reply = await interviewerTurn({
      interview: iv,
      interviewer: persona,
      candidateName: r.name,
      transcript: [...r.transcript, ...userTurn],
      elapsedSec: elapsed,
    });

    const turns: TranscriptTurn[] = [...userTurn, { role: "agent", text: reply.say, at: Date.now() }];
    const saved = await appendTurns(r.id, turns, r.transcript.length);
    if (!saved) {
      // A parallel attempt of this same turn won the race (or the call just ended): answer with its reply
      const fresh = await loadCall(r.id);
      if (!fresh || fresh.response.status !== "in_progress") return json({ error: "This interview has ended" }, 409);
      return await replay(fresh.response.transcript);
    }
    if (reply.end) {
      await db.update(response).set({ durationSec: elapsed }).where(eq(response.id, r.id));
    }
    const audio = await synthesize(reply.say, voice);

    return json({
      userText: userText === SILENCE_MARKER ? "" : userText,
      say: reply.say,
      end: reply.end,
      audio: audio.toString("base64"),
      len: r.transcript.length + turns.length,
    });
  } catch (err) {
    console.error("[turn] failed", r.id, err);
    return json({ error: "The interviewer had a hiccup. Retrying…" }, 502);
  }
}
