import "server-only";
import { isMock } from "./mock";

const BASE = "https://api.sarvam.ai";

function key() {
  const k = process.env.SARVAM_API_KEY;
  if (!k) throw new Error("SARVAM_API_KEY is not set");
  return k;
}

export class SarvamError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    super(`Sarvam ${status}: ${body.slice(0, 500)}`);
  }
}

async function sarvamError(res: Response) {
  return new SarvamError(res.status, await res.text().catch(() => ""));
}

/** Speech → text. Audio must be under ~30s (callers chunk longer answers). */
export async function transcribe(audio: Blob, language: string): Promise<string> {
  if (isMock()) return audio.size > 0 ? "This is a mock answer from the candidate." : "";
  const form = new FormData();
  // Sarvam matches the MIME type exactly: "audio/webm;codecs=opus" (what Chrome records) is rejected, "audio/webm" works
  const type = audio.type.split(";")[0].trim() || "audio/webm";
  const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : "webm";
  form.append("file", new Blob([audio], { type }), `audio.${ext}`);
  const model = process.env.SARVAM_STT_MODEL || "saaras:v4";
  form.append("model", model);
  if (model === "saaras:v3") form.append("mode", "transcribe");
  form.append("language_code", language);
  const res = await fetch(`${BASE}/speech-to-text`, {
    method: "POST",
    headers: { "api-subscription-key": key() },
    body: form,
  });
  if (!res.ok) throw await sarvamError(res);
  const json = (await res.json()) as { transcript?: string };
  return (json.transcript ?? "").trim();
}

/** Text → speech. Returns MP3 bytes. */
export async function synthesize(
  text: string,
  opts: { language: string; voice: string; pace?: number },
): Promise<Buffer> {
  if (isMock()) return silentWav(0.4);
  const res = await fetch(`${BASE}/text-to-speech`, {
    method: "POST",
    headers: { "api-subscription-key": key(), "content-type": "application/json" },
    body: JSON.stringify({
      text: text.slice(0, 2400),
      language_code: opts.language,
      speaker: opts.voice,
      model: process.env.SARVAM_TTS_MODEL || "bulbul:v3",
      pace: opts.pace ?? 1,
      speech_sample_rate: 24000,
      output_audio_codec: "mp3",
    }),
  });
  if (!res.ok) throw await sarvamError(res);
  const json = (await res.json()) as { audios: string[] };
  return Buffer.concat(json.audios.map((a) => Buffer.from(a, "base64")));
}

/** Map the 1–10 "speed" persona trait to a TTS pace. */
export const paceFor = (speed: number) => Math.round((0.85 + (speed - 1) * 0.04) * 100) / 100;

function silentWav(seconds: number): Buffer {
  const rate = 8000;
  const samples = Math.floor(rate * seconds);
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples * 2, 40);
  return buf;
}
