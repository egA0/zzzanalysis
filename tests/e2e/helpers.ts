import { expect, type Page } from "@playwright/test";

export async function navigate(page: Page, name: string) {
  await page.locator(".app-shell").waitFor({ state: "visible" });
  const desktop = page
    .locator(".sidebar")
    .getByRole("button", { name, exact: true });
  if (await desktop.isVisible()) {
    await desktop.click();
    return;
  }
  const primary = page
    .locator(".mobile-nav")
    .getByRole("button", { name, exact: true });
  if (await primary.count()) {
    await primary.click();
    return;
  }
  await page.getByRole("button", { name: "更多页面", exact: true }).click();
  await page
    .locator(".mobile-more-menu")
    .getByRole("button", { name, exact: true })
    .click();
}

export async function dismissStartupGuide(page: Page) {
  const guide = page.getByRole("dialog", { name: "使用指引", exact: true });
  await expect(guide).toBeVisible();
  await guide.getByRole("button", { name: "开始规划", exact: true }).click();
  await expect(guide).not.toBeVisible();
}

export async function openPlanner(page: Page) {
  await page.goto("/");
  await dismissStartupGuide(page);
}
