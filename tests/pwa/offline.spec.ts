import { expect, test } from "@playwright/test";

test("生产 PWA 安装后断网仍可打开总览", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "抽卡规划台" })).toBeVisible();
});
