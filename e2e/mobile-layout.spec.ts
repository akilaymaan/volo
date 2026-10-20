import { expect, test } from "@playwright/test";
import { assertMobileLayout } from "./mobile-assertions";

test("mobile landing header stays uncluttered and all secondary actions work in its menu", async ({ page }) => {
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const header = page.locator("header").first();
    await expect(header.getByRole("link", { name: "Volo home", exact: true })).toBeVisible();
    await expect(header.getByRole("button", { name: "Open navigation menu", exact: true })).toBeVisible();
    await expect(header.getByRole("link", { name: "Existing account", exact: true })).not.toBeVisible();
    await expect(header.getByRole("button", { name: "Toggle dark mode", exact: true })).not.toBeVisible();
    await assertMobileLayout(page);
    const mainAction = page.getByRole("link", { name: "Create your first interview", exact: true });
    await expect(mainAction).toBeInViewport();
    await page.screenshot({ path: `test-results/mobile-landing-${width}.png`, fullPage: true });
    await header.getByRole("button", { name: "Open navigation menu", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Explore Volo", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Mobile landing navigation" }).getByRole("link", { name: "Enter Volo", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Toggle dark mode", exact: true }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.screenshot({ path: `test-results/mobile-landing-menu-${width}.png` });
    await page.getByRole("button", { name: "Toggle dark mode", exact: true }).click();
    await page.getByRole("navigation", { name: "Mobile landing navigation" }).getByRole("link", { name: "Existing account", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in\?method=account$/);
    await expect(page.getByLabel("Work email", { exact: true })).toBeVisible();
    await assertMobileLayout(page);
  }
});

test("public, account and candidate screens fit narrow phones and short landscape viewports", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 667, height: 375 }]) {
    await page.setViewportSize(viewport);
    for (const [name, path] of [["entry", "/sign-in"], ["account", "/sign-in?method=account"], ["signup", "/sign-up"], ["candidate", "/i/e2e-legacy-teal"], ["closed", "/i/e2e-closed-teal"], ["invalid", "/i/not-an-interview"], ["recovery", "/recording-recovery"]]) {
      await page.goto(path);
      await assertMobileLayout(page);
      await page.screenshot({ path: `test-results/mobile-${name}-${viewport.width}.png`, fullPage: true });
    }
  }
});

test("mobile dashboard search, drawer and long interviewer dialog remain reachable on a short screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  // UI-only checks reuse the seeded account; preserve the real guest IP quota.
  await page.goto("/sign-in?method=account");
  await page.getByLabel("Work email", { exact: true }).fill("admin@example.test");
  await page.getByLabel("Password", { exact: true }).fill("local-admin-pass-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Search quick actions", exact: true }).click();
  await page.getByLabel("Search pages and interviews", { exact: true }).fill("Interviewers");
  await page.getByRole("navigation", { name: "Quick action results" }).getByRole("link", { name: "Interviewers", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Interviewers", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New interviewer", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New interviewer", exact: true });
  await expect(dialog).toBeVisible();
  const rect = await dialog.boundingBox();
  expect(rect!.y).toBeGreaterThanOrEqual(15);
  expect(rect!.height).toBeLessThanOrEqual(536);
  await assertMobileLayout(page);
  const dialogGeometry = await dialog.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { scroll: element.scrollWidth, width: element.clientWidth,
      outside: [...element.querySelectorAll("*")].filter((node) => node.getBoundingClientRect().right > bounds.right + 0.5).map((node) => ({ tag: node.tagName, slot: node.getAttribute("data-slot"), class: node.getAttribute("class"), right: node.getBoundingClientRect().right })).slice(0, 8) };
  });
  expect(dialogGeometry.scroll, JSON.stringify(dialogGeometry)).toBeLessThanOrEqual(dialogGeometry.width + 1);
  await dialog.getByRole("button", { name: "Create interviewer", exact: true }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole("button", { name: "Create interviewer", exact: true })).toBeInViewport();
  await page.screenshot({ path: "test-results/mobile-interviewer-dialog-short.png" });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.setViewportSize({ width: 667, height: 375 });
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page.getByRole("link", { name: "Privacy and data retention", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("link", { name: "Privacy and data retention", exact: true })).toBeInViewport();
  await page.getByRole("button", { name: "Account menu", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeInViewport();
  await page.screenshot({ path: "test-results/mobile-drawer-landscape.png" });
});
