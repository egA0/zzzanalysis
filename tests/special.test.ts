import { describe, expect, it } from "vitest";
import type {
  ChannelRule,
  SpecialChannelRule,
  SpecialPlanState,
} from "../src/domain/types";
import {
  analyzeSpecial,
  changeSpecialSelection,
  resetSpecialPeriod,
  simulateSpecial,
  specialTransition,
  specialWorstCase,
  syncSpecialFromRegular,
} from "../src/engine/special";
import { defaultRules, setRuleSourceEnabled } from "../src/rules/profiles";

const base: ChannelRule = {
  hardPity: 3,
  featuredChance: 0.5,
  baseChance: 0,
  officialConsolidatedChance: 1 / 3,
  officialFeaturedConsolidatedChance: 2 / 9,
  guaranteeAfterMiss: true,
  pityCarriesAcrossTargets: true,
  guaranteeCarriesAcrossTargets: true,
  rateSteps: [],
  confidence: "test",
};
const special: SpecialChannelRule = {
  mechanic: "first-s-selected-v1",
  baseChannel: "agent",
  usesBaseChannelRates: true,
  specialFirstSGuaranteed: true,
  specialGuaranteeSeparate: true,
  inheritance: {
    regular: {
      pity: "independent",
      standardGuarantee: "independent",
    },
    selection: {
      pity: "carry",
      standardGuarantee: "carry",
      specialGuarantee: "carry",
      discount: "carry",
    },
    period: {
      pity: "carry",
      standardGuarantee: "carry",
      specialGuarantee: "reset",
      discount: "reset",
    },
  },
  discountSearches: 10,
  discountCost: 8,
  confidence: "test",
};
const plan = (change: Partial<SpecialPlanState> = {}): SpecialPlanState => ({
  periodId: "test",
  targetName: "目标",
  pity: 0,
  standardGuaranteed: false,
  specialGuaranteeAvailable: true,
  discountAvailable: false,
  useDiscount: false,
  copies: 1,
  maxTapes: 6,
  ...change,
});

describe("特殊频道状态转移", () => {
  it("首次 S 必出目标且不消耗原有标准保证", () => {
    const outcomes = specialTransition(base, special, {
      pity: 2,
      standardGuaranteed: true,
      specialGuaranteeAvailable: true,
    });
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({
      featured: true,
      probability: 1,
      state: {
        pity: 0,
        standardGuaranteed: true,
        specialGuaranteeAvailable: false,
      },
    });
  });

  it("特殊保证用完后回到标准 50/50 和歪后保证", () => {
    const outcomes = specialTransition(base, special, {
      pity: 2,
      standardGuaranteed: false,
      specialGuaranteeAvailable: false,
    });
    expect(outcomes.find((x) => x.featured)?.probability).toBe(0.5);
    expect(outcomes.find((x) => !x.featured)?.state.standardGuaranteed).toBe(
      true,
    );
  });

  it("切换自选目标时按状态机保留同一期状态", () => {
    const next = changeSpecialSelection(
      plan({
        targetName: "旧目标",
        pity: 2,
        standardGuaranteed: true,
        specialGuaranteeAvailable: false,
        discountAvailable: false,
      }),
      special,
      "新目标",
    );
    expect(next).toMatchObject({
      targetName: "新目标",
      pity: 2,
      standardGuaranteed: true,
      specialGuaranteeAvailable: false,
      discountAvailable: false,
    });
  });

  it("与普通限定频道独立时不导入普通垫数和保证", () => {
    const current = plan({ pity: 1, standardGuaranteed: false });
    expect(
      syncSpecialFromRegular(current, special, {
        count: 2,
        guaranteed: true,
        lastResult: "off-banner",
      }),
    ).toMatchObject({ pity: 1, standardGuaranteed: false });
  });

  it("首个折扣十连强制完成 10 抽并消耗 8 张", () => {
    const result = analyzeSpecial(
      base,
      special,
      plan({
        discountAvailable: true,
        useDiscount: true,
        maxTapes: 8,
      }),
    );
    expect(result.probability).toBe(1);
    expect(result.meanSearches).toBe(10);
    expect(result.meanTapes).toBe(8);
    expect(result.worstSearches).toBe(10);
    expect(result.worstTapes).toBe(8);
  });

  it("预算不足以购买折扣十连时拒绝计算", () => {
    expect(() =>
      analyzeSpecial(
        base,
        special,
        plan({
          discountAvailable: true,
          useDiscount: true,
          maxTapes: 7,
        }),
      ),
    ).toThrow("至少需要 8");
  });
});

describe("特殊频道规划", () => {
  it("标准保证与特殊保证同时存在时可连续保证两个目标", () => {
    const result = analyzeSpecial(
      base,
      special,
      plan({
        pity: 2,
        standardGuaranteed: true,
        copies: 2,
        maxTapes: 4,
      }),
    );
    expect(result.worstSearches).toBe(4);
    expect(result.probability).toBe(1);
  });

  it("精确算法与模拟基本一致", () => {
    const input = plan({
      specialGuaranteeAvailable: false,
      copies: 1,
      maxTapes: 5,
    });
    const exact = analyzeSpecial(base, special, input);
    const simulated = simulateSpecial(base, special, input, 50000, 77);
    expect(Math.abs(exact.probability - simulated.probability)).toBeLessThan(
      0.015,
    );
    expect(Math.abs(exact.meanTapes - simulated.meanTapes)).toBeLessThan(0.03);
  });

  it("周期重置恢复特殊保证和折扣，并按配置保留普通状态", () => {
    const previous = plan({
      periodId: "2.5",
      pity: 2,
      standardGuaranteed: true,
      specialGuaranteeAvailable: false,
      discountAvailable: false,
    });
    const next = resetSpecialPeriod(previous, special, "3.1", "新目标");
    expect(next).toMatchObject({
      periodId: "3.1",
      targetName: "新目标",
      pity: 2,
      standardGuaranteed: true,
      specialGuaranteeAvailable: true,
      discountAvailable: true,
    });
  });

  it("拒绝 BitTopup 后关闭概率模型并只回滚跨期常规保证", () => {
    const rules = setRuleSourceEnabled(
      defaultRules,
      "bittopup-special-rate-and-guarantee",
      false,
    );
    expect(rules.specialChannels.rescreening.usesBaseChannelRates).toBe(false);
    expect(
      rules.specialChannels.rescreening.inheritance.period.standardGuarantee,
    ).toBe("reset");
    expect(rules.specialChannels.rescreening.inheritance.period.pity).toBe(
      "carry",
    );
    expect(() =>
      analyzeSpecial(
        rules.channels.agent,
        rules.specialChannels.rescreening,
        plan(),
      ),
    ).toThrow("基础概率补丁未启用");
  });

  it("拒绝 ZZZ Wiki 后只回滚跨期垫数", () => {
    const rules = setRuleSourceEnabled(
      defaultRules,
      "zzzwiki-special-period-pity",
      false,
    );
    expect(rules.specialChannels.rescreening.inheritance.period.pity).toBe(
      "reset",
    );
    expect(
      rules.specialChannels.rescreening.inheritance.period.standardGuarantee,
    ).toBe("carry");
    expect(rules.specialChannels.rescreening.usesBaseChannelRates).toBe(true);
  });

  it("无歪后保证时理论最坏需求无有限上界", () => {
    expect(
      specialWorstCase(
        { ...base, guaranteeAfterMiss: false },
        special,
        plan({ specialGuaranteeAvailable: false }),
      ),
    ).toEqual({ searches: null, tapes: null });
  });
});
