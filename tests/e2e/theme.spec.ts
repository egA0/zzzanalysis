import {
  expect,
  test,
  type Download,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import type { AppData } from "../../src/domain/types";
import { navigate, openPlanner, dismissStartupGuide } from "./helpers";

const fixedNow = new Date("2026-10-07T04:00:00Z");
const longTargetName = "TargetAB".repeat(10);
const longPlanName = "PlanABCD".repeat(10);

test.use({ timezoneId: "Asia/Shanghai" });
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(fixedNow);
  await page.emulateMedia({ reducedMotion: "reduce" });
});

async function expectReadable(page: Page) {
  const issues = await page.evaluate(() => {
    type Color = [number, number, number, number];
    const parse = (value: string): Color => {
      const values = value.match(/[\d.]+/g)?.map(Number) ?? [];
      return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 1];
    };
    const blend = (front: Color, back: Color): Color => [
      front[0] * front[3] + back[0] * (1 - front[3]),
      front[1] * front[3] + back[1] * (1 - front[3]),
      front[2] * front[3] + back[2] * (1 - front[3]),
      1,
    ];
    const luminance = (color: Color) => {
      const channels = color.slice(0, 3).map((value) => {
        const channel = value / 255;
        return channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return (
        channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
      );
    };
    const contrast = (front: Color, back: Color) => {
      const a = luminance(blend(front, back));
      const b = luminance(back);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    const backgrounds = (element: Element): Color[] => {
      const ancestors: Element[] = [];
      for (
        let current: Element | null = element;
        current;
        current = current.parentElement
      )
        ancestors.unshift(current);
      let colors: Color[] = [[255, 255, 255, 1]];
      for (const ancestor of ancestors) {
        const style = getComputedStyle(ancestor);
        const solid = parse(style.backgroundColor);
        if (solid[3] > 0) colors = colors.map((color) => blend(solid, color));
        // Check every gradient stop, including translucent decorative overlays.
        const stops = (
          style.backgroundImage.match(/rgba?\([^)]+\)/g) ?? []
        ).map(parse);
        const opaque = stops.filter((stop) => stop[3] === 1);
        if (opaque.length > 1) colors = opaque;
        for (const stop of stops.filter(
          (color) => color[3] > 0 && color[3] < 1,
        )) {
          colors = [...colors, ...colors.map((color) => blend(stop, color))];
        }
      }
      return colors;
    };
    const selectors =
      ".content :is(h1,h2,h3,h4,p,small,strong,span,a,label,input,select,button,output), .breadcrumb, .model-pill, .side-footer, nav button, nav button span, .brand small";
    return Array.from(document.querySelectorAll(selectors)).flatMap(
      (element) => {
        const style = getComputedStyle(element);
        if (
          !element.getClientRects().length ||
          style.visibility === "hidden" ||
          element.matches(":disabled")
        )
          return [];
        const text = Array.from(element.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent?.trim())
          .join("")
          .trim();
        if (!text && !element.matches("input,select")) return [];
        const foreground = parse(style.color);
        const ratio = Math.min(
          ...backgrounds(element).map((background) =>
            contrast(foreground, background),
          ),
        );
        const size = parseFloat(style.fontSize);
        const required =
          size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700)
            ? 3
            : 4.5;
        return ratio + 0.01 >= required
          ? []
          : [
              {
                text:
                  text.slice(0, 55) ||
                  element.getAttribute("aria-label") ||
                  element.tagName,
                className: element.className,
                ratio: Number(ratio.toFixed(2)),
                required,
              },
            ];
      },
    );
  });
  expect(issues, "正文、次级文字及导航应保持足够对比度").toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 2,
    ),
    "页面不应产生横向溢出",
  ).toBe(true);
}

async function downloadBytes(download: Download) {
  expect(await download.failure()).toBeNull();
  const stream = await download.createReadStream();
  if (!stream) throw new Error("下载未提供可读取的内容");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of stream) {
    const bytes = new Uint8Array(chunk);
    chunks.push(bytes);
    length += bytes.length;
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

async function openPopulatedPlanner(
  page: Page,
  testInfo: TestInfo,
  largeResources = false,
) {
  await page.route("**/wiki.biligame.com/**", (route) => route.abort());
  await openPlanner(page);
  await navigate(page, "目标编辑");
  await page.getByRole("button", { name: "角色", exact: true }).click();
  await page.getByRole("textbox", { name: "目标名称" }).fill(longTargetName);
  await page.getByRole("spinbutton", { name: "最多投入抽数" }).fill("8");
  await navigate(page, "设置");
  const exported = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 JSON", exact: true }).click();
  const data = JSON.parse(
    new TextDecoder().decode(await downloadBytes(await exported)),
  ) as AppData;
  const plan = data.plans.find((item) => item.id === data.activePlanId)!;
  plan.name = longPlanName;
  const target = plan.targets[0]!;
  target.name = longTargetName;
  target.targetVersion = "3.2";
  target.targetPhase = 2;
  target.stopDate = "2026-10-20";
  target.copies = 1;
  target.maxPulls = 8;
  target.includeSignatureEngine = false;
  target.skipped = false;
  data.resources.film = largeResources ? 1_000_000 : 1600;
  data.resources.encrypted = largeResources ? 1_000_000 : 0;
  data.pity.agent.count = 85;
  data.pity.agent.guaranteed = true;
  data.settings.includeEstimates = false;
  data.settings.gachaProceeds.enabled = false;
  data.settings.simulations = 100;
  data.settings.seed = 20261007;
  data.settings.theme = "dark";
  await testInfo.attach("visual-regression.json", {
    body: JSON.stringify(data),
    contentType: "application/json",
  });
  const seed = testInfo.attachments.at(-1)?.body;
  if (!seed) throw new Error("未生成测试导入内容");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("选择 JSON 文件").setInputFiles({
    name: "visual-regression.json",
    mimeType: "application/json",
    buffer: seed,
  });
  await expect(page.getByRole("spinbutton", { name: "随机种子" })).toHaveValue(
    "20261007",
  );
}

async function expectChartInk(page: Page) {
  await expect
    .poll(async () =>
      page.locator(".chart canvas").evaluateAll((canvases) => {
        const hex = getComputedStyle(document.documentElement)
          .getPropertyValue("--chart-line")
          .trim();
        const color = [1, 3, 5].map((start) =>
          parseInt(hex.slice(start, start + 2), 16),
        );
        let painted = 0;
        for (const canvas of canvases) {
          const element = canvas as HTMLCanvasElement;
          const pixels = element
            .getContext("2d")!
            .getImageData(0, 0, element.width, element.height).data;
          for (let index = 0; index < pixels.length; index += 4)
            if (
              pixels[index] === color[0] &&
              pixels[index + 1] === color[1] &&
              pixels[index + 2] === color[2] &&
              pixels[index + 3]! > 200
            )
              painted++;
        }
        return painted;
      }),
    )
    .toBeGreaterThan(5);
}

async function expectLayoutFits(page: Page) {
  await expectReadable(page);
  const issues = await page.evaluate(() => {
    const issues: string[] = [];
    const content = document.querySelector(".content")!.getBoundingClientRect();
    const visible = (element: Element) =>
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== "hidden";
    for (const element of Array.from(
      document.querySelectorAll(
        ".content :is(h1,h2,h3,p,small,strong,span,button,input,select,output)",
      ),
    )) {
      if (!visible(element)) continue;
      const box = element.getBoundingClientRect();
      if (box.left < content.left - 1 || box.right > content.right + 1)
        issues.push(
          `超出正文边界：${element.textContent?.trim().slice(0, 35) || element.getAttribute("aria-label") || element.tagName}`,
        );
    }
    for (const group of Array.from(
      document.querySelectorAll(
        ".heading, .section-heading, .top-actions, .actions",
      ),
    )) {
      const children = Array.from(group.children).filter(visible);
      for (let index = 0; index < children.length; index++)
        for (let next = index + 1; next < children.length; next++) {
          const a = children[index]!.getBoundingClientRect();
          const b = children[next]!.getBoundingClientRect();
          if (
            Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
            Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
          )
            issues.push(
              `标题或操作重叠：${group.textContent?.trim().slice(0, 60)}`,
            );
        }
    }
    return issues;
  });
  expect(issues, "长名称及关键操作不应越界或互相覆盖").toEqual([]);
}

async function expectTouchTargets(page: Page) {
  const issues = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll(
        ".top-actions button, .content button, .content input:not([type='checkbox']):not([type='file']), .content select, .mobile-nav button, .mobile-more-menu button",
      ),
    ).flatMap((element) => {
      if (
        !element.getClientRects().length ||
        getComputedStyle(element).visibility === "hidden" ||
        element.matches(":disabled")
      )
        return [];
      const box = element.getBoundingClientRect();
      return box.width >= 43.5 && box.height >= 43.5
        ? []
        : [
            {
              name:
                element.getAttribute("aria-label") ||
                element.textContent?.trim() ||
                element.tagName,
              width: box.width,
              height: box.height,
            },
          ];
    }),
  );
  expect(issues, "手机可用的输入框和工具按钮触控区域应至少44px").toEqual([]);
}

async function expectLastItemAboveNavigation(page: Page, item: Locator) {
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await expect(item).toBeInViewport();
  await expect
    .poll(
      async () => {
        const last = await item.boundingBox();
        const navigation = await page.locator(".mobile-nav").boundingBox();
        return (
          !!last && !!navigation && last.y + last.height <= navigation.y - 1
        );
      },
      { message: "滚动到底后最后一项应完整露出固定底栏" },
    )
    .toBe(true);
}

for (const theme of ["light", "dark"] as const) {
  test(`${theme} 主题所有页面文字可读且布局无溢出`, async ({
    page,
  }, testInfo) => {
    await page.route("**/wiki.biligame.com/**", (route) => route.abort());
    await openPlanner(page);
    await expect(
      page.getByRole("heading", { name: "抽卡规划台" }),
    ).toBeVisible();
    if (theme === "light")
      await page.getByRole("button", { name: "切换深浅模式" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    for (const name of [
      "总览",
      "当前资源",
      "版本资源",
      "卡池状态",
      "目标编辑",
      "版本时间轴",
      "特殊频道",
      "概率分析",
      "方案比较",
      "数据来源",
      "设置",
    ]) {
      await navigate(page, name);
      await expect(page.locator(".heading h1")).toBeVisible();
      await expectReadable(page);
      if (name === "总览") {
        const metrics = page.locator(".metrics").first();
        const columns = await metrics.evaluate(
          (element) =>
            getComputedStyle(element).gridTemplateColumns.split(" ").length,
        );
        expect(columns).toBe(testInfo.project.name === "mobile" ? 2 : 4);
        await expect(page.locator('.metric[data-emphasis="true"]')).toHaveCount(
          2,
        );
        await page.screenshot({
          path: testInfo.outputPath(`${theme}-overview.png`),
          fullPage: true,
        });
      }
    }
    await page.reload();
    await dismissStartupGuide(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  });

  test(`${theme} 时间轴卡池、往期查询及复刻表可读`, async ({
    page,
  }, testInfo) => {
    await page.route("**/wiki.biligame.com/**", (route) => route.abort());
    await openPlanner(page);
    await expect(
      page.getByRole("heading", { name: "抽卡规划台" }),
    ).toBeVisible();
    if (theme === "light")
      await page.getByRole("button", { name: "切换深浅模式" }).click();
    await navigate(page, "版本时间轴");
    await expect(page.locator(".phase-card").first()).toBeVisible();
    await expectReadable(page);
    await page.screenshot({
      path: testInfo.outputPath(`${theme}-timeline.png`),
    });
    await page.getByRole("tab", { name: "往期查询" }).click();
    await page.getByPlaceholder("例如：艾莲、青衣、音擎名称").fill("艾莲");
    await expect(page.locator(".history-result").first()).toBeVisible();
    await expectReadable(page);
    await page.screenshot({
      path: testInfo.outputPath(`${theme}-history.png`),
    });
    await page.getByRole("tab", { name: "复刻周期" }).click();
    await expect(page.locator(".rerun-row")).toHaveCount(44);
    await expectReadable(page);
    await page.screenshot({ path: testInfo.outputPath(`${theme}-reruns.png`) });
  });
}

test("同步中的状态点不会继承页面加载块的尺寸", async ({ page }) => {
  await page.route("**/wiki.biligame.com/**", () => new Promise(() => {}));
  await openPlanner(page);
  await expect(page.getByRole("heading", { name: "抽卡规划台" })).toBeVisible();
  await navigate(page, "版本时间轴");
  const indicator = page.locator(".sync-indicator");
  await expect(indicator).toHaveClass("sync-indicator pending");
  for (const theme of ["dark", "light"]) {
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(indicator).toHaveCSS("width", "10px");
    await expect(indicator).toHaveCSS("height", "10px");
    await expect(indicator).toHaveCSS("padding-top", "0px");
    await expectReadable(page);
    if (theme === "dark")
      await page.getByRole("button", { name: "切换深浅模式" }).click();
  }
});

test("概率图表在当前页面即时跟随主题切换", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/wiki.biligame.com/**", (route) => route.abort());
  await openPlanner(page);
  await expect(page.getByRole("heading", { name: "抽卡规划台" })).toBeVisible();
  await navigate(page, "当前资源");
  await page
    .getByRole("spinbutton", { name: "菲林", exact: true })
    .fill("1600");
  await navigate(page, "卡池状态");
  await page.getByRole("spinbutton", { name: "当前垫数" }).first().fill("89");
  await page
    .getByRole("checkbox", {
      name: "下一次 S 必定为当期限定（请核对游戏内状态）",
    })
    .first()
    .check();
  await navigate(page, "目标编辑");
  await page.getByRole("button", { name: "角色", exact: true }).click();
  await page.getByRole("textbox", { name: "目标名称" }).fill("主题图表测试");
  await navigate(page, "概率分析");
  await expect(page.getByText("整套计划完成概率")).toBeVisible({
    timeout: 60000,
  });
  await expect(page.locator(".chart")).toHaveAttribute("data-point-count", "1");
  for (const [index, theme] of ["dark", "light", "dark"].entries()) {
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expectChartInk(page);
    await expectReadable(page);
    await page
      .locator(".chart")
      .screenshot({ path: testInfo.outputPath(`${theme}-chart.png`) });
    if (index < 2)
      await page.getByRole("button", { name: "切换深浅模式" }).click();
  }
});

test("320 像素窄屏和打印预览保持布局及文字可读", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.route("**/wiki.biligame.com/**", (route) => route.abort());
  await openPlanner(page);
  await expect(page.getByRole("heading", { name: "抽卡规划台" })).toBeVisible();
  await page.getByRole("button", { name: "切换深浅模式" }).click();
  for (const name of [
    "总览",
    "当前资源",
    "版本资源",
    "卡池状态",
    "目标编辑",
    "版本时间轴",
    "特殊频道",
    "概率分析",
    "方案比较",
    "数据来源",
    "设置",
  ]) {
    await navigate(page, name);
    await expectReadable(page);
  }
  await navigate(page, "版本时间轴");
  await page.getByRole("tab", { name: "往期查询" }).click();
  await expect(page.locator(".history-result").first()).toBeVisible();
  await expectReadable(page);
  await page.screenshot({ path: testInfo.outputPath("narrow-history.png") });
  await navigate(page, "总览");
  for (const theme of ["light", "dark"]) {
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.emulateMedia({ media: "print" });
    await expectReadable(page);
    await expect(page.locator(".app-shell")).toHaveCSS("display", "block");
    await expect(page.locator(".heading")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    await page.emulateMedia({ media: "screen" });
    if (theme === "light")
      await page.getByRole("button", { name: "切换深浅模式" }).click();
  }
});

for (const sizeIndex of [0, 1] as const) {
  test(`有数据布局尺寸组 ${sizeIndex + 1}：长名称、资源、操作和触控`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90000);
    const mobile = testInfo.project.name === "mobile";
    const width = (mobile ? [320, 390] : [1280, 1440])[sizeIndex]!;
    await page.setViewportSize({ width, height: mobile ? 844 : 900 });
    await openPopulatedPlanner(page, testInfo, true);
    for (const theme of ["dark", "light"] as const) {
      if ((await page.locator("html").getAttribute("data-theme")) !== theme)
        await page.getByRole("button", { name: "切换深浅模式" }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      for (const name of [
        "总览",
        "当前资源",
        "目标编辑",
        "概率分析",
        "方案比较",
        "版本时间轴",
      ]) {
        await navigate(page, name);
        await expect(page.locator(".heading h1")).toBeVisible();
        if (name === "总览") {
          await expect(
            page.getByRole("heading", {
              name: `当前方案 · ${longPlanName}`,
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            page.locator(".overview-list strong").first(),
          ).toHaveText(longTargetName);
        }
        if (name === "当前资源") {
          const film = page.getByRole("spinbutton", {
            name: "菲林",
            exact: true,
          });
          await expect(film).toHaveValue("1000000");
          await film.fill("-1");
          const validation = film.locator("..").getByRole("alert");
          await expect(validation).toHaveText("请输入 0 至 1000000 的整数");
          await expectLayoutFits(page);
          await film.blur();
          await expect(film).toHaveValue("1000000");
          await expect(validation).toHaveCount(0);
        }
        if (name === "目标编辑")
          await expect(
            page.getByRole("textbox", { name: "目标名称" }),
          ).toHaveValue(longTargetName);
        if (name === "概率分析") {
          await expect(
            page.getByText("整套计划完成概率", { exact: true }),
          ).toBeVisible({ timeout: 60000 });
          const metrics = page.locator(".print-area > .metrics").first();
          await expect(metrics.locator(":scope > .metric")).toHaveCount(3);
          if (!mobile) {
            const layout = await metrics.evaluate((element) => ({
              row: {
                x: element.getBoundingClientRect().left,
                right: element.getBoundingClientRect().right,
              },
              cards: Array.from(element.children).map((child) => {
                const box = child.getBoundingClientRect();
                return {
                  x: box.left,
                  right: box.right,
                  y: box.top,
                  width: box.width,
                };
              }),
            }));
            expect(
              Math.max(...layout.cards.map((card) => card.y)) -
                Math.min(...layout.cards.map((card) => card.y)),
            ).toBeLessThan(1);
            expect(Math.abs(layout.cards[0]!.x - layout.row.x)).toBeLessThan(1);
            expect(
              Math.abs(layout.cards.at(-1)!.right - layout.row.right),
            ).toBeLessThan(1);
            expect(
              Math.max(...layout.cards.map((card) => card.width)) -
                Math.min(...layout.cards.map((card) => card.width)),
            ).toBeLessThan(1);
          }
          await expectChartInk(page);
          await page.screenshot({
            path: testInfo.outputPath(
              `${theme}-${width}-populated-analysis.png`,
            ),
            fullPage: true,
          });
        }
        await expectLayoutFits(page);
        if (mobile) {
          await expectTouchTargets(page);
          if (name === "目标编辑")
            await expectLastItemAboveNavigation(
              page,
              page.locator(".target-content > small").last(),
            );
          if (name === "概率分析")
            await expectLastItemAboveNavigation(
              page,
              page.locator(".advice p").last(),
            );
        }
      }
      if (mobile) {
        await page
          .getByRole("button", { name: "更多页面", exact: true })
          .click();
        await expect(
          page.getByRole("navigation", { name: "更多页面" }),
        ).toBeVisible();
        await expectTouchTargets(page);
        await page.keyboard.press("Escape");
      }
    }
  });
}

test("多点分析的计算中状态、主题绘制、缩放、PNG下载与打印", async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  const mobile = testInfo.project.name === "mobile";
  const initialWidth = mobile ? 390 : 1280;
  const resizedWidth = mobile ? 320 : 1440;
  await page.setViewportSize({ width: initialWidth, height: 900 });
  await openPopulatedPlanner(page, testInfo);

  // Hold the actual Worker resource to make the loading state deterministic;
  // release it before asserting any computed result.
  let releaseWorker = () => {};
  const workerGate = new Promise<void>((resolve) => {
    releaseWorker = resolve;
  });
  await page.route("**/src/worker/analysis.worker.ts*", async (route) => {
    await workerGate;
    await route.continue();
  });
  try {
    await navigate(page, "目标编辑");
    await page.getByRole("spinbutton", { name: "最多投入抽数" }).fill("9");
    await navigate(page, "概率分析");
    await expect(
      page.getByRole("status").filter({ hasText: "正在计算计划，请稍候…" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "图片", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "PDF", exact: true }),
    ).toBeDisabled();
    await expectLayoutFits(page);
  } finally {
    releaseWorker();
  }
  await expect(page.getByText("整套计划完成概率", { exact: true })).toBeVisible(
    { timeout: 60000 },
  );
  const chart = page.getByRole("img", {
    name: "规划实际消耗抽数的累计概率曲线",
  });
  expect(Number(await chart.getAttribute("data-point-count"))).toBeGreaterThan(
    1,
  );
  for (const theme of ["dark", "light"] as const) {
    if ((await page.locator("html").getAttribute("data-theme")) !== theme)
      await page.getByRole("button", { name: "切换深浅模式" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expectChartInk(page);
    const before = await chart.evaluate((element) => element.clientWidth);
    const nextWidth =
      page.viewportSize()!.width === initialWidth ? resizedWidth : initialWidth;
    await page.setViewportSize({ width: nextWidth, height: 900 });
    await expect
      .poll(() => chart.evaluate((element) => element.clientWidth))
      .not.toBe(before);
    await expect
      .poll(() =>
        chart
          .locator("canvas")
          .first()
          .evaluate((canvas) =>
            Math.abs(
              canvas.getBoundingClientRect().width -
                canvas.closest(".chart")!.getBoundingClientRect().width,
            ),
          ),
      )
      .toBeLessThan(1);
    await expectChartInk(page);
    await expectLayoutFits(page);
    const explanation = page.getByText("消耗分位", { exact: true });
    const textBox = await explanation.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        width: box.width,
        height: box.height,
        fontSize: parseFloat(style.fontSize),
        lineHeight: parseFloat(style.lineHeight),
      };
    });
    expect(textBox.width, "说明中的加粗词应保持横向可读").toBeGreaterThan(
      textBox.fontSize * 2,
    );
    expect(textBox.height, "说明中的加粗词不应挤成竖排").toBeLessThanOrEqual(
      textBox.lineHeight * 2 + 1,
    );
  }

  const imageEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "图片", exact: true }).click();
  const image = await imageEvent;
  expect(image.suggestedFilename()).toBe("抽卡规划结果.png");
  await image.saveAs(testInfo.outputPath("populated-analysis-export.png"));
  const png = await downloadBytes(image);
  expect(Array.from(png.subarray(0, 8))).toEqual([
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);
  const dimensions = new DataView(png.buffer, png.byteOffset, png.byteLength);
  expect(dimensions.getUint32(16)).toBeGreaterThan(300);
  expect(dimensions.getUint32(20)).toBeGreaterThan(300);

  let printRequests = 0;
  await page.exposeFunction("recordPrintRequest", () => {
    printRequests++;
  });
  await page.evaluate(() => {
    const recordPrintRequest = Reflect.get(
      window,
      "recordPrintRequest",
    ) as () => Promise<void>;
    window.print = () => {
      void recordPrintRequest();
    };
  });
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await expect.poll(() => printRequests).toBe(1);
  try {
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".sidebar")).toBeHidden();
    await expect(page.locator(".topbar")).toBeHidden();
    await expect(page.locator(".mobile-navigation")).toBeHidden();
    await expect(
      page.getByText("整套计划完成概率", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(`角色 · ${longTargetName}`, { exact: true }),
    ).toBeVisible();
    await expect(chart).toBeVisible();
    await expectLayoutFits(page);
    await page.screenshot({
      path: testInfo.outputPath("populated-analysis-print.png"),
      fullPage: true,
    });
  } finally {
    await page.emulateMedia({ media: "screen" });
  }
});
