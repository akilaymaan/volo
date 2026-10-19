import { afterEach, expect, it, vi } from "vitest";
import { sendInvitationMail } from "@/lib/mail";
import { emailConfigurationIssue } from "@/lib/email-config";

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
  vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("EMAIL_FROM", "hiring@example.test");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("sensitive provider details", { status: 429 })));
  await expect(sendInvitationMail({ email: "x", interviewName: "Role", url: "x", expiresAt: new Date(), deliveryKey: "x" }))
    .rejects.toMatchObject({ code: "rate_limit", message: "Resend is rate-limiting email requests. Wait at least one minute before resending." });
});

it("clearly labels reminder emails and explains that the new link replaces the old one", async () => {
  vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("EMAIL_FROM", "hiring@example.test"); vi.stubEnv("EMAIL_MOCK", "0");
  const fetcher = vi.fn().mockResolvedValue(Response.json({ id: "reminder-1" }));
  vi.stubGlobal("fetch", fetcher);
  await sendInvitationMail({ email: "candidate@example.test", interviewName: "Engineer", url: "https://example.test/new", expiresAt: new Date(), deliveryKey: "invite/1/2", reminder: true });
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body.subject).toBe("Interview reminder: Engineer");
  expect(body.text).toContain("replaces your previous personal link");
});

const mail = { email: "candidate@example.test", interviewName: "Engineer", url: "https://example.test/i/id#invite=private", expiresAt: new Date(), deliveryKey: "invite/1/1" };

it.each([
  [401, "validation_error", "API key is invalid", "authentication", "RESEND_API_KEY"],
  [403, "restricted_api_key", "API key is not active", "authentication", "sending permission"],
  [403, "validation_error", "You can only send testing emails to your own email address (private@example.test).", "test_sender", "Verify your own domain"],
  [403, "validation_error", "The private.example domain is not verified.", "sender_domain", "EMAIL_FROM domain"],
  [429, "daily_quota_exceeded", "Private quota details", "quota", "quota has been reached"],
  [429, "rate_limit_exceeded", "Private rate details", "rate_limit", "rate-limiting"],
  [503, "application_error", "private internal details", "unavailable", "temporarily unavailable"],
  [422, "validation_error", "private recipient@example.test details", "rejected", "candidate email address"],
] as const)("classifies %i %s without exposing raw provider details", async (status, name, message, code, hint) => {
  vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("EMAIL_FROM", "hiring@example.test");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ name, message }, { status })));
  const error = await sendInvitationMail(mail).catch((e: unknown) => e);
  expect(error).toMatchObject({ code, status, message: expect.stringContaining(hint) });
  expect((error as Error).message).not.toContain("private");
});

it("reports missing or invalid local configuration before calling the provider", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  vi.stubEnv("RESEND_API_KEY", ""); vi.stubEnv("EMAIL_FROM", "");
  expect(emailConfigurationIssue()).toContain("Set RESEND_API_KEY and EMAIL_FROM");
  await expect(sendInvitationMail(mail)).rejects.toMatchObject({ code: "configuration" });
  vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("EMAIL_FROM", "personal-gmail-without-domain");
  expect(emailConfigurationIssue()).toContain("EMAIL_FROM must be");
  await expect(sendInvitationMail(mail)).rejects.toMatchObject({ code: "configuration" });
  vi.stubEnv("EMAIL_FROM", "Hiring <hiring@example.test>\r\nBcc: private@example.test");
  expect(emailConfigurationIssue()).toContain("EMAIL_FROM must be");
  expect(fetcher).not.toHaveBeenCalled();
});

it("normalizes pasted outer whitespace without exposing keys in setup messages", async () => {
  vi.stubEnv("RESEND_API_KEY", "  test-key  "); vi.stubEnv("EMAIL_FROM", " Hiring <hiring@example.test> ");
  expect(emailConfigurationIssue()).toBeNull();
  const fetcher = vi.fn().mockResolvedValue(Response.json({ id: "accepted" })); vi.stubGlobal("fetch", fetcher);
  await sendInvitationMail(mail);
  expect(fetcher.mock.calls[0][1].headers.authorization).toBe("Bearer test-key");
  expect(JSON.parse(fetcher.mock.calls[0][1].body).from).toBe("Hiring <hiring@example.test>");
  vi.stubEnv("RESEND_API_KEY", '"secret-key"');
  expect(emailConfigurationIssue()).toContain("without quotes or whitespace");
  expect(emailConfigurationIssue()).not.toContain("secret-key");
});

it("does not retry an ambiguous network failure", async () => {
  vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("EMAIL_FROM", "hiring@example.test");
  const fetcher = vi.fn().mockRejectedValue(new Error("private network details")); vi.stubGlobal("fetch", fetcher);
  await expect(sendInvitationMail(mail)).rejects.toMatchObject({ code: "unconfirmed", message: expect.stringContaining("Check invitation status") });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each(["not-json", JSON.stringify({ id: 123 }), JSON.stringify({})])("does not report success for invalid success responses: %s", async (body) => {
  vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("EMAIL_FROM", "hiring@example.test");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
  await expect(sendInvitationMail(mail)).rejects.toMatchObject({ code: "unconfirmed" });
});
