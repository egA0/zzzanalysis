import { expect, it } from "vitest";
import { initialData } from "../src/domain/data";
import {
  currentVersion,
  futureVersionDefaultPulls,
  futureVersionProjections,
  versionResourceView,
} from "../src/data/version-resources";

it("版本资源按活动页面、每日活跃和月卡计算", () => {
  const data = initialData();
  const activity = data.versionResources.find(
    (item) => item.id === "manual-3.2-activity",
  )!;
  activity.pulls = 50;
  activity.film = 160;
  const view = versionResourceView(data, currentVersion);
  expect(view.activityPulls).toBe(51);
  expect(view.dailyActivityPulls).toBeCloseTo((60 * 42) / 160);
  expect(view.monthlyCardPulls).toBeCloseTo((90 * 42) / 160);
  expect(view.total).toBeCloseTo(51 + (60 * 42) / 160 + (90 * 42) / 160);
});

it("已获得资源同时累计菲林和抽数", () => {
  const data = initialData();
  data.versionResources.find(
    (item) => item.id === "manual-3.2-activity",
  )!.pulls = 50;
  data.resourceProgress[currentVersion] = {
    version: currentVersion,
    film: 320,
    encrypted: 0,
    acquiredPulls: 3,
    acquisitionPercent: 0,
    observedAt: "2026-09-24",
  };
  expect(versionResourceView(data, currentVersion).acquired).toBe(5);
});

it("未来版本资源固定为每版本 90 抽", () => {
  const data = initialData();
  expect(
    futureVersionProjections(data, 6).every(
      (item) => item.projectedPulls === futureVersionDefaultPulls,
    ),
  ).toBe(true);
});
