import { expect, test } from "@playwright/test";
import { assertMobileLayout } from "./mobile-assertions";

test("legacy teal interviews use neutral setup, live controls, dialogs and completion", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/i/e2e-legacy-teal");
  const surface = page.locator("[data-candidate-surface]");
  await expect(surface).toHaveCSS("background-color", "rgb(22, 22, 22)");
  await expect(surface.locator(":scope > div").first()).toHaveCSS("background-color", "rgb(39, 39, 39)");
  expect(await surface.locator("svg stop[stop-color]").evaluateAll((stops) => stops.every((stop) => ["#ffffff", "#929292"].includes(stop.getAttribute("stop-color")!)))).toBe(true);
  const start = page.getByRole("button", { name: "Start interview", exact: true });
  await expect(start).toBeDisabled();
  await expect(start).toHaveCSS("background-color", "rgb(238, 238, 238)");
  await expect(start).toHaveCSS("color", "rgb(17, 17, 17)");
  await page.screenshot({ path: "test-results/candidate-neutral-intro.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/candidate-neutral-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("Your name").fill("Neutral Candidate");
  await page.getByLabel("Email", { exact: true }).fill("neutral@example.test");
  await page.getByRole("button", { name: "Allow microphone", exact: true }).click();
  await expect(page.getByText("Microphone connected", { exact: false })).toBeVisible();
  const consent = page.getByRole("checkbox");
  await consent.check();
  await expect(consent).toHaveCSS("accent-color", "rgb(238, 238, 238)");
  await expect(start).toBeEnabled();
  await start.click();
  const done = page.getByRole("button", { name: "I'm done answering", exact: true });
  await expect(done).toBeEnabled({ timeout: 20_000 });
  await expect(done).toHaveCSS("background-color", "rgb(238, 238, 238)");
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 667, height: 375 }]) {
    await page.setViewportSize(viewport);
    await assertMobileLayout(page);
    await expect(done).toBeInViewport();
    await page.screenshot({ path: `test-results/mobile-live-interview-${viewport.width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "test-results/candidate-neutral-live.png" });
  await page.getByRole("button", { name: "Show conversation", exact: true }).click();
  const transcript = page.getByRole("dialog");
  await expect(transcript.getByRole("heading", { name: "Conversation so far" })).toBeVisible();
  await expect(transcript).toHaveCSS("background-color", "rgb(22, 22, 22)");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "End interview", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toHaveCSS("background-color", "rgb(22, 22, 22)");
  await confirmation.getByRole("button", { name: "Keep going", exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await page.getByRole("button", { name: "End interview", exact: true }).click();
  await confirmation.getByRole("button", { name: "End interview", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Thank you, Neutral!", exact: true })).toBeVisible();
  await expect(surface).toHaveCSS("background-color", "rgb(22, 22, 22)");
  const rating = page.getByRole("radio", { name: "5 out of 5" });
  await rating.click();
  await expect(rating).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: "Send feedback", exact: true })).toHaveCSS("background-color", "rgb(238, 238, 238)");
  await page.screenshot({ path: "test-results/candidate-neutral-completed.png", fullPage: true });
});

test("closed, invalid and recording recovery pages keep the same neutral candidate surface", async ({ page }) => {
  for (const theme of ["light", "dark"]) {
    await page.addInitScript((value) => localStorage.setItem("volo-reference-theme", value), theme);
    for (const [path, heading] of [
      ["/i/e2e-closed-teal", "This interview is closed"],
      ["/i/e2e-missing-link", "This link doesn't work"],
      ["/recording-recovery", "Recording recovery"],
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      await expect(page.locator("[data-candidate-surface]")).toHaveCSS("background-color", "rgb(22, 22, 22)");
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/candidate-neutral-recovery.png", fullPage: true });
});
