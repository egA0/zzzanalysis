import { expect, test } from "@playwright/test";
import { navigate } from "./helpers";

const startupLabel = "下次打开网页时自动显示使用指引";

test.beforeEach(async ({ page }) => {
  await page.route("**/wiki.biligame.com/**", (route) => route.abort());
});

test("默认弹出，关闭不修改偏好，刷新后再次显示", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const guide = page.getByRole("dialog", { name: "使用指引", exact: true });
  await expect(guide).toBeVisible();
  await expect(guide.getByRole("listitem")).toHaveCount(6);
  await expect(
    guide.getByRole("checkbox", { name: startupLabel }),
  ).toBeChecked();
  await expect(
    guide.getByRole("heading", { name: "使用指引", exact: true }),
  ).toBeFocused();
  await guide
    .getByRole("button", { name: "关闭使用指引", exact: true })
    .click();
  await expect(guide).not.toBeVisible();
  await navigate(page, "当前资源");
  await page
    .getByRole("spinbutton", { name: "菲林", exact: true })
    .fill("1600");
  await expect(guide).not.toBeVisible();
  await page.reload();
  await expect(guide).toBeVisible();
  await expect(
    guide.getByRole("checkbox", { name: startupLabel }),
  ).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(guide).not.toBeVisible();
  await navigate(page, "当前资源");
  await expect(
    page.getByRole("spinbutton", { name: "菲林", exact: true }),
  ).toHaveValue("1600");
  expect(errors).toEqual([]);
});

test("记住关闭选择，顶部与设置均可重开，设置可以恢复自动弹出", async ({
  page,
}) => {
  await page.goto("/");
  const guide = page.getByRole("dialog", { name: "使用指引", exact: true });
  await guide.getByRole("checkbox", { name: startupLabel }).uncheck();
  await guide.getByRole("button", { name: "开始规划" }).click();
  await page.reload();
  const topButton = page.getByRole("button", { name: "使用指引", exact: true });
  await expect(topButton).toBeVisible();
  await expect(guide).not.toBeVisible();
  await topButton.click();
  await expect(guide).toBeVisible();
  await expect(
    guide.getByRole("checkbox", { name: startupLabel }),
  ).not.toBeChecked();
  await page.keyboard.press("Escape");
  await expect(topButton).toBeFocused();
  await navigate(page, "设置");
  await expect(
    page.getByRole("checkbox", { name: startupLabel }),
  ).not.toBeChecked();
  const settingsButton = page.getByRole("button", {
    name: "打开使用指引",
    exact: true,
  });
  await settingsButton.click();
  await expect(guide).toBeVisible();
  await guide.getByRole("button", { name: "开始规划" }).click();
  await expect(settingsButton).toBeFocused();
  await page.getByRole("checkbox", { name: startupLabel }).check();
  // 更改偏好仅影响下一次进入，不应在本次使用过程中突然弹窗。
  await expect(guide).not.toBeVisible();
  await page.reload();
  await expect(guide).toBeVisible();
  await expect(
    guide.getByRole("checkbox", { name: startupLabel }),
  ).toBeChecked();
});

for (const theme of ["dark", "light"] as const) {
  test(`${theme} 使用指引小屏可滚动、操作区可见且键盘焦点不离开弹窗`, async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    const guide = page.getByRole("dialog", { name: "使用指引", exact: true });
    await expect(guide).toBeVisible();
    if (theme === "light") {
      await guide.getByRole("button", { name: "开始规划" }).click();
      await page.getByRole("button", { name: "切换深浅模式" }).click();
      await page.getByRole("button", { name: "使用指引", exact: true }).click();
    }
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(
      guide.getByRole("button", { name: "开始规划" }),
    ).toBeInViewport();
    await expect(
      guide.getByRole("checkbox", { name: startupLabel }),
    ).toBeInViewport();
    const viewport = page.viewportSize()!;
    const box = (await guide.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await guide.getByRole("button", { name: "开始规划" }).focus();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      expect(
        await guide.evaluate((dialog) =>
          dialog.contains(document.activeElement),
        ),
      ).toBe(true);
    }
    await guide.getByRole("heading", { name: "使用指引", exact: true }).focus();
    await page.screenshot({
      path: testInfo.outputPath(`${theme}-usage-guide.png`),
      fullPage: false,
    });
    const body = guide.locator(".guide-body");
    if (testInfo.project.name === "mobile") {
      expect(
        await body.evaluate(
          (element) => element.scrollHeight > element.clientHeight,
        ),
      ).toBe(true);
      await body.focus();
      await page.keyboard.press("End");
      await expect
        .poll(() => body.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(0);
      await expect(
        guide.getByRole("button", { name: "开始规划" }),
      ).toBeInViewport();
    }
    await guide.getByRole("button", { name: "开始规划" }).click();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
      "hidden",
    );
  });
}

test("320 像素窄屏可以阅读指引并操作偏好，Shift+Tab 仍在弹窗内", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  const guide = page.getByRole("dialog", { name: "使用指引", exact: true });
  await expect(guide).toBeVisible();
  await expect(
    guide.getByRole("button", { name: "关闭使用指引", exact: true }),
  ).toBeInViewport();
  await expect(
    guide.getByRole("checkbox", { name: startupLabel }),
  ).toBeInViewport();
  await expect(
    guide.getByRole("button", { name: "开始规划" }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const box = (await guide.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(568);
  await guide.getByRole("heading", { name: "使用指引", exact: true }).focus();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(
      await guide.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await guide.getByRole("checkbox", { name: startupLabel }).uncheck();
  await guide.getByRole("button", { name: "开始规划" }).click();
  await expect(guide).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "使用指引", exact: true }),
  ).toBeInViewport();
});
