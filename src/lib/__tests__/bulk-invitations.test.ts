import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { db, schema } from "@/lib/db";
import { previewInvitationImport } from "@/lib/bulk-invitations";
import { sendInvite } from "@/lib/invitations";
import { sendInvitationMail } from "@/lib/mail";
import { newToken, tokenHash } from "@/lib/security";
import { REMINDER_WAIT_MS } from "@/lib/invitation-import";
import { previewInvitationImportAction, sendImportedInvitationAction } from "@/app/actions";
import { requireUser } from "@/lib/auth";
import { EmailDeliveryError } from "@/lib/email-config";

vi.mock("@/lib/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const schema = await import("@/lib/db/schema");
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return { db, schema, client };
});
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/mail", () => ({ sendInvitationMail: vi.fn() }));

beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_URL", "https://app.example.test");
  await db.insert(schema.user).values([
    { id: "owner", name: "Owner", email: "owner@example.test" },
    { id: "other", name: "Other", email: "other@example.test" },
  ]);
  await db.insert(schema.interview).values({ id: "role", ownerId: "owner", interviewerId: "preset-bob", name: "Engineer", objective: "Skills" });
});

beforeEach(async () => {
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("EMAIL_FROM", "hiring@example.test");
  vi.mocked(sendInvitationMail).mockReset().mockResolvedValue({ id: "mock-provider" });
  vi.mocked(requireUser).mockResolvedValue({ id: "owner" } as Awaited<ReturnType<typeof requireUser>>);
  await db.delete(schema.response);
  await db.delete(schema.invitation);
  await db.delete(schema.rateLimit);
  await db.update(schema.interview).set({ isActive: true, isAnonymous: false, allowedEmails: [] });
});

afterAll(async () => {
  const { client } = await import("@/lib/db") as unknown as { client: { close(): Promise<void> } };
  await client.close();
  vi.unstubAllEnvs();
});

async function seedInvite(patch: Partial<typeof schema.invitation.$inferInsert> = {}) {
  const oldToken = newToken();
  await db.insert(schema.invitation).values({
    id: "invite", interviewId: "role", email: "asha@example.test", status: "sent", tokenHash: tokenHash(oldToken),
    expiresAt: new Date(Date.now() + 3 * 86_400_000), lastAttemptAt: new Date(Date.now() - REMINDER_WAIT_MS - 60_000), sendCount: 1,
    ...patch,
  });
  return oldToken;
}

it("previews without storing recipients or sending mail", async () => {
  const result = await previewInvitationImportAction("role", "name,email\nAsha,asha@example.test\nAgain,ASHA@example.test\nBad,invalid", "new");
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Preview failed");
  expect(result.rows.map((r) => r.status)).toEqual(["ready", "duplicate", "invalid"]);
  expect(await db.select().from(schema.invitation)).toEqual([]);
  expect(sendInvitationMail).not.toHaveBeenCalled();
});

it("enforces ownership at preview and send action boundaries", async () => {
  vi.mocked(requireUser).mockResolvedValue({ id: "other" } as Awaited<ReturnType<typeof requireUser>>);
  await expect(previewInvitationImportAction("role", "email\nasha@example.test", "new")).rejects.toThrow();
  await expect(sendImportedInvitationAction("role", "asha@example.test", "new")).rejects.toThrow();
  expect(sendInvitationMail).not.toHaveBeenCalled();
  expect(await db.select().from(schema.invitation)).toEqual([]);
});

it("does not trust a stale preview after access settings change", async () => {
  expect((await previewInvitationImport("owner", "role", "email\nasha@example.test", "new"))[0].status).toBe("ready");
  await db.update(schema.interview).set({ allowedEmails: ["allowed@example.test"] });
  const result = await sendImportedInvitationAction("role", "asha@example.test", "new");
  expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/allowlist/) });
  expect((await previewInvitationImport("owner", "role", "email\nasha@example.test", "new"))[0].status).toBe("blocked");
  expect(sendInvitationMail).not.toHaveBeenCalled();
});

it("new imports send once even when requests race or a response is lost", async () => {
  const results = await Promise.allSettled([
    sendInvite("owner", "role", "asha@example.test", "new"),
    sendInvite("owner", "role", "asha@example.test", "new"),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(sendInvitationMail).toHaveBeenCalledTimes(1);
  const [first] = await db.select().from(schema.invitation);
  await db.update(schema.invitation).set({ lastAttemptAt: new Date(0) });
  await expect(sendInvite("owner", "role", "asha@example.test", "new")).rejects.toThrow(/already exists/);
  const [after] = await db.select().from(schema.invitation);
  expect(after.tokenHash).toBe(first.tokenHash);
  expect(after.sendCount).toBe(1);
  expect((await previewInvitationImport("owner", "role", "email\nasha@example.test", "new"))[0].status).toBe("blocked");
});

it("sends an eligible reminder with a rotated link and atomically blocks concurrent reminders", async () => {
  const oldToken = await seedInvite();
  expect((await previewInvitationImport("owner", "role", "email\nasha@example.test", "reminder"))[0].status).toBe("ready");
  const results = await Promise.allSettled([
    sendInvite("owner", "role", "asha@example.test", "reminder"),
    sendInvite("owner", "role", "asha@example.test", "reminder"),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(sendInvitationMail).toHaveBeenCalledTimes(1);
  expect(vi.mocked(sendInvitationMail).mock.calls[0][0]).toMatchObject({ reminder: true });
  const [after] = await db.select().from(schema.invitation);
  expect(after.tokenHash).not.toBe(tokenHash(oldToken));
  expect(after.sendCount).toBe(2);
  expect(after.status).toBe("sent");
  await expect(sendInvite("owner", "role", "asha@example.test", "reminder")).rejects.toThrow(/24 hours/);
});

it("blocks recent, expired, revoked, failed and over-limit reminders", async () => {
  for (const patch of [
    { lastAttemptAt: new Date() }, { expiresAt: new Date(0) }, { revokedAt: new Date() },
    { status: "failed" as const }, { sendCount: 3 }, { status: "started" as const },
  ]) {
    await db.delete(schema.invitation);
    await seedInvite(patch);
    expect((await previewInvitationImport("owner", "role", "email\nasha@example.test", "reminder"))[0].status).toBe("blocked");
    await expect(sendInvite("owner", "role", "asha@example.test", "reminder")).rejects.toThrow();
  }
  expect(sendInvitationMail).not.toHaveBeenCalled();
});

it("skips candidates who have already started even if their invitation state is stale", async () => {
  await seedInvite();
  await db.insert(schema.response).values({ id: "response", interviewId: "role", email: "asha@example.test" });
  await db.insert(schema.candidateAttempt).values({ interviewId: "role", email: "asha@example.test", responseId: "response" });
  expect((await previewInvitationImport("owner", "role", "email\nasha@example.test", "reminder"))[0].reason).toMatch(/already started/);
  expect(await sendImportedInvitationAction("role", "asha@example.test", "reminder")).toMatchObject({ ok: false });
  expect(sendInvitationMail).not.toHaveBeenCalled();
});

it("records individual provider failures safely while other recipients can succeed", async () => {
  vi.mocked(sendInvitationMail).mockRejectedValueOnce(new Error("secret upstream details"));
  const failed = await sendImportedInvitationAction("role", "failed@example.test", "new");
  expect(failed).toMatchObject({ ok: false, error: expect.stringMatching(/Could not confirm/) });
  expect(JSON.stringify(failed)).not.toContain("secret upstream details");
  expect(await sendImportedInvitationAction("role", "ok@example.test", "new")).toEqual({ ok: true });
  const states = await db.select({ email: schema.invitation.email, status: schema.invitation.status }).from(schema.invitation);
  expect(states).toEqual(expect.arrayContaining([
    { email: "failed@example.test", status: "failed" }, { email: "ok@example.test", status: "sent" },
  ]));
});

it("rejects missing configuration without creating invitations or consuming rate limits", async () => {
  vi.stubEnv("RESEND_API_KEY", "");
  expect(await sendImportedInvitationAction("role", "new@example.test", "new"))
    .toMatchObject({ ok: false, error: expect.stringContaining("Set RESEND_API_KEY and EMAIL_FROM") });
  expect(await db.select().from(schema.invitation)).toEqual([]);
  expect(await db.select().from(schema.rateLimit)).toEqual([]);
  expect(sendInvitationMail).not.toHaveBeenCalled();
});

it("does not rotate an existing personal link when sender configuration is invalid", async () => {
  await seedInvite();
  const before = await db.select().from(schema.invitation);
  vi.stubEnv("EMAIL_FROM", "not-an-address");
  expect(await sendImportedInvitationAction("role", "asha@example.test", "reminder"))
    .toMatchObject({ ok: false, error: expect.stringContaining("EMAIL_FROM must be") });
  expect(await db.select().from(schema.invitation)).toEqual(before);
  expect(sendInvitationMail).not.toHaveBeenCalled();
});

it("preserves safe actionable provider diagnostics through invitation actions", async () => {
  vi.mocked(sendInvitationMail).mockRejectedValueOnce(new EmailDeliveryError("sender_domain", "Verify the EMAIL_FROM domain in Resend.", 403));
  const result = await sendImportedInvitationAction("role", "new@example.test", "new");
  expect(result).toEqual({ ok: false, error: "Verify the EMAIL_FROM domain in Resend." });
  const [saved] = await db.select().from(schema.invitation);
  expect(saved).toMatchObject({ status: "failed", sendCount: 1, providerId: null });
});

it("rejects paused/anonymous interviews and untrusted action inputs", async () => {
  for (const settings of [{ isActive: false, isAnonymous: false }, { isActive: true, isAnonymous: true }]) {
    await db.update(schema.interview).set(settings);
    await expect(previewInvitationImport("owner", "role", "email\nasha@example.test", "new")).rejects.toThrow();
    expect(await sendImportedInvitationAction("role", "asha@example.test", "new")).toMatchObject({ ok: false });
  }
  expect(await sendImportedInvitationAction("role", "invalid", "new")).toMatchObject({ ok: false });
  expect(await sendImportedInvitationAction("role", "asha@example.test", "resend" as "new")).toMatchObject({ ok: false });
  expect(sendInvitationMail).not.toHaveBeenCalled();
});

it("retains the shared account email quota without inserting denied recipients", async () => {
  const { takeRateLimit } = await import("@/lib/rate-limit");
  for (let i = 0; i < 100; i++) await takeRateLimit("email:owner", 100, 3_600_000);
  expect(await sendImportedInvitationAction("role", "asha@example.test", "new")).toMatchObject({ ok: false, error: expect.stringMatching(/Account email limit/) });
  expect(await db.select().from(schema.invitation)).toEqual([]);
  expect(sendInvitationMail).not.toHaveBeenCalled();
});
