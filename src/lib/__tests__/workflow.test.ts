import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { POST as start } from "@/app/api/call/start/route";
import { POST as turn } from "@/app/api/call/turn/route";
import { POST as end } from "@/app/api/call/end/route";
import { POST as rate } from "@/app/api/call/feedback/route";
import { CONSENT_VERSION } from "@/lib/privacy";
import { sendInvite, revokeInvite } from "@/lib/invitations";
import { sendInvitationMail } from "@/lib/mail";
import { tokenHash } from "@/lib/security";
import { expireAccountData } from "@/lib/retention";
import { withUsage, recordUsage } from "@/lib/usage";
import { POST as maintenance } from "@/app/api/maintenance/retention/route";
import { loadCall } from "@/lib/call";
import { finalizeStale, refreshInsights, runAnalysis } from "@/lib/data";
import * as tasks from "@/lib/ai/tasks";

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
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/ai/tasks", () => import("../../../e2e/stubs/tasks"));
vi.mock("@/lib/ai/sarvam", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/ai/sarvam")>(),
  transcribe: async (audio: Blob) => audio.size ? "This is a test answer from the candidate." : "",
  synthesize: async () => Buffer.from("test audio"),
}));
vi.mock("@/lib/mail", () => ({ sendInvitationMail: vi.fn().mockResolvedValue({ id: "provider-test" }) }));

const jsonRequest = (path: string, data: object, cookie = "") => new Request(`http://localhost/api/call/${path}`, {
  method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(data),
});
const intake = (email: string) => ({ interviewId: "test", name: "Candidate", email, consentVersion: CONSENT_VERSION });
const makeTurn = (id: string, len: number, cookie: string, silent = false) => {
  const form = new FormData();
  form.set("responseId", id);
  form.set("len", String(len));
  if (silent) form.set("silent", "1");
  return turn(new Request("http://localhost/api/call/turn", { method: "POST", body: form, headers: { cookie } }));
};

beforeAll(async () => {
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("EMAIL_FROM", "hiring@example.test");
  await db.insert(schema.user).values({ id: "owner", name: "Owner", email: "owner@example.test" });
  const [persona] = await db.select().from(schema.interviewer).limit(1);
  await db.insert(schema.interview).values({
    id: "test", ownerId: "owner", interviewerId: persona.id, name: "Engineer", objective: "Job-relevant skills",
    questions: [{ id: "q1", question: "Describe a project", followUps: 1 }],
  });
});
afterAll(async () => {
  const { client } = await import("@/lib/db") as unknown as { client: { close(): Promise<void> } };
  await client.close();
  vi.unstubAllEnvs();
});

it("requires explicit server-side consent and blocks impersonation through an allowlist", async () => {
  expect((await start(jsonRequest("start", { ...intake("a@example.test"), consentVersion: undefined }))).status).toBe(400);
  await db.update(schema.interview).set({ allowedEmails: ["a@example.test"] }).where(eq(schema.interview.id, "test"));
  expect((await start(jsonRequest("start", intake("a@example.test")))).status).toBe(403);
  await db.update(schema.interview).set({ allowedEmails: [] }).where(eq(schema.interview.id, "test"));
});

it("atomically claims an email even when two starts race", async () => {
  const results = await Promise.all([start(jsonRequest("start", intake("race@example.test"))), start(jsonRequest("start", intake("RACE@example.test")))]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  const rows = await db.select().from(schema.response).where(eq(schema.response.email, "race@example.test"));
  expect(rows).toHaveLength(1);
  expect(rows[0].consentVersion).toBe(CONSENT_VERSION);
  expect(rows[0].consentedAt).toBeInstanceOf(Date);
  expect(rows[0].interviewSnapshot?.questions[0].id).toBe("q1");
});

it("requires a separate session cookie; replays closure and cascades private data on deletion", async () => {
  const begun = await start(jsonRequest("start", intake("flow@example.test")));
  const { responseId } = await begun.json();
  const cookie = begun.headers.get("set-cookie")!.split(";")[0];
  expect((await makeTurn(responseId, 0, "")).status).toBe(404);
  expect((await makeTurn(responseId, 999, cookie)).status).toBe(409);
  const first = await (await makeTurn(responseId, 0, cookie)).json();
  expect(first.len).toBe(1);
  expect((await (await makeTurn(responseId, 0, cookie)).json()).len).toBe(1);
  const closing = await (await makeTurn(responseId, 1, cookie, true)).json();
  expect(closing.end).toBe(true);
  expect((await (await makeTurn(responseId, 1, cookie, true)).json()).end).toBe(true);
  expect((await end(jsonRequest("end", { responseId }))).status).toBe(404);
  expect((await end(jsonRequest("end", { responseId }, cookie))).status).toBe(200);
  expect((await end(jsonRequest("end", { responseId }, cookie))).status).toBe(200);
  await rate(jsonRequest("feedback", { responseId, satisfaction: 5, comment: "Private" }, cookie));
  await db.insert(schema.recording).values({ responseId, mime: "audio/wav", data: Buffer.from("audio") });
  await db.delete(schema.response).where(eq(schema.response.id, responseId));
  expect(await db.select().from(schema.feedback).where(eq(schema.feedback.responseId, responseId))).toHaveLength(0);
  expect(await db.select().from(schema.recording).where(eq(schema.recording.responseId, responseId))).toHaveLength(0);
  expect(await db.select().from(schema.candidateAttempt).where(eq(schema.candidateAttempt.responseId, responseId))).toHaveLength(0);
  expect((await makeTurn(responseId, 0, cookie)).status).toBe(404);
});

it("delivers personal invitations, rotates resends, and enforces owner, email, expiry and single use", async () => {
  await db.update(schema.interview).set({ invitationOnly: true }).where(eq(schema.interview.id, "test"));
  await expect(sendInvite("outsider", "test", "invite@example.test")).rejects.toThrow();
  await sendInvite("owner", "test", "invite@example.test");
  const mail = vi.mocked(sendInvitationMail).mock.calls.at(-1)![0];
  const token = new URL(mail.url).hash.split("=")[1];
  const [row] = await db.select().from(schema.invitation).where(eq(schema.invitation.email, "invite@example.test"));
  expect(row.tokenHash).toBe(tokenHash(token));
  expect(JSON.stringify(row)).not.toContain(token);
  expect(row.status).toBe("sent");
  expect((await start(jsonRequest("start", intake("invite@example.test")))).status).toBe(403);
  expect((await start(jsonRequest("start", { ...intake("wrong@example.test"), invitationToken: token }))).status).toBe(403);
  await expect(sendInvite("owner", "test", row.email)).rejects.toThrow(/one minute/);
  await db.update(schema.invitation).set({ lastAttemptAt: new Date(0) }).where(eq(schema.invitation.id, row.id));
  await sendInvite("owner", "test", row.email);
  const rotated = new URL(vi.mocked(sendInvitationMail).mock.calls.at(-1)![0].url).hash.split("=")[1];
  expect(rotated).not.toBe(token);
  expect((await start(jsonRequest("start", { ...intake(row.email), invitationToken: token }))).status).toBe(403);
  await db.update(schema.invitation).set({ expiresAt: new Date(0) }).where(eq(schema.invitation.id, row.id));
  expect((await start(jsonRequest("start", { ...intake(row.email), invitationToken: rotated }))).status).toBe(403);
  await db.update(schema.invitation).set({ expiresAt: new Date(Date.now() + 60_000) }).where(eq(schema.invitation.id, row.id));
  const started = await start(jsonRequest("start", { ...intake(row.email), invitationToken: rotated }));
  expect(started.status).toBe(200);
  const { responseId } = await started.json();
  const cookie = started.headers.get("set-cookie")!.split(";")[0];
  // Use another address to test revocation separately from this address's start rate limit.
  expect((await makeTurn(responseId, 0, cookie)).status).toBe(200);
  await revokeInvite("owner", "test", row.id);
  expect((await makeTurn(responseId, 0, cookie)).status).toBe(404);
  await expect(sendInvite("owner", "test", row.email)).rejects.toThrow(/already started/);
  await db.update(schema.interview).set({ invitationOnly: false }).where(eq(schema.interview.id, "test"));
});

it("records mail failures without returning provider internals", async () => {
  vi.mocked(sendInvitationMail).mockRejectedValueOnce(new Error("sensitive upstream response"));
  await expect(sendInvite("owner", "test", "failed@example.test")).rejects.toThrow(/Could not confirm email delivery/);
  const [row] = await db.select().from(schema.invitation).where(eq(schema.invitation.email, "failed@example.test"));
  expect(row.status).toBe("failed");
});

it("keeps usage account-scoped, removes candidate references, and scopes retention with a dry-run default", async () => {
  await db.insert(schema.user).values({ id: "other", name: "Other", email: "other@example.test" });
  const [persona] = await db.select().from(schema.interviewer).limit(1);
  await db.insert(schema.interview).values({ id: "other-role", ownerId: "other", interviewerId: persona.id, name: "Other role", objective: "Other" });
  await db.insert(schema.response).values([
    { id: "due", interviewId: "test", email: "erase@example.test", deleteAfter: new Date(0) },
    { id: "not-due", interviewId: "test", deleteAfter: new Date(Date.now() + 86_400_000) },
    { id: "legacy", interviewId: "test", deleteAfter: null },
    { id: "other-due", interviewId: "other-role", deleteAfter: new Date(0) },
  ]);
  await db.insert(schema.invitation).values({ id: "erase-invite", interviewId: "test", email: "erase@example.test", expiresAt: new Date() });
  await db.insert(schema.feedback).values({ interviewId: "test", responseId: "due", satisfaction: 5, comment: "Erase me" });
  await db.insert(schema.recording).values({ responseId: "due", mime: "audio/wav", data: Buffer.from("private") });
  await withUsage({ accountId: "owner", responseId: "due", operation: "test" }, () => recordUsage("unknown", { inputTokens: 20 }));
  const [event] = await db.select().from(schema.usageEvent);
  expect(event.accountId).toBe("owner");
  expect(event.estimatedCostMicrousd).toBeNull();
  expect((await expireAccountData("owner")).responses).toBe(1);
  expect(await db.select().from(schema.response).where(eq(schema.response.id, "due"))).toHaveLength(1);
  await expireAccountData("owner", true);
  for (const id of ["not-due", "legacy", "other-due"])
    expect(await db.select().from(schema.response).where(eq(schema.response.id, id))).toHaveLength(1);
  expect(await db.select().from(schema.response).where(eq(schema.response.id, "due"))).toHaveLength(0);
  expect(await db.select().from(schema.feedback).where(eq(schema.feedback.responseId, "due"))).toHaveLength(0);
  expect(await db.select().from(schema.recording).where(eq(schema.recording.responseId, "due"))).toHaveLength(0);
  expect(await db.select().from(schema.invitation).where(eq(schema.invitation.id, "erase-invite"))).toHaveLength(0);
  expect((await db.select().from(schema.usageEvent))[0].responseId).toBeNull();
});

it("protects maintenance with an independent secret and explicit deletion enablement", async () => {
  vi.stubEnv("RETENTION_CRON_SECRET", "test-maintenance-secret-minimum-32-characters");
  vi.stubEnv("RETENTION_ENABLED", "0");
  const req = (token = "", data: object = { dryRun: true }) => new Request("http://localhost/api/maintenance/retention", {
    method: "POST", headers: { "content-type": "application/json", authorization: token }, body: JSON.stringify(data),
  });
  expect((await maintenance(req())).status).toBe(401);
  expect((await maintenance(req("Bearer test-maintenance-secret-minimum-32-characters", {}))).status).toBe(400);
  expect((await maintenance(req("Bearer test-maintenance-secret-minimum-32-characters", { dryRun: false }))).status).toBe(403);
  const result = await maintenance(req("Bearer test-maintenance-secret-minimum-32-characters"));
  expect(result.status).toBe(200);
  expect((await result.json()).applied).toBe(false);
});

it("rate limits repeated candidate starts and prevents parallel paid turn processing", async () => {
  const begun = await start(jsonRequest("start", intake("limited@example.test")));
  const { responseId } = await begun.json();
  const cookie = begun.headers.get("set-cookie")!.split(";")[0];
  await db.update(schema.response).set({ turnLeaseUntil: new Date(Date.now() + 60_000) }).where(eq(schema.response.id, responseId));
  expect((await makeTurn(responseId, 0, cookie)).status).toBe(503);
  expect((await db.select().from(schema.response).where(eq(schema.response.id, responseId)))[0].transcript).toEqual([]);
  for (let i = 0; i < 4; i++)
    expect((await start(jsonRequest("start", intake("limited@example.test")))).status).toBe(409);
  expect((await start(jsonRequest("start", intake("limited@example.test")))).status).toBe(429);
});

it("snapshots the live interviewer and claims analysis once without making a hiring decision", async () => {
  const begun = await start(jsonRequest("start", intake("snapshot@example.test")));
  const { responseId } = await begun.json();
  const cookie = begun.headers.get("set-cookie")!.split(";")[0];
  const req = jsonRequest("end", { responseId }, cookie);
  const original = await loadCall(responseId, req);
  await db.update(schema.interview).set({ objective: "Edited objective", durationMins: 3 }).where(eq(schema.interview.id, "test"));
  const frozen = await loadCall(responseId, req);
  expect(frozen!.interview.objective).toBe(original!.interview.objective);
  expect(frozen!.interview.durationMins).toBe(original!.interview.durationMins);
  expect(frozen!.response.interviewSnapshot?.persona?.name).toBe(original!.interviewer.name);
  await db.update(schema.response).set({
    status: "completed", analysisStatus: "pending",
    transcript: [
      { role: "agent", text: "Describe a project", at: 0 },
      { role: "user", text: "I built a queue for burst traffic and measured the latency.", at: 1 },
    ],
  }).where(eq(schema.response.id, responseId));
  const analyzed = vi.spyOn(tasks, "analyzeTranscript");
  await Promise.all([runAnalysis(responseId), runAnalysis(responseId)]);
  await runAnalysis(responseId);
  expect(analyzed).toHaveBeenCalledTimes(1);
  const [r] = await db.select().from(schema.response).where(eq(schema.response.id, responseId));
  expect(r.analytics?.overallScore).toBe(75);
  expect(r.candidateStatus).toBe("none");
  analyzed.mockRestore();
});

it("finalizes empty abandoned sessions and uses each session's original time limit", async () => {
  const [iv] = await db.select().from(schema.interview).where(eq(schema.interview.id, "test"));
  await db.insert(schema.response).values([
    { id: "abandoned", interviewId: iv.id, createdAt: new Date(Date.now() - 3_600_000) },
    { id: "long-call", interviewId: iv.id, createdAt: new Date(Date.now() - 30 * 60_000),
      interviewSnapshot: { name: "Original", objective: "Original", questions: [], language: "en-IN", durationMins: 60 } },
  ]);
  const finalized = await finalizeStale(iv);
  expect(finalized).toContain("abandoned");
  expect(finalized).not.toContain("long-call");
  await runAnalysis("abandoned");
  const [r] = await db.select().from(schema.response).where(eq(schema.response.id, "abandoned"));
  expect(r.status).toBe("completed");
  expect(r.analysisStatus).toBe("done");
  expect(r.analytics).toBeNull();
});

it("does not cache insights for a response deleted while generation was running", async () => {
  const [analyzed] = await db.select().from(schema.response).where(eq(schema.response.email, "snapshot@example.test"));
  const generated = vi.spyOn(tasks, "generateInsights").mockImplementationOnce(async () => {
    await db.delete(schema.response).where(eq(schema.response.id, analyzed.id));
    return ["Erased candidate's private summary"];
  });
  await refreshInsights("test");
  const [iv] = await db.select().from(schema.interview).where(eq(schema.interview.id, "test"));
  expect(iv.insights).toEqual([]);
  generated.mockRestore();
});
