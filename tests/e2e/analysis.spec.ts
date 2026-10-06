import { expect, test, type Page } from "@playwright/test";
import { navigate, openPlanner } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.route("**/wiki.biligame.com/**", (route) => route.abort());
});

async function configureBudgetAndPity(page: Page, pulls: number) {
  await openPlanner(page);
  await navigate(page, "设置");
  await page
    .getByRole("checkbox", { name: "将未来资源累计计入可用资源（默认开启）" })
    .uncheck();
  await navigate(page, "当前资源");
  await page
    .getByRole("spinbutton", { name: "加密母带", exact: true })
    .fill(String(pulls));
  await navigate(page, "卡池状态");
  await page.getByRole("spinbutton", { name: "当前垫数" }).first().fill("89");
  await page.getByRole("spinbutton", { name: "当前垫数" }).last().fill("79");
  const guarantees = page.getByRole("checkbox", {
    name: "下一次 S 必定为当期限定（请核对游戏内状态）",
  });
  await guarantees.first().check();
  await guarantees.last().check();
}

async function addCombinedTarget(page: Page) {
  await navigate(page, "目标编辑");
  await page.getByRole("button", { name: "角色", exact: true }).click();
  await page.getByRole("textbox", { name: "目标名称" }).fill("组合测试目标");
  await page.getByRole("checkbox", { name: "同时抽取专武" }).check();
  await navigate(page, "概率分析");
  await expect(
    page.getByRole("region", { name: "音擎分析", exact: true }),
  ).toBeVisible({ timeout: 60000 });
}

test("组合目标展示角色、音擎及联合完成率，共享有限预算", async ({
  page,
}, testInfo) => {
  await configureBudgetAndPity(page, 1);
  await addCombinedTarget(page);
  const agent = page.getByRole("region", { name: "角色分析", exact: true });
  const engine = page.getByRole("region", { name: "音擎分析", exact: true });
  await expect(agent.locator(".result-list strong")).toHaveText("100.0%");
  await expect(
    engine.getByText("组合测试目标的专属音擎", { exact: true }),
  ).toBeVisible();
  await expect(engine.locator(".result-list strong")).toHaveText("0.0%");
  const combined = page
    .locator(".result-list > div")
    .filter({ hasText: "角色 + 专属音擎 · 组合测试目标" });
  await expect(combined.locator("strong")).toHaveText("0.0%");
  await expect(engine.getByText("79 抽", { exact: true })).toBeVisible();
  await expect(engine.getByText("1 抽", { exact: true })).toBeVisible();
  await expect(engine.getByText("已保证", { exact: true })).toBeVisible();
  await expect(engine.getByText(/与角色共享该目标的投入上限/)).toBeVisible();
  await navigate(page, "当前资源");
  await page
    .getByRole("spinbutton", { name: "加密母带", exact: true })
    .fill("2");
  await navigate(page, "概率分析");
  await expect(engine.locator(".result-list strong")).toHaveText("100.0%", {
    timeout: 60000,
  });
  await expect(combined.locator("strong")).toHaveText("100.0%");
  await page.screenshot({
    path: testInfo.outputPath("engine-analysis.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 2,
    ),
  ).toBe(true);
});

test("独立音擎目标使用音擎概率及保证状态，并响应状态修改", async ({ page }) => {
  await configureBudgetAndPity(page, 1);
  await navigate(page, "卡池状态");
  await page
    .getByRole("checkbox", {
      name: "下一次 S 必定为当期限定（请核对游戏内状态）",
    })
    .last()
    .uncheck();
  await navigate(page, "目标编辑");
  await page.getByRole("button", { name: "音擎", exact: true }).click();
  await page.getByRole("textbox", { name: "目标名称" }).fill("独立音擎测试");
  await navigate(page, "概率分析");
  const engine = page.getByRole("region", { name: "音擎分析", exact: true });
  await expect(engine.locator(".result-list strong")).toHaveText("75.0%", {
    timeout: 60000,
  });
  await expect(engine.getByText("未保证", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "角色分析", exact: true })
      .getByText(/尚未设置角色目标/),
  ).toBeVisible();
  await navigate(page, "卡池状态");
  await page
    .getByRole("checkbox", {
      name: "下一次 S 必定为当期限定（请核对游戏内状态）",
    })
    .last()
    .check();
  await navigate(page, "概率分析");
  await expect(engine.locator(".result-list strong")).toHaveText("100.0%", {
    timeout: 60000,
  });
});

test("取消同时抽取专武后，音擎分析不保留过期结果", async ({ page }) => {
  await configureBudgetAndPity(page, 2);
  await addCombinedTarget(page);
  await navigate(page, "目标编辑");
  await page.getByRole("checkbox", { name: "同时抽取专武" }).uncheck();
  await navigate(page, "概率分析");
  const engine = page.getByRole("region", { name: "音擎分析", exact: true });
  await expect(engine.getByText(/尚未设置音擎目标/)).toBeVisible({
    timeout: 60000,
  });
  await expect(engine.locator(".result-list")).toHaveCount(0);
  await expect(
    page.getByText("角色 · 组合测试目标", { exact: true }),
  ).toBeVisible();
});
