import { expect, test } from "@playwright/test";

test("recruiter signup cannot grant admin access, including direct URLs and RSC requests", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Admin impersonator");
  await page.getByLabel("Work email").fill("not-admin@example.test");
  await page.getByLabel("Password").fill("local-recruiter-pass-123");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("link", { name: "API usage", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Search quick actions" }).click();
  await page.getByLabel("Search pages and interviews").fill("API usage");
  await expect(page.getByRole("navigation", { name: "Quick action results" }).getByRole("link")).toHaveCount(0);
  await page.keyboard.press("Escape");
  for (const route of ["/dashboard/usage", "/dashboard/admin/usage"]) {
    const headerSets: Record<string, string>[] = [{}, { RSC: "1" }, { RSC: "1", "Next-Router-Prefetch": "1" }];
    for (const headers of headerSets) {
      const response = await page.request.get(route, { headers });
      // Next 16 can answer metadata-only/streamed RSC requests with 200.
      // Document requests must be 404; no RSC response may contain usage data.
      if (!headers.RSC) expect(response.status()).toBe(404);
      else expect([200, 404]).toContain(response.status());
      const body = await response.text();
      expect(body).not.toContain("Other account operation");
      expect(body).not.toContain("Estimated priced usage");
      expect(body).not.toContain("fixture-model");
    }
  }
  await page.goto("/dashboard/privacy");
  await expect(page.getByRole("heading", { name: "Privacy and data retention", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete expired data", exact: true })).toBeVisible();
  await expect(page.getByText("Estimated priced usage (USD)")).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Delete expired data", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Expired candidate data" })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete expired data", exact: true }).click();
  await expect(page.getByText("Expired candidate data deleted", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/privacy-recruiter.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("link", { name: "API usage", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Privacy and data retention", exact: true })).toBeVisible();
});

test("only an allowlisted admin can see platform usage, with retention separate and access lost on sign-out", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill("admin@example.test");
  await page.getByLabel("Password").fill("local-admin-pass-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("link", { name: "API usage", exact: true }).click();
  await expect(page.getByRole("heading", { name: "API usage", exact: true })).toBeVisible();
  await expect(page.getByText("Admin fixture operation", { exact: true })).toBeVisible();
  await expect(page.getByText("Other account operation", { exact: true })).toBeVisible();
  await expect(page.getByText("$1.0000", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete expired data", exact: true })).toHaveCount(0);
  await page.screenshot({ path: "test-results/api-usage-admin.png" });
  await page.goto("/dashboard/usage");
  await expect(page).toHaveURL(/\/dashboard\/admin\/usage$/);
  await page.getByRole("button", { name: "Search quick actions" }).click();
  await page.getByLabel("Search pages and interviews").fill("API usage");
  await expect(page.getByRole("navigation", { name: "Quick action results" }).getByRole("link", { name: "API usage", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/dashboard/admin/usage");
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/dashboard/privacy");
  await expect(page).toHaveURL(/\/sign-in$/);
});
