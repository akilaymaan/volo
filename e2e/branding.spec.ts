import { expect, test } from "@playwright/test";

test("black-and-white favicon is inherited by all public surfaces and renders without colored pixels", async ({ page }) => {
  let iconHref = "";
  for (const path of ["/sign-in", "/sign-up", "/recording-recovery", "/i/e2e-missing-link"]) {
    await page.goto(path);
    const icons = page.locator('link[rel="icon"]');
    await expect(icons).toHaveCount(1);
    const href = (await icons.getAttribute("href"))!;
    expect(href).toMatch(/^\/icon\.svg\?[^\s]+$/);
    if (iconHref) expect(href).toBe(iconHref);
    iconHref = href;
  }
  const response = await page.request.get(iconHref);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/svg+xml");
  const svg = await response.text();
  expect(svg).not.toContain("#0e6e66");
  expect(svg).not.toContain("#f4fffb");
  expect(new Set(svg.match(/#[0-9a-f]{6}/gi))).toEqual(new Set(["#000000", "#ffffff"]));
  const pixels = await page.evaluate(async (href) => {
    const image = new Image();
    image.src = href;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 32;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0, 32, 32);
    const { data } = context.getImageData(0, 0, 32, 32);
    let colored = 0, black = 0, white = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (!data[i + 3]) continue;
      if (data[i] !== data[i + 1] || data[i] !== data[i + 2]) colored++;
      if (data[i] === 0) black++;
      if (data[i] === 255) white++;
    }
    return { colored, black, white };
  }, iconHref);
  expect(pixels.colored).toBe(0);
  expect(pixels.black).toBeGreaterThan(100);
  expect(pixels.white).toBeGreaterThan(10);
});

test("black-and-white Volo logo stays neutral in both page themes", async ({ page }) => {
  for (const theme of ["light", "dark"]) {
    await page.addInitScript((value) => localStorage.setItem("volo-reference-theme", value), theme);
    await page.goto("/sign-in");
    const logo = page.getByRole("link", { name: "Volo home", exact: true });
    await expect(logo.locator("circle")).toHaveCSS("fill", theme === "light" ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)");
    await expect(logo.locator("path")).toHaveCSS("stroke", theme === "light" ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)");
  }
});
