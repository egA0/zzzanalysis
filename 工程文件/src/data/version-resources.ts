import type { AppData, Banner, VersionResourceEntry } from "../domain/types";

export const currentVersion = "3.2";
export const currentVersionStart = "2026-09-09";
export const currentVersionEnd = "2026-10-20";
export const currentVersionDays = 42;
export const futureVersionDefaultPulls = 90;
export const manualVersionResourceSourceId = "manual-version-resources";

/**
 * 版本资源只保留手工录入：活动页面菲林/抽数、每日活跃和月卡每日菲林。
 * 这里不再保存或请求第三方版本奖励页面，避免联网结果污染规划基线。
 */
export const versionResourceSources = [
  {
    id: manualVersionResourceSourceId,
    name: "活动页面手工记录",
    kind: "manual" as const,
    url: "",
    description:
      "请从游戏活动页面填写版本资源总数与当前获取度；每日活跃和月卡按版本持续时间自动计算。",
  },
] as const;

const manualEntry = (
  value: Omit<
    VersionResourceEntry,
    "phase1Min" | "phase1Max" | "phase2Min" | "phase2Max"
  > &
    Partial<
      Pick<
        VersionResourceEntry,
        "phase1Min" | "phase1Max" | "phase2Min" | "phase2Max"
      >
    >,
): VersionResourceEntry => ({
  phase1Min: null,
  phase1Max: null,
  phase2Min: null,
  phase2Max: null,
  ...value,
});

export const bundledVersionResources: VersionResourceEntry[] = [
  manualEntry({
    id: "manual-3.2-activity",
    version: currentVersion,
    scope: "f2p",
    label: "3.2 活动页面版本资源",
    pulls: null,
    film: null,
    encryptedTapes: null,
    masterTapes: null,
    boopons: null,
    start: currentVersionStart,
    end: currentVersionEnd,
    sourceId: manualVersionResourceSourceId,
    sourceName: "活动页面手工记录",
    sourceKind: "manual",
    certainty: "estimated",
    checkedAt: currentVersionStart,
    note: "请填写活动页面显示的本版本资源总数（按限定抽数计）。",
  }),
  manualEntry({
    id: "manual-3.2-daily-active",
    version: currentVersion,
    scope: "confirmed",
    label: "每日活跃（按天数计算）",
    pulls: null,
    film: 60,
    encryptedTapes: null,
    masterTapes: null,
    boopons: null,
    start: currentVersionStart,
    end: currentVersionEnd,
    sourceId: manualVersionResourceSourceId,
    sourceName: "每日活跃手工参数",
    sourceKind: "manual",
    certainty: "estimated",
    checkedAt: currentVersionStart,
    note: "每日菲林 × 版本持续天数 ÷ 160。请按实际活动页面规则调整。",
  }),
  manualEntry({
    id: "manual-3.2-monthly",
    version: currentVersion,
    scope: "monthly",
    label: "月卡（按天数计算）",
    pulls: null,
    film: 90,
    encryptedTapes: null,
    masterTapes: null,
    boopons: null,
    start: currentVersionStart,
    end: currentVersionEnd,
    sourceId: manualVersionResourceSourceId,
    sourceName: "月卡手工参数",
    sourceKind: "manual",
    certainty: "estimated",
    checkedAt: currentVersionStart,
    note: "月卡每日菲林 × 版本持续天数 ÷ 160。未购买月卡时可填 0。",
  }),
];

export const bundledVersionResourcesForSource = (sourceId: string) =>
  bundledVersionResources
    .filter((resource) => resource.sourceId === sourceId)
    .map((resource) => structuredClone(resource));

export const versionResourceSourceIds = versionResourceSources.map(
  (source) => source.id,
);

const localToday = () => new Date().toLocaleDateString("en-CA");
const parseDay = (value: string) =>
  Math.floor(Date.parse(`${value}T00:00:00Z`) / 86400000);
const dateFromDay = (day: number) =>
  new Date(day * 86400000).toISOString().slice(0, 10);

export const versionStartForBanners = (banners: Banner[], version: string) => {
  const starts = banners
    .filter((banner) => banner.version === version && banner.start)
    .map((banner) => banner.start)
    .sort();
  return starts[0] ?? "";
};

export const targetDateForVersion = (
  banners: Banner[],
  version: string,
  phase: 1 | 2,
) => {
  const exact = banners
    .filter(
      (banner) =>
        banner.version === version &&
        banner.phase === phase &&
        banner.channel === "agent" &&
        banner.end,
    )
    .map((banner) => banner.end)
    .sort();
  if (exact.at(-1)) return exact.at(-1)!;
  const versionEnds = banners
    .filter((banner) => banner.version === version && banner.end)
    .map((banner) => banner.end)
    .sort();
  return versionEnds.at(-1) ?? "";
};

export const versionOptions = (banners: Banner[]) =>
  [...new Set(banners.map((banner) => banner.version).filter(Boolean))].sort(
    (a, b) => b.localeCompare(a, undefined, { numeric: true }),
  );

export const versionWindow = (banners: Banner[], version: string) => {
  const starts = banners
    .filter((banner) => banner.version === version)
    .map((banner) => banner.start)
    .filter(Boolean)
    .sort();
  const ends = banners
    .filter((banner) => banner.version === version)
    .map((banner) => banner.end)
    .filter(Boolean)
    .sort();
  return {
    start: starts[0] ?? "",
    end: ends.at(-1) ?? "",
    days:
      starts[0] && ends.at(-1)
        ? Math.max(1, parseDay(ends.at(-1)!) - parseDay(starts[0]!) + 1)
        : 42,
  };
};

export type VersionResourceView = {
  version: string;
  start: string;
  end: string;
  days: number;
  total: number;
  totalMin: number;
  totalMax: number;
  remaining: number;
  acquired: number;
  progressRatio: number;
  officialEncrypted: number;
  activityFilm: number;
  activityPulls: number;
  dailyActivityPulls: number;
  monthlyCardPulls: number;
  f2p: VersionResourceEntry | null;
  alternatives: VersionResourceEntry[];
  monthly: VersionResourceEntry | null;
  monthlyPass: VersionResourceEntry | null;
  phase1: { min: number; max: number } | null;
  phase2: { min: number; max: number } | null;
};

const calculatedEntry = (
  entry: VersionResourceEntry | null,
  pulls: number,
  note: string,
) =>
  entry
    ? {
        ...entry,
        pulls,
        note: `${entry.note} ${note}`.trim(),
      }
    : null;

export const versionResourceView = (
  data: AppData,
  version = currentVersion,
): VersionResourceView => {
  const disabled = new Set(data.versionResourceSync.disabledSourceIds);
  const entries = data.versionResources.filter(
    (resource) =>
      resource.version === version &&
      resource.sourceKind === "manual" &&
      !disabled.has(resource.sourceId),
  );
  const window = versionWindow(data.banners, version);
  const activity = entries.find((resource) => resource.scope === "f2p") ?? null;
  const daily = entries.find((resource) =>
    resource.id.endsWith("-daily-active"),
  );
  const monthlyInput = entries.find((resource) => resource.scope === "monthly");
  const activityFilm = Math.max(0, activity?.film ?? 0);
  const activityPulls =
    Math.max(0, activity?.pulls ?? 0) +
    activityFilm / data.rules.conversion.filmPerTape;
  const dailyActivityPulls =
    ((daily?.film ?? 0) * window.days) / data.rules.conversion.filmPerTape;
  const monthlyCardPulls =
    ((monthlyInput?.film ?? 0) * window.days) /
    data.rules.conversion.filmPerTape;
  const total = activityPulls + dailyActivityPulls + monthlyCardPulls;
  const progress = data.resourceProgress[version];
  const acquired = progress
    ? progress.film / data.rules.conversion.filmPerTape +
      (progress.acquiredPulls ?? progress.encrypted)
    : 0;
  const progressRatio =
    total > 0 ? Math.max(0, Math.min(1, acquired / total)) : 0;
  const calculatedActivity = calculatedEntry(
    activity,
    activityPulls,
    "不含每日活跃与月卡。",
  );
  const calculatedMonthly = calculatedEntry(
    monthlyInput ?? null,
    monthlyCardPulls,
    `按 ${window.days} 天计算。`,
  );
  return {
    version,
    start: window.start || activity?.start || "",
    end: window.end || activity?.end || "",
    days: window.days,
    total,
    totalMin: total,
    totalMax: total,
    remaining: Math.max(0, total - acquired),
    acquired,
    progressRatio,
    officialEncrypted: 0,
    activityFilm,
    activityPulls,
    dailyActivityPulls,
    monthlyCardPulls,
    f2p: calculatedActivity,
    alternatives: calculatedActivity ? [calculatedActivity] : [],
    monthly: calculatedMonthly,
    monthlyPass: null,
    phase1: null,
    phase2: null,
  };
};

export type FutureVersionProjection = {
  version: string;
  start: string;
  end: string;
  days: number;
  projectedPulls: number;
  sampleVersions: string[];
};

const versionParts = (version: string) => {
  const [rawMajor, rawMinor] = version.split(".").map(Number);
  return {
    major: Number.isFinite(rawMajor) ? rawMajor! : 3,
    minor: Number.isFinite(rawMinor) ? rawMinor! : 2,
  };
};

const minorCountForMajor = (data: AppData, major: number) => {
  const counts = new Map<number, Set<number>>();
  for (const banner of data.banners) {
    const parts = versionParts(banner.version);
    if (!counts.has(parts.major)) counts.set(parts.major, new Set());
    counts.get(parts.major)!.add(parts.minor);
  }
  const historical = [...counts.entries()]
    .filter(([value]) => value !== major)
    .map(([, minors]) => minors.size)
    .filter((value) => value >= 2)
    .sort((a, b) => a - b);
  if (!historical.length) return 9;
  return historical[Math.floor(historical.length / 2)] ?? 9;
};

const nextVersion = (data: AppData, version: string, offset: number) => {
  const current = versionParts(version);
  const minorCount = Math.max(3, minorCountForMajor(data, current.major));
  const absoluteMinor = current.minor + offset;
  const major = current.major + Math.floor(absoluteMinor / minorCount);
  const minor = absoluteMinor % minorCount;
  return `${major}.${minor}`;
};

export const versionOffsetFromCurrent = (
  data: AppData,
  targetVersion: string,
) => {
  for (let offset = 1; offset <= 240; offset += 1) {
    if (nextVersion(data, currentVersion, offset) === targetVersion)
      return offset;
  }
  return null;
};

export const futureVersionProjections = (
  data: AppData,
  count = 3,
): FutureVersionProjection[] => {
  const current = versionResourceView(data, currentVersion);
  const averageDays = current.days || currentVersionDays;
  const startDay = parseDay(currentVersionEnd) + 1;
  return Array.from({ length: count }, (_, index) => {
    const start = startDay + index * averageDays;
    return {
      version: nextVersion(data, currentVersion, index + 1),
      start: dateFromDay(start),
      end: dateFromDay(start + averageDays - 1),
      days: averageDays,
      projectedPulls: futureVersionDefaultPulls,
      sampleVersions: [],
    };
  });
};

export const targetDateForSelection = (
  data: AppData,
  version: string,
  phase: 1 | 2,
) => {
  const known = targetDateForVersion(data.banners, version, phase);
  if (known) return known;
  const offset = versionOffsetFromCurrent(data, version);
  const projected = futureVersionProjections(
    data,
    Math.max(24, (offset ?? 0) + 2),
  ).find((item) => item.version === version);
  if (!projected) return currentVersionEnd;
  if (phase === 2) return projected.end;
  return dateFromDay(
    parseDay(projected.start) + Math.ceil(projected.days / 2) - 1,
  );
};

export const estimatedVersionPullsUntil = (data: AppData, deadline: string) => {
  const current = versionResourceView(data, currentVersion);
  let pulls = 0;
  if (deadline >= current.start) {
    if (deadline >= current.end) pulls += current.remaining;
    else {
      const elapsed = Math.max(
        1,
        parseDay(deadline) - parseDay(current.start) + 1,
      );
      const projectedEarned =
        current.total * Math.min(1, elapsed / current.days);
      pulls += Math.max(0, projectedEarned - current.acquired);
    }
  }
  const projectionCount = Math.max(
    24,
    Math.ceil(
      Math.max(0, parseDay(deadline) - parseDay(currentVersionEnd)) /
        currentVersionDays,
    ) + 2,
  );
  for (const projection of futureVersionProjections(data, projectionCount)) {
    if (deadline < projection.start) break;
    if (deadline >= projection.end) pulls += projection.projectedPulls;
    else {
      const elapsed = parseDay(deadline) - parseDay(projection.start) + 1;
      pulls +=
        projection.projectedPulls *
        Math.max(0, Math.min(1, elapsed / projection.days));
      break;
    }
  }
  return Math.max(0, Math.floor(pulls));
};

export const setVersionResourceSourceEnabled = (
  data: AppData,
  sourceId: string,
  enabled: boolean,
) => {
  const disabled = new Set(data.versionResourceSync.disabledSourceIds);
  if (enabled) {
    disabled.delete(sourceId);
    const cached = data.versionResourceSync.cachedEntries.filter(
      (resource) => resource.sourceId === sourceId,
    );
    const bundled = cached.length
      ? cached
      : bundledVersionResourcesForSource(sourceId);
    for (const resource of bundled) {
      const existing = data.versionResources.find(
        (item) => item.id === resource.id,
      );
      if (existing) Object.assign(existing, resource);
      else data.versionResources.push(resource);
    }
  } else {
    disabled.add(sourceId);
  }
  data.versionResourceSync.disabledSourceIds = [...disabled];
};

export const setResourceProgress = (
  data: AppData,
  version: string,
  acquiredPulls: number,
) => {
  const view = versionResourceView(data, version);
  const film = acquiredPulls * data.rules.conversion.filmPerTape;
  data.resourceProgress[version] = {
    version,
    film,
    encrypted: 0,
    acquiredPulls,
    acquisitionPercent:
      view.total > 0
        ? Math.max(0, Math.min(100, (acquiredPulls / view.total) * 100))
        : 0,
    observedAt: localToday(),
  };
};

export const versionResourceSourceState = (data: AppData, sourceId: string) =>
  !data.versionResourceSync.disabledSourceIds.includes(sourceId);
