import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { GET as status, POST as upload } from "@/app/api/call/recording/route";
import { cookieName, newToken, tokenHash } from "@/lib/security";

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

const token = newToken();
const transcript = [{ role: "agent" as const, text: "Hello", at: 1 }, { role: "user" as const, text: "My original answer", at: 2 }];
const timeline = { version: 1, durationMs: 2000, turns: [{ turnIndex: 0, offsetMs: 0 }, { turnIndex: 1, offsetMs: 600 }] };
function request(timing: unknown = timeline, audio = "original audio", cookie = `${cookieName("response")}=${token}`) {
  const form = new FormData();
  form.set("responseId", "response");
  form.set("file", new Blob([audio], { type: "audio/webm" }), "call.webm");
  if (timing !== null) form.set("timeline", typeof timing === "string" ? timing : JSON.stringify(timing));
  return new Request("http://localhost/api/call/recording", { method: "POST", body: form, headers: { cookie } });
}

beforeAll(async () => {
  await db.insert(schema.user).values({ id: "owner", name: "Owner", email: "owner@example.test" });
  await db.insert(schema.interview).values({ id: "role", ownerId: "owner", interviewerId: "preset-bob", name: "Role", objective: "Skills" });
});
beforeEach(async () => {
  await db.delete(schema.response);
  await db.insert(schema.response).values({ id: "response", interviewId: "role", status: "completed", candidateStatus: "shortlisted",
    transcript, sessionHash: tokenHash(token), sessionExpiresAt: new Date(Date.now() + 3 * 60 * 60_000) });
});
afterAll(async () => {
  const { client } = await import("@/lib/db") as unknown as { client: { close(): Promise<void> } };
  await client.close();
});

it("stores recording bytes and validated cues together without changing report data", async () => {
  expect((await upload(request())).status).toBe(200);
  const [r] = await db.select().from(schema.response);
  expect(r.transcript).toEqual([{ ...transcript[0], recordingOffsetMs: 0 }, { ...transcript[1], recordingOffsetMs: 600 }]);
  expect(r.hasRecording).toBe(true);
  expect(r.candidateStatus).toBe("shortlisted");
  expect(r.sessionHash).toBe(tokenHash(token));
  const [recording] = await db.select().from(schema.recording);
  expect(recording.data.toString()).toBe("original audio");
});

it("accepts old clients without timestamps", async () => {
  expect((await upload(request(null))).status).toBe(200);
  expect((await db.select().from(schema.response))[0].transcript).toEqual(transcript);
});

it("rejects invalid timing atomically, before storing audio or changing the transcript", async () => {
  expect((await upload(request({ ...timeline, turns: [{ turnIndex: 5, offsetMs: 100 }] }))).status).toBe(400);
  expect((await upload(request("bad JSON"))).status).toBe(400);
  expect(await db.select().from(schema.recording)).toEqual([]);
  const [r] = await db.select().from(schema.response);
  expect(r.transcript).toEqual(transcript);
  expect(r.hasRecording).toBe(false);
});

it("replayed uploads cannot replace the recording or retime its transcript", async () => {
  expect((await upload(request())).status).toBe(200);
  expect((await upload(request({ ...timeline, turns: [{ turnIndex: 1, offsetMs: 1800 }] }, "replacement"))).status).toBe(200);
  expect((await db.select().from(schema.recording))[0].data.toString()).toBe("original audio");
  expect((await db.select().from(schema.response))[0].transcript[1].recordingOffsetMs).toBe(600);
});

it("concurrent uploads keep the winning recording and its matching cues as one pair", async () => {
  const second = { ...timeline, turns: [{ turnIndex: 1, offsetMs: 1200 }] };
  const results = await Promise.all([upload(request(timeline, "first")), upload(request(second, "second"))]);
  expect(results.map((r) => r.status)).toEqual([200, 200]);
  const [recording] = await db.select().from(schema.recording);
  const [r] = await db.select().from(schema.response);
  expect(r.transcript[1].recordingOffsetMs).toBe(recording.data.toString() === "first" ? 600 : 1200);
});

it("requires the candidate credential and a completed call within the upload window", async () => {
  expect((await upload(request(timeline, "audio", ""))).status).toBe(404);
  expect((await upload(request(timeline, "audio", `${cookieName("response")}=${newToken()}`))).status).toBe(404);
  await db.update(schema.response).set({ status: "in_progress" }).where(eq(schema.response.id, "response"));
  expect((await upload(request())).status).toBe(409);
  await db.update(schema.response).set({ status: "completed", createdAt: new Date(Date.now() - 4 * 60 * 60_000) });
  expect((await upload(request())).status).toBe(410);
  expect(await db.select().from(schema.recording)).toEqual([]);
});

it("acknowledges a saved upload only to its candidate session without exposing audio or transcripts", async () => {
  const check = (cookie = `${cookieName("response")}=${token}`) => status(new Request("http://localhost/api/call/recording?responseId=response", { headers: { cookie } }));
  expect((await check("")).status).toBe(404);
  expect((await check(`${cookieName("response")}=${newToken()}`)).status).toBe(404);
  expect(await (await check()).json()).toEqual({ uploaded: false });
  await upload(request());
  const confirmed = await check();
  expect(confirmed.headers.get("cache-control")).toBe("no-store");
  expect(await confirmed.json()).toEqual({ uploaded: true });
  await db.update(schema.response).set({ sessionExpiresAt: new Date(0) });
  expect((await check()).status).toBe(404);
});

it("does not allow acknowledgement after the upload window or after deletion", async () => {
  const check = () => status(new Request("http://localhost/api/call/recording?responseId=response", { headers: { cookie: `${cookieName("response")}=${token}` } }));
  await db.update(schema.response).set({ createdAt: new Date(Date.now() - 4 * 60 * 60_000) });
  expect((await check()).status).toBe(410);
  await db.delete(schema.response);
  expect((await check()).status).toBe(404);
});

it("rejects recovery acknowledgement after its personal invitation is revoked", async () => {
  await db.insert(schema.invitation).values({ id: "revoked-invite", interviewId: "role", email: "candidate@example.test", expiresAt: new Date(Date.now() + 60_000), revokedAt: new Date() });
  await db.update(schema.response).set({ invitationId: "revoked-invite" });
  const result = await status(new Request("http://localhost/api/call/recording?responseId=response", { headers: { cookie: `${cookieName("response")}=${token}` } }));
  expect(result.status).toBe(404);
});
