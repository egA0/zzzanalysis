import { expect, test } from "@playwright/test";

const startupLabel = "下次打开网页时自动显示使用指引";

test("生产 PWA 安装后断网仍可打开总览、加载标志，指引默认可离线弹出", async ({
  page,
  context,
}) => {
  const session = await context.newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.setCacheDisabled", { cacheDisabled: true });
  await page.goto("/");
  const logo = page.locator(".topbar-mark");
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute("src", "./zenless-zone-zero-logo.png");
  await expect
    .poll(() =>
      logo.evaluate(
        (image: HTMLImageElement) =>
          image.complete && image.naturalWidth === 250,
      ),
    )
    .toBe(true);
  const guide = page.getByRole("dialog", { name: "使用指引", exact: true });
  await expect(guide).toBeVisible();
  await guide.getByRole("button", { name: "开始规划" }).click();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(guide).toBeVisible();
  await guide.getByRole("button", { name: "开始规划" }).click();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await expect(guide).toBeVisible();
  await guide.getByRole("button", { name: "开始规划" }).click();
  await expect(page.getByRole("heading", { name: "抽卡规划台" })).toBeVisible();
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

test("离线保留不再自动显示的选择，仍能手动打开指引", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const guide = page.getByRole("dialog", { name: "使用指引", exact: true });
  await guide.getByRole("checkbox", { name: startupLabel }).uncheck();
  await guide.getByRole("button", { name: "开始规划" }).click();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  const openGuide = page.getByRole("button", { name: "使用指引", exact: true });
  await expect(openGuide).toBeVisible();
  await expect(guide).not.toBeVisible();
  await openGuide.click();
  await expect(guide).toBeVisible();
  await expect(
    guide.getByRole("checkbox", { name: startupLabel }),
  ).not.toBeChecked();
});
