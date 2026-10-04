import { expect, test } from "@playwright/test";

test("资源、保底、目标、计算与本地保存", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "抽卡规划台" })).toBeVisible();
  await page.getByRole("button", { name: "当前资源" }).first().click();
  await page
    .getByRole("spinbutton", { name: "菲林", exact: true })
    .fill("1600");
  await expect(page.getByText("10", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "卡池状态" }).first().click();
  await page.getByRole("spinbutton", { name: "当前垫数" }).first().fill("89");
  await page.getByRole("button", { name: "目标编辑" }).first().click();
  await page.getByRole("button", { name: "角色", exact: true }).click();
  await page.getByRole("textbox", { name: "目标名称" }).fill("测试目标");
  await page.getByRole("button", { name: "概率分析" }).first().click();
  await expect(page.getByText("整套计划完成概率")).toBeVisible({
    timeout: 60000,
  });
  await expect(
    page.getByText("角色 · 测试目标", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("完成概率覆盖线")).toBeVisible();
  await expect
    .poll(async () => page.locator(".chart canvas").count())
    .toBeGreaterThan(0);
  expect(
    await page
      .locator(".chart canvas")
      .first()
      .evaluate((canvas) => {
        const element = canvas as HTMLCanvasElement;
        const pixels = element
          .getContext("2d")!
          .getImageData(0, 0, element.width, element.height).data;
        let painted = 0;
        for (let i = 3; i < pixels.length; i += 128)
          if (pixels[i]! > 0) painted++;
        return painted;
      }),
  ).toBeGreaterThan(10);
  await page.reload();
  await page.getByRole("button", { name: "当前资源" }).first().click();
  await expect(
    page.getByRole("spinbutton", { name: "菲林", exact: true }),
  ).toHaveValue("1600");
  await page.screenshot({
    path: testInfo.outputPath("resource-view.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 2,
    ),
  ).toBe(true);
});

test("方案删除确认、来源和估算收入开关", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "方案比较" }).first().click();
  await page.getByRole("button", { name: "保存副本" }).click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: /删除方案/ })
    .last()
    .click();
  await expect(page.getByText("我的规划 副本", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "数据来源" }).first().click();
  await expect(page.getByText("需要再次确认")).toBeVisible();
  await page.getByRole("button", { name: "设置" }).first().click();
  await expect(
    page.getByRole("checkbox", { name: /将估算收入计入/ }),
  ).not.toBeChecked();
});
test("关闭歪后保证后显示无有限最坏需求", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "设置" }).first().click();
  await page
    .getByRole("checkbox", { name: "歪后下一次 S 必定限定" })
    .first()
    .uncheck();
  await page.getByRole("button", { name: "当前资源" }).first().click();
  await page
    .getByRole("spinbutton", { name: "加密母带", exact: true })
    .fill("1");
  await page.getByRole("button", { name: "卡池状态" }).first().click();
  await page.getByRole("spinbutton", { name: "当前垫数" }).first().fill("89");
  await page.getByRole("button", { name: "目标编辑" }).first().click();
  await page.getByRole("button", { name: "角色", exact: true }).click();
  await page.getByRole("textbox", { name: "目标名称" }).fill("无保证目标");
  await page.getByRole("button", { name: "概率分析" }).first().click();
  await expect(page.getByText("无有限上界").first()).toBeVisible({
    timeout: 60000,
  });
});
test("第三方规则来源可停用、持久化并重新启用", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "数据来源" }).first().click();
  const source = page
    .locator(".comparison-row")
    .filter({ hasText: "GachaData 角色软保底拟合模型" });
  page.once("dialog", (dialog) => dialog.accept());
  await source.getByRole("button", { name: "停用并回滚" }).click();
  await expect(
    source.getByRole("button", { name: "启用并应用" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "数据来源" }).first().click();
  const reloaded = page
    .locator(".comparison-row")
    .filter({ hasText: "GachaData 角色软保底拟合模型" });
  await expect(
    reloaded.getByRole("button", { name: "启用并应用" }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await reloaded.getByRole("button", { name: "启用并应用" }).click();
  await expect(
    reloaded.getByRole("button", { name: "停用并回滚" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("rule-sources.png"),
    fullPage: true,
  });
});

test("特殊频道切换同一期自选目标时保留独立状态", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "特殊频道" }).first().click();
  await expect(
    page.getByRole("heading", { name: "特殊频道", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/与普通角色限定频道：垫数独立，常规歪后保证独立/),
  ).toBeVisible();
  await page.getByRole("spinbutton", { name: "特殊频道当前垫数" }).fill("12");
  await page
    .getByRole("checkbox", {
      name: "特殊频道常规保证：下一次常规 S 必定为自选目标",
    })
    .check();
  const target = page.getByRole("combobox", { name: "该期可选目标" });
  await target.selectOption({ index: 1 });
  await expect(
    page.getByRole("spinbutton", { name: "特殊频道当前垫数" }),
  ).toHaveValue("12");
  await expect(
    page.getByRole("checkbox", {
      name: "特殊频道常规保证：下一次常规 S 必定为自选目标",
    }),
  ).toBeChecked();
});

test("历史卡池、离线记录和复刻周期表可用", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "版本时间轴" }).first().click();
  await expect(page.getByText(/覆盖 1\.0 至 3\.2/)).toBeVisible();
  await expect(page.getByText("官方记录（手动维护）")).toBeVisible();
  await page.getByRole("tab", { name: "复刻周期" }).click();
  await expect(
    page.getByRole("heading", { name: "全角色复刻周期表" }),
  ).toBeVisible();
  await expect(page.locator(".rerun-row")).toHaveCount(42);
  await expect(page.getByText("琉音", { exact: true }).first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 2,
    ),
  ).toBe(true);
});

test("手机导航精简为常用入口并通过更多访问其余页面", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "手机导航" });
  await expect(navigation.getByRole("button")).toHaveCount(5);
  const moreButton = navigation.getByRole("button", { name: "更多页面" });
  await moreButton.click();
  const morePages = page.getByRole("navigation", { name: "更多页面" });
  await expect(morePages.getByRole("button")).toHaveCount(7);
  await morePages.getByRole("button", { name: "方案比较" }).click();
  await expect(moreButton).toHaveAttribute("aria-current", "page");
  await moreButton.click();
  await page.keyboard.press("Escape");
  await expect(morePages).toBeHidden();
});
