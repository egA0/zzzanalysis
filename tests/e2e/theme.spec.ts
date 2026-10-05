import { expect, test, type Page } from "@playwright/test";
import { navigate, openPlanner, dismissStartupGuide } from "./helpers";

test.beforeEach(async ({ page }) => {
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
      if (name === "总览")
        await page.screenshot({
          path: testInfo.outputPath(`${theme}-overview.png`),
          fullPage: true,
        });
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
    await expect(page.locator(".rerun-row")).toHaveCount(42);
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
  await navigate(page, "目标编辑");
  await page.getByRole("button", { name: "角色", exact: true }).click();
  await page.getByRole("textbox", { name: "目标名称" }).fill("主题图表测试");
  await navigate(page, "概率分析");
  await expect(page.getByText("整套计划完成概率")).toBeVisible({
    timeout: 60000,
  });
  for (const [index, theme] of ["dark", "light", "dark"].entries()) {
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect
      .poll(async () =>
        page.locator(".chart canvas").evaluateAll((canvases) => {
          const hex = getComputedStyle(document.documentElement)
            .getPropertyValue("--chart-line")
            .trim();
          const target = [1, 3, 5].map((start) =>
            parseInt(hex.slice(start, start + 2), 16),
          );
          let matches = 0;
          for (const canvas of canvases) {
            const element = canvas as HTMLCanvasElement;
            const pixels = element
              .getContext("2d")!
              .getImageData(0, 0, element.width, element.height).data;
            for (let index = 0; index < pixels.length; index += 4)
              if (
                pixels[index] === target[0] &&
                pixels[index + 1] === target[1] &&
                pixels[index + 2] === target[2] &&
                pixels[index + 3]! > 200
              )
                matches++;
          }
          return matches;
        }),
      )
      .toBeGreaterThan(5);
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
