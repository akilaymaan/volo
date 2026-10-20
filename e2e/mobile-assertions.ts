import { expect, type Page } from "@playwright/test";

export async function assertMobileLayout(page: Page) {
  const layout = await page.evaluate(() => ({
    width: innerWidth, scroll: document.documentElement.scrollWidth,
    fields: [...document.querySelectorAll<HTMLInputElement>("input, textarea, select")]
      .filter((el) => { const rect = el.getBoundingClientRect(); return rect.width > 5 && rect.height > 5 && !["checkbox", "radio", "range", "hidden"].includes(el.type) && getComputedStyle(el).visibility !== "hidden"; })
      .map((el) => ({ label: el.getAttribute("aria-label") ?? el.id, font: parseFloat(getComputedStyle(el).fontSize) })),
  }));
  expect(layout.scroll, `Page overflow at ${page.url()} (${layout.width}px)`).toBeLessThanOrEqual(layout.width + 1);
  expect(layout.fields.filter((field) => field.font < 16), `Small mobile form text at ${page.url()}`).toEqual([]);
}
