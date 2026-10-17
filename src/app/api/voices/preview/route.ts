import { synthesize } from "@/lib/ai/sarvam";
import { getUser } from "@/lib/auth";
import { LANGUAGES, VOICES } from "@/lib/constants";
import { withUsage } from "@/lib/usage";
import { takeRateLimit } from "@/lib/rate-limit";

const SAMPLE: Record<string, string> = {
  "en-IN": "Hi! I'll be your interviewer today. Whenever you're ready, tell me a little about yourself.",
  "hi-IN": "नमस्ते! आज मैं आपका इंटरव्यू लूंगी। जब आप तैयार हों, अपने बारे में थोड़ा बताइए।",
};

const cache = new Map<string, Buffer>();

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!(await takeRateLimit(`preview:${user.id}`, 60)))
    return new Response("Preview limit reached", { status: 429 });
  const url = new URL(req.url);
  const voice = url.searchParams.get("voice") ?? "";
  const lang = url.searchParams.get("lang") ?? "en-IN";
  if (!VOICES.some((v) => v.id === voice) || !LANGUAGES.some((l) => l.code === lang))
    return new Response("Bad request", { status: 400 });

  const language = SAMPLE[lang] ? lang : "en-IN";
  const key = `${voice}:${language}`;
  try {
    let audio = cache.get(key);
    if (!audio) {
      audio = await withUsage({ accountId: user.id, operation: "voice-preview" },
        () => synthesize(SAMPLE[language], { language, voice }));
      cache.set(key, audio);
    }
    return new Response(new Uint8Array(audio), {
      headers: { "content-type": audio.subarray(0, 4).toString() === "RIFF" ? "audio/wav" : "audio/mpeg", "cache-control": "private, max-age=86400" },
    });
  } catch (err) {
    console.error("[voice preview] failed", { type: err instanceof Error ? err.name : "unknown" });
    return new Response("Voice preview unavailable", { status: 502 });
  }
}
