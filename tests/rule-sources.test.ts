import { describe, expect, it } from "vitest";
import { modeledConsolidatedChance } from "../src/engine/probability";
import {
  defaultRules,
  officialRules,
  restoreLegacyRules,
  setRuleSourceEnabled,
} from "../src/rules/profiles";

describe("规则来源补丁", () => {
  it("默认启用五个可撤销补丁且拟合官方综合概率", () => {
    expect(defaultRules.enabledSourceIds).toHaveLength(5);
    expect(modeledConsolidatedChance(defaultRules.channels.agent)).toBeCloseTo(
      defaultRules.channels.agent.officialConsolidatedChance,
      5,
    );
    expect(modeledConsolidatedChance(defaultRules.channels.engine)).toBeCloseTo(
      defaultRules.channels.engine.officialConsolidatedChance,
      5,
    );
  });

  it("停用 GachaData 只回滚角色逐抽曲线", () => {
    const edited = structuredClone(defaultRules);
    edited.channels.engine.rateSteps[0]!.probability = 0.123456;
    const next = setRuleSourceEnabled(
      edited,
      "gachadata-agent-soft-pity",
      false,
    );
    expect(next.channels.agent.rateSteps).toEqual([]);
    expect(next.channels.engine.rateSteps[0]!.probability).toBe(0.123456);
    expect(next.channels.agent.hardPity).toBe(90);
  });

  it("停用 ZZZ Database 只回滚音擎逐抽曲线", () => {
    const next = setRuleSourceEnabled(
      defaultRules,
      "zzzdb-engine-soft-pity",
      false,
    );
    expect(next.channels.engine.rateSteps).toEqual([]);
    expect(next.channels.agent.rateSteps.length).toBeGreaterThan(0);
  });

  it("停用 Icy Veins 只回滚跨目标限定保证", () => {
    const next = setRuleSourceEnabled(
      defaultRules,
      "icyveins-guarantee-carry",
      false,
    );
    expect(next.channels.agent.guaranteeCarriesAcrossTargets).toBe(false);
    expect(next.channels.engine.guaranteeCarriesAcrossTargets).toBe(false);
    expect(next.channels.agent.pityCarriesAcrossTargets).toBe(true);
  });

  it("官方基线和更新前快照均可恢复", () => {
    expect(officialRules.enabledSourceIds).toEqual([]);
    const legacy = restoreLegacyRules();
    expect(legacy.profileId).toBe("legacy-example-2026-09-15");
    expect(legacy.channels.agent.rateSteps).toEqual([]);
    expect(legacy.channels.agent.guaranteeCarriesAcrossTargets).toBe(true);
  });
});
