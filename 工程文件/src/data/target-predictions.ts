import type {
  AnnouncedCharacter,
  AppData,
  Banner,
  Channel,
} from "../domain/types";
import { currentVersion, futureVersionProjections } from "./version-resources";

export type TargetCatalogEntry = {
  name: string;
  channel: Channel;
  status: "released" | "announced";
  firstVersion: string;
  latestVersion: string;
  latestStart: string;
  history: Banner[];
  announced: AnnouncedCharacter | null;
};

export type TargetVersionPrediction = {
  version: string;
  phase: 1 | 2;
  probability: number;
  confidence: "high" | "medium" | "low";
  reason: string;
  kind: "rerun" | "debut";
};

const day = (value: string) =>
  Math.floor(Date.parse(`${value}T00:00:00Z`) / 86400000);
const today = () => new Date().toLocaleDateString("en-CA");
const versionCompare = (a: string, b: string) =>
  b.localeCompare(a, undefined, { numeric: true });
const unique = <T>(values: T[]) => [...new Set(values)];

const upcomingVersions = (data: AppData, count = 24) => {
  const known = unique(
    data.banners
      .map((banner) => banner.version)
      .filter(
        (version) => version && versionCompare(version, currentVersion) < 0,
      ),
  ).sort(versionCompare);
  const projected = futureVersionProjections(data, Math.max(count, 24)).map(
    (item) => item.version,
  );
  return unique([...known, ...projected]).slice(0, count);
};

const phaseForDate = (data: AppData, version: string, date: string): 1 | 2 => {
  const records = data.banners
    .filter(
      (banner) => banner.version === version && banner.channel === "agent",
    )
    .sort((a, b) => a.start.localeCompare(b.start));
  if (records.length > 1 && day(date) >= day(records[1]!.start)) return 2;
  return 1;
};

export const targetCatalog = (
  data: AppData,
  asOf = today(),
): TargetCatalogEntry[] => {
  const grouped = new Map<string, TargetCatalogEntry>();
  const put = (
    name: string,
    channel: Channel,
    history: Banner[],
    announced: AnnouncedCharacter | null,
  ) => {
    const key = `${channel}:${name}`;
    const current = grouped.get(key);
    const sorted = [...history].sort((a, b) => a.start.localeCompare(b.start));
    const first = sorted[0];
    const latest = sorted.at(-1);
    const latestStart = latest?.start ?? announced?.announcedAt ?? asOf;
    const isAnnounced = Boolean(announced) || latestStart > asOf;
    grouped.set(key, {
      name,
      channel,
      status: isAnnounced ? "announced" : "released",
      firstVersion: first?.version ?? announced?.expectedVersion ?? "",
      latestVersion: latest?.version ?? announced?.expectedVersion ?? "",
      latestStart,
      history: sorted,
      announced,
    });
    if (current && current.history.length > sorted.length)
      grouped.set(key, current);
  };
  for (const channel of ["agent", "engine"] as Channel[]) {
    const names = unique(
      data.banners
        .filter((banner) => banner.channel === channel && banner.featured)
        .map((banner) => banner.featured),
    );
    for (const name of names) {
      put(
        name,
        channel,
        data.banners.filter(
          (banner) => banner.channel === channel && banner.featured === name,
        ),
        null,
      );
    }
  }
  for (const announced of data.announcedCharacters) {
    put(
      announced.name,
      "agent",
      data.banners.filter(
        (banner) =>
          banner.channel === "agent" && banner.featured === announced.name,
      ),
      announced,
    );
  }
  return [...grouped.values()].sort(
    (a, b) =>
      (a.channel === b.channel ? 0 : a.channel === "agent" ? -1 : 1) ||
      a.name.localeCompare(b.name, "zh-CN"),
  );
};

const normalize = (values: number[]) => {
  const total = values.reduce((sum, value) => sum + value, 0);
  return total ? values.map((value) => value / total) : values;
};

export const targetPredictions = (
  data: AppData,
  name: string,
  channel: Channel = "agent",
  count = 3,
  asOf = today(),
): TargetVersionPrediction[] => {
  const entry = targetCatalog(data, asOf).find(
    (item) => item.name === name && item.channel === channel,
  );
  if (!entry) return [];
  const slots = upcomingVersions(data, 24);
  const existingUpcoming = entry.history
    .filter((banner) => banner.start >= asOf && banner.version)
    .sort((a, b) => a.start.localeCompare(b.start));
  if (existingUpcoming.length) {
    const debut = entry.history.every((banner) => banner.start >= asOf);
    return existingUpcoming.slice(0, count).map((banner, index) => ({
      version: banner.version,
      phase: banner.phase === 2 ? 2 : 1,
      probability: Math.max(0.01, 0.99 - index * 0.08),
      confidence: banner.official ? "high" : "medium",
      reason: banner.official ? "官方已公布卡池" : "已收录的未来卡池记录",
      kind: debut ? ("debut" as const) : ("rerun" as const),
    }));
  }
  if (entry.announced?.expectedVersion) {
    const expected = entry.announced.expectedVersion;
    if (slots.includes(expected)) {
      return [
        {
          version: expected,
          phase: 1 as const,
          probability: 0.72,
          confidence: "medium" as const,
          reason: "资料提供者填写的预计实装版本",
          kind: "debut" as const,
        },
        ...slots
          .filter((version) => version !== expected)
          .slice(0, Math.max(0, count - 1))
          .map((version, index) => ({
            version,
            phase: 1 as const,
            probability: Math.max(0.01, 0.28 - index * 0.08),
            confidence: "low" as const,
            reason: "未有官方版本日期，按后续版本顺序保守估计",
            kind: "debut" as const,
          })),
      ].slice(0, count);
    }
  }
  const intervals = entry.history
    .slice(1)
    .map(
      (banner, index) => day(banner.start) - day(entry.history[index]!.start),
    )
    .filter((value) => value > 0)
    .sort((a, b) => a - b);
  const median = intervals.length
    ? intervals[Math.floor(intervals.length / 2)]!
    : 126;
  const spread =
    intervals.length > 1
      ? Math.max(30, intervals.at(-1)! - intervals[0]!)
      : Math.max(45, median * 0.6);
  const lastStart = entry.history.at(-1)?.start ?? asOf;
  const expectedDay = day(lastStart) + median;
  const projections = futureVersionProjections(data, 24);
  const raw = slots.map((version, index) => {
    const window = data.banners
      .filter(
        (banner) => banner.version === version && banner.channel === channel,
      )
      .sort((a, b) => a.start.localeCompare(b.start));
    const start =
      window[0]?.start ??
      projections.find((item) => item.version === version)?.start ??
      asOf;
    const distance = Math.abs(day(start) - expectedDay);
    // Score every future version first, then take the strongest candidates.
    // The previous implementation always returned the first N versions even
    // when a later version was much closer to the learned rerun interval.
    const score = Math.exp(-distance / spread);
    return { version, phase: phaseForDate(data, version, start), score, index };
  });
  const chosen = raw
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, count);
  const probabilities = normalize(chosen.map((item) => item.score));
  return chosen.map((item, index) => ({
    version: item.version,
    phase: item.phase,
    probability: probabilities[index] ?? 0,
    confidence:
      entry.history.length >= 3
        ? "medium"
        : entry.history.length >= 1
          ? "low"
          : "low",
    reason:
      entry.history.length >= 2
        ? `按 ${entry.history.length} 次历史记录的复刻间隔中位数 ${median} 天估算`
        : "缺少历史复刻样本，按未来版本的先后与已知周期保守估计",
    kind: entry.history.length ? ("rerun" as const) : ("debut" as const),
  }));
};

export const topTargetPrediction = (
  data: AppData,
  name: string,
  channel: Channel,
) => targetPredictions(data, name, channel, 1)[0] ?? null;

export const targetOptionLabel = (entry: TargetCatalogEntry) =>
  `${entry.name}${entry.status === "announced" ? "（已公布/未实装）" : ""}`;

export const futureVersionList = (data: AppData) => upcomingVersions(data, 24);
