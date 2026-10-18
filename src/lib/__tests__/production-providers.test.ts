import { afterEach, expect, it, vi } from "vitest";
import { generateQuestions } from "@/lib/ai/tasks";
import { synthesize, transcribe } from "@/lib/ai/sarvam";
import { sendInvitationMail } from "@/lib/mail";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("old demo flags cannot substitute scripted AI or silent speech for missing credentials", async () => {
  vi.stubEnv("AI_MOCK", "1");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("SARVAM_API_KEY", "");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await expect(generateQuestions({ name: "Role", objective: "Skills", count: 1, context: "" })).rejects.toThrow("ANTHROPIC_API_KEY");
  await expect(transcribe(new Blob(["audio"]), "en-IN")).rejects.toThrow("SARVAM_API_KEY");
  await expect(synthesize("Hello", { language: "en-IN", voice: "test" })).rejects.toThrow("SARVAM_API_KEY");
  expect(fetcher).not.toHaveBeenCalled();
});

it("old email flags cannot report a fake success without a configured mail provider", async () => {
  vi.stubEnv("AI_MOCK", "1"); vi.stubEnv("EMAIL_MOCK", "1");
  vi.stubEnv("RESEND_API_KEY", ""); vi.stubEnv("EMAIL_FROM", "");
  await expect(sendInvitationMail({ email: "test@example.test", interviewName: "Role", url: "https://example.test", expiresAt: new Date(), deliveryKey: "test" }))
    .rejects.toThrow("Email delivery is not configured");
});
