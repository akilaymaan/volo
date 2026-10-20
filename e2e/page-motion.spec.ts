import { expect, test } from "@playwright/test";

test("dashboard pages have one title and lightweight motion never blocks navigation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    const observed = { entrances: 0, transitions: [] as number[], entryOpacity: -1, finishedOpacity: -1 };
    Object.assign(window, { observedPageMotion: observed });
    document.addEventListener("animationstart", (event) => {
      if (event.animationName === "site-entrance") observed.entrances++;
    });
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args: Parameters<Element["animate"]>) {
      const animation = animate.apply(this, args);
      if (this.hasAttribute("data-page-motion")) {
        observed.transitions.push(Number((args[1] as KeyframeAnimationOptions).duration));
        if (observed.transitions.length === 1) {
          requestAnimationFrame(() => { observed.entryOpacity = Number(getComputedStyle(this).opacity); });
          void animation.finished.then(() => { observed.finishedOpacity = Number(getComputedStyle(this).opacity); }).catch(() => {});
        }
      }
      return animation;
    };
  });
  await page.goto("/sign-in");
  await expect(page.getByRole("button", { name: "Enter Volo", exact: true })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => (window as unknown as { observedPageMotion: { entrances: number } }).observedPageMotion.entrances)).toBe(1);
  await page.getByRole("button", { name: "Enter Volo", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect.poll(() => page.evaluate(() => (window as unknown as { observedPageMotion: { transitions: number[] } }).observedPageMotion.transitions)).toEqual([420]);
  await expect.poll(() => page.evaluate(() => (window as unknown as { observedPageMotion: { entryOpacity: number } }).observedPageMotion.entryOpacity)).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate(() => (window as unknown as { observedPageMotion: { entryOpacity: number } }).observedPageMotion.entryOpacity)).toBeLessThan(0.9);
  await expect.poll(() => page.evaluate(() => (window as unknown as { observedPageMotion: { finishedOpacity: number } }).observedPageMotion.finishedOpacity)).toBe(1);
  for (const title of ["New interview", "Interviewers", "Review inbox", "Privacy and data retention"]) {
    await page.getByRole("navigation", { name: "Main", exact: true }).getByRole("link", { name: title, exact: true }).click();
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(main.getByText(title, { exact: true })).toHaveCount(1);
  }
  await expect.poll(() => page.evaluate(() => (window as unknown as { observedPageMotion: { transitions: number[] } }).observedPageMotion.transitions.length)).toBe(5);
  expect(await page.evaluate(() => (window as unknown as { observedPageMotion: { transitions: number[] } }).observedPageMotion.transitions)).toEqual([420, 420, 420, 420, 420]);
  await page.screenshot({ path: "test-results/single-heading-desktop.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("navigation", { name: "Main", exact: true }).getByRole("link", { name: "New interview", exact: true }).click();
  await page.getByLabel("Interview name").fill("Keep my draft");
  await expect(page.getByLabel("Interview name")).toHaveValue("Keep my draft");
  expect(await page.locator("[data-page-motion]").evaluate((element) => element.getAnimations().length)).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { observedPageMotion: { transitions: number[] } }).observedPageMotion.transitions.length)).toBe(5);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("main").getByText("New interview", { exact: true })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/single-heading-mobile.png" });
});

test("opening the website respects reduced-motion preferences", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/sign-in");
  expect(await page.locator("body").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  await expect(page.getByRole("button", { name: "Enter Volo", exact: true })).toBeEnabled();
});
