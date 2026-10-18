import { afterEach, expect, it, vi } from "vitest";
import { transcribe } from "@/lib/ai/sarvam";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("uploads recorder audio without the codecs parameter Sarvam rejects", async () => {
  vi.stubEnv("SARVAM_API_KEY", "test");
  let sent: File | undefined;
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    sent = (init.body as FormData).get("file") as File;
    return Response.json({ transcript: " hello " });
  });
  const text = await transcribe(new Blob(["x"], { type: "audio/webm;codecs=opus" }), "en-IN");
  expect(text).toBe("hello");
  expect(sent?.type).toBe("audio/webm");
  expect(sent?.name).toBe("audio.webm");
});
