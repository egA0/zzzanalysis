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
  bwikiGachaTimerUrl,
  bundledBannersForSource,
  bwikiBannerHistoryUrl,
  localizeBannerName,
  normalizeBannerKinds,
  onlineBannerSourceId,
} from "./banner-history";

export const onlineBannerSourceUrl = bwikiGachaTimerUrl;
export const fallbackBannerSourceUrl = "https://www.zzz-build.com/banners";
export const bannerSyncTimeoutMs = 15_000;

const addDaysToDate = (date: string, days: number) => {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year!, month! - 1, day!));
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

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
  return normalizeBannerKinds(result);
};

const cleanBwikiName = (value: string) => {
  const name = plainText(value)
    .replace(/^文件:/i, "")
    .replace(/（页面不存在）$/i, "")
    .replace(/^(?:角色头像|音擎头像|武器立绘)[-_]?/i, "")
    .replace(/\.(?:png|jpe?g|webp|gif|svg)$/i, "")
    .trim();
  if (
    !name ||
    /(?:头像|图片|image|banner|\.(?:png|jpe?g|webp|gif|svg)$)/i.test(name)
  )
    return "";
  return name;
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
  // Accept sufficiently populated recent feeds even when older rows are omitted.
  // The bundled history supplies records that are absent from the feed.
  if (phaseCount < 12 || result.length < 30)
    throw new Error(
      `中文来源结构可能已失效：仅解析到 ${phaseCount} 个卡池阶段、${result.length} 条角色记录`,
    );
  return normalizeBannerKinds(result);
};

/**
 * Parse BWIKI nested tables as an independent source of localized banner data,
 * including S-rank W-Engine entries that may be absent from other feeds.
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
  return normalizeBannerKinds(result);
};

const sameBanner = (a: Banner, b: Banner) =>
  [
    "name",
    "featured",
    "rarity",
    "period",
    "channel",
    "version",
    "phase",
    "start",
    "end",
  ].every((key) => a[key as keyof Banner] === b[key as keyof Banner]);

const sourcePriority = (banner: Banner) =>
  banner.sourceKind === "manual"
    ? 4
    : banner.sourceId === onlineBannerSourceId
      ? 3.5
      : banner.sourceKind === "official"
        ? 3
        : 2;

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
        ? data.bannerSync.cachedBanners
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

export const parseBwikiGachaTimerBanners = (
  html: string,
  checkedAt: string,
): Banner[] => {
  const records: {
    name: string;
    version: string;
    phase: number | null;
    start: string;
    channel: Banner["channel"];
    rarity: "S" | "A";
  }[] = [];
  const cardStarts = [...html.matchAll(/<div class="Gacha(?:\s|")[^>]*>/gi)]
    .map((match) => match.index ?? -1)
    .filter((index) => index >= 0);
  const headings = [
    ...html.matchAll(
      /<h3[^>]*>[\s\S]*?<span[^>]*class="mw-headline"[^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/h3>/gi,
    ),
  ]
    .map((match) => ({
      index: match.index ?? -1,
      label: plainText(match[1] ?? ""),
    }))
    .filter((item) => item.index >= 0);

  for (let index = 0; index < cardStarts.length; index++) {
    const cardStart = cardStarts[index]!;
    const cardEnd = cardStarts[index + 1] ?? html.length;
    const block = html.slice(cardStart, cardEnd);
    const text = plainText(block);
    const phaseMatch = text.match(/UP版本：([0-9]+(?:\.[0-9]+)?)(上半|下半)?/);
    const dateMatch = text.match(
      /UP时间：([0-9]{4})[/-]([0-9]{1,2})[/-]([0-9]{1,2})/,
    );
    const rarityMatch = block.match(/rarity-([SA])级/i);
    const rarity =
      (rarityMatch?.[1]?.toUpperCase() as "S" | "A" | undefined) ?? "S";
    if (!phaseMatch || !dateMatch || rarity !== "S") continue;
    const nameCandidates = [
      block.match(
        /<div class="Gacha-text">[\s\S]*?<a[^>]*title="([^"]+)"/i,
      )?.[1],
      block.match(
        /<div class="Gacha-img">[\s\S]*?<a[^>]*title="([^"]+)"/i,
      )?.[1],
    ];
    const name =
      nameCandidates
        .map((candidate) => cleanBwikiName(candidate ?? ""))
        .find(Boolean) ?? "";
    if (!name) continue;
    const version = phaseMatch[1]!;
    const phase = phaseMatch[2] ? (phaseMatch[2] === "上半" ? 1 : 2) : null;
    const start = `${dateMatch[1]}-${dateMatch[2]!.padStart(2, "0")}-${dateMatch[3]!.padStart(2, "0")}`;
    const heading =
      headings.filter((item) => item.index < cardStart).at(-1)?.label ?? "";
    const channel: Banner["channel"] = /音擎/.test(heading)
      ? "engine"
      : "agent";
    records.push({ name, version, phase, start, channel, rarity });
  }

  // Some BWiki entries omit “上半/下半” (for example 2.5). Infer the phase
  // from the chronological order of unique start dates within that version,
  // while respecting any explicit phase labels already present on the page.
  const phaseByVersionAndStart = new Map<string, number>();
  for (const item of records.filter((record) => record.phase !== null)) {
    const key = `${item.version}:${item.start}`;
    const previous = phaseByVersionAndStart.get(key);
    if (previous !== undefined && previous !== item.phase) {
      throw new Error(`BWiki 卡池分期冲突：${item.version} ${item.start}`);
    }
    phaseByVersionAndStart.set(key, item.phase!);
  }
  const startsByVersion = new Map<string, string[]>();
  for (const item of records) {
    const starts = startsByVersion.get(item.version) ?? [];
    if (!starts.includes(item.start)) starts.push(item.start);
    startsByVersion.set(item.version, starts);
  }
  for (const [version, starts] of startsByVersion) {
    starts.sort();
    starts.forEach((start, index) => {
      if (!phaseByVersionAndStart.has(`${version}:${start}`))
        phaseByVersionAndStart.set(
          `${version}:${start}`,
          Math.min(index + 1, 2),
        );
    });
  }
  const normalized = records.map((item) => ({
    ...item,
    // A page entry without “上半/下半” describes a pool that lasts across
    // the version. Keep it separate even when the same version also has
    // explicitly split phase entries.
    phase: item.phase ?? 1,
    period: item.phase === null ? ("version" as const) : ("phase" as const),
  }));
  const unique = new Map(
    normalized.map((item) => [
      `${item.channel}:${item.version}:${item.period}:${item.phase}:${item.name}`,
      item,
    ]),
  );
  const rows = [...unique.values()].sort(
    (a, b) =>
      a.start.localeCompare(b.start) ||
      a.channel.localeCompare(b.channel) ||
      a.name.localeCompare(b.name, "zh-CN"),
  );
  if (rows.length < 12)
    throw new Error(
      `BWiki 卡池计时器结构可能已变化：仅解析到 ${rows.length} 条记录`,
    );
  const phases = [
    ...new Map(
      rows.map((x) => [`${x.channel}:${x.version}:${x.phase}:${x.start}`, x]),
    ).values(),
  ].sort((a, b) => a.start.localeCompare(b.start));
  return normalizeBannerKinds(
    rows.map((item) => {
      const nextSameVersion = phases.find(
        (x) =>
          item.period === "phase" &&
          x.channel === item.channel &&
          x.version === item.version &&
          x.start > item.start,
      );
      const nextVersion = phases.find(
        (x) =>
          x.channel === item.channel &&
          x.version !== item.version &&
          x.start > item.start,
      );
      const nextStart = (nextSameVersion ?? nextVersion)?.start;
      const end = nextStart
        ? addDaysToDate(nextStart, -1)
        : addDaysToDate(item.start, 20);
      const peers = rows.filter(
        (x) =>
          x.channel === item.channel &&
          x.version === item.version &&
          x.period === item.period &&
          x.phase === item.phase,
      );
      const index = peers.findIndex((x) => x.name === item.name);
      const recordKey = `${bannerRecordKey(item.version, item.phase, item.channel, item.name)}${item.period === "version" ? ":version" : ""}`;
      return {
        id: `bwiki:${item.version}-${item.period}-${item.phase}:${item.channel}:${item.name}`,
        recordKey,
        name: item.name,
        featured: item.name,
        rarity: item.rarity,
        period: item.period,
        channel: item.channel,
        version: item.version,
        phase: item.phase,
        kind: index === 0 ? "debut" : "rerun",
        start: item.start,
        end,
        official: false,
        source: onlineBannerSourceUrl,
        sourceId: onlineBannerSourceId,
        sourceKind: "third-party",
        updatedAt: checkedAt,
      };
    }),
  );
};

export const checkBannerUpdates = async (
  data: AppData,
  fetcher: typeof fetch = fetch,
): Promise<BannerCheckResult> => {
  const checkedAt = new Date().toISOString();
  data.bannerSync.lastCheckedAt = checkedAt;
  try {
    const endpoint = `https://wiki.biligame.com/zzz/api.php?action=parse&page=${encodeURIComponent("卡池计时器")}&prop=text&format=json&origin=*`;
    const response = await fetcher(endpoint, {
      signal: AbortSignal.timeout(bannerSyncTimeoutMs),
    });
    if (!response.ok) throw new Error(`Wiki 返回 HTTP ${response.status}`);
    const payload = (await response.json()) as {
      parse?: { text?: { "*"?: string } };
      error?: { info?: string };
    };
    if (payload.error)
      throw new Error(payload.error.info || "Wiki API 返回错误");
    const html = payload.parse?.text?.["*"];
    if (!html) throw new Error("Wiki API 未返回页面内容");
    const parsed = parseBwikiGachaTimerBanners(html, checkedAt).filter(
      (banner) => banner.rarity !== "A",
    );
    data.bannerSync.cachedBanners = parsed;
    data.bannerSync.cacheUpdatedAt = checkedAt;
    data.bannerSync.lastSuccessAt = checkedAt;
    data.bannerSync.lastError = "";
    data.bannerSync.usedCache = false;
    const disabled =
      data.bannerSync.disabledSourceIds.includes(onlineBannerSourceId);
    const incomingKeys = new Set(parsed.map((banner) => banner.recordKey));
    const incomingVersionChannels = new Set(
      parsed.map((banner) => `${banner.version}:${banner.channel}`),
    );
    const stale = !disabled
      ? data.banners.filter(
          (banner) =>
            incomingVersionChannels.has(
              `${banner.version}:${banner.channel}`,
            ) &&
            banner.sourceId === onlineBannerSourceId &&
            !incomingKeys.has(banner.recordKey),
        )
      : [];
    const currentWithoutStale = data.banners.filter(
      (banner) => !stale.some((old) => old.recordKey === banner.recordKey),
    );
    const changes = disabled
      ? []
      : [
          ...stale.map((before) => ({
            recordKey: before.recordKey,
            before: structuredClone(before),
            after: null,
          })),
          ...diffBannerUpdates(currentWithoutStale, parsed),
        ];
    if (!disabled) {
      data.bannerSync.pendingChanges = changes;
      applyBannerChanges(data, "BWiki 卡池计时器");
    }
    return { changes, usedCache: false, error: "", fetched: parsed.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    data.bannerSync.lastError = message;
    data.bannerSync.usedCache = data.bannerSync.cachedBanners.length > 0;
    return {
      changes: [],
      usedCache: data.bannerSync.usedCache,
      error: message,
      fetched: 0,
    };
  }
};
