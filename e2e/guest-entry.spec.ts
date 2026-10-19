import { expect, test } from "@playwright/test";

test("one click opens an isolated real guest workspace and safely resumes the same session", async ({ page, browser }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Enter Volo", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/guest-entry-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/guest-entry-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  let starts = 0;
  page.on("request", (request) => { if (request.url().endsWith("/api/auth/guest-entry")) starts++; });
  await page.getByRole("button", { name: "Enter Volo", exact: true }).dblclick();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(starts).toBe(1);
  await expect(page.getByText("Create your first interview", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "API usage", exact: true })).toHaveCount(0);
  const initial = await (await page.request.get("/api/auth/get-session")).json();
  expect(initial.user.email).toMatch(/^guest-[0-9a-f-]{36}@guest\.volo\.invalid$/);
  expect(initial.user.emailVerified).toBe(false);
  const origin = new URL(page.url()).origin;
  expect((await page.request.post("/api/auth/guest-entry", { headers: { origin }, data: { userId: "e2e-platform-admin", admin: true } })).status()).toBe(200);
  const resumed = await (await page.request.get("/api/auth/get-session")).json();
  expect(resumed.user.id).toBe(initial.user.id);
  await page.reload();
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toContainText("Guest workspace");
  await page.getByRole("link", { name: "New interview", exact: true }).first().click();
  await page.getByLabel("Interview name").fill("Guest private interview");
  await page.getByLabel("Objective").fill("Check relevant skills");
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(page.getByLabel("Question 5")).toBeVisible();
  await page.getByRole("button", { name: "Create interview", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/interviews\/[\w-]+$/);
  await expect(page.getByRole("dialog", { name: "Share with candidates", exact: true })).toBeVisible();
  const privatePath = new URL(page.url()).pathname;
  await page.keyboard.press("Escape");
  const other = await browser.newContext();
  try {
    const response = await other.request.post(`${origin}/api/auth/guest-entry`, { headers: { origin }, data: {} });
    expect(response.status()).toBe(200);
    const second = await (await other.request.get(`${origin}/api/auth/get-session`)).json();
    expect(second.user.id).not.toBe(initial.user.id);
    expect((await other.request.get(`${origin}/dashboard/admin/usage`)).status()).toBe(404);
    expect((await other.request.get(`${origin}${privatePath}`)).status()).toBe(404);
  } finally { await other.close(); }
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Guest private interview", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await expect(page.getByRole("menu")).not.toContainText("@guest.volo.invalid");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("entry failures allow retry, reject foreign origins and respect paused registration", async ({ page }) => {
  await page.goto("/sign-in");
  let attempts = 0;
  await page.route("**/api/auth/guest-entry", async (route) => {
    attempts++;
    return route.fulfill({ status: attempts === 1 ? 503 : 429, contentType: "application/json", body: '{"message":"not shown"}' });
  });
  await page.getByRole("button", { name: "Enter Volo", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Could not open your workspace" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enter Volo", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Enter Volo", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Too many new workspaces" })).toBeVisible();
  expect((await page.request.post("/api/auth/guest-entry", { headers: { origin: "https://foreign.example" }, data: {} })).status()).toBe(403);
  expect(await (await page.request.get("/api/auth/get-session")).json()).toBeNull();
  if (process.env.E2E_EMAIL_SIGNUP === "0") {
    await page.goto("/sign-up");
    await expect(page).toHaveURL(/\/sign-in$/);
    expect((await page.request.post("/api/auth/sign-up/email", { headers: { origin: new URL(page.url()).origin }, data: { email: "disabled@example.test", password: "password-12345", name: "Disabled" } })).ok()).toBe(false);
    await expect(page.getByRole("button", { name: "Enter Volo", exact: true })).toBeVisible();
  }
});
