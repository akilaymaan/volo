import { expect, type BrowserContext, type Page, test } from "@playwright/test";
import { TEST_USER } from "./fixtures";
import { CONSENT_VERSION } from "../src/lib/privacy";
import { RECOVERY_DB, RECOVERY_STORE } from "../src/lib/recording-recovery-store";

// One recruiter journey end to end: sign up → create interview → candidate voice call → report.
test.describe.configure({ mode: "serial" });

let interviewUrl = "";
let interviewId = "";
let reportId = "";
let templateId = "";
let templatedInterviewId = "";
let inboxFailureInterviewId = "";
let recruiterCookies: Awaited<ReturnType<BrowserContext["cookies"]>> | undefined;

async function signIn(page: Page) {
  if (recruiterCookies) {
    await page.context().addCookies(recruiterCookies);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    return;
  }
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(TEST_USER.email);
  await page.getByLabel("Password").fill(TEST_USER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  recruiterCookies = await page.context().cookies();
}

async function recoveryCount(page: Page) {
  return page.evaluate(async ({ database, store }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(database, 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    return new Promise<number>((resolve, reject) => {
      const tx = db.transaction(store); const request = tx.objectStore(store).count();
      tx.oncomplete = () => { db.close(); resolve(request.result); }; tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }, { database: RECOVERY_DB, store: RECOVERY_STORE });
}

async function completeVoiceInterview(page: Page, name: string, email: string) {
  await page.goto(`/i/${interviewId}`);
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Allow microphone" }).click();
  await expect(page.getByText("Microphone connected", { exact: false })).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Start interview" }).click();
  const thanks = page.getByRole("heading", { name: `Thank you, ${name.split(" ")[0]}!`, exact: true });
  const done = page.getByRole("button", { name: "I'm done answering" });
  const deadline = Date.now() + 60_000;
  while (!(await thanks.isVisible()) && Date.now() < deadline) {
    if (await done.isEnabled({ timeout: 500 }).catch(() => false)) {
      await page.waitForTimeout(700);
      await done.click({ timeout: 1000 }).catch(() => {});
    }
    await page.waitForTimeout(300);
  }
  await expect(thanks).toBeVisible();
}

test("dashboard requires an account", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Live interview", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: "test-results/landing-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/landing-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/dashboard/inbox");
  await expect(page).toHaveURL(/\/sign-in$/);
  const res = await page.request.get("/api/interviews/anything/export");
  expect(res.status()).toBe(401);
});

test("recruiter signs up and creates an interview", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill(TEST_USER.name);
  await page.getByLabel("Work email").fill(TEST_USER.email);
  await page.getByLabel("Password").fill(TEST_USER.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Create your first interview")).toBeVisible();

  await page.getByRole("link", { name: "New interview" }).first().click();
  await page.getByLabel("Interview name").fill("Frontend Engineer screen");
  await page.getByLabel("Objective").fill("Find React engineers who ship production apps.");
  await page.getByRole("button", { name: "Generate" }).click();
  await expect(page.getByLabel("Question 5")).toBeVisible();
  await page.getByRole("radio", { name: "Empathetic Bob" }).click();
  await page.getByRole("button", { name: "Create interview" }).click();

  await expect(page).toHaveURL(/\/dashboard\/interviews\/[\w-]+$/);
  const dialog = page.getByRole("dialog", { name: "Share with candidates" });
  await expect(dialog).toBeVisible();
  interviewUrl = await dialog.getByLabel("Interview link").inputValue();
  interviewId = interviewUrl.split("/i/")[1];
  expect(interviewId).toBeTruthy();
});

test("candidate completes a voice interview", async ({ page }) => {
  // Let the server save one answer, then lose its reply. The replay must retain
  // the original answer's recording position even though userText comes back empty.
  let lostReply = false;
  let uploads = 0;
  let blocked = true;
  let lostUploadReply = false;
  await page.route("**/api/call/recording**", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    uploads++;
    if (blocked) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Temporary outage" }) });
    if (!lostUploadReply) {
      lostUploadReply = true;
      const saved = await route.fetch();
      expect(saved.status()).toBe(200);
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Lost upload acknowledgement" }) });
    }
    await route.continue();
  });
  await page.route("**/api/call/turn", async (route) => {
    if (!lostReply && route.request().postDataBuffer()?.includes(Buffer.from('name="chunk"'))) {
      lostReply = true;
      await route.fetch();
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Simulated lost reply" }) });
    } else await route.continue();
  });
  await page.goto(`/i/${interviewId}`);
  await expect(page.getByRole("heading", { name: "Frontend Engineer screen" })).toBeVisible();
  await page.getByLabel("Your name").fill("Asha Tester");
  await page.getByLabel("Email").fill("asha@example.test");
  await page.getByRole("button", { name: "Allow microphone" }).click();
  await expect(page.getByText("Microphone connected")).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Start interview" }).click();

  // Greeting, then three answers; the mock interviewer closes after the third
  await expect(page.getByText(/Hi Asha Tester! I'm Empathetic Bob/)).toBeVisible({ timeout: 20_000 });
  const done = page.getByRole("button", { name: "I'm done answering" });
  const thanks = page.getByRole("heading", { name: "Thank you, Asha!" });
  const deadline = Date.now() + 60_000;
  // Answer whenever the interviewer is listening, until it wraps up
  while (!(await thanks.isVisible()) && Date.now() < deadline) {
    // The closing turn can remove the button between these checks.
    if (await done.isEnabled({ timeout: 500 }).catch(() => false)) {
      await page.waitForTimeout(700); // let the fake mic record something
      await done.click({ timeout: 1000 }).catch(() => {});
    }
    await page.waitForTimeout(300);
  }
  await expect(thanks).toBeVisible({ timeout: 30_000 });
  expect(lostReply).toBe(true);
  await page.getByRole("radio", { name: "5 out of 5" }).click();
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page.getByText("Thanks for the feedback")).toBeVisible();
  await expect.poll(() => uploads, { timeout: 20_000 }).toBe(3);
  await expect(page.getByRole("button", { name: "Retry recording upload" })).toBeEnabled();
  expect(await recoveryCount(page)).toBe(1);
  await page.reload();
  await page.getByRole("link", { name: "Open Recording recovery", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recording recovery", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Recording upload" })).toBeVisible();
  expect(uploads).toBe(3); // Restored recordings need an explicit retry, not a new interview.
  await page.screenshot({ path: "test-results/recording-recovery-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/recording-recovery-mobile.png", fullPage: true });
  await page.context().setOffline(true);
  await page.getByRole("button", { name: "Retry recording upload" }).click();
  await expect(page.getByText("You are offline.", { exact: false })).toBeVisible();
  expect(uploads).toBe(3);
  blocked = false;
  await page.context().setOffline(false); // An enabled recovery resumes on reconnect.
  await expect(page.getByText("Recording saved successfully. Its local copy was removed.", { exact: true })).toBeVisible({ timeout: 20_000 });
  expect(lostUploadReply).toBe(true);
  expect(uploads).toBe(4); // A status check resolves the saved-but-lost reply without resending bytes.
  expect(await recoveryCount(page)).toBe(0);
});

test("recovery purges expired copies, refuses missing credentials and supports explicit discard", async ({ page }) => {
  await page.goto("/recording-recovery");
  await expect(page.getByText("No pending recordings on this browser.", { exact: false })).toBeVisible();
  await page.evaluate(async ({ database, store }) => {
    const db = await new Promise<IDBDatabase>((resolve) => { const request = indexedDB.open(database, 1); request.onsuccess = () => resolve(request.result); });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      const base = { version: 1, interviewId: "role", audio: new Blob(["test audio"], { type: "audio/webm" }), timeline: null, tabSwitches: 0, createdAt: Date.now() - 1000, expiresAt: Date.now() + 60_000 };
      tx.objectStore(store).put({ ...base, responseId: "no-session" });
      tx.objectStore(store).put({ ...base, responseId: "expired", expiresAt: Date.now() - 1 });
      tx.objectStore(store).put({ ...base, responseId: "invalid", version: 99 });
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }, { database: RECOVERY_DB, store: RECOVERY_STORE });
  await page.reload();
  await expect(page.getByRole("region", { name: "Recording upload" })).toHaveCount(1);
  expect(await recoveryCount(page)).toBe(1);
  await page.getByRole("button", { name: "Retry recording upload" }).click();
  await expect(page.getByText("This browser no longer has permission to upload.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry recording upload" })).toBeDisabled();
  expect(await recoveryCount(page)).toBe(1); // A permanent failure does not silently throw away the only copy.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download recording" }).click();
  expect((await download).suggestedFilename()).toBe("interview-recording.webm");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove local copy" }).click();
  await expect(page.getByText("Local copy removed. Server-side interview data was not deleted.", { exact: true })).toBeVisible();
  expect(await recoveryCount(page)).toBe(0);
});

test("unavailable browser storage keeps a memory-only copy and permanent host limits do not retry", async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, "indexedDB", { get() { throw new DOMException("Storage disabled", "SecurityError"); } }); });
  let uploads = 0;
  await page.route("**/api/call/recording**", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    uploads++;
    return route.fulfill({ status: 413, body: "Host size limit" });
  });
  await completeVoiceInterview(page, "Storage Denied", "storage-denied@example.test");
  await expect(page.getByText("Browser storage is unavailable or full.", { exact: false })).toBeVisible();
  await expect(page.getByText("The recording exceeds this host's upload size limit.", { exact: false })).toBeVisible();
  expect(uploads).toBe(1);
  await expect(page.getByRole("button", { name: "Retry recording upload" })).toBeDisabled();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download recording" }).click();
  expect(await download).toBeTruthy();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove local copy" }).click();
  await expect(page.getByText("Local recording copy removed.", { exact: false })).toBeVisible();
});

test("a full recovery store does not evict older pending recordings", async ({ page }) => {
  await page.goto("/recording-recovery");
  await expect(page.getByText("No pending recordings on this browser.", { exact: false })).toBeVisible();
  await page.evaluate(async ({ database, store }) => {
    const db = await new Promise<IDBDatabase>((resolve) => { const request = indexedDB.open(database, 1); request.onsuccess = () => resolve(request.result); });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      for (let i = 0; i < 3; i++) tx.objectStore(store).put({ version: 1, responseId: `older-${i}`, interviewId: "other-role",
        audio: new Blob(["older test recording"], { type: "audio/webm" }), timeline: null, tabSwitches: 0, createdAt: Date.now(), expiresAt: Date.now() + 60_000 });
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }, { database: RECOVERY_DB, store: RECOVERY_STORE });
  await page.route("**/api/call/recording**", (route) => route.request().method() === "POST"
    ? route.fulfill({ status: 413, body: "Host size limit" }) : route.continue());
  await completeVoiceInterview(page, "Quota Full", "quota-full@example.test");
  await expect(page.getByText("Browser storage is unavailable or full.", { exact: false })).toBeVisible();
  await expect(page.getByText("The recording exceeds this host's upload size limit.", { exact: false })).toBeVisible();
  expect(await recoveryCount(page)).toBe(3);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove local copy" }).click();
  expect(await recoveryCount(page)).toBe(3);
});

test("the same email can't take it twice", async ({ request }) => {
  const res = await request.post("/api/call/start", {
    data: { interviewId, name: "Asha Tester", email: "ASHA@example.test", consentVersion: CONSENT_VERSION },
  });
  expect(res.status()).toBe(409);
});

test("public call API is idempotent and strict", async ({ request }) => {
  const start = await request.post("/api/call/start", {
    data: { interviewId, name: "Ravi Retry", email: "ravi@example.test", consentVersion: CONSENT_VERSION },
  });
  const { responseId } = await start.json();

  const turn = (len: number) =>
    request.post("/api/call/turn", { multipart: { responseId, len: String(len) } });
  const first = await (await turn(0)).json();
  expect(first.len).toBe(1);
  // A retry of the same turn replays the saved reply instead of writing it twice
  const retry = await (await turn(0)).json();
  expect(retry.say).toBe(first.say);
  expect(retry.len).toBe(1);

  const badType = await request.post("/api/call/recording", {
    multipart: {
      responseId,
      file: { name: "x", mimeType: "audio/webm, text/html", buffer: Buffer.from("<script>alert(1)</script>") },
    },
  });
  expect(badType.status()).toBe(415);

  // Ratings only count for finished interviews
  const early = await request.post("/api/call/feedback", { data: { responseId, satisfaction: 1 } });
  expect(early.status()).toBe(404);
});

test("recruiter reviews the scored report", async ({ page }) => {
  await signIn(page);
  await page.goto(`/dashboard/interviews/${interviewId}`);
  const row = page.getByRole("link", { name: /Asha Tester/ });
  await expect(row).toBeVisible();
  await expect(page.getByText("Hire").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("5 / 5")).toBeVisible();

  await row.click();
  await expect(page).toHaveURL(/\/responses\/[\w-]+$/);
  reportId = page.url().split("/responses/")[1];
  await expect(page.getByRole("heading", { name: "Asha Tester" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Overall: 75 out of 100" })).toBeVisible();
  await expect(page.getByText("This is a test answer from the candidate.").first()).toBeVisible();
  await expect(page.locator("audio")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("AI assessment — human review required.", { exact: false })).toBeVisible();
  await expect(page.getByText("Rubric score: 3 / 4").first()).toBeVisible();

  const answerAudio = page.getByRole("button", { name: /^Play transcript turn 2 at/ });
  await expect(answerAudio).toBeEnabled({ timeout: 15_000 });
  const offset = Number(await answerAudio.getAttribute("data-offset-ms"));
  expect(offset).toBeGreaterThan(0);
  await answerAudio.click();
  const playedAt = await page.locator("audio").evaluate((element) => { const audio = element as HTMLAudioElement; audio.pause(); return audio.currentTime; });
  expect(Math.abs(playedAt - offset / 1000)).toBeLessThan(0.35);
  await expect(page.locator("#turn-1")).toHaveAttribute("aria-current", "true");
  await page.getByRole("link", { name: "Play evidence from transcript turn 2", exact: true }).click();
  const evidenceAt = await page.locator("audio").evaluate((element) => { const audio = element as HTMLAudioElement; audio.pause(); return audio.currentTime; });
  expect(Math.abs(evidenceAt - offset / 1000)).toBeLessThan(0.35);
  await expect(page).toHaveURL(/#turn-1$/);
  await page.screenshot({ path: "test-results/recording-review-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/recording-review-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.getByRole("combobox", { name: "Candidate status" }).click();
  await page.getByRole("option", { name: "Shortlisted" }).click();
  await expect(page.getByText("Marked as shortlisted")).toBeVisible();

  const csv = await page.request.get(`/api/interviews/${interviewId}/export`);
  expect(csv.status()).toBe(200);
  const body = await csv.text();
  expect(body).toContain("Asha Tester");
  expect(body).toContain("Shortlisted");

  await page.goto(`/dashboard/interviews/${interviewId}`);
  await page.getByRole("tab", { name: "Insights" }).click();
  await page.getByRole("button", { name: "Generate insights" }).click();
  await expect(page.getByText("Communication scores are consistently strong across the pool.")).toBeVisible();
  await page.getByRole("tab", { name: "Invitations", exact: true }).click();
  await page.getByLabel("Candidate email").fill("invited@example.test");
  await page.getByRole("button", { name: "Send invitation", exact: true }).click();
  await expect(page.getByText("invited@example.test", { exact: true })).toBeVisible();
});

test("reports without captured timestamps retain recording playback and plain transcript links", async ({ page, request }) => {
  await signIn(page);
  const audio = await page.request.get(`/api/recordings/${reportId}`);
  expect(audio.status()).toBe(200);
  const begun = await request.post("/api/call/start", { data: {
    interviewId, name: "Legacy Timing", email: "legacy-timing@example.test", consentVersion: CONSENT_VERSION,
  } });
  const { responseId } = await begun.json();
  let len = 0;
  for (let i = 0; i < 4; i++) {
    const result = await request.post("/api/call/turn", { multipart: {
      responseId, len: String(len),
      ...(i ? { chunk: { name: "answer.webm", mimeType: "audio/webm", buffer: Buffer.from("mock answer") } } : {}),
    } });
    expect(result.status()).toBe(200);
    len = (await result.json()).len;
  }
  expect((await request.post("/api/call/end", { data: { responseId } })).status()).toBe(200);
  // Old clients upload audio without a timeline. No server-created timestamp is substituted.
  expect((await request.post("/api/call/recording", { multipart: {
    responseId, file: { name: "legacy.webm", mimeType: "audio/webm", buffer: await audio.body() },
  } })).status()).toBe(200);
  await page.goto(`/dashboard/interviews/${interviewId}/responses/${responseId}`);
  await expect(page.getByText("Audio timestamps were not captured for this interview.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Play transcript turn/ })).toHaveCount(0);
  await expect(page.locator('a[href="#turn-1"]').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("audio")).toBeVisible();
});

test("recording failures leave the transcript readable and audio shortcuts disabled", async ({ page }) => {
  await signIn(page);
  await page.route(`**/api/recordings/${reportId}`, (route) => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.goto(`/dashboard/interviews/${interviewId}/responses/${reportId}`);
  await expect(page.getByText("The recording couldn't be loaded.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Play transcript turn 2 at/ })).toBeDisabled();
  await expect(page.locator("#turn-1")).toContainText("This is a test answer from the candidate.");
  await expect(page.locator('a[href="#turn-1"]').first()).toBeVisible();
});

test("recruiter previews CSV recipients, sends eligible invitations and cannot import them twice", async ({ page }) => {
  await signIn(page);
  await page.goto(`/dashboard/interviews/${interviewId}`);
  await page.getByRole("tab", { name: "Invitations", exact: true }).click();
  const bulk = page.getByRole("region", { name: "Bulk invitations and reminders" });
  const template = await bulk.getByRole("link", { name: "Download CSV template" }).getAttribute("href");
  expect(decodeURIComponent(template!.split(",").slice(1).join(","))).toBe("name,email\n");
  await bulk.getByLabel("Recipient CSV").setInputFiles({
    name: "recipients.csv", mimeType: "text/csv",
    buffer: Buffer.from("name,email\nAsha,asha@example.test\nInvited,invited@example.test\nNew One,bulk-one@example.test\nNew Two,bulk-two@example.test\nDuplicate,BULK-ONE@example.test\nInvalid,not-an-email\n"),
  });
  await bulk.getByRole("button", { name: "Preview CSV" }).click();
  await expect(bulk.getByText("2 ready to send · 4 skipped")).toBeVisible();
  await expect(bulk.getByText("Candidate has already started or completed.")).toBeVisible();
  const send = bulk.getByRole("button", { name: "Send 2 invitations", exact: true });
  await expect(send).toBeDisabled();
  await page.screenshot({ path: "test-results/bulk-invitations-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/bulk-invitations-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await bulk.getByRole("checkbox").check();
  await send.click();
  await expect(bulk.getByRole("status")).toHaveText("2 accepted by email provider, 0 failed or unconfirmed, 0 not attempted.");
  await expect(page.getByRole("list", { name: "Invitations", exact: true }).getByText("bulk-one@example.test", { exact: true })).toBeVisible();
  await bulk.getByRole("button", { name: "Preview CSV" }).click();
  await expect(bulk.getByText("0 ready to send · 6 skipped")).toBeVisible();
  await expect(bulk.getByRole("checkbox")).toHaveCount(0);
  await bulk.getByLabel("Send type").selectOption("reminder");
  await bulk.getByRole("button", { name: "Preview CSV" }).click();
  await expect(bulk.getByText("0 ready to send · 6 skipped")).toBeVisible();
  await expect(bulk.getByText("Wait 24 hours after the last send attempt.").first()).toBeVisible();
});

test("a recruiter can stop a bulk send after its in-flight recipient", async ({ page }) => {
  await signIn(page);
  await page.goto(`/dashboard/interviews/${interviewId}`);
  await page.getByRole("tab", { name: "Invitations", exact: true }).click();
  const bulk = page.getByRole("region", { name: "Bulk invitations and reminders" });
  await bulk.getByLabel("Recipient CSV").setInputFiles({ name: "stop.csv", mimeType: "text/csv", buffer: Buffer.from("email\nstop-one@example.test\nstop-two@example.test\nstop-three@example.test") });
  await bulk.getByRole("button", { name: "Preview CSV" }).click();
  await expect(bulk.getByText("3 ready to send · 0 skipped")).toBeVisible();
  await bulk.getByRole("checkbox").check();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let sends = 0;
  await page.route(`**/dashboard/interviews/${interviewId}`, async (route) => {
    if (route.request().method() === "POST" && route.request().headers()["next-action"]) { sends++; if (sends === 1) await gate; }
    await route.continue();
  });
  try {
    await bulk.getByRole("button", { name: "Send 3 invitations" }).click();
    await bulk.getByRole("button", { name: "Stop after current send" }).click();
  } finally { release(); }
  await expect(bulk.getByRole("status")).toHaveText("1 accepted by email provider, 0 failed or unconfirmed, 2 not attempted.");
  expect(sends).toBe(1);
  await expect(page.getByRole("list", { name: "Invitations", exact: true }).getByText("stop-two@example.test", { exact: true })).toHaveCount(0);
});

test("ambiguous bulk-send transport failures stop the batch without automatic retries", async ({ page }) => {
  await signIn(page);
  await page.goto(`/dashboard/interviews/${interviewId}`);
  await page.getByRole("tab", { name: "Invitations", exact: true }).click();
  const bulk = page.getByRole("region", { name: "Bulk invitations and reminders" });
  await bulk.getByLabel("Recipient CSV").setInputFiles({ name: "network.csv", mimeType: "text/csv", buffer: Buffer.from("email\nnetwork-one@example.test\nnetwork-two@example.test") });
  await bulk.getByRole("button", { name: "Preview CSV" }).click();
  await expect(bulk.getByText("2 ready to send · 0 skipped")).toBeVisible();
  await bulk.getByRole("checkbox").check();
  let sends = 0;
  await page.route(`**/dashboard/interviews/${interviewId}`, async (route) => {
    if (route.request().method() === "POST" && route.request().headers()["next-action"]) { sends++; await route.abort("failed"); }
    else await route.continue();
  });
  await bulk.getByRole("button", { name: "Send 2 invitations" }).click();
  await expect(bulk.getByRole("status")).toHaveText("0 accepted by email provider, 1 failed or unconfirmed, 1 not attempted.");
  await expect(bulk.getByText("Send not confirmed.", { exact: false })).toBeVisible();
  expect(sends).toBe(1);
});

test("candidate credentials do not leak through report identifiers", async ({ request }) => {
  expect((await request.post("/api/call/end", { data: { responseId: reportId } })).status()).toBe(404);
  expect((await request.post("/api/call/feedback", { data: { responseId: reportId, satisfaction: 1 } })).status()).toBe(404);
  expect((await request.get(`/api/recordings/${reportId}`)).status()).toBe(401);
  expect((await request.post("/api/call/start", { data: { interviewId, name: "No Consent", email: "noconsent@example.test" } })).status()).toBe(400);
});

test("privacy remains accessible without API usage and maintenance is guarded", async ({ page, request }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Privacy and data retention" }).click();
  await expect(page.getByRole("heading", { name: "Privacy and data retention" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete expired data" })).toBeVisible();
  await expect(page.getByText("Recent usage", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Estimated priced usage (USD)", { exact: true })).toHaveCount(0);
  expect((await request.post("/api/maintenance/retention", { data: { dryRun: true } })).status()).toBe(401);
  expect((await request.post("/api/maintenance/retention", {
    headers: { authorization: "Bearer e2e-maintenance-secret-not-for-production" }, data: { dryRun: false },
  })).status()).toBe(403);
});

test("recruiter compares evidence-backed reports for the same role", async ({ page, request }) => {
  const begun = await request.post("/api/call/start", {
    data: { interviewId, name: "Sam Compare", email: "sam@example.test", consentVersion: CONSENT_VERSION },
  });
  expect(begun.status()).toBe(200);
  const { responseId } = await begun.json();
  const first = await request.post("/api/call/turn", { multipart: { responseId, len: "0" } });
  let len = (await first.json()).len;
  for (let answer = 0; answer < 3; answer++) {
    const reply = await request.post("/api/call/turn", { multipart: {
      responseId, len: String(len),
      chunk: { name: "answer.webm", mimeType: "audio/webm", buffer: Buffer.from("mock audio") },
    } });
    expect(reply.status()).toBe(200);
    len = (await reply.json()).len;
  }
  expect((await request.post("/api/call/end", { data: { responseId } })).status()).toBe(200);
  await signIn(page);
  await page.goto(`/dashboard/interviews/${interviewId}`);
  await page.getByLabel("Asha Tester", { exact: true }).check();
  await expect(page.getByLabel("Sam Compare", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Sam Compare", { exact: true }).check();
  await page.getByRole("button", { name: "Compare selected" }).click();
  await expect(page.getByRole("heading", { name: "Compare candidates", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Asha Tester" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Sam Compare" })).toBeVisible();
  await expect(page.getByText("3 / 5 assessed").first()).toBeVisible();
});

test("review inbox filters completed candidates without marking reports viewed", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Review inbox", exact: true }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/inbox$/);
  await expect(page.getByRole("navigation", { name: "Main", exact: true }).getByRole("link", { name: "Review inbox", exact: true })).toHaveAttribute("aria-current", "page");
  const candidates = page.getByRole("list", { name: "Review inbox candidates" });
  const sam = candidates.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Sam Compare", exact: true }) });
  await expect(sam).toContainText("Unopened report");
  await page.getByRole("button", { name: "Refresh inbox" }).click();
  await expect(sam).toContainText("Unopened report");
  await expect(candidates.getByRole("link", { name: "Asha Tester", exact: true })).toHaveCount(0);
  const filters = page.getByRole("form", { name: "Inbox filters" });
  await filters.getByLabel("Attention type", { exact: true }).selectOption("unopened");
  await filters.getByLabel("Interview", { exact: true }).selectOption(interviewId);
  const today = new Date().toISOString().slice(0, 10);
  await filters.getByLabel("From (UTC)", { exact: true }).fill(today);
  await filters.getByLabel("Through (UTC)", { exact: true }).fill(today);
  await filters.getByRole("button", { name: "Apply filters" }).click();
  await expect(sam).toBeVisible();
  await expect(page).toHaveURL(/category=unopened/);
  await filters.getByLabel("Review status", { exact: true }).selectOption("rejected");
  await filters.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("heading", { name: "No attention items match these filters", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Reset filters", exact: true }).click();
  await candidates.getByRole("link", { name: "Sam Compare", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sam Compare", exact: true })).toBeVisible();
  await page.goto("/dashboard/inbox?category=unopened");
  await expect(candidates.getByRole("link", { name: "Sam Compare", exact: true })).toHaveCount(0);
  await page.goto("/dashboard/inbox?category=decision");
  await expect(sam).toContainText("Needs decision"); // Viewing is not a hiring decision.
  await page.goto("/dashboard/inbox?category=recording");
  await expect(candidates.getByRole("link", { name: "Storage Denied", exact: true })).toBeVisible();
  await expect(candidates.getByRole("link", { name: "Asha Tester", exact: true })).toHaveCount(0);
  await page.goto("/dashboard/inbox?from=2026-02-30");
  await expect(page.getByRole("alert").filter({ hasText: "Invalid inbox filters" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Review inbox candidates" })).toHaveCount(0);
});

test("inbox shows failed analysis across interviews and retries only after confirmation", async ({ page }) => {
  await signIn(page);
  await page.goto("/dashboard/interviews/new");
  await page.getByLabel("Interview name").fill("Inbox analysis failure");
  await page.getByLabel("Objective").fill("Check explicit analysis retry behavior.");
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(page.getByLabel("Question 5")).toBeVisible();
  await page.getByRole("button", { name: "Create interview", exact: true }).click();
  const share = page.getByRole("dialog", { name: "Share with candidates" });
  await expect(share).toBeVisible();
  inboxFailureInterviewId = (await share.getByLabel("Interview link").inputValue()).split("/i/")[1];
  const begun = await page.request.post("/api/call/start", { data: { interviewId: inboxFailureInterviewId, name: "Inbox Failed", email: "inbox-failed@example.test", consentVersion: CONSENT_VERSION } });
  expect(begun.status()).toBe(200);
  const { responseId } = await begun.json();
  let len = 0;
  for (let i = 0; i < 4; i++) {
    const turn = await page.request.post("/api/call/turn", { multipart: { responseId, len: String(len), ...(i ? { chunk: { name: "answer.webm", mimeType: "audio/webm", buffer: Buffer.from("test audio") } } : {}) } });
    expect(turn.status()).toBe(200); len = (await turn.json()).len;
  }
  expect((await page.request.post("/api/call/end", { data: { responseId } })).status()).toBe(200);
  await page.goto("/dashboard/inbox?category=failed");
  const candidates = page.getByRole("list", { name: "Review inbox candidates" });
  const row = candidates.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Inbox Failed", exact: true }) });
  await expect(row).toContainText("Analysis failed or stalled", { timeout: 30_000 });
  await expect(row.getByRole("link", { name: "Inbox analysis failure", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/review-inbox-desktop.png", fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/review-inbox-mobile.png", fullPage: true, animations: "disabled" });
  let retries = 0;
  await page.route("**/dashboard/inbox**", async (route) => {
    if (route.request().method() === "POST" && route.request().headers()["next-action"]) retries++;
    await route.continue();
  });
  await row.getByRole("button", { name: "Retry analysis", exact: true }).click();
  const confirm = page.getByRole("alertdialog", { name: "Retry this AI analysis?", exact: true });
  await expect(confirm).toContainText("may incur provider charges");
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(retries).toBe(0);
  await page.getByRole("button", { name: "Refresh inbox", exact: true }).click();
  expect(retries).toBe(0);
  await row.getByRole("button", { name: "Retry analysis", exact: true }).click();
  await page.screenshot({ path: "test-results/review-inbox-confirmation-mobile.png", fullPage: true, animations: "disabled" });
  await confirm.getByRole("button", { name: "Confirm analysis retry", exact: true }).click();
  await expect(page.getByText("Analysis retry queued", { exact: true })).toBeVisible();
  expect(retries).toBe(1);
  await expect(row).toContainText("Analysis failed or stalled", { timeout: 30_000 }); // The test-only provider deliberately stays unavailable.
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`/dashboard/inbox?interviewId=${interviewId}&category=failed`);
  await expect(page.getByRole("heading", { name: "No attention items match these filters", exact: true })).toBeVisible();
});

test("reference dashboard supports real analytics, filters, quick actions and responsive navigation", async ({ page }) => {
  await signIn(page);
  await page.setViewportSize({ width: 1600, height: 1200 });
  await expect(page.getByRole("heading", { name: "Interview activity", exact: true })).toBeVisible();
  await expect(page.getByRole("meter", { name: "Needs decision", exact: true })).toHaveAttribute("aria-valuenow", /\d+/);
  await expect(page.getByRole("img", { name: /Monthly completed interviews: [1-9]/ })).toBeVisible();
  const chart = await page.locator("#activity").boundingBox();
  expect(chart?.x).toBeCloseTo(215, 0);
  expect(chart?.y).toBeCloseTo(129, 0);
  expect(chart?.height).toBe(358);
  expect(await page.getByRole("complementary", { name: "Sidebar" }).evaluate((node) => getComputedStyle(node).width)).toBe("191px");
  const sidebar = await page.getByRole("complementary", { name: "Sidebar" }).boundingBox();
  expect(sidebar).toMatchObject({ x: 0, y: 0, height: 1200 });
  expect(await page.locator("#main-content").evaluate((node) => Math.round(node.getBoundingClientRect().right))).toBe(1600);
  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(page.getByRole("menu")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).not.toBeVisible();
  await page.screenshot({ path: "test-results/dashboard-reference-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Expand sidebar", exact: true })).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
  await page.getByRole("button", { name: "Search quick actions" }).click();
  await page.getByRole("textbox", { name: "Search pages and interviews" }).fill("Frontend");
  const actions = page.getByRole("navigation", { name: "Quick action results" });
  await expect(actions.getByRole("link", { name: "Frontend Engineer screen", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Search pages and interviews" }).fill("not-a-real-page");
  await expect(page.getByText("No matching pages or interviews.")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Quick actions", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Interview activity options" }).click();
  await page.getByRole("menuitem", { name: "View data table" }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByRole("button", { name: "Interview activity options" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Download chart CSV" }).click();
  expect((await download).suggestedFilename()).toBe("interview-activity.csv");
  await page.getByRole("button", { name: "Interview activity options" }).click();
  await page.getByRole("menuitem", { name: "Hide data table" }).click();
  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(page.getByRole("menuitem", { name: "Sign out", exact: true })).toBeVisible();
  await page.getByRole("menuitem", { name: "Toggle dark mode" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("menuitem", { name: "Sign out", exact: true })).not.toBeVisible();
  await page.screenshot({ path: "test-results/dashboard-reference-dark.png", fullPage: true });
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Toggle dark mode" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByText("Add filter", { exact: true }).click();
  await page.getByLabel("Interview name", { exact: true }).fill("Inbox analysis failure");
  await page.getByLabel("Interview status", { exact: true }).selectOption("live");
  await page.evaluate(() => { document.documentElement.dataset.navigationProof = "same-document"; });
  await page.getByRole("button", { name: "Apply filters", exact: true }).click();
  await expect(page.getByRole("region", { name: "Your interviews" })).not.toContainText("Frontend Engineer screen");
  await expect(page.getByRole("region", { name: "Your interviews" })).toContainText("Inbox analysis failure");
  await expect(page.locator("html")).toHaveAttribute("data-navigation-proof", "same-document");
  await page.locator("details").first().locator("summary").click();
  await page.getByLabel("From (UTC)", { exact: true }).fill("2000-01-01");
  await page.getByLabel("Through (UTC)", { exact: true }).fill("2000-02-01");
  await page.getByRole("button", { name: "Apply dates" }).click();
  await expect(page.getByRole("img", { name: /Monthly completed interviews: 0 total/ })).toBeVisible();
  await expect(page).toHaveURL(/q=Inbox\+analysis\+failure/);
  await page.goto("/dashboard?from=2026-02-30");
  await expect(page.getByRole("alert").filter({ hasText: "Invalid dashboard filters" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Interview activity" })).toHaveCount(0);
  await page.getByRole("link", { name: "Reset dashboard filters" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/dashboard-reference-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("navigation", { name: "Main", exact: true }).getByRole("link", { name: "Review inbox", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/inbox$/);
  await expect(page.getByRole("dialog", { name: "Menu", exact: true })).not.toBeVisible();
});

test("Volo branding and click feedback stay responsive while navigation is stalled", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  // Install before login: visible safe destinations now preload immediately.
  await page.route("**/dashboard/templates**", async (route) => { await gate; await route.continue(); });
  await signIn(page);
  const sidebar = page.getByRole("complementary", { name: "Sidebar" });
  const logo = sidebar.getByRole("link", { name: "Volo home", exact: true });
  await expect(logo).toBeVisible();
  await expect(logo).toContainText("Volo");
  const bounds = await logo.boundingBox();
  expect(bounds?.x).toBe(20); expect(bounds?.y).toBe(20);
  await expect(logo.locator("svg circle")).toHaveCSS("fill", "rgb(255, 255, 255)");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(logo.locator("svg")).toBeVisible();
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  const templates = page.getByRole("navigation", { name: "Main", exact: true }).getByRole("link", { name: "Templates", exact: true });
  try {
    await templates.click();
    await expect(templates.locator(".navigation-feedback")).toHaveAttribute("data-pending", "true", { timeout: 1000 });
    await page.getByRole("button", { name: "Account menu" }).click();
    await expect(page.getByRole("menuitem", { name: "Sign out", exact: true })).toBeVisible({ timeout: 1000 });
    await page.keyboard.press("Escape");
  } finally { release(); }
  await expect(page).toHaveURL(/\/dashboard\/templates$/);
  await expect(page.getByRole("heading", { name: "Interview templates", exact: true })).toBeVisible();
  await page.unroute("**/dashboard/templates**");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const duration = await sidebar.evaluate((node) => parseFloat(getComputedStyle(node).transitionDuration));
  expect(duration).toBeLessThan(.001);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("link", { name: "Volo home", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Volo home", exact: true }).locator("..")).toHaveCSS("background-color", "rgb(0, 0, 0)");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/volo-brand-mobile.png" });
});

test("visible navigation preloads full page content before clicking, without a server round trip", async ({ page }) => {
  const destinations = [
    { path: "/dashboard/templates", link: "Templates", content: "Interview templates", role: "heading" as const },
    { path: "/dashboard/interviewers", link: "Interviewers", content: "New interviewer", role: "button" as const },
    { path: "/dashboard/privacy", link: "Privacy and data retention", content: "Expired candidate data", role: "heading" as const },
  ];
  const prefetched = Promise.all(destinations.map(({ path }) => page.waitForResponse((res) => new URL(res.url()).pathname === path && res.request().method() === "GET")));
  await signIn(page);
  for (const response of await prefetched) {
    expect(response.status()).toBe(200);
    await response.finished();
  }
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  for (const destination of destinations) {
    let unexpectedRequests = 0;
    const pattern = `**${destination.path}**`;
    await page.route(pattern, async (route) => { unexpectedRequests++; await route.abort(); });
    const start = Date.now();
    await page.getByRole("navigation", { name: "Main", exact: true }).getByRole("link", { name: destination.link, exact: true }).click();
    await expect(page.getByRole(destination.role, { name: destination.content, exact: true })).toBeVisible({ timeout: 1000 });
    const elapsed = Date.now() - start;
    console.log(`[navigation benchmark] Preloaded ${destination.link} content visible in ${elapsed}ms, additional requests: ${unexpectedRequests}`);
    expect(unexpectedRequests).toBe(0);
    await expect(page.getByRole("status", { name: "Loading dashboard content" })).toHaveCount(0);
    await page.unroute(pattern);
  }
});

test("account controls replace the workspace at bottom-left on desktop, collapsed and mobile layouts", async ({ page }) => {
  await signIn(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const sidebar = page.getByRole("complementary", { name: "Sidebar" });
  const account = sidebar.getByRole("button", { name: "Account menu", exact: true });
  await expect(account).toContainText(TEST_USER.name);
  await expect(page.locator("#main-content > header").getByRole("button", { name: "Account menu" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Workspace menu" })).toHaveCount(0);
  const bounds = await account.boundingBox();
  expect(bounds?.x).toBe(20); expect(bounds?.y).toBeGreaterThan(780);
  await account.click();
  const menu = page.getByRole("menu");
  await expect(menu).toContainText(TEST_USER.email);
  await expect(menu.getByRole("menuitem", { name: "Sign out", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Toggle dark mode", exact: true })).toBeVisible();
  expect((await menu.boundingBox())!.y).toBeLessThan(bounds!.y);
  await page.screenshot({ path: "test-results/sidebar-account-desktop.png" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await account.click();
  await expect(page.getByRole("menuitem", { name: "Sign out", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Account menu" })).toHaveCount(0);
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Toggle dark mode" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(page.getByRole("menuitem", { name: "Sign out", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/sidebar-account-mobile.png" });
  await page.getByRole("menuitem", { name: "Toggle dark mode" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("recruiter confirms bulk review and selection never includes hidden results", async ({ page }) => {
  await signIn(page);
  await page.goto(`/dashboard/interviews/${interviewId}`);
  const bulk = page.getByRole("region", { name: "Bulk candidate review" });
  const asha = page.getByRole("checkbox", { name: "Select for review: Asha Tester", exact: true });
  const sam = page.getByRole("checkbox", { name: "Select for review: Sam Compare", exact: true });
  await asha.check();
  await sam.check();
  await expect(bulk.getByRole("status")).toHaveText("2 selected");
  await bulk.getByRole("button", { name: "Review selection" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByRole("list", { name: "Candidates to update" })).toContainText("Asha Tester");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  // Cancelling does not update Asha's existing status or discard the selection.
  await expect(page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Asha Tester", exact: true }) })).toContainText("Shortlisted");
  await page.getByRole("textbox", { name: "Search candidates" }).fill("Sam Compare");
  await expect(bulk.getByRole("status")).toHaveText("0 selected");
  await bulk.getByRole("button", { name: "Select shown", exact: true }).click();
  await expect(bulk.getByRole("status")).toHaveText("1 selected");
  await page.getByRole("combobox", { name: "Filter by status" }).click();
  await page.getByRole("option", { name: "Maybe", exact: true }).click();
  await expect(bulk.getByRole("status")).toHaveText("0 selected");
  await expect(bulk.getByRole("button", { name: "Review selection" })).toBeDisabled();
  await page.getByRole("combobox", { name: "Filter by status" }).click();
  await page.getByRole("option", { name: "All candidates", exact: true }).click();
  await page.getByRole("textbox", { name: "Search candidates" }).fill("");
  await asha.check();
  await sam.check();
  await bulk.getByRole("combobox", { name: "Bulk candidate status" }).click();
  await page.getByRole("option", { name: "Maybe", exact: true }).click();
  await page.screenshot({ path: "test-results/bulk-review-desktop.png", fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/bulk-review-mobile.png", fullPage: true, animations: "disabled" });
  await bulk.getByRole("button", { name: "Review selection" }).click();
  await expect(dialog).toContainText("Set the selected candidates to Maybe");
  await page.screenshot({ path: "test-results/bulk-review-confirmation-mobile.png", fullPage: true, animations: "disabled" });
  await dialog.getByRole("button", { name: "Confirm status update" }).click();
  await expect(page.getByText("2 candidate statuses updated", { exact: true })).toBeVisible();
  await expect(bulk.getByRole("status")).toHaveText("0 selected");
  await page.reload();
  for (const name of ["Asha Tester", "Sam Compare"]) {
    await expect(page.getByRole("listitem").filter({ has: page.getByRole("link", { name: new RegExp(`${name}$`) }) })).toContainText("Maybe");
  }
});

test("a stale bulk selection cannot overwrite a newer report decision", async ({ page }) => {
  await signIn(page);
  await page.goto(`/dashboard/interviews/${interviewId}`);
  await page.getByRole("checkbox", { name: "Select for review: Asha Tester", exact: true }).check();
  await page.getByRole("checkbox", { name: "Select for review: Sam Compare", exact: true }).check();
  const otherTab = await page.context().newPage();
  await otherTab.goto(`/dashboard/interviews/${interviewId}/responses/${reportId}`);
  await otherTab.getByRole("combobox", { name: "Candidate status", exact: true }).click();
  await otherTab.getByRole("option", { name: "Rejected", exact: true }).click();
  await expect(otherTab.getByText("Marked as rejected", { exact: true })).toBeVisible();
  await otherTab.close();
  const bulk = page.getByRole("region", { name: "Bulk candidate review" });
  await bulk.getByRole("button", { name: "Review selection" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm status update" }).click();
  await expect(page.getByText("Candidate statuses changed since selection. Refresh and select them again. No statuses were changed.", { exact: true })).toBeVisible();
  await expect(bulk.getByRole("status")).toHaveText("0 selected");
  await expect(page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Asha Tester", exact: true }) })).toContainText("Rejected");
  await expect(page.getByRole("listitem").filter({ has: page.getByRole("link", { name: /Sam Compare$/ }) })).toContainText("Maybe");
});

test("an unconfirmed bulk update is not automatically retried", async ({ page }) => {
  await signIn(page);
  await page.goto(`/dashboard/interviews/${interviewId}`);
  await page.getByRole("checkbox", { name: "Select for review: Sam Compare", exact: true }).check();
  let requests = 0;
  await page.route(`**/dashboard/interviews/${interviewId}`, async (route) => {
    if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
      requests++;
      await route.fetch();
      await route.fulfill({ status: 503, body: "Lost update reply" });
    } else await route.continue();
  });
  const bulk = page.getByRole("region", { name: "Bulk candidate review" });
  await bulk.getByRole("button", { name: "Review selection" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm status update" }).click();
  await expect(page.getByText("Could not confirm the update. Refresh and check candidate statuses before trying again.", { exact: true })).toBeVisible();
  await expect(bulk.getByRole("status")).toHaveText("0 selected");
  expect(requests).toBe(1);
  await page.reload();
  await expect(page.getByRole("listitem").filter({ has: page.getByRole("link", { name: /Sam Compare$/ }) })).toContainText("Shortlisted");
});

test("recruiter creates a custom interviewer", async ({ page }) => {
  await signIn(page);
  await page.goto("/dashboard/interviewers");
  await page.getByRole("button", { name: "New interviewer" }).click();
  await page.getByLabel("Name").fill("Curious Kiran");
  await page.getByLabel("Description").fill("Thorough and friendly.");
  await page.getByRole("button", { name: "Create interviewer" }).click();
  await expect(page.getByRole("heading", { name: "Curious Kiran" })).toBeVisible();
});

test("recruiter saves a reusable template and creates an independent interview", async ({ page }) => {
  await signIn(page);
  await page.goto(`/dashboard/interviews/${interviewId}`);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Save as template", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Save as template", exact: true });
  await dialog.getByLabel("Template name").fill("React hiring template");
  await dialog.getByRole("button", { name: "Save template", exact: true }).click();
  await expect(page.getByText("Template saved. Find it in Templates.")).toBeVisible();

  await page.goto(`/dashboard/interviews/${interviewId}/edit`);
  await page.getByLabel("Objective").fill("Changed after the template was saved.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/interviews/${interviewId}$`));
  await page.getByRole("link", { name: "Templates", exact: true }).click();
  await expect(page.getByRole("heading", { name: "React hiring template" })).toBeVisible();
  const useTemplate = page.getByRole("link", { name: "Use template React hiring template" });
  templateId = (await useTemplate.getAttribute("href"))!.split("template=")[1];
  await page.screenshot({ path: "test-results/templates-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/templates-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await useTemplate.click();
  await expect(page.getByLabel("Objective")).toHaveValue("Find React engineers who ship production apps.");
  await expect(page.getByLabel("Question 5")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Empathetic Bob" })).toHaveAttribute("aria-checked", "true");
  await page.getByLabel("Interview name").fill("Template-based engineer screen");
  await page.getByRole("button", { name: "Create interview", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Share with candidates" })).toBeVisible();
  templatedInterviewId = (await page.getByLabel("Interview link").inputValue()).split("/i/")[1];
  expect(templatedInterviewId).not.toBe(interviewId);
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByText("No finished interviews yet.", { exact: false })).toBeVisible();
});

test("duplicate interview opens a reviewable copy without existing results", async ({ page }) => {
  await signIn(page);
  await page.goto(`/dashboard/interviews/${interviewId}`);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Duplicate interview", exact: true }).click();
  await expect(page.getByLabel("Interview name")).toHaveValue("Frontend Engineer screen (copy)");
  await expect(page.getByLabel("Objective")).toHaveValue("Changed after the template was saved.");
  await expect(page.getByLabel("Question 5")).toBeVisible();
  await page.getByRole("button", { name: "Create interview", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Share with candidates" })).toBeVisible();
  const copyId = (await page.getByLabel("Interview link").inputValue()).split("/i/")[1];
  expect(copyId).not.toBe(interviewId);
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByText("No finished interviews yet.", { exact: false })).toBeVisible();
  await page.goto(`/dashboard/interviews/${interviewId}`);
  await expect(page.getByRole("link", { name: /Asha Tester/ })).toBeVisible();
});

test("other accounts can't see this interview or reuse its templates", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Someone Else");
  await page.getByLabel("Work email").fill("other@example.test");
  await page.getByLabel("Password").fill("another-local-pass-456");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const res = await page.goto(`/dashboard/interviews/${interviewId}`);
  expect(res?.status()).toBe(404);
  expect((await page.request.get(`/api/interviews/${interviewId}/export`)).status()).toBe(404);
  expect((await page.request.get(`/api/recordings/${reportId}`)).status()).toBe(404);
  expect((await page.goto(`/dashboard/interviews/${interviewId}/responses/${reportId}`))?.status()).toBe(404);
  expect((await page.goto(`/dashboard/interviews/${interviewId}/compare?candidate=${reportId}&candidate=other`))?.status()).toBe(404);
  expect((await page.goto(`/dashboard/interviews/new?duplicate=${interviewId}`))?.status()).toBe(404);
  expect((await page.goto(`/dashboard/interviews/new?template=${templateId}`))?.status()).toBe(404);
  await page.goto("/dashboard/templates");
  await expect(page.getByRole("heading", { name: "No templates yet" })).toBeVisible();
  await page.goto(`/dashboard/inbox?interviewId=${inboxFailureInterviewId}`);
  await expect(page.getByRole("heading", { name: "No attention items match these filters", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Inbox analysis failure", exact: true })).toHaveCount(0);
  await expect(page.getByText("Inbox Failed", { exact: true })).toHaveCount(0);
  await page.goto("/dashboard/inbox");
  await expect(page.getByRole("heading", { name: "No attention items match these filters", exact: true })).toBeVisible();
  await ctx.close();
});

test("deleting a template keeps interviews created from it", async ({ page }) => {
  await signIn(page);
  await page.goto("/dashboard/templates");
  await page.getByRole("button", { name: "Delete template React hiring template" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete template?" });
  await dialog.getByRole("button", { name: "Keep template" }).click();
  await expect(page.getByRole("heading", { name: "React hiring template" })).toBeVisible();
  await page.getByRole("button", { name: "Delete template React hiring template" }).click();
  await dialog.getByRole("button", { name: "Delete template", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No templates yet" })).toBeVisible();
  expect((await page.goto(`/dashboard/interviews/new?template=${templateId}`))?.status()).toBe(404);
  await page.goto(`/dashboard/interviews/${templatedInterviewId}`);
  await expect(page.getByRole("heading", { name: "Template-based engineer screen", exact: true })).toBeVisible();
});

test("all recruiter screens share the edge-to-edge neutral reference theme", async ({ page }) => {
  await signIn(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [name, path] of [
    ["inbox", "/dashboard/inbox"], ["interviewers", "/dashboard/interviewers"],
    ["templates", "/dashboard/templates"], ["privacy", "/dashboard/privacy"],
    ["editor", "/dashboard/interviews/new"], ["interview", `/dashboard/interviews/${interviewId}`],
    ["report", `/dashboard/interviews/${interviewId}/responses/${reportId}`],
  ]) {
    await page.goto(path);
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    expect(await page.locator("body").evaluate((node) => getComputedStyle(node).getPropertyValue("--primary").trim())).toMatch(/^#111(?:111)?$/);
    expect(await page.getByRole("complementary", { name: "Sidebar" }).evaluate((node) => node.getBoundingClientRect().left)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (name === "editor") {
      const preview = page.locator("[data-candidate-preview]");
      await expect(preview).toHaveCSS("background-color", "rgb(22, 22, 22)");
      await expect(preview.getByText("Start interview", { exact: true })).toHaveCSS("background-color", "rgb(238, 238, 238)");
      await expect(preview.getByText("Start interview", { exact: true })).toHaveCSS("color", "rgb(17, 17, 17)");
      await expect(page.getByText("Brand color", { exact: true })).toHaveCount(0);
    }
    await page.screenshot({ path: `test-results/reference-${name}-desktop.png` });
  }
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Toggle dark mode" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(page.getByRole("menu")).toHaveCSS("background-color", "rgb(32, 32, 32)");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Toggle dark mode" }).click();
});

test("dashboard account menu signs out without leaving authenticated dashboard access", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in$/);
});
