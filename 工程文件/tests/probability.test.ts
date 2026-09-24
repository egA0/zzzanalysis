import { describe, expect, it } from "vitest";
import { initialData } from "../src/domain/data";
import {
  analyze,
  coverageLine,
  targetDistribution,
  transition,
} from "../src/engine/probability";
import { simulate } from "../src/engine/simulation";
import type { ChannelRule, Target } from "../src/domain/types";

const simple: ChannelRule = {
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
const target = (channel: "agent" | "engine", copies = 1): Target => ({
  id: `${channel}-${copies}`,
  name: "目标",
  channel,
  copies,
  priority: 1,
  maxPulls: 12,
  targetVersion: "3.2",
  targetPhase: 2,
  stopDate: "2099-01-01",
  continueOnSuccess: true,
  skipped: false,
});
describe("状态转移", () => {
  it("概率守恒、硬保底边界", () => {
    expect(
      transition(simple, { pity: 0, guaranteed: false }).reduce(
        (v, x) => v + x.probability,
        0,
      ),
    ).toBeCloseTo(1);
    expect(
      transition(simple, { pity: 2, guaranteed: false }).reduce(
        (v, x) => v + x.probability,
        0,
      ),
    ).toBeCloseTo(1);
    expect(() => transition(simple, { pity: 3, guaranteed: false })).toThrow();
  });
  it("保证状态下一次 S 必出目标，歪后继承状态", () => {
    expect(
      targetDistribution(simple, { pity: 2, guaranteed: true }, 1, 1)[0],
    ).toMatchObject({ pulls: 1, success: true, probability: 1 });
    const misses = targetDistribution(
      simple,
      { pity: 2, guaranteed: false },
      1,
      1,
    );
    expect(misses.find((x) => !x.success)?.state.guaranteed).toBe(true);
    expect(misses.reduce((v, x) => v + x.probability, 0)).toBeCloseTo(1);
  });
  it("关闭歪后保证时最坏需求无有限上界", () => {
    const rule = { ...simple, guaranteeAfterMiss: false };
    const misses = targetDistribution(
      rule,
      { pity: 2, guaranteed: false },
      1,
      1,
    );
    expect(misses.find((x) => !x.success)?.state.guaranteed).toBe(false);
    const data = initialData();
    data.rules.channels.agent = rule;
    data.resources.encrypted = 6;
    data.plans[0]!.targets = [target("agent")];
    expect(analyze(data, data.plans[0]!).worst).toBeNull();
    expect(analyze(data, data.plans[0]!).deficit).toBeNull();
  });
  it("零抽与非法输入", () => {
    expect(
      targetDistribution(simple, { pity: 0, guaranteed: false }, 1, 0)[0]
        ?.success,
    ).toBe(false);
    expect(() =>
      targetDistribution(simple, { pity: -1, guaranteed: false }, 1, 2),
    ).toThrow();
    expect(() =>
      targetDistribution(simple, { pity: 0, guaranteed: false }, 1, 999999),
    ).toThrow();
  });
  it("成功覆盖线在概率不足时不可达", () => {
    expect(coverageLine([{ pulls: 1, probability: 0.7 }], 0.75)).toBeNull();
    expect(
      coverageLine(
        [
          { pulls: 1, probability: 0.7 },
          { pulls: 2, probability: 0.3 },
        ],
        0.9,
      ),
    ).toBe(2);
  });
});
describe("副产物模拟", () => {
  it("抽取过程中累积副产物并兑换成后续抽数", () => {
    const data = initialData();
    data.rules.channels.agent = { ...simple };
    data.resources.encrypted = 1;
    data.rules.conversion.signalAfterglowPerTape = 20;
    data.settings.gachaProceeds = {
      enabled: true,
      agentAfterglowPerPull: 20,
      agentResidualPerPull: 0,
      engineAfterglowPerPull: 0,
      engineResidualPerPull: 0,
    };
    data.plans[0]!.targets = [target("agent")];
    data.plans[0]!.targets[0]!.maxPulls = 2;
    const result = simulate(data, data.plans[0]!, 100, 1);
    expect(result.probability).toBe(0);
    expect(result.mean).toBe(2);
    expect(result.meanReturnedPulls).toBe(2);
  });
});
describe("完整规划", () => {
  it("真实量级双频道目标仍能精确计算", () => {
    const data = initialData();
    data.resources.encrypted = 340;
    const plan = data.plans[0]!;
    plan.targets = [
      { ...target("agent"), maxPulls: 180 },
      { ...target("engine"), maxPulls: 160 },
    ];
    const result = analyze(data, plan);
    expect(result.probability).toBeGreaterThan(0);
    expect(result.probability).toBeLessThanOrEqual(1);
    expect(
      result.distribution.reduce((v, x) => v + x.probability, 0),
    ).toBeCloseTo(1, 6);
  }, 30000);
  it("资源不足、足够覆盖最坏情况与两个频道", () => {
    const data = initialData();
    data.rules.channels.agent = simple;
    data.rules.channels.engine = simple;
    const plan = data.plans[0]!;
    plan.targets = [target("agent"), target("engine")];
    expect(analyze(data, plan).probability).toBe(0);
    expect(analyze(data, plan).successLines.p75).toBeNull();
    data.resources.encrypted = 12;
    expect(analyze(data, plan).probability).toBeCloseTo(1);
    expect(analyze(data, plan).worst).toBe(12);
    expect(analyze(data, plan).deficit).toBe(0);
    expect(analyze(data, plan).successLines.p95).not.toBeNull();
  });
  it("连续角色、模拟与精确结果一致", () => {
    const data = initialData();
    data.rules.channels.agent = { ...simple, hardPity: 4, baseChance: 0.15 };
    data.resources.encrypted = 14;
    const plan = data.plans[0]!;
    plan.targets = [target("agent"), target("agent")];
    const exact = analyze(data, plan).probability;
    const mc = simulate(data, plan, 50000, 123);
    expect(Math.abs(exact - mc.probability)).toBeLessThan(0.015);
    expect(exact).toBeGreaterThan(0);
  });
  it("跨目标垫数继承开关与模拟保持一致", () => {
    const data = initialData();
    data.rules.channels.agent = simple;
    data.pity.agent.count = 1;
    data.resources.encrypted = 2;
    const plan = data.plans[0]!;
    plan.targets = [
      { ...target("agent"), id: "first", maxPulls: 1 },
      { ...target("agent"), id: "second", maxPulls: 1 },
    ];
    const carried = analyze(data, plan).targetProbabilities[1]!;
    data.rules.channels.agent = { ...simple, pityCarriesAcrossTargets: false };
    const reset = analyze(data, plan).targetProbabilities[1]!;
    expect(carried).toBeGreaterThan(reset);
    expect(simulate(data, plan, 20000, 11).probability).toBeCloseTo(
      analyze(data, plan).probability,
      2,
    );
  });
  it("跨目标限定保证状态可分别配置", () => {
    const data = initialData();
    data.rules.channels.agent = simple;
    data.pity.agent.count = 2;
    data.resources.encrypted = 4;
    const plan = data.plans[0]!;
    plan.targets = [
      { ...target("agent"), id: "first", maxPulls: 1 },
      { ...target("agent"), id: "second", maxPulls: 3 },
    ];
    const carried = analyze(data, plan).targetProbabilities[1]!;
    data.rules.channels.agent = {
      ...simple,
      guaranteeCarriesAcrossTargets: false,
    };
    const reset = analyze(data, plan).targetProbabilities[1]!;
    expect(carried).toBeGreaterThan(reset);
  });
  it("接近硬保底且已保证时的理论最坏需求扣除垫数", () => {
    const data = initialData();
    data.rules.channels.agent = simple;
    data.pity.agent.count = 2;
    data.pity.agent.guaranteed = true;
    data.resources.encrypted = 1;
    const plan = data.plans[0]!;
    plan.targets = [{ ...target("agent"), maxPulls: 1 }];
    const result = analyze(data, plan);
    expect(result.worst).toBe(1);
    expect(result.probability).toBe(1);
    expect(result.successLines.p95).toBe(1);
  });
  it("关闭收入、跨日期与重叠日期保持守恒", () => {
    const data = initialData();
    data.rules.channels.agent = simple;
    data.incomes[0]!.amount = 3000;
    data.incomes[0]!.end = "2099-01-01";
    const plan = data.plans[0]!;
    plan.targets = [target("agent")];
    expect(analyze(data, plan).probability).toBe(0);
    data.incomes[0]!.enabled = true;
    data.settings.includeEstimates = true;
    expect(analyze(data, plan).probability).toBeGreaterThan(0);
  });
});
