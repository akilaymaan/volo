import { expect, test } from "@playwright/test";

test("auth sphere follows the cursor, resets on leave and leaves the form usable", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/sign-in");
  const orb = page.locator("[data-auth-orb]");
  await expect(orb).toBeVisible();
  await expect(orb).toHaveAttribute("aria-hidden", "true");
  await expect(orb).toHaveAttribute("data-running", "true");
  const box = (await orb.boundingBox())!;
  await page.mouse.move(box.x + box.width * .8, box.y + box.height * .3);
  await expect(orb).toHaveAttribute("data-tracking", "true");
  expect(await orb.evaluate((el) => parseFloat((el as HTMLElement).style.getPropertyValue("--orb-x")))).toBeGreaterThan(0);
  await page.screenshot({ path: "test-results/auth-orb-desktop.png" });
  await page.mouse.move(50, 50);
  await expect(orb).toHaveAttribute("data-tracking", "false");
  await expect(orb).not.toHaveAttribute("style");
  await page.getByLabel("Work email").fill("person@example.test");
  await page.getByLabel("Password").fill("not-submitted");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/sign-up$/);
  await expect(orb).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(orb).toBeHidden();
  await expect(orb).toHaveAttribute("data-running", "false");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/auth-orb-mobile.png" });
});

test("auth sphere respects live reduced-motion changes and ignores touch movement", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/sign-in");
  const orb = page.locator("[data-auth-orb]");
  await expect(orb).toHaveAttribute("data-tracking", "false");
  await orb.hover({ position: { x: 300, y: 100 } });
  await expect(orb).toHaveAttribute("data-tracking", "false");
  expect(await orb.evaluate((el) => Array.from(el.querySelectorAll("*")).every((child) => getComputedStyle(child).animationName === "none"))).toBe(true);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await orb.hover({ position: { x: 320, y: 120 } });
  await expect(orb).toHaveAttribute("data-tracking", "true");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(orb).toHaveAttribute("data-tracking", "false");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await orb.dispatchEvent("pointermove", { pointerType: "touch", clientX: 1200, clientY: 350 });
  await expect(orb).toHaveAttribute("data-tracking", "false");
});
