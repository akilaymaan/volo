import { expect, test, type Page } from "@playwright/test";

async function enter(page: Page) {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Enter Volo", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("navigation", { name: "Main", exact: true }).getByRole("link", { name: "New interview", exact: true }).click();
  await expect(page.getByRole("button", { name: "Guided setup", exact: true })).toHaveAttribute("aria-pressed", "true");
}
async function saved(page: Page) {
  await expect(page.getByText("Draft saved on this device. Expires after 7 days; attachments are not saved.", { exact: true })).toBeVisible();
}
async function draftKeys(page: Page) {
  return page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("volo:interview-draft:v1:")));
}

test("guided creation preserves every step, mode and draft, validates failures and clears only after creation", async ({ page }) => {
  await enter(page);
  await page.screenshot({ path: "test-results/guided-role-desktop.png", fullPage: true });
  await expect(page.getByRole("navigation", { name: "Interview setup progress" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create interview", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Continue to questions", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "name and objective" })).toBeVisible();
  await page.getByLabel("Interview name", { exact: true }).fill("Guided engineering screen");
  await page.getByLabel("Objective", { exact: true }).fill("Assess reliable software delivery");
  await page.getByLabel("Job description (optional)", { exact: true }).fill("Build production React systems");
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review your questions and format", exact: true })).toBeVisible();
  await expect(page.getByLabel("Question 5", { exact: true })).toBeVisible();
  await page.getByLabel("Question 1", { exact: true }).fill("How do you ship changes safely?");
  await page.getByRole("radio", { name: "Empathetic Bob", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/guided-questions-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByLabel("Job description (optional)", { exact: true })).toHaveValue("Build production React systems");
  await page.getByRole("button", { name: "Continue to questions", exact: true }).click();
  await expect(page.getByLabel("Question 1", { exact: true })).toHaveValue("How do you ship changes safely?");
  await expect(page.getByRole("radio", { name: "Empathetic Bob", exact: true })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Review and launch", exact: true }).click();
  await page.getByLabel("Intro for candidates", { exact: true }).fill("Tell us about your engineering work.");
  await page.getByLabel("Data retention (days)", { exact: true }).fill("0");
  await saved(page);
  await page.getByRole("button", { name: "Create interview", exact: true }).click();
  await expect(page.getByText(/Too small|greater than or equal|at least 1/i)).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/interviews\/new$/);
  await expect.poll(() => draftKeys(page)).toHaveLength(1);
  await page.reload();
  await expect(page.getByText("Saved draft restored. Review it before creating your interview.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Intro for candidates", { exact: true })).toHaveValue("Tell us about your engineering work.");
  await expect(page.getByLabel("Data retention (days)", { exact: true })).toHaveValue("0");
  await page.getByRole("button", { name: "Full editor", exact: true }).click();
  await saved(page);
  await page.reload();
  await expect(page.getByRole("button", { name: "Full editor", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Interview name", { exact: true })).toHaveValue("Guided engineering screen");
  await expect(page.getByLabel("Question 1", { exact: true })).toHaveValue("How do you ship changes safely?");
  await page.getByLabel("Data retention (days)", { exact: true }).fill("30");
  await page.getByRole("button", { name: "Guided setup", exact: true }).click();
  await expect(page.locator("[data-candidate-preview]")).toContainText("Guided engineering screen");
  await saved(page);
  await page.screenshot({ path: "test-results/guided-launch-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Create interview", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/interviews\/[\w-]+(?:\?share=1)?$/);
  await expect(page.getByRole("dialog", { name: "Share with candidates", exact: true })).toBeVisible();
  expect(await draftKeys(page)).toHaveLength(0);
  await page.goto(`${new URL(page.url()).pathname}/edit`);
  await expect(page.getByLabel("Interview name", { exact: true })).toHaveValue("Guided engineering screen");
  await expect(page.getByLabel("Question 1", { exact: true })).toHaveValue("How do you ship changes safely?");
  await expect(page.getByLabel("Data retention (days)", { exact: true })).toHaveValue("30");
  await expect(page.getByRole("radio", { name: "Empathetic Bob", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: "Guided setup", exact: true })).toHaveCount(0);
});

test("draft flushes on navigation, restores attachments as reminders, and can be explicitly discarded", async ({ page }) => {
  await enter(page);
  await page.getByLabel("Interview name", { exact: true }).fill("Recovered role");
  await page.getByLabel("Objective", { exact: true }).fill("Assess skills");
  await page.getByLabel("Attach PDF or text file", { exact: false }).setInputFiles({ name: "role-notes.txt", mimeType: "text/plain", buffer: Buffer.from("These file bytes must not be persisted") });
  await page.getByRole("navigation", { name: "Main", exact: true }).getByRole("link", { name: "Interviewers", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Interviewers", exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Main", exact: true }).getByRole("link", { name: "New interview", exact: true }).click();
  await expect(page.getByLabel("Interview name", { exact: true })).toHaveValue("Recovered role");
  await expect(page.getByRole("alert").filter({ hasText: "Reattach “role-notes.txt”" })).toBeVisible();
  const keys = await draftKeys(page);
  expect(await page.evaluate((key) => localStorage.getItem(key), keys[0])).not.toContain("These file bytes");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/guided-role-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(page.getByText("Reattach your saved file or remove the attachment reminder before generating.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove attachment reminder", exact: true }).click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Discard draft", exact: true }).click();
  await expect(page.getByLabel("Interview name", { exact: true })).toHaveValue("Recovered role");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Discard draft", exact: true }).click();
  await expect(page.getByLabel("Interview name", { exact: true })).toHaveValue("");
  expect(await draftKeys(page)).toHaveLength(0);
});

test("blocked draft storage keeps both editors usable without false save claims", async ({ page }) => {
  await page.addInitScript(() => {
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      if (key.startsWith("volo:interview-draft:")) throw new DOMException("Blocked", "SecurityError");
      return getItem.call(this, key);
    };
  });
  await enter(page);
  await expect(page.getByText("Draft saving unavailable. Keep this page open or copy your work before leaving.", { exact: true })).toBeVisible();
  await page.getByLabel("Interview name", { exact: true }).fill("Unsaved but editable");
  await page.getByRole("button", { name: "Full editor", exact: true }).click();
  await expect(page.getByLabel("Interview name", { exact: true })).toHaveValue("Unsaved but editable");
  await expect(page.getByRole("button", { name: "Create interview", exact: true })).toBeEnabled();
  await expect(page.getByText(/^Draft saved on this device/)).toHaveCount(0);
});

test("another tab cannot silently overwrite a newer draft", async ({ page, context }) => {
  await enter(page);
  await page.getByLabel("Interview name", { exact: true }).fill("Original draft");
  await saved(page);
  const second = await context.newPage();
  await second.goto("/dashboard/interviews/new");
  await expect(second.getByLabel("Interview name", { exact: true })).toHaveValue("Original draft");
  await saved(second);
  await page.getByLabel("Interview name", { exact: true }).fill("Newer draft in first tab");
  await saved(page);
  await second.getByLabel("Interview name", { exact: true }).fill("Older tab unsaved work");
  await expect(second.getByText("Draft changed in another tab. Automatic saving paused; copy your work before reloading.", { exact: true })).toBeVisible();
  const keys = await draftKeys(page);
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state.values.name, keys[0])).toBe("Newer draft in first tab");
  await second.close();
});

test("manual questions work without generation when draft writes fail", async ({ page }) => {
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("volo:interview-draft:")) throw new DOMException("Full", "QuotaExceededError");
      return setItem.call(this, key, value);
    };
  });
  await enter(page);
  await page.getByLabel("Interview name", { exact: true }).fill("Manual guided screen");
  await page.getByLabel("Objective", { exact: true }).fill("Discuss relevant experience");
  await expect(page.getByText("Draft could not be saved. Keep this page open or copy your work before leaving.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue to questions", exact: true }).click();
  await page.getByRole("button", { name: "Review and launch", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "at least one question" })).toBeVisible();
  await page.getByRole("button", { name: "Add a question", exact: false }).click();
  await page.getByLabel("Question 1", { exact: true }).fill("Tell us about something you built.");
  await page.getByRole("button", { name: "Review and launch", exact: true }).click();
  await page.getByRole("button", { name: "Create interview", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Share with candidates", exact: true })).toBeVisible();
});

test("invalid local drafts are discarded safely and never imported into another guest workspace", async ({ page }) => {
  await enter(page);
  await page.getByLabel("Interview name", { exact: true }).fill("Private unfinished role");
  await saved(page);
  const [key] = await draftKeys(page);
  await page.getByRole("navigation", { name: "Main", exact: true }).getByRole("link", { name: "Interviews", exact: true }).click();
  await page.evaluate((draftKey) => localStorage.setItem(draftKey, "not valid JSON"), key);
  await page.getByRole("navigation", { name: "Main", exact: true }).getByRole("link", { name: "New interview", exact: true }).click();
  await expect(page.getByLabel("Interview name", { exact: true })).toHaveValue("");
  await page.getByLabel("Interview name", { exact: true }).fill("Another private draft");
  await saved(page);
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await enter(page);
  await expect(page.getByLabel("Interview name", { exact: true })).toHaveValue("");
  await expect(page.getByText("Saved draft restored. Review it before creating your interview.", { exact: true })).toHaveCount(0);
});
