import { expect, it } from "vitest";
import {
  availableAt,
  currentPulls,
  incomeUntil,
  initialData,
} from "../src/domain/data";

it("重叠卡池不重复计算收入，未来收入按截止日期累计", () => {
  const data = initialData();
  data.settings.includeEstimates = false;
  data.resources.encrypted = 1;
  data.banners.push({
    ...data.banners[0]!,
    id: "overlap",
    official: false,
    name: "非官方重叠",
  });
  data.incomes = [
    {
      id: "daily",
      name: "测试",
      source: "",
      category: "daily",
      amount: 160,
      unit: "film",
      start: "2026-09-17",
      end: "2026-09-19",
      everyDays: 1,
      certainty: "confirmed",
      enabled: true,
    },
  ];
  expect(
    data.banners.filter((x) => x.start === data.banners[0]!.start).length,
  ).toBeGreaterThan(1);
  expect(
    incomeUntil(data.incomes, "2026-09-17", data.rules, false).confirmed,
  ).toBe(1);
  expect(availableAt(data, "2026-09-19")).toBe(4);
  data.incomes[0]!.enabled = false;
  expect(availableAt(data, "2026-09-19")).toBe(1);
});
it("官方登录奖励有条件且可单独计入", () => {
  const data = initialData();
  const reward = data.incomes.find((x) => x.name.includes("七日登录奖励"))!;
  expect(reward.enabled).toBe(false);
  expect(incomeUntil([reward], "2026-09-20", data.rules, false).confirmed).toBe(
    0,
  );
  reward.enabled = true;
  expect(incomeUntil([reward], "2026-09-20", data.rules, false).confirmed).toBe(
    10,
  );
});

it("默认模拟次数采用更轻的设置并开启未来资源累计", () => {
  expect(initialData().settings.simulations).toBe(1000);
  expect(initialData().settings.includeEstimates).toBe(true);
});

it("副产物余额按兑换比例计入当前抽数", () => {
  const data = initialData();
  data.resources.signalAfterglow =
    data.rules.conversion.signalAfterglowPerTape * 2 + 1;
  data.resources.signalResidual =
    data.rules.conversion.signalResidualPerTape - 1;
  expect(currentPulls(data.resources, data.rules)).toBe(2);
});
