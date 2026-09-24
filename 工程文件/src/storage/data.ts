import { openDB } from "idb";
import { defaultRules, initialData, nonnegative, today } from "../domain/data";
import { validateRule } from "../engine/probability";
import { validateSpecialRule } from "../engine/special";
import type {
  AnnouncedCharacter,
  AppData,
  Banner,
  Channel,
  Plan,
  SpecialFamily,
  Target,
} from "../domain/types";
import { looksLikeLegacyDefault, ruleSources } from "../rules/profiles";
import {
  bannerRecordKey,
  bannerHistoryChineseUrl,
  bannerHistorySourceId,
  bundledBanners,
  localizeBannerName,
  onlineBannerSourceId,
} from "../data/banner-history";
import { bundledVersionResources } from "../data/version-resources";

const db = () =>
  openDB("signal-planner", 1, {
    upgrade(database) {
      database.createObjectStore("local");
    },
  });
export const loadData = async (): Promise<AppData | null> => {
  const value = await (await db()).get("local", "app");
  return value ? migrate(value) : null;
};
export const saveData = async (value: AppData) =>
  (await db()).put("local", value, "app");
export const clearData = async () => (await db()).clear("local");

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("数据不是对象");
  return value as Record<string, unknown>;
};
const whole = (value: unknown, min: number, max: number) => {
  const n = nonnegative(value, max);
  if (!Number.isInteger(n) || n < min)
    throw new Error(`请输入 ${min} 至 ${max} 的整数`);
  return n;
};
const validDate = (s: unknown) => {
  const time = typeof s === "string" ? Date.parse(`${s}T00:00:00Z`) : NaN;
  if (
    typeof s !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    !Number.isFinite(time) ||
    new Date(time).toISOString().slice(0, 10) !== s
  )
    throw new Error("日期格式必须为 YYYY-MM-DD");
  return s;
};
const migrateSpecialRule = (
  raw: unknown,
  family: SpecialFamily,
): AppData["rules"]["specialChannels"][SpecialFamily] => {
  const fallback = defaultRules.specialChannels[family];
  const value = object(raw ?? {});
  const inheritance =
    value.inheritance === undefined ? {} : object(value.inheritance);
  const regular =
    inheritance.regular === undefined ? {} : object(inheritance.regular);
  const selection =
    inheritance.selection === undefined ? {} : object(inheritance.selection);
  const period =
    inheritance.period === undefined ? {} : object(inheritance.period);
  const legacySelectionCarry = value.pityCarriesAcrossSelections !== false;
  return {
    ...fallback,
    ...value,
    mechanic: "first-s-selected-v1",
    inheritance: {
      regular: {
        pity:
          regular.pity === "shared" ||
          (inheritance.regular === undefined &&
            value.pityIndependentFromRegular === false)
            ? "shared"
            : "independent",
        standardGuarantee:
          regular.standardGuarantee === "shared" ? "shared" : "independent",
      },
      selection: {
        pity:
          selection.pity === "reset" ||
          (inheritance.selection === undefined && !legacySelectionCarry)
            ? "reset"
            : "carry",
        standardGuarantee:
          selection.standardGuarantee === "reset" ||
          (inheritance.selection === undefined && !legacySelectionCarry)
            ? "reset"
            : "carry",
        specialGuarantee:
          selection.specialGuarantee === "reset" ? "reset" : "carry",
        discount: selection.discount === "reset" ? "reset" : "carry",
      },
      period: {
        pity:
          period.pity === "carry" ||
          (inheritance.period === undefined &&
            value.pityCarriesAcrossPeriods === true)
            ? "carry"
            : "reset",
        standardGuarantee:
          period.standardGuarantee === "carry" ||
          (inheritance.period === undefined &&
            value.standardGuaranteeCarriesAcrossPeriods === true)
            ? "carry"
            : "reset",
        specialGuarantee:
          period.specialGuarantee === "carry" ||
          (inheritance.period === undefined &&
            value.specialGuaranteeResetsEachPeriod === false)
            ? "carry"
            : "reset",
        discount:
          period.discount === "carry" ||
          (inheritance.period === undefined &&
            value.discountResetsEachPeriod === false)
            ? "carry"
            : "reset",
      },
    },
  } as AppData["rules"]["specialChannels"][SpecialFamily];
};
export const migrate = (input: unknown): AppData => {
  const source = object(input);
  if (
    source.schemaVersion !== 1 &&
    source.schemaVersion !== 2 &&
    source.schemaVersion !== 3 &&
    source.schemaVersion !== 4 &&
    source.schemaVersion !== 5 &&
    source.schemaVersion !== 6 &&
    source.schemaVersion !== 7 &&
    source.schemaVersion !== 8 &&
    source.schemaVersion !== 9 &&
    source.schemaVersion !== 10
  )
    throw new Error("未知数据版本；未覆盖本地数据");
  const base = initialData();
  const r = object(source.resources ?? {});
  base.resources = {
    film: whole(r.film ?? 0, 0, 1_000_000_000),
    encrypted: whole(r.encrypted ?? 0, 0, 1_000_000_000),
    original: whole(r.original ?? 0, 0, 1_000_000_000),
    other: whole(r.other ?? 0, 0, 1_000_000_000),
    signalAfterglow: whole(r.signalAfterglow ?? 0, 0, 1_000_000_000),
    signalResidual: whole(r.signalResidual ?? 0, 0, 1_000_000_000),
    includeMoney: r.includeMoney === true,
    moneyBudget: nonnegative(r.moneyBudget ?? 0),
  };
  const rules = object(source.rules ?? {});
  base.rules = {
    ...defaultRules,
    ...rules,
    conversion: {
      ...defaultRules.conversion,
      signalAfterglowPerTape: 20,
      signalResidualPerTape: 90,
      ...object(rules.conversion ?? {}),
    },
    channels: {
      agent: {
        ...defaultRules.channels.agent,
        ...object(object(rules.channels ?? {}).agent ?? {}),
      },
      engine: {
        ...defaultRules.channels.engine,
        ...object(object(rules.channels ?? {}).engine ?? {}),
      },
    },
    specialChannels: {
      rescreening: migrateSpecialRule(
        object(rules.specialChannels ?? {}).rescreening,
        "rescreening",
      ),
      reverberation: migrateSpecialRule(
        object(rules.specialChannels ?? {}).reverberation,
        "reverberation",
      ),
    },
  } as AppData["rules"];
  if (!Array.isArray(rules.enabledSourceIds)) {
    if (looksLikeLegacyDefault(rules as Partial<AppData["rules"]>)) {
      base.rules = structuredClone(defaultRules);
    } else {
      base.rules.enabledSourceIds = [];
      base.rules.profileId = "custom-legacy-import";
      base.rules.modelLabel =
        "从旧版迁移的自定义规则；未自动应用第三方来源补丁";
    }
  } else {
    const known = new Set(ruleSources.map((item) => item.id));
    base.rules.enabledSourceIds = rules.enabledSourceIds
      .filter((item): item is string => typeof item === "string")
      .filter((item) => known.has(item));
  }
  if (Array.isArray(source.announcedCharacters)) {
    base.announcedCharacters = source.announcedCharacters
      .slice(0, 200)
      .map((value, index): AnnouncedCharacter => {
        const item = object(value);
        const sourceKind =
          item.sourceKind === "official" ? "official" : "third-party";
        return {
          id: String(item.id ?? `announced-${index}`).slice(0, 120),
          name: String(item.name ?? "")
            .trim()
            .slice(0, 80),
          channel: "agent",
          announcedAt: validDate(item.announcedAt ?? today()),
          source: String(item.source ?? "").slice(0, 500),
          sourceId: String(item.sourceId ?? "").slice(0, 120),
          sourceName: String(item.sourceName ?? "未知来源").slice(0, 120),
          sourceKind,
          note: String(item.note ?? "").slice(0, 500),
          expectedVersion: item.expectedVersion
            ? String(item.expectedVersion).slice(0, 16)
            : undefined,
        };
      })
      .filter((item) => item.name.length > 0);
  }
  for (const channel of ["agent", "engine"] as Channel[]) {
    if (!Array.isArray(base.rules.channels[channel].rateSteps))
      throw new Error("概率阶梯必须为数组");
    validateRule(base.rules.channels[channel]);
  }
  validateSpecialRule(base.rules.specialChannels.rescreening);
  validateSpecialRule(base.rules.specialChannels.reverberation);
  for (const value of [
    base.rules.conversion.filmPerTape,
    base.rules.conversion.otherPerTape,
    base.rules.conversion.signalAfterglowPerTape,
    base.rules.conversion.signalResidualPerTape,
  ]) {
    if (
      !Number.isFinite(value) ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > 1_000_000
    )
      throw new Error("兑换比例不合法");
  }
  for (const channel of ["agent", "engine"] as Channel[]) {
    const p = object(object(source.pity ?? {})[channel] ?? {});
    const count = whole(p.count ?? 0, 0, 200);
    if (
      !Number.isInteger(count) ||
      count >= base.rules.channels[channel].hardPity
    )
      throw new Error(`${channel} 垫数不合法`);
    base.pity[channel] = {
      count,
      guaranteed: p.guaranteed === true,
      lastResult: ["featured", "off-banner"].includes(String(p.lastResult))
        ? (p.lastResult as "featured" | "off-banner")
        : "none",
    };
  }
  if (source.specialPlans !== undefined) {
    const plans = object(source.specialPlans);
    for (const family of ["rescreening", "reverberation"] as const) {
      const value = object(plans[family] ?? {});
      const baseChannel = base.rules.specialChannels[family].baseChannel;
      base.specialPlans[family] = {
        periodId: String(value.periodId ?? "custom").slice(0, 80),
        targetName: String(
          value.targetName ?? base.specialPlans[family].targetName,
        ).slice(0, 80),
        pity: whole(
          value.pity ?? 0,
          0,
          base.rules.channels[baseChannel].hardPity - 1,
        ),
        standardGuaranteed: value.standardGuaranteed === true,
        specialGuaranteeAvailable: value.specialGuaranteeAvailable !== false,
        discountAvailable: value.discountAvailable !== false,
        useDiscount: value.useDiscount !== false,
        copies: whole(value.copies ?? 1, 1, 6),
        maxTapes: whole(value.maxTapes ?? 0, 0, 1200),
      };
    }
  }
  if (Array.isArray(source.plans)) {
    base.plans = source.plans.map((value, index): Plan => {
      const plan = object(value);
      return {
        id: String(plan.id ?? `migrated-${index}`),
        name: String(plan.name ?? "旧方案").slice(0, 80),
        targets: Array.isArray(plan.targets)
          ? plan.targets.map((value, i): Target => {
              const t = object(value);
              const channel =
                t.channel === "engine"
                  ? "engine"
                  : t.channel === "agent"
                    ? "agent"
                    : null;
              if (!channel) throw new Error("目标频道不合法");
              return {
                id: String(t.id ?? `migrated-${i}`),
                name: String(t.name ?? "").slice(0, 80),
                channel,
                copies: whole(t.copies ?? 1, 1, 6),
                includeSignatureEngine:
                  channel === "agent" && t.includeSignatureEngine === true,
                signatureEngineCopies: whole(
                  t.signatureEngineCopies ?? 1,
                  1,
                  6,
                ),
                priority: whole(t.priority ?? 1, 1, 10),
                maxPulls: whole(t.maxPulls ?? 180, 0, 1200),
                targetVersion: String(t.targetVersion ?? "3.2").slice(0, 16),
                targetPhase: t.targetPhase === 1 ? 1 : 2,
                stopDate: validDate(t.stopDate ?? "2099-01-01"),
                continueOnSuccess: t.continueOnSuccess !== false,
                skipped: t.skipped === true,
              };
            })
          : [],
      };
    });
  }
  if (base.plans.length === 0) base.plans = initialData().plans;
  base.activePlanId = base.plans.some((p) => p.id === source.activePlanId)
    ? String(source.activePlanId)
    : base.plans[0]!.id;
  const migrateBanner = (value: unknown, index: number): Banner => {
    const b = object(value);
    if (b.channel !== "agent" && b.channel !== "engine")
      throw new Error("卡池频道不合法");
    const rawName = String(b.featured ?? b.name ?? "").slice(0, 80);
    const featured = localizeBannerName(rawName).slice(0, 80);
    const name = localizeBannerName(String(b.name ?? featured)).slice(0, 80);
    const start = validDate(b.start);
    const end = validDate(b.end);
    const matched = bundledBanners.find(
      (candidate) =>
        candidate.channel === b.channel &&
        candidate.start === start &&
        candidate.end === end &&
        (name.includes(candidate.featured) || featured === candidate.featured),
    );
    const version = String(b.version ?? matched?.version ?? "").slice(0, 16);
    const phase = whole(b.phase ?? matched?.phase ?? 0, 0, 9);
    const kind = ["debut", "rerun", "special", "manual"].includes(
      String(b.kind),
    )
      ? (b.kind as Banner["kind"])
      : (matched?.kind ?? "manual");
    const sourceKind = ["official", "third-party", "manual"].includes(
      String(b.sourceKind),
    )
      ? (b.sourceKind as Banner["sourceKind"])
      : b.official === true
        ? "official"
        : (matched?.sourceKind ?? "manual");
    const rawSourceId = String(b.sourceId ?? "");
    const legacyBundle = rawSourceId === "rackoon-banner-history";
    const legacyOnline = rawSourceId === "zzzbuild-banner-feed";
    const sourceId = legacyBundle
      ? bannerHistorySourceId
      : legacyOnline
        ? onlineBannerSourceId
        : String(
            b.sourceId ??
              matched?.sourceId ??
              `manual:${String(b.id ?? index)}`,
          ).slice(0, 120);
    const sourceUrl =
      legacyBundle || legacyOnline
        ? (matched?.source ?? bannerHistoryChineseUrl)
        : String(b.source ?? "");
    return {
      id: String(b.id ?? `migrated-banner-${index}`),
      recordKey:
        kind === "manual" || !version
          ? String(b.recordKey ?? `manual:${String(b.id ?? index)}`).slice(
              0,
              200,
            )
          : bannerRecordKey(version, phase, b.channel, featured),
      name,
      featured,
      channel: b.channel,
      version,
      phase,
      kind,
      start,
      end,
      official: b.official === true,
      source: sourceUrl,
      sourceId,
      sourceKind,
      updatedAt: validDate(b.updatedAt ?? base.rules.verifiedAt),
    };
  };
  if (Array.isArray(source.banners)) {
    const migrated = source.banners.map(migrateBanner);
    const keys = new Set(migrated.map((banner) => banner.recordKey));
    base.banners = [
      ...migrated,
      ...bundledBanners
        .filter((banner) => !keys.has(banner.recordKey))
        .map((banner) => structuredClone(banner)),
    ];
  }
  if (base.banners.some((b) => b.end < b.start))
    throw new Error("卡池结束日期不能早于开始日期");
  if (source.bannerSync !== undefined) {
    const sync = object(source.bannerSync);
    const disabledSourceIds = Array.isArray(sync.disabledSourceIds)
      ? sync.disabledSourceIds
          .filter((value): value is string => typeof value === "string")
          .map((value) =>
            value === "rackoon-banner-history"
              ? bannerHistorySourceId
              : value === "zzzbuild-banner-feed"
                ? onlineBannerSourceId
                : value,
          )
          .slice(0, 100)
      : [];
    const migrateChanges = (value: unknown) => {
      if (!Array.isArray(value)) return [];
      return value.slice(0, 1000).map((raw, index) => {
        const change = object(raw);
        return {
          recordKey: String(change.recordKey ?? `change-${index}`).slice(
            0,
            200,
          ),
          before:
            change.before === null || change.before === undefined
              ? null
              : migrateBanner(change.before, index),
          after:
            change.after === null || change.after === undefined
              ? null
              : migrateBanner(change.after, index),
        };
      });
    };
    base.bannerSync = {
      lastCheckedAt: String(sync.lastCheckedAt ?? "").slice(0, 40),
      lastSuccessAt: String(sync.lastSuccessAt ?? "").slice(0, 40),
      lastError: String(sync.lastError ?? "").slice(0, 500),
      cacheUpdatedAt: String(sync.cacheUpdatedAt ?? "").slice(0, 40),
      usedCache: sync.usedCache === true,
      cachedBanners: Array.isArray(sync.cachedBanners)
        ? sync.cachedBanners
            .slice(0, 1000)
            .map((banner, index) => migrateBanner(banner, index))
        : [],
      pendingChanges: migrateChanges(sync.pendingChanges),
      updateBatches: Array.isArray(sync.updateBatches)
        ? sync.updateBatches.slice(0, 20).map((raw, index) => {
            const batch = object(raw);
            return {
              id: String(batch.id ?? `batch-${index}`).slice(0, 120),
              sourceId:
                String(batch.sourceId ?? "") === "zzzbuild-banner-feed"
                  ? onlineBannerSourceId
                  : String(batch.sourceId ?? "").slice(0, 120),
              sourceName: String(batch.sourceName ?? "").slice(0, 120),
              appliedAt: String(batch.appliedAt ?? "").slice(0, 40),
              changes: migrateChanges(batch.changes),
            };
          })
        : [],
      disabledSourceIds,
    };
    for (const sourceId of disabledSourceIds)
      base.banners = base.banners.filter(
        (banner) => banner.sourceId !== sourceId,
      );
  }
  if (Array.isArray(source.incomes))
    base.incomes = source.incomes.map((value) => {
      const item = object(value);
      return {
        id: String(item.id),
        name: String(item.name).slice(0, 80),
        source: String(item.source ?? "").slice(0, 500),
        category: [
          "daily",
          "weekly",
          "event",
          "version",
          "code",
          "monthly",
          "pass",
          "other",
        ].includes(String(item.category))
          ? (item.category as AppData["incomes"][number]["category"])
          : "other",
        amount: whole(item.amount ?? 0, 0, 1_000_000_000),
        unit: item.unit === "tape" ? ("tape" as const) : ("film" as const),
        start: validDate(item.start),
        end: validDate(item.end),
        everyDays: whole(item.everyDays ?? 0, 0, 365),
        certainty:
          item.certainty === "confirmed"
            ? ("confirmed" as const)
            : ("estimated" as const),
        enabled: item.enabled === true,
      };
    });
  if (base.incomes.some((item) => item.end < item.start))
    throw new Error("收入结束日期不能早于开始日期");
  const settings = object(source.settings ?? {});
  base.settings = {
    ...base.settings,
    includeEstimates:
      settings.includeEstimates === undefined
        ? base.settings.includeEstimates
        : settings.includeEstimates === true,
    gachaProceeds: {
      ...base.settings.gachaProceeds,
      ...object(settings.gachaProceeds ?? {}),
      enabled: object(settings.gachaProceeds ?? {}).enabled !== false,
      agentAfterglowPerPull: nonnegative(
        object(settings.gachaProceeds ?? {}).agentAfterglowPerPull ??
          base.settings.gachaProceeds.agentAfterglowPerPull,
        1_000_000,
      ),
      agentResidualPerPull: nonnegative(
        object(settings.gachaProceeds ?? {}).agentResidualPerPull ??
          base.settings.gachaProceeds.agentResidualPerPull,
        1_000_000,
      ),
      engineAfterglowPerPull: nonnegative(
        object(settings.gachaProceeds ?? {}).engineAfterglowPerPull ??
          base.settings.gachaProceeds.engineAfterglowPerPull,
        1_000_000,
      ),
      engineResidualPerPull: nonnegative(
        object(settings.gachaProceeds ?? {}).engineResidualPerPull ??
          base.settings.gachaProceeds.engineResidualPerPull,
        1_000_000,
      ),
    },
    simulations: whole(
      settings.simulations ?? base.settings.simulations,
      100,
      200000,
    ),
    seed: whole(settings.seed ?? base.settings.seed, 0, 4294967295),
    theme: settings.theme === "light" ? "light" : "dark",
    language: "zh-CN",
  };
  if (Array.isArray(source.versionResources)) {
    base.versionResources = source.versionResources.map((value, index) => {
      const item = object(value);
      return {
        id: String(item.id ?? `resource-${index}`).slice(0, 120),
        version: String(item.version ?? "").slice(0, 16),
        scope: ["confirmed", "f2p", "monthly", "monthly_pass"].includes(
          String(item.scope),
        )
          ? (item.scope as AppData["versionResources"][number]["scope"])
          : "f2p",
        label: String(item.label ?? "资源资料").slice(0, 120),
        pulls:
          item.pulls === null || item.pulls === undefined
            ? null
            : nonnegative(item.pulls, 10000),
        film:
          item.film === null || item.film === undefined
            ? null
            : nonnegative(item.film),
        encryptedTapes:
          item.encryptedTapes === null || item.encryptedTapes === undefined
            ? null
            : nonnegative(item.encryptedTapes),
        masterTapes:
          item.masterTapes === null || item.masterTapes === undefined
            ? null
            : nonnegative(item.masterTapes),
        boopons:
          item.boopons === null || item.boopons === undefined
            ? null
            : nonnegative(item.boopons),
        start: validDate(item.start),
        end: validDate(item.end),
        phase1Min:
          item.phase1Min === null || item.phase1Min === undefined
            ? null
            : nonnegative(item.phase1Min, 10000),
        phase1Max:
          item.phase1Max === null || item.phase1Max === undefined
            ? null
            : nonnegative(item.phase1Max, 10000),
        phase2Min:
          item.phase2Min === null || item.phase2Min === undefined
            ? null
            : nonnegative(item.phase2Min, 10000),
        phase2Max:
          item.phase2Max === null || item.phase2Max === undefined
            ? null
            : nonnegative(item.phase2Max, 10000),
        sourceId: String(item.sourceId ?? "manual").slice(0, 120),
        sourceName: String(item.sourceName ?? "").slice(0, 160),
        sourceKind:
          item.sourceKind === "official"
            ? "official"
            : item.sourceKind === "manual" ||
                String(item.sourceId ?? "").startsWith("manual")
              ? "manual"
              : "third-party",
        certainty: item.certainty === "confirmed" ? "confirmed" : "estimated",
        checkedAt: validDate(item.checkedAt),
        note: String(item.note ?? "").slice(0, 1000),
      };
    });
  }
  if (Array.isArray(source.versionResources)) {
    const legacyActivity = base.versionResources.find(
      (resource) =>
        resource.version === "3.2" &&
        resource.scope === "f2p" &&
        resource.pulls !== null,
    );
    const manualEntries = base.versionResources.filter(
      (resource) => resource.sourceKind === "manual",
    );
    const defaults = structuredClone(bundledVersionResources);
    const hasManualActivity = manualEntries.some(
      (resource) => resource.id === "manual-3.2-activity",
    );
    if (!hasManualActivity && legacyActivity) {
      const activity = defaults.find(
        (resource) => resource.id === "manual-3.2-activity",
      );
      if (activity) activity.pulls = legacyActivity.pulls;
    }
    base.versionResources = [
      ...manualEntries,
      ...defaults.filter(
        (resource) =>
          !manualEntries.some((existing) => existing.id === resource.id),
      ),
    ];
  }
  if (source.resourceProgress && typeof source.resourceProgress === "object") {
    base.resourceProgress = {};
    const legacyProgressFormat =
      typeof source.schemaVersion !== "number" || source.schemaVersion < 10;
    for (const [version, raw] of Object.entries(
      object(source.resourceProgress),
    )) {
      const item = object(raw);
      const hasAcquiredPulls =
        item.acquiredPulls !== null && item.acquiredPulls !== undefined;
      base.resourceProgress[version] = {
        version,
        film:
          legacyProgressFormat && hasAcquiredPulls
            ? 0
            : nonnegative(item.film ?? 0),
        encrypted: nonnegative(item.encrypted ?? 0),
        acquiredPulls:
          item.acquiredPulls === null || item.acquiredPulls === undefined
            ? undefined
            : nonnegative(item.acquiredPulls, 10000),
        acquisitionPercent: nonnegative(item.acquisitionPercent ?? 0, 100),
        observedAt: validDate(
          item.observedAt ?? new Date().toLocaleDateString("en-CA"),
        ),
      };
    }
  }
  if (source.versionResourceSync !== undefined) {
    const sync = object(source.versionResourceSync);
    base.versionResourceSync = {
      lastCheckedAt: String(sync.lastCheckedAt ?? "").slice(0, 40),
      lastSuccessAt: String(sync.lastSuccessAt ?? "").slice(0, 40),
      lastError: String(sync.lastError ?? "").slice(0, 1000),
      usedCache: sync.usedCache === true,
      cachedEntries: [],
      disabledSourceIds: Array.isArray(sync.disabledSourceIds)
        ? sync.disabledSourceIds
            .filter((value): value is string => typeof value === "string")
            .slice(0, 100)
        : [],
    };
  }
  base.schemaVersion = 10;
  return base;
};
export const exportJson = (data: AppData) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `抽卡规划-${new Date().toLocaleDateString("en-CA")}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
