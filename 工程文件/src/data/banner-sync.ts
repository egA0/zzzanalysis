import { id } from "../domain/data";
import type {
  AppData,
  Banner,
  BannerChange,
  BannerUpdateBatch,
} from "../domain/types";
import {
  bannerRecordKey,
  bannerHistoryChineseUrl,
  bundledBannersForSource,
  bwikiBannerHistoryUrl,
  localizeBannerName,
  onlineBannerSourceId,
} from "./banner-history";

export const onlineBannerSourceUrl = bannerHistoryChineseUrl;
export const fallbackBannerSourceUrl = "https://www.zzz-build.com/banners";
export const bannerSyncTimeoutMs = 15_000;
const localToday = () => new Date().toLocaleDateString("en-CA");
const currentAndFuture = (banners: Banner[]) =>
  banners.filter((banner) => banner.end >= localToday());

const decodeHtml = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");

const plainText = (value: string) =>
  decodeHtml(value.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();

const listNames = (value: string) =>
  value
    .split(/\s*(?:,|·|\+)\s*/)
    .map((name) => name.trim())
    .filter(Boolean);

type EventDate = { start: string; end: string };
const parseEventDates = (html: string) => {
  const dates = new Map<string, EventDate>();
  const scripts = html.matchAll(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
  );
  for (const match of scripts) {
    try {
      const value = JSON.parse(match[1]!);
      const graph = Array.isArray(value?.["@graph"]) ? value["@graph"] : [];
      const list = graph.find(
        (item: Record<string, unknown>) =>
          item?.["@type"] === "ItemList" &&
          String(item.name ?? "").includes("banner schedule"),
      );
      const entries = Array.isArray(list?.itemListElement)
        ? list.itemListElement
        : [];
      for (const entry of entries) {
        const event = entry?.item;
        const version = String(event?.name ?? "").match(
          /Version\s+([0-9.]+)\s+Phase\s+([12])/,
        );
        const start = String(event?.startDate ?? "").slice(0, 10);
        const end = String(event?.endDate ?? "").slice(0, 10);
        if (
          version &&
          /^\d{4}-\d{2}-\d{2}$/.test(start) &&
          /^\d{4}-\d{2}-\d{2}$/.test(end)
        )
          dates.set(`${version[1]}-${version[2]}`, { start, end });
      }
    } catch {
      // Other JSON-LD blocks on the page are unrelated to the banner schedule.
    }
  }
  return dates;
};

export const parseZzzBuildBanners = (
  html: string,
  checkedAt: string,
): Banner[] => {
  const dates = parseEventDates(html);
  const cards = html.matchAll(
    /<a class="group relative block[^>]*href="\/agents\/[^"]+">([\s\S]*?)<\/a>/g,
  );
  const banners: Banner[] = [];
  for (const card of cards) {
    const block = card[1]!;
    const alt = decodeHtml(
      block.match(/<img alt="([^"]*Signal Search banner[^"]*)"/)?.[1] ?? "",
    );
    const version = alt.match(/Zenless Zone Zero ([0-9.]+) Phase ([12])/);
    if (!version) continue;
    const versionNumber = version[1]!;
    const phase = Number(version[2]);
    const date = dates.get(`${versionNumber}-${phase}`);
    if (!date) continue;
    const primary = plainText(
      block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? "",
    );
    if (!primary) continue;
    const plus = plainText(
      block.match(/<p class="text-\[10px\][^>]*>\+\s*([\s\S]*?)<\/p>/)?.[1] ??
        "",
    );
    const description = plainText(
      block.match(/<p class="mt-2\.5[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "",
    );
    const engineText =
      description.match(/Featured W-Engines:\s*([^.]+)\./)?.[1] ?? "";
    const agents = [primary, ...listNames(plus)];
    const engines = listNames(engineText);
    const add = (
      rawName: string,
      channel: Banner["channel"],
      index: number,
    ) => {
      const featured = localizeBannerName(rawName);
      const kind = index === 0 ? "debut" : "rerun";
      banners.push({
        id: `online:${versionNumber}-${phase}:${channel}:${index}`,
        recordKey: bannerRecordKey(versionNumber, phase, channel, featured),
        name: featured,
        featured,
        channel,
        version: versionNumber,
        phase,
        kind,
        start: date.start,
        end: date.end,
        official: false,
        source: onlineBannerSourceUrl,
        sourceId: onlineBannerSourceId,
        sourceKind: "third-party",
        updatedAt: checkedAt,
      });
    };
    agents.forEach((name, index) => add(name, "agent", index));
    engines.forEach((name, index) => add(name, "engine", index));
  }
  const unique = new Map(banners.map((banner) => [banner.recordKey, banner]));
  const result = [...unique.values()];
  const phaseCount = new Set(
    result.map((banner) => `${banner.version}-${banner.phase}`),
  ).size;
  if (phaseCount < 12 || result.length < 30)
    throw new Error(
      `来源结构可能已失效：仅解析到 ${phaseCount} 个卡池阶段、${result.length} 条记录`,
    );
  return result;
};

const phaseDate = (block: string, label: "开始" | "结束") => {
  const segment =
    block.match(
      new RegExp(`<dt[^>]*>${label}<\\/dt>([\\s\\S]*?)<\\/div>`),
    )?.[1] ?? "";
  return plainText(segment).match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
};

export const parseBannerHistoryBanners = (
  html: string,
  checkedAt: string,
): Banner[] => {
  const banners: Banner[] = [];
  const addPhase = (
    version: string,
    phase: number,
    start: string,
    end: string,
    names: string[],
    prefix: string,
  ) => {
    names.forEach((featured, index) => {
      const kind = index === 0 ? "debut" : "rerun";
      banners.push({
        id: `${prefix}:${version}-${phase}:agent:${index}`,
        recordKey: bannerRecordKey(version, phase, "agent", featured),
        name: featured,
        featured,
        channel: "agent",
        version,
        phase,
        kind,
        start,
        end,
        official: false,
        source: bannerHistoryChineseUrl,
        sourceId: onlineBannerSourceId,
        sourceKind: "third-party",
        updatedAt: checkedAt,
      });
    });
  };
  const serialized = html.matchAll(
    /\\"id\\":\\"ZZZ_([0-9.]+)_P([123])\\"[\s\S]*?\\"start\\":\\"(\d{4}-\d{2}-\d{2})\\"[\s\S]*?\\"end\\":\\"(\d{4}-\d{2}-\d{2})\\"[\s\S]*?\\"characters\\":\[(.*?)\],\\"art\\"/g,
  );
  for (const pickup of serialized) {
    const names = [
      ...new Set(
        [...pickup[5]!.matchAll(/\\"zhName\\":\\"([^\\"]+)\\"/g)].map(
          (match) => match[1]!,
        ),
      ),
    ];
    addPhase(
      pickup[1]!,
      Number(pickup[2]),
      pickup[3]!,
      pickup[4]!,
      names,
      "bannerhistory-cn-data",
    );
  }
  const articles = html.matchAll(
    /<article data-pickup-id="ZZZ_([0-9.]+)_P([123])"[^>]*>([\s\S]*?)<\/article>/g,
  );
  for (const article of articles) {
    const version = article[1]!;
    const phase = Number(article[2]);
    const block = article[3]!;
    const start = phaseDate(block, "开始");
    const end = phaseDate(block, "结束");
    if (!start || !end) continue;
    const names = [
      ...new Set(
        [...block.matchAll(/<img[^>]*alt="([^"]+)"[^>]*>/g)]
          .map((match) => plainText(match[1]!))
          .filter(
            (name) =>
              name && name !== "Banner art" && !/Zenless Zone Zero/i.test(name),
          ),
      ),
    ];
    addPhase(version, phase, start, end, names, "bannerhistory-cn");
  }
  const unique = new Map(banners.map((banner) => [banner.recordKey, banner]));
  const result = [...unique.values()];
  const phaseCount = new Set(
    result.map((banner) => `${banner.version}-${banner.phase}`),
  ).size;
  // BannerHistory currently retains the complete history on its own page,
  // but may intentionally omit very old rows on a compact deployment. Do not
  // reject a valid 1.0+ recent feed merely because it has fewer than the old
  // hard-coded 35 phases. The bundled history remains responsible for rows
  // absent from the feed.
  if (phaseCount < 12 || result.length < 30)
    throw new Error(
      `中文来源结构可能已失效：仅解析到 ${phaseCount} 个卡池阶段、${result.length} 条角色记录`,
    );
  return result;
};

/**
 * BWIKI is used as a second, independent parser rather than as a blind
 * fallback. Its nested wikitable layout has been stable for much longer than
 * the old English mirror and, importantly, contains the S-rank W-Engine rows.
 */
export const parseBwikiBannerHistoryBanners = (
  html: string,
  checkedAt: string,
): Banner[] => {
  const banners: Banner[] = [];
  const tables = html.matchAll(
    /<table\b[^>]*style="[^"]*text-align:center[^"]*"[^>]*>([\s\S]*?)<\/table>/gi,
  );
  for (const match of tables) {
    const block = match[0]!;
    const text = plainText(block);
    const versionMatch = text.match(/版本\s*([0-9]+\.[0-9]+)\s*(上半|下半)?/);
    const range = text.match(
      /(\d{4})[-/](\d{1,2})[-/](\d{1,2})[\s\S]{0,80}?~[\s\S]{0,80}?(\d{4})[-/](\d{1,2})[-/](\d{1,2})/,
    );
    if (!versionMatch || !range) continue;
    const version = versionMatch[1]!;
    const special = /独家重映|音擎回响/.test(text);
    const channel: Banner["channel"] = /S级音擎|音擎频段|音擎回响/.test(text)
      ? "engine"
      : "agent";
    const phaseFromLabel = versionMatch[2]
      ? versionMatch[2] === "下半"
        ? 2
        : 1
      : Number(block.match(/-(1|2)期/)?.[1] ?? (special ? 2 : 1));
    const start = `${range[1]}-${range[2]!.padStart(2, "0")}-${range[3]!.padStart(2, "0")}`;
    const end = `${range[4]}-${range[5]!.padStart(2, "0")}-${range[6]!.padStart(2, "0")}`;
    const rowLabel = channel === "engine" ? "S级音擎" : "S级代理人";
    const row =
      block.match(
        new RegExp(
          String.raw`<th[^>]*>\s*${rowLabel}[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>`,
          "i",
        ),
      )?.[1] ?? "";
    const names = [
      ...new Set(
        [...row.matchAll(/<a\b[^>]*title="([^"]+)"[^>]*>/gi)]
          .map((item) => plainText(item[1]!))
          .map((name) =>
            name
              .replace(/（[^）]*）$/, "")
              .replace(/\s+/g, "")
              .trim(),
          )
          .filter(Boolean),
      ),
    ];
    if (!names.length) continue;
    names.forEach((featured, index) => {
      banners.push({
        id: `bwiki:${version}-${phaseFromLabel}:${channel}:${index}:${featured}`,
        recordKey: bannerRecordKey(version, phaseFromLabel, channel, featured),
        name: featured,
        featured,
        channel,
        version,
        phase: phaseFromLabel,
        kind: special ? "special" : index === 0 ? "debut" : "rerun",
        start,
        end,
        official: false,
        source: bwikiBannerHistoryUrl,
        sourceId: onlineBannerSourceId,
        sourceKind: "third-party",
        updatedAt: checkedAt,
      });
    });
  }
  const unique = new Map(banners.map((banner) => [banner.recordKey, banner]));
  const result = [...unique.values()];
  const phaseCount = new Set(
    result.map((banner) => `${banner.version}-${banner.phase}`),
  ).size;
  if (phaseCount < 12 || result.length < 20)
    throw new Error(
      `BWIKI 来源结构可能已失效：仅解析到 ${phaseCount} 个卡池阶段、${result.length} 条记录`,
    );
  return result;
};

const sameBanner = (a: Banner, b: Banner) =>
  ["name", "featured", "channel", "version", "phase", "start", "end"].every(
    (key) => a[key as keyof Banner] === b[key as keyof Banner],
  );

const sourcePriority = (banner: Banner) =>
  banner.sourceKind === "manual" ? 4 : banner.sourceKind === "official" ? 3 : 2;

export const diffBannerUpdates = (
  current: Banner[],
  incoming: Banner[],
): BannerChange[] => {
  const existing = new Map(current.map((banner) => [banner.recordKey, banner]));
  const changes: BannerChange[] = [];
  for (const next of incoming) {
    const before = existing.get(next.recordKey) ?? null;
    if (before && sourcePriority(before) > sourcePriority(next)) continue;
    if (!before || !sameBanner(before, next))
      changes.push({
        recordKey: next.recordKey,
        before: before ? structuredClone(before) : null,
        after: structuredClone(next),
      });
  }
  return changes;
};

export const applyBannerChanges = (
  data: AppData,
  sourceName: string,
): BannerUpdateBatch | null => {
  if (!data.bannerSync.pendingChanges.length) return null;
  const changes = structuredClone(data.bannerSync.pendingChanges);
  for (const change of changes) {
    data.banners = data.banners.filter(
      (banner) => banner.recordKey !== change.recordKey,
    );
    if (change.after) data.banners.push(structuredClone(change.after));
  }
  const batch: BannerUpdateBatch = {
    id: id(),
    sourceId: onlineBannerSourceId,
    sourceName,
    appliedAt: new Date().toISOString(),
    changes,
  };
  data.bannerSync.updateBatches.unshift(batch);
  data.bannerSync.updateBatches = data.bannerSync.updateBatches.slice(0, 20);
  data.bannerSync.pendingChanges = [];
  return batch;
};

export const rollbackBannerBatch = (data: AppData, batchId: string): number => {
  const batch = data.bannerSync.updateBatches.find(
    (item) => item.id === batchId,
  );
  if (!batch) return 0;
  let restored = 0;
  for (const change of [...batch.changes].reverse()) {
    const current = data.banners.find(
      (banner) => banner.recordKey === change.recordKey,
    );
    if (change.after && current && !sameBanner(current, change.after)) continue;
    data.banners = data.banners.filter(
      (banner) => banner.recordKey !== change.recordKey,
    );
    if (change.before) data.banners.push(structuredClone(change.before));
    restored++;
  }
  data.bannerSync.updateBatches = data.bannerSync.updateBatches.filter(
    (item) => item.id !== batchId,
  );
  return restored;
};

export const setBannerSourceEnabled = (
  data: AppData,
  sourceId: string,
  enabled: boolean,
) => {
  const disabled = new Set(data.bannerSync.disabledSourceIds);
  if (enabled) {
    disabled.delete(sourceId);
    const candidates =
      sourceId === onlineBannerSourceId
        ? currentAndFuture(data.bannerSync.cachedBanners)
        : bundledBannersForSource(sourceId);
    for (const candidate of candidates) {
      const existing = data.banners.find(
        (banner) => banner.recordKey === candidate.recordKey,
      );
      if (!existing || sourcePriority(existing) <= sourcePriority(candidate)) {
        data.banners = data.banners.filter(
          (banner) => banner.recordKey !== candidate.recordKey,
        );
        data.banners.push(structuredClone(candidate));
      }
    }
  } else {
    disabled.add(sourceId);
    data.banners = data.banners.filter(
      (banner) => banner.sourceId !== sourceId,
    );
    data.bannerSync.pendingChanges = data.bannerSync.pendingChanges.filter(
      (change) => change.after?.sourceId !== sourceId,
    );
  }
  data.bannerSync.disabledSourceIds = [...disabled];
};

export type BannerCheckResult = {
  changes: BannerChange[];
  usedCache: boolean;
  error: string;
  fetched: number;
};

export const checkBannerUpdates = async (
  data: AppData,
  fetcher?: typeof fetch,
): Promise<BannerCheckResult> => {
  void fetcher;
  // 卡池时间轴改为官方记录 + 手动维护；保留兼容导出但绝不发起网络请求。
  const checkedAt = new Date().toISOString();
  data.bannerSync.lastCheckedAt = checkedAt;
  data.bannerSync.lastSuccessAt = checkedAt;
  data.bannerSync.lastError = "";
  data.bannerSync.cacheUpdatedAt = "";
  data.bannerSync.usedCache = false;
  data.bannerSync.pendingChanges = [];
  return { changes: [], usedCache: false, error: "", fetched: 0 };
};
