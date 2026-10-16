import { expect, type Page, test } from "@playwright/test";
import { TEST_USER } from "./fixtures";

// One recruiter journey end to end: sign up → create interview → candidate voice call → report.
test.describe.configure({ mode: "serial" });

let interviewUrl = "";
let interviewId = "";

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(TEST_USER.email);
  await page.getByLabel("Password").fill(TEST_USER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("dashboard requires an account", async ({ page }) => {
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
    if (await done.isEnabled().catch(() => false)) {
      await page.waitForTimeout(700); // let the fake mic record something
      await done.click().catch(() => {});
    }
    await page.waitForTimeout(300);
  }
  await expect(thanks).toBeVisible({ timeout: 30_000 });
  await page.getByRole("radio", { name: "5 out of 5" }).click();
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page.getByText("Thanks for the feedback")).toBeVisible();
});

test("the same email can't take it twice", async ({ request }) => {
  const res = await request.post("/api/call/start", {
    data: { interviewId, name: "Asha Tester", email: "ASHA@example.test" },
  });
  expect(res.status()).toBe(409);
});

test("public call API is idempotent and strict", async ({ request }) => {
  const start = await request.post("/api/call/start", {
    data: { interviewId, name: "Ravi Retry", email: "ravi@example.test" },
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
  await expect(page.getByRole("heading", { name: "Asha Tester" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Overall: 78 out of 100" })).toBeVisible();
  await expect(page.getByText("This is a mock answer from the candidate.").first()).toBeVisible();
  await expect(page.locator("audio")).toBeVisible({ timeout: 15_000 });

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

test("other accounts can't see this interview", async ({ browser }) => {
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
  await ctx.close();
});
