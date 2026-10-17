import { afterEach, expect, it, vi } from "vitest";
import { sendInvitationMail } from "@/lib/mail";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("uses Resend with an idempotency key and plain-text private links", async () => {
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("EMAIL_FROM", "Hiring <hiring@example.test>");
  vi.stubEnv("EMAIL_MOCK", "0");
  const fetcher = vi.fn().mockResolvedValue(Response.json({ id: "message-1" }));
  vi.stubGlobal("fetch", fetcher);
  expect(await sendInvitationMail({
    email: "candidate@example.test", interviewName: "<script>role</script>",
    url: "https://example.test/i/id#invite=secret", expiresAt: new Date("2026-11-01"), deliveryKey: "invite/1/1",
  })).toEqual({ id: "message-1" });
  const [url, options] = fetcher.mock.calls[0];
  expect(url).toBe("https://api.resend.com/emails");
  expect(options.headers["Idempotency-Key"]).toBe("invite/1/1");
  const body = JSON.parse(options.body);
  expect(body.html).toBeUndefined();
  expect(body.to).toEqual(["candidate@example.test"]);
});

it("does not leak provider response bodies on failures", async () => {
  vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("EMAIL_FROM", "test");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("sensitive provider details", { status: 429 })));
  await expect(sendInvitationMail({ email: "x", interviewName: "Role", url: "x", expiresAt: new Date(), deliveryKey: "x" }))
    .rejects.toThrow("Email provider rejected the request.");
});
