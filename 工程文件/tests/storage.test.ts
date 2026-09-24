import { expect, it } from "vitest";
import { initialData, nonnegative } from "../src/domain/data";
import { migrate } from "../src/storage/data";

it("旧版本迁移并补齐设置", () => {
  const old = initialData() as unknown as Record<string, unknown>;
  old.schemaVersion = 2;
  delete old.settings;
  const oldRules = old.rules as Record<string, unknown>;
  delete oldRules.enabledSourceIds;
  delete oldRules.profileId;
  const channels = oldRules.channels as Record<
    string,
    { rateSteps: unknown[] }
  >;
  channels.agent!.rateSteps = [];
  channels.engine!.rateSteps = [];
  const migrated = migrate(old);
  expect(migrated.schemaVersion).toBe(10);
  expect(migrated.settings.includeEstimates).toBe(true);
  expect(migrated.rules.enabledSourceIds).toContain(
    "gachadata-agent-soft-pity",
  );
  expect(migrated.specialPlans.rescreening.specialGuaranteeAvailable).toBe(
    true,
  );
});
it("第四版特殊频道布尔字段迁移为明确继承关系", () => {
  const old = initialData() as unknown as Record<string, unknown>;
  old.schemaVersion = 4;
  const rules = old.rules as Record<string, unknown>;
  const specialChannels = rules.specialChannels as Record<
    string,
    Record<string, unknown>
  >;
  specialChannels.rescreening = {
    baseChannel: "agent",
    usesBaseChannelRates: true,
    specialFirstSGuaranteed: true,
    specialGuaranteeSeparate: true,
    specialGuaranteeResetsEachPeriod: true,
    pityIndependentFromRegular: true,
    pityCarriesAcrossSelections: true,
    pityCarriesAcrossPeriods: true,
    standardGuaranteeCarriesAcrossPeriods: false,
    discountSearches: 10,
    discountCost: 8,
    discountResetsEachPeriod: true,
    confidence: "legacy",
  };
  const migrated = migrate(old);
  expect(migrated.rules.specialChannels.rescreening.inheritance).toEqual({
    regular: { pity: "independent", standardGuarantee: "independent" },
    selection: {
      pity: "carry",
      standardGuarantee: "carry",
      specialGuarantee: "carry",
      discount: "carry",
    },
    period: {
      pity: "carry",
      standardGuarantee: "reset",
      specialGuarantee: "reset",
      discount: "reset",
    },
  });
});
it("旧版自定义规则不会被第三方补丁覆盖", () => {
  const old = initialData() as unknown as Record<string, unknown>;
  old.schemaVersion = 2;
  const oldRules = old.rules as Record<string, unknown>;
  delete oldRules.enabledSourceIds;
  delete oldRules.profileId;
  const channels = oldRules.channels as Record<
    string,
    { baseChance: number; rateSteps: unknown[] }
  >;
  channels.agent!.baseChance = 0.02;
  channels.agent!.rateSteps = [{ fromPull: 10, probability: 0.2 }];
  const migrated = migrate(old);
  expect(migrated.rules.profileId).toBe("custom-legacy-import");
  expect(migrated.rules.enabledSourceIds).toEqual([]);
  expect(migrated.rules.channels.agent.baseChance).toBe(0.02);
  expect(migrated.rules.channels.agent.rateSteps).toEqual([
    { fromPull: 10, probability: 0.2 },
  ]);
});
it("非法文本、负数、超大值被拒绝", () => {
  for (const value of ["oops", -1, 1e20])
    expect(() => nonnegative(value)).toThrow();
  const data = initialData();
  data.pity.agent.count = 90;
  expect(() => migrate(data)).toThrow();
});
it("坏规则与不存在日期被拒绝", () => {
  const bad = initialData();
  bad.rules.conversion.filmPerTape = 0;
  expect(() => migrate(bad)).toThrow();
  bad.rules.conversion.filmPerTape = 160;
  bad.banners[0]!.end = "2026-02-30";
  expect(() => migrate(bad)).toThrow();
  bad.banners[0]!.end = "2026-09-30";
  bad.resources.encrypted = 1.5;
  expect(() => migrate(bad)).toThrow();
});
