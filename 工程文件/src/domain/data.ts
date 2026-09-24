import { t } from "../i18n";
import { defaultRules } from "../rules/profiles";
import type {
  AppData,
  Channel,
  Income,
  Resources,
  Rules,
  Target,
} from "./types";
import { estimatedVersionPullsUntil } from "../data/version-resources";
import { bundledBanners } from "../data/banner-history";
import { bundledVersionResources } from "../data/version-resources";
import { bundledAnnouncedCharacters } from "../data/announced-characters";

export { defaultRules };

export const today = () => new Date().toLocaleDateString("en-CA");
export const id = (): string => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
};
export const nonnegative = (value: unknown, max = 1_000_000_000): number => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max)
    throw new Error(`请输入 0 至 ${max} 的数字`);
  return n;
};
export const initialData = (): AppData => {
  const date = today();
  const planId = id();
  return {
    schemaVersion: 10,
    resources: {
      film: 0,
      encrypted: 0,
      original: 0,
      other: 0,
      signalAfterglow: 0,
      signalResidual: 0,
      includeMoney: false,
      moneyBudget: 0,
    },
    pity: {
      agent: { count: 0, guaranteed: false, lastResult: "none" },
      engine: { count: 0, guaranteed: false, lastResult: "none" },
    },
    specialPlans: {
      rescreening: {
        periodId: "custom",
        targetName: "自选复映角色",
        pity: 0,
        standardGuaranteed: false,
        specialGuaranteeAvailable: true,
        discountAvailable: true,
        useDiscount: true,
        copies: 1,
        maxTapes: 0,
      },
      reverberation: {
        periodId: "custom",
        targetName: "自选复刻音擎",
        pity: 0,
        standardGuaranteed: false,
        specialGuaranteeAvailable: true,
        discountAvailable: true,
        useDiscount: true,
        copies: 1,
        maxTapes: 0,
      },
    },
    rules: structuredClone(defaultRules),
    banners: structuredClone(bundledBanners),
    announcedCharacters: structuredClone(bundledAnnouncedCharacters),
    bannerSync: {
      lastCheckedAt: "",
      lastSuccessAt: "",
      lastError: "",
      cacheUpdatedAt: "",
      usedCache: false,
      cachedBanners: [],
      pendingChanges: [],
      updateBatches: [],
      disabledSourceIds: [],
    },
    incomes: [
      {
        id: id(),
        name: "日常（自行核对）",
        source: "",
        category: "daily",
        amount: 0,
        unit: "film",
        start: date,
        end: date,
        everyDays: 1,
        certainty: "estimated",
        enabled: false,
      },
      {
        id: id(),
        name: "周常",
        source: "",
        category: "weekly",
        amount: 0,
        unit: "film",
        start: date,
        end: date,
        everyDays: 7,
        certainty: "estimated",
        enabled: false,
      },
      {
        id: id(),
        name: "活动",
        source: "",
        category: "event",
        amount: 0,
        unit: "film",
        start: date,
        end: date,
        everyDays: 0,
        certainty: "estimated",
        enabled: false,
      },
      {
        id: id(),
        name: "版本更新",
        source: "",
        category: "version",
        amount: 0,
        unit: "film",
        start: date,
        end: date,
        everyDays: 0,
        certainty: "estimated",
        enabled: false,
      },
      {
        id: id(),
        name: "兑换码",
        source: "",
        category: "code",
        amount: 0,
        unit: "film",
        start: date,
        end: date,
        everyDays: 0,
        certainty: "estimated",
        enabled: false,
      },
      {
        id: id(),
        name: "月卡",
        source: "",
        category: "monthly",
        amount: 0,
        unit: "film",
        start: date,
        end: date,
        everyDays: 1,
        certainty: "estimated",
        enabled: false,
      },
      {
        id: id(),
        name: "战令",
        source: "",
        category: "pass",
        amount: 0,
        unit: "film",
        start: date,
        end: date,
        everyDays: 0,
        certainty: "estimated",
        enabled: false,
      },
      {
        id: id(),
        name: "3.2 七日登录奖励（达到等级并完成登录）",
        source: "https://zenless.hoyoverse.com/zh-cn/news/166000?catchSpider=1",
        category: "event",
        amount: 10,
        unit: "tape",
        start: "2026-09-09",
        end: "2026-10-20",
        everyDays: 0,
        certainty: "confirmed",
        enabled: false,
      },
    ],
    versionResources: structuredClone(bundledVersionResources),
    resourceProgress: {},
    versionResourceSync: {
      lastCheckedAt: "",
      lastSuccessAt: "",
      lastError: "",
      usedCache: false,
      cachedEntries: [],
      disabledSourceIds: [],
    },
    plans: [{ id: planId, name: "我的规划", targets: [] }],
    activePlanId: planId,
    settings: {
      includeEstimates: true,
      gachaProceeds: {
        enabled: true,
        agentAfterglowPerPull: 0,
        agentResidualPerPull: 0,
        engineAfterglowPerPull: 0,
        engineResidualPerPull: 0,
      },
      simulations: 1000,
      seed: 20260915,
      theme: "dark",
      language: "zh-CN",
    },
  };
};
export const currentPulls = (r: Resources, rules: Rules) =>
  Math.floor(r.film / rules.conversion.filmPerTape) +
  Math.floor(r.other / rules.conversion.otherPerTape) +
  Math.floor(r.signalAfterglow / rules.conversion.signalAfterglowPerTape) +
  Math.floor(r.signalResidual / rules.conversion.signalResidualPerTape) +
  r.encrypted;

/** Worst-case featured pulls for a target when starting from a fresh pity. */
export const channelMaxPulls = (
  rules: Rules,
  channel: Channel,
  copies: number,
) =>
  Math.min(
    1200,
    copies *
      rules.channels[channel].hardPity *
      (rules.channels[channel].guaranteeAfterMiss ? 2 : 1),
  );

/** Default editable cap for a visible target, including its optional signature W-Engine. */
export const targetMaxPulls = (
  data: AppData,
  target: Pick<
    Target,
    "channel" | "copies" | "includeSignatureEngine" | "signatureEngineCopies"
  >,
) =>
  Math.min(
    1200,
    channelMaxPulls(data.rules, target.channel, target.copies) +
      (target.channel === "agent" && target.includeSignatureEngine === true
        ? channelMaxPulls(
            data.rules,
            "engine",
            target.signatureEngineCopies ?? 1,
          )
        : 0),
  );

const parseDay = (day: string): number => {
  const time = Date.parse(`${day}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !Number.isFinite(time) ||
    new Date(time).toISOString().slice(0, 10) !== day
  )
    throw new Error("日期不合法");
  return Math.floor(time / 86400000);
};
export const incomeUntil = (
  incomes: Income[],
  deadline: string,
  rules: Rules,
  includeEstimates: boolean,
) => {
  const limit = parseDay(deadline);
  let confirmed = 0;
  let estimated = 0;
  for (const income of incomes) {
    if (!income.enabled) continue;
    nonnegative(income.amount);
    const start = parseDay(income.start);
    const end = Math.min(parseDay(income.end), limit);
    if (end < start) continue;
    const origin = parseDay(income.start);
    const first =
      income.everyDays > 0
        ? origin +
          Math.ceil((start - origin) / income.everyDays) * income.everyDays
        : start;
    if (first > end) continue;
    const count =
      income.everyDays > 0
        ? Math.floor((end - first) / income.everyDays) + 1
        : 1;
    const pulls =
      (count * income.amount) /
      (income.unit === "film" ? rules.conversion.filmPerTape : 1);
    if (income.certainty === "confirmed") confirmed += pulls;
    else estimated += pulls;
  }
  return {
    confirmed,
    estimated,
    included: Math.floor(confirmed + (includeEstimates ? estimated : 0)),
  };
};
export const availableAt = (data: AppData, date: string) =>
  currentPulls(data.resources, data.rules) +
  incomeUntil(data.incomes, date, data.rules, data.settings.includeEstimates)
    .included +
  (data.settings.includeEstimates ? estimatedVersionPullsUntil(data, date) : 0);
export const channelName = (channel: Channel) => t(channel);
