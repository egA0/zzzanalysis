import { expect, test } from "@playwright/test";

const startupLabel = "下次打开网页时自动显示使用指引";

test("生产 PWA 安装后断网仍可打开总览，指引默认可离线弹出", async ({
  page,
  context,
}) => {
  await page.goto("/");
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
