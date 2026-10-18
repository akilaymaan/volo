import { expect, type BrowserContext, type Page, test } from "@playwright/test";
import { TEST_USER } from "./fixtures";
import { CONSENT_VERSION } from "../src/lib/privacy";

// One recruiter journey end to end: sign up → create interview → candidate voice call → report.
test.describe.configure({ mode: "serial" });

let interviewUrl = "";
let interviewId = "";
let reportId = "";
let templateId = "";
let templatedInterviewId = "";
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

test("usage and privacy is account scoped and maintenance is guarded", async ({ page, request }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Usage and privacy" }).click();
  await expect(page.getByRole("heading", { name: "Usage and privacy" })).toBeVisible();
  await expect(page.getByText("No recorded provider usage yet.")).toBeVisible();
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
