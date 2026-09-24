import { describe, expect, it } from "vitest";
import { initialData } from "../src/domain/data";
import {
  applyBannerChanges,
  checkBannerUpdates,
  diffBannerUpdates,
  parseBannerHistoryBanners,
  parseBwikiBannerHistoryBanners,
  parseZzzBuildBanners,
  rollbackBannerBatch,
} from "../src/data/banner-sync";
import { bundledBanners } from "../src/data/banner-history";

const pageFixture = () => {
  const events = Array.from({ length: 35 }, (_, index) => {
    const version = `${index + 4}.0`;
    return {
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Event",
        name: `Agent ${index} Signal Search banner — Zenless Zone Zero Version ${version} Phase 1`,
        startDate: `2027-01-${String((index % 20) + 1).padStart(2, "0")}T04:00:00Z`,
        endDate: `2027-02-${String((index % 20) + 1).padStart(2, "0")}T04:00:00Z`,
      },
    };
  });
  const cards = Array.from({ length: 35 }, (_, index) => {
    const version = `${index + 4}.0`;
    return `<a class="group relative block card" href="/agents/agent-${index}">
      <img alt="Agent ${index} — Zenless Zone Zero ${version} Phase 1 Signal Search banner">
      <h3>Agent ${index}</h3>
      <p class="text-[10px] font-medium">+ <!-- -->Rerun ${index}</p>
      <p class="mt-2.5 leading">Featured W-Engines: Engine ${index}, Old Engine ${index}. Ran.</p>
    </a>`;
  }).join("");
  return `<html><head><script type="application/ld+json">${JSON.stringify({
    "@graph": [
      {
        "@type": "ItemList",
        name: "Zenless Zone Zero Signal Search banner schedule",
        itemListElement: events,
      },
    ],
  })}</script></head><body>${cards}</body></html>`;
};

const chinesePageFixture = () =>
  Array.from({ length: 35 }, (_, index) => {
    const version = `${index + 4}.0`;
    const day = String((index % 20) + 1).padStart(2, "0");
    return `<article data-pickup-id="ZZZ_${version}_P1">
      <img src="/a.webp" alt="测试角色甲${index}">
      <img src="/b.webp" alt="测试角色乙${index}">
      <dl>
        <div><dt>开始</dt><dd><span>2027-${day}</span><span>-01</span></dd></div>
        <div><dt>结束</dt><dd><span>2027-${day}</span><span>-20</span></dd></div>
      </dl>
    </article>`;
  }).join("");

const serializedChinesePageFixture = () =>
  Array.from({ length: 35 }, (_, index) => {
    const version = `${index + 4}.0`;
    const day = String((index % 20) + 1).padStart(2, "0");
    return `\\"id\\":\\"ZZZ_${version}_P1\\",\\"start\\":\\"2027-01-${day}\\",\\"end\\":\\"2027-02-${day}\\",\\"characters\\":[{\\"zhName\\":\\"内嵌角色甲${index}\\"},{\\"zhName\\":\\"内嵌角色乙${index}\\"}],\\"art\\"`;
  }).join(",");

it("BWIKI 现行嵌套表格可同时解析代理人与音擎", () => {
  const tables = Array.from({ length: 12 }, (_, index) => {
    const version = `${Math.floor(index / 2) + 1}.0`;
    const phase = index % 2 ? "下半" : "上半";
    const suffix = index % 2 ? 2 : 1;
    return `<table class="wikitable" style="text-align:center;">
      <tr><th><img alt="测试${index}-${suffix}期独家频段"></th></tr>
      <tr><th>时间</th><td>2026/01/01 12:00:00 ~ 2026/01/21 14:59:59</td></tr>
      <tr><th>版本</th><td>${version}${phase}</td></tr>
      <tr><th>S级代理人</th><td><a title="角色甲${index}">角色甲${index}（强攻·冰）</a></td></tr>
    </table>
    <table class="wikitable" style="text-align:center;">
      <tr><th><img alt="测试音擎-${suffix}期音擎频段"></th></tr>
      <tr><th>时间</th><td>2026/01/01 12:00:00 ~ 2026/01/21 14:59:59</td></tr>
      <tr><th>版本</th><td>${version}${phase}</td></tr>
      <tr><th>S级音擎</th><td><a title="音擎甲${index}">音擎甲${index}（强攻）</a></td></tr>
    </table>`;
  }).join("");
  const parsed = parseBwikiBannerHistoryBanners(tables, "2026-09-18");
  expect(parsed.filter((item) => item.channel === "agent")).toHaveLength(12);
  expect(parsed.filter((item) => item.channel === "engine")).toHaveLength(12);
  expect(parsed.find((item) => item.channel === "engine")?.featured).toBe(
    "音擎甲0",
  );
});

describe("卡池联网更新", () => {
  it("优先解析简中卡池页，并保证内置角色与音擎名称均为中文", () => {
    const parsed = parseBannerHistoryBanners(
      chinesePageFixture(),
      "2026-09-16",
    );
    expect(parsed).toHaveLength(70);
    expect(parsed[0]).toMatchObject({
      featured: "测试角色甲0",
      channel: "agent",
      version: "4.0",
      start: "2027-01-01",
      end: "2027-01-20",
    });
    const serialized = parseBannerHistoryBanners(
      serializedChinesePageFixture(),
      "2026-09-16",
    );
    expect(serialized).toHaveLength(70);
    expect(serialized[0]?.featured).toBe("内嵌角色甲0");
    expect(
      bundledBanners.filter((banner) => /[A-Za-z]{2,}/.test(banner.featured)),
    ).toEqual([]);
  });

  it("解析版本、复刻、音擎和日期，并拒绝残缺来源", () => {
    const parsed = parseZzzBuildBanners(pageFixture(), "2026-09-16");
    expect(parsed).toHaveLength(140);
    expect(parsed[0]).toMatchObject({
      version: "4.0",
      phase: 1,
      featured: "Agent 0",
      start: "2027-01-01",
      end: "2027-02-01",
    });
    expect(parsed.some((banner) => banner.featured === "Rerun 0")).toBe(true);
    expect(parsed.some((banner) => banner.featured === "Old Engine 0")).toBe(
      true,
    );
    expect(() => parseZzzBuildBanners("<html></html>", "2026-09-16")).toThrow(
      /来源结构可能已失效/,
    );
  });

  it("官方记录优先，手工差异可写入并整批回滚", () => {
    const data = initialData();
    const official = data.banners.find((banner) => banner.official)!;
    const incoming = {
      ...official,
      end: "2099-01-01",
      sourceId: "manual:test",
      sourceKind: "manual" as const,
      official: false,
    };
    data.bannerSync.pendingChanges = diffBannerUpdates(data.banners, [
      incoming,
    ]);
    expect(data.bannerSync.pendingChanges).toHaveLength(1);
    const batch = applyBannerChanges(data, "手工官方记录");
    expect(batch).not.toBeNull();
    expect(
      data.banners.find((banner) => banner.recordKey === incoming.recordKey)
        ?.end,
    ).toBe("2099-01-01");
    expect(rollbackBannerBatch(data, batch!.id)).toBe(1);
    expect(
      data.banners.find((banner) => banner.recordKey === incoming.recordKey)
        ?.end,
    ).toBe(official.end);
    expect(
      diffBannerUpdates(data.banners, [
        { ...official, end: "2099-01-01", sourceKind: "third-party" },
      ]),
    ).toHaveLength(0);
  });

  it("兼容检查函数不发起联网请求", async () => {
    const data = initialData();
    data.bannerSync.cachedBanners = [data.banners[0]!];
    const result = await checkBannerUpdates(data, async () => {
      throw new Error("offline");
    });
    expect(result.usedCache).toBe(false);
    expect(result.error).toBe("");
    expect(result.fetched).toBe(0);
    expect(data.bannerSync.pendingChanges).toHaveLength(0);
  });
});
