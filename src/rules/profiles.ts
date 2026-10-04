import defaultRaw from "./default.json";
import legacyRaw from "./baseline-2026-09-15.json";
import officialRaw from "./official.json";
import patchesRaw from "./source-patches.json";
import type { Rules } from "../domain/types";

export type RuleSource = {
  id: string;
  name: string;
  kind: "third-party-model" | "third-party-derived" | "third-party-rule";
  url: string;
  checkedAt: string;
  confidence: string;
  summary: string;
  enabledByDefault: boolean;
  appliesTo: string[];
  patch: Record<string, unknown>;
};
export type OfficialRuleSource = {
  id: string;
  name: string;
  url: string;
  checkedAt: string;
  confidence: string;
  summary: string;
  fields: string[];
};

export const officialRules = officialRaw as Rules;
export const legacyRules = legacyRaw as Rules;
export const defaultRules = defaultRaw as Rules;
export const officialRuleSources =
  patchesRaw.officialSources as OfficialRuleSource[];
export const ruleSources = patchesRaw.sources as RuleSource[];

const getPath = (value: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);

const setPath = (value: object, path: string, next: unknown) => {
  const parts = path.split(".");
  let current = value as Record<string, unknown>;
  for (const key of parts.slice(0, -1)) {
    const child = current[key];
    if (!child || typeof child !== "object")
      throw new Error(`规则路径不存在：${path}`);
    current = child as Record<string, unknown>;
  }
  current[parts.at(-1)!] = structuredClone(next);
};

const merge = (
  target: Record<string, unknown>,
  patch: Record<string, unknown>,
) => {
  for (const [key, value] of Object.entries(patch)) {
    const current = target[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      current &&
      typeof current === "object" &&
      !Array.isArray(current)
    ) {
      merge(
        current as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else target[key] = structuredClone(value);
  }
};

const updateLabels = (rules: Rules) => {
  const enabled = new Set(rules.enabledSourceIds);
  const agentSoft = enabled.has("gachadata-agent-soft-pity");
  const engineSoft = enabled.has("zzzdb-engine-soft-pity");
  const carry = enabled.has("icyveins-guarantee-carry");
  const specialPeriodPity = enabled.has("zzzwiki-special-period-pity");
  const specialRates = enabled.has("bittopup-special-rate-and-guarantee");
  rules.profileId = enabled.size
    ? "official-plus-selected-third-party-2026-09-18"
    : "official-only-2026-09-18";
  rules.verifiedAt = "2026-09-18";
  rules.modelLabel = enabled.size
    ? `官方基础规则 + ${enabled.size} 个可撤销第三方补丁`
    : "仅官方公开规则；逐抽递增曲线和跨目标限定保证未启用";
  rules.channels.agent.confidence =
    "基础/综合概率、90 抽、50%、歪后保证与同类型计数累计为官方；" +
    (agentSoft ? "逐抽曲线采用 GachaData 拟合；" : "未配置软保底逐抽曲线；") +
    (carry
      ? "跨目标限定保证采用 Icy Veins 资料。"
      : "跨目标限定保证按未确认处理。");
  rules.channels.engine.confidence =
    "基础/综合概率、80 抽、75%、歪后保证与同类型计数累计为官方；" +
    (engineSoft
      ? "第 65 抽起点来自 ZZZ Database，增幅按官方综合概率拟合；"
      : "未配置软保底逐抽曲线；") +
    (carry
      ? "跨目标限定保证采用 Icy Veins 资料。"
      : "跨目标限定保证按未确认处理。");
  for (const special of Object.values(rules.specialChannels)) {
    special.confidence =
      "首次 S 特殊保证、与普通限定独立、特殊/常规保证分离、同期开关目标不重置、首十连折扣及每期重置为官方；" +
      (specialPeriodPity
        ? "跨特殊期垫数采用 ZZZ Wiki 转录资料；"
        : "跨特殊期垫数按重置处理；") +
      (specialRates
        ? "基础概率、硬保底和跨特殊期常规保证采用 BitTopup 资料。"
        : "基础概率未启用，特殊概率计算不可用；跨特殊期常规保证按重置处理。");
  }
};

export const applyRuleSourceSelection = (
  current: Rules,
  enabledSourceIds: string[],
): Rules => {
  const known = new Set(ruleSources.map((source) => source.id));
  const enabled = [...new Set(enabledSourceIds)].filter((id) => known.has(id));
  const next = structuredClone(current);
  for (const source of ruleSources) {
    for (const path of source.appliesTo)
      setPath(next, path, getPath(officialRules, path));
  }
  for (const source of ruleSources) {
    if (enabled.includes(source.id))
      merge(next as unknown as Record<string, unknown>, source.patch);
  }
  next.enabledSourceIds = enabled;
  updateLabels(next);
  return next;
};

export const setRuleSourceEnabled = (
  current: Rules,
  sourceId: string,
  enabled: boolean,
) => {
  const source = ruleSources.find((item) => item.id === sourceId);
  if (!source) throw new Error(`未知规则来源：${sourceId}`);
  const next = structuredClone(current);
  const selected = new Set(next.enabledSourceIds);
  if (enabled) {
    merge(next as unknown as Record<string, unknown>, source.patch);
    selected.add(sourceId);
  } else {
    selected.delete(sourceId);
    for (const path of source.appliesTo) {
      setPath(next, path, getPath(officialRules, path));
      for (const other of ruleSources) {
        if (selected.has(other.id) && other.appliesTo.includes(path))
          setPath(next, path, getPath(other.patch, path));
      }
    }
  }
  next.enabledSourceIds = [...selected];
  updateLabels(next);
  return next;
};

export const restoreOfficialRules = (): Rules => structuredClone(officialRules);
export const restoreLegacyRules = (): Rules => structuredClone(legacyRules);

export const looksLikeLegacyDefault = (value: Partial<Rules>) => {
  const agent = value.channels?.agent;
  const engine = value.channels?.engine;
  return (
    agent?.hardPity === 90 &&
    agent.baseChance === 0.006 &&
    agent.featuredChance === 0.5 &&
    agent.rateSteps?.length === 0 &&
    engine?.hardPity === 80 &&
    engine.baseChance === 0.01 &&
    engine.featuredChance === 0.75 &&
    engine.rateSteps?.length === 0
  );
};
