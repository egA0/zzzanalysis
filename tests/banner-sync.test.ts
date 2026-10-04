import { describe, expect, it } from "vitest";
import { initialData } from "../src/domain/data";
import {
  applyBannerChanges,
  checkBannerUpdates,
  diffBannerUpdates,
  parseBannerHistoryBanners,
  parseBwikiGachaTimerBanners,
  parseBwikiBannerHistoryBanners,
  parseZzzBuildBanners,
  rollbackBannerBatch,
} from "../src/data/banner-sync";
import {
  bundledBanners,
  normalizeBannerKinds,
} from "../src/data/banner-history";

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

  it("按角色/音擎的完整历史判断首次 UP 与复刻，而不是按期内顺序", () => {
    const make = (
      channel: "agent" | "engine",
      featured: string,
      version: string,
      phase: number,
      start: string,
    ) => ({
      id: `${channel}-${version}-${phase}-${featured}`,
      recordKey: `${version}-${phase}:${channel}:${featured}`,
      name: featured,
      featured,
      channel,
      version,
      phase,
      kind: "debut" as const,
      start,
      end: start,
      official: false,
      source: "",
      sourceId: "test",
      sourceKind: "third-party" as const,
      updatedAt: start,
    });
    const normalized = normalizeBannerKinds([
      make("agent", "老角色", "2.2", 2, "2026-02-20"),
      make("agent", "老角色", "1.0", 1, "2025-01-01"),
      make("engine", "老音擎", "2.2", 2, "2026-02-20"),
      make("engine", "老音擎", "1.0", 1, "2025-01-01"),
    ]);
    expect(
      normalized.find(
        (item) => item.version === "1.0" && item.channel === "agent",
      )?.kind,
    ).toBe("debut");
    expect(
      normalized.find(
        (item) => item.version === "2.2" && item.channel === "agent",
      )?.kind,
    ).toBe("rerun");
    expect(
      normalized.find(
        (item) => item.version === "1.0" && item.channel === "engine",
      )?.kind,
    ).toBe("debut");
    expect(
      normalized.find(
        (item) => item.version === "2.2" && item.channel === "engine",
      )?.kind,
    ).toBe("rerun");
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

  it("解析 BWiki 卡池计时器角色/音擎历史条目", () => {
    const cards = Array.from(
      { length: 14 },
      (_, i) =>
        `<div class="Gacha"><div class="Gacha-img"><a title="角色${i}"></a></div><div class="Gacha-text"><div>UP次数：1次</div><div>UP版本：${Math.floor(i / 2) + 1}.0${i % 2 ? "下半" : "上半"}</div><div>UP时间：2025/01/${String(i + 1).padStart(2, "0")}</div></div></div>`,
    ).join("");
    const parsed = parseBwikiGachaTimerBanners(
      `<h2>S级代理人</h2>${cards}`,
      "2026-09-24",
    );
    expect(parsed).toHaveLength(14);
    expect(parsed[0]).toMatchObject({
      featured: "角色0",
      version: "1.0",
      phase: 1,
      channel: "agent",
      rarity: "S",
      sourceId: "bwiki-gacha-timer",
    });
  });

  it("为省略上下半标记的版本按日期顺序补齐期数", () => {
    const cards = [
      ["2.5", "2025/12/30", "安比"],
      ["2.5下半", "2026/01/21", "耀嘉音"],
      ["2.5下半", "2026/01/21", "零号·安比"],
    ]
      .concat(
        Array.from(
          { length: 10 },
          (_, index) =>
            [
              `${3 + index}.0上半`,
              `2026/02/${String(index + 1).padStart(2, "0")}`,
              `角色${index}`,
            ] as const,
        ),
      )
      .map(
        ([version, date, name]) =>
          `<div class="Gacha"><div class="Gacha-img"><a title="${name}"></a></div><div class="Gacha-text"><div>UP版本：${version}</div><div>UP时间：${date}</div></div></div>`,
      )
      .join("");
    const parsed = parseBwikiGachaTimerBanners(
      `<h2>S级代理人</h2>${cards}`,
      "2026-09-25",
    );
    expect(parsed.find((item) => item.featured === "安比")).toMatchObject({
      version: "2.5",
      phase: 1,
    });
    expect(parsed.find((item) => item.featured === "耀嘉音")).toMatchObject({
      version: "2.5",
      phase: 2,
    });
    expect(parsed.some((item) => item.phase === 0)).toBe(false);
  });

  it("将单日期无上下半标记的卡池独立为全版本", () => {
    const cards = [
      ["2.5", "2026/01/01", "全版本角色"],
      ["3.0上半", "2026/02/01", "上半角色"],
      ["3.0下半", "2026/02/22", "下半角色"],
    ]
      .concat(
        Array.from(
          { length: 10 },
          (_, index) =>
            [
              `${4 + index}.0上半`,
              `2026/03/${String(index + 1).padStart(2, "0")}`,
              `角色${index}`,
            ] as const,
        ),
      )
      .map(
        ([version, date, name]) =>
          `<div class="Gacha"><div class="Gacha-img"><a title="${name}"></a></div><div class="Gacha-bar rarity-S级"></div><div class="Gacha-text"><div>UP版本：${version}</div><div>UP时间：${date}</div></div></div>`,
      )
      .join("");
    const parsed = parseBwikiGachaTimerBanners(
      `<h2>S级代理人</h2>${cards}`,
      "2026-09-25",
    );
    expect(parsed.find((item) => item.featured === "全版本角色")).toMatchObject(
      { period: "version", phase: 1 },
    );
    expect(parsed.find((item) => item.featured === "上半角色")).toMatchObject({
      period: "phase",
      phase: 1,
    });
    expect(parsed.find((item) => item.featured === "下半角色")).toMatchObject({
      period: "phase",
      phase: 2,
    });
  });

  it("混合全版本与上下半时仍保持独立分组和版本边界", () => {
    const cards = [
      ["3.2", "2026/09/09", "全版本角色"],
      ["3.2上半", "2026/09/09", "上半角色"],
      ["3.2下半", "2026/09/30", "下半角色"],
      ["3.3上半", "2026/10/21", "下一版本角色"],
    ]
      .concat(
        Array.from(
          { length: 9 },
          (_, index) =>
            [
              `${4 + index}.0上半`,
              `2027/01/${String(index + 1).padStart(2, "0")}`,
              `角色${index}`,
            ] as const,
        ),
      )
      .map(
        ([version, date, name]) =>
          `<div class="Gacha"><div class="Gacha-img"><a title="${name}"></a></div><div class="Gacha-bar rarity-S级"></div><div class="Gacha-text"><div>UP版本：${version}</div><div>UP时间：${date}</div></div></div>`,
      )
      .join("");
    const parsed = parseBwikiGachaTimerBanners(
      `<h2>S级代理人</h2>${cards}`,
      "2026-09-25",
    );
    expect(parsed.find((item) => item.featured === "全版本角色")).toMatchObject(
      { period: "version", phase: 1, end: "2026-10-20" },
    );
    expect(parsed.find((item) => item.featured === "上半角色")).toMatchObject({
      period: "phase",
      phase: 1,
      end: "2026-09-29",
    });
    expect(parsed.find((item) => item.featured === "下半角色")).toMatchObject({
      period: "phase",
      phase: 2,
      end: "2026-10-20",
    });
  });

  it("按卡片自身 rarity 区分 A 级，并拒绝图片文件名作为名称", () => {
    const cards = Array.from(
      { length: 13 },
      (_, i) =>
        `<div class="Gacha"><div class="Gacha-img"><a title="${i === 0 ? "安比" : `角色${i}`}"><img alt="角色头像-${i === 0 ? "安比" : `角色${i}`}.png"></a></div><div class="Gacha-info"><div class="Gacha-bar rarity-${i === 0 ? "A" : "S"}级"></div><div class="Gacha-text"><div><a title="${i === 0 ? "安比" : `角色${i}`}">${i === 0 ? "安比" : `角色${i}`}</a></div><div>UP版本：2.5</div><div>UP时间：2026/01/${String(i + 1).padStart(2, "0")}</div></div></div></div>`,
    ).join("");
    const parsed = parseBwikiGachaTimerBanners(
      `<h2>S级代理人</h2>${cards}`,
      "2026-09-24",
    );
    expect(parsed.some((item) => item.featured === "安比")).toBe(false);
    expect(parsed.every((item) => item.rarity === "S")).toBe(true);
    expect(
      parsed.some((item) => /\.(png|jpe?g|webp)$/i.test(item.featured)),
    ).toBe(false);
  });

  it("联网检查失败时保留缓存并返回错误", async () => {
    const data = initialData();
    data.bannerSync.cachedBanners = [data.banners[0]!];
    const result = await checkBannerUpdates(data, async () => {
      throw new Error("offline");
    });
    expect(result.usedCache).toBe(true);
    expect(result.error).toBe("offline");
    expect(result.fetched).toBe(0);
  });
});

it("保留 2.4/2.5 官方历史中的首发角色与专属音擎", () => {
  expect(bundledBanners).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        version: "2.4",
        phase: 1,
        featured: "琉音",
        channel: "agent",
      }),
      expect.objectContaining({
        version: "2.4",
        phase: 1,
        featured: "空羽复归之诗",
        channel: "engine",
      }),
      expect.objectContaining({
        version: "2.5",
        phase: 1,
        period: "version",
        featured: "叶瞬光",
        channel: "agent",
      }),
      expect.objectContaining({
        version: "2.5",
        phase: 1,
        period: "version",
        featured: "云霓孤光",
        channel: "engine",
      }),
    ]),
  );
});
