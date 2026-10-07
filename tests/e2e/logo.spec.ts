import { expect, test } from "@playwright/test";
import { dismissStartupGuide, openPlanner } from "./helpers";

test("附件标志在桌面、手机与深浅主题下显示在左上角", async ({
  page,
}, testInfo) => {
  await openPlanner(page);
  const logo = page.locator(".topbar-mark");
  const mobile = (page.viewportSize()?.width ?? 1280) <= 700;

  for (const theme of ["dark", "light"]) {
    if ((await page.locator("html").getAttribute("data-theme")) !== theme)
      await page.getByRole("button", { name: "切换深浅模式" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute("src", "/zenless-zone-zero-logo.png");
    await expect(logo).toHaveAttribute("alt", "");
    await expect
      .poll(() =>
        logo.evaluate((image: HTMLImageElement) =>
          image.complete ? [image.naturalWidth, image.naturalHeight] : [],
        ),
      )
      .toEqual([250, 250]);

    const bounds = await logo.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBe(mobile ? 16 : 24);
    expect(bounds!.width).toBe(mobile ? 28 : 32);
    expect(bounds!.height).toBe(bounds!.width);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(mobile ? 56 : 64);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.locator(".topbar").screenshot({
      path: testInfo.outputPath(`${theme}-topbar-logo.png`),
    });
  }

  await page.reload();
  await dismissStartupGuide(page);
  await expect(logo).toBeVisible();
  await expect
    .poll(() =>
      logo.evaluate(
        (image: HTMLImageElement) =>
          image.complete && image.naturalWidth === 250,
      ),
    )
    .toBe(true);
});
