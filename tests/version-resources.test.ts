import { expect, it } from "vitest";
import { initialData } from "../src/domain/data";
import {
  currentVersion,
  defaultActivityPulls,
  defaultMonthlyFilm,
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
  data.versionResources.find((item) => item.id === "manual-3.2-monthly")!.film =
    90;
  data.settings.monthlyCardOwned = true;
  const view = versionResourceView(data, currentVersion, "2026-09-09");
  expect(view.activityPulls).toBe(51);
  expect(view.remainingDays).toBe(42);
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
  expect(versionResourceView(data, currentVersion, "2026-09-09").acquired).toBe(
    5,
  );
});

it("日活和月卡按版本实时剩余天数计算，活动默认资源保持固定", () => {
  const data = initialData();
  const activity = data.versionResources.find(
    (item) => item.id === "manual-3.2-activity",
  )!;
  const daily = data.versionResources.find(
    (item) => item.id === "manual-3.2-daily-active",
  )!;
  daily.film = 9999;
  daily.film = 999;
  expect(activity.pulls).toBe(defaultActivityPulls);
  expect(daily.film).toBe(999);
  expect(
    data.versionResources.find((item) => item.id === "manual-3.2-monthly")!
      .film,
  ).toBe(defaultMonthlyFilm);
  const atStart = versionResourceView(data, currentVersion, "2026-09-09");
  const later = versionResourceView(data, currentVersion, "2026-09-20");
  expect(atStart.dailyActivityPulls).toBeCloseTo((60 * 42) / 160);
  expect(atStart.total).toBeCloseTo(defaultActivityPulls + (60 * 42) / 160);
  data.settings.monthlyCardOwned = true;
  const atStartWithMonthly = versionResourceView(
    data,
    currentVersion,
    "2026-09-09",
  );
  expect(atStartWithMonthly.total).toBeCloseTo(90);
  expect(later.remainingDays).toBe(31);
  expect(later.dailyActivityPulls).toBeCloseTo((60 * 31) / 160);
  expect(later.activityPulls).toBe(defaultActivityPulls);
  expect(later.total).toBeCloseTo(defaultActivityPulls + (60 * 42) / 160);
  expect(later.available).toBeCloseTo(defaultActivityPulls + (60 * 31) / 160);
});

it("未来版本资源固定为每版本 90 抽", () => {
  const data = initialData();
  expect(
    futureVersionProjections(data, 6).every(
      (item) => item.projectedPulls === futureVersionDefaultPulls,
    ),
  ).toBe(true);
});
