import type {
  ChannelRule,
  Pity,
  SpecialChannelRule,
  SpecialPlanState,
} from "../domain/types";
import { drawChance, quantile } from "./probability";
import { rng, wilson } from "./simulation";

export type SpecialDrawState = {
  pity: number;
  standardGuaranteed: boolean;
  specialGuaranteeAvailable: boolean;
};
type SpecialDrawOutcome = {
  state: SpecialDrawState;
  featured: boolean;
  probability: number;
};
type LocalState = SpecialDrawState & {
  copies: number;
  searches: number;
  tapes: number;
};
export type SpecialAnalysis = {
  probability: number;
  meanSearches: number;
  meanTapes: number;
  medianTapes: number;
  p90Tapes: number;
  p95Tapes: number;
  worstSearches: number | null;
  worstTapes: number | null;
  exploredStates: number;
  distribution: {
    tapes: number;
    searches: number;
    success: boolean;
    probability: number;
  }[];
};

const key = (state: LocalState) =>
  `${state.pity}/${+state.standardGuaranteed}/${+state.specialGuaranteeAvailable}/${state.copies}/${state.searches}/${state.tapes}`;
const add = (
  map: Map<string, { state: LocalState; probability: number }>,
  state: LocalState,
  probability: number,
) => {
  const id = key(state);
  const current = map.get(id);
  if (current) current.probability += probability;
  else map.set(id, { state, probability });
};
export const validateSpecialRule = (rule: SpecialChannelRule) => {
  if (rule.mechanic !== "first-s-selected-v1")
    throw new Error(`不支持的特殊频道状态机：${String(rule.mechanic)}`);
  for (const flag of [
    rule.usesBaseChannelRates,
    rule.specialFirstSGuaranteed,
    rule.specialGuaranteeSeparate,
  ]) {
    if (typeof flag !== "boolean") throw new Error("特殊频道规则开关不合法");
  }
  for (const relation of Object.values(rule.inheritance.regular)) {
    if (relation !== "independent" && relation !== "shared")
      throw new Error("特殊频道与普通频道的继承关系不合法");
  }
  for (const scope of [rule.inheritance.selection, rule.inheritance.period]) {
    for (const relation of Object.values(scope)) {
      if (relation !== "carry" && relation !== "reset")
        throw new Error("特殊频道状态继承关系不合法");
    }
  }
  if (
    !Number.isInteger(rule.discountSearches) ||
    !Number.isInteger(rule.discountCost) ||
    rule.discountSearches < 0 ||
    rule.discountSearches > 100 ||
    rule.discountCost < 0 ||
    rule.discountCost > rule.discountSearches
  )
    throw new Error("特殊频道折扣配置不合法");
};

const carryOr = <T>(relation: "carry" | "reset", current: T, reset: T) =>
  relation === "carry" ? current : reset;

export const changeSpecialSelection = (
  plan: SpecialPlanState,
  rule: SpecialChannelRule,
  targetName: string,
): SpecialPlanState => {
  validateSpecialRule(rule);
  return {
    ...plan,
    targetName,
    pity: carryOr(rule.inheritance.selection.pity, plan.pity, 0),
    standardGuaranteed: carryOr(
      rule.inheritance.selection.standardGuarantee,
      plan.standardGuaranteed,
      false,
    ),
    specialGuaranteeAvailable: carryOr(
      rule.inheritance.selection.specialGuarantee,
      plan.specialGuaranteeAvailable,
      true,
    ),
    discountAvailable: carryOr(
      rule.inheritance.selection.discount,
      plan.discountAvailable,
      true,
    ),
  };
};

export const resetSpecialPeriod = (
  plan: SpecialPlanState,
  rule: SpecialChannelRule,
  periodId: string,
  targetName: string,
): SpecialPlanState => ({
  ...plan,
  periodId,
  targetName,
  pity: carryOr(rule.inheritance.period.pity, plan.pity, 0),
  standardGuaranteed: carryOr(
    rule.inheritance.period.standardGuarantee,
    plan.standardGuaranteed,
    false,
  ),
  specialGuaranteeAvailable: carryOr(
    rule.inheritance.period.specialGuarantee,
    plan.specialGuaranteeAvailable,
    true,
  ),
  discountAvailable: carryOr(
    rule.inheritance.period.discount,
    plan.discountAvailable,
    true,
  ),
});

export const syncSpecialFromRegular = (
  plan: SpecialPlanState,
  rule: SpecialChannelRule,
  regular: Pity,
): SpecialPlanState => {
  validateSpecialRule(rule);
  return {
    ...plan,
    pity:
      rule.inheritance.regular.pity === "shared" ? regular.count : plan.pity,
    standardGuaranteed:
      rule.inheritance.regular.standardGuarantee === "shared"
        ? regular.guaranteed
        : plan.standardGuaranteed,
  };
};

export const specialTransition = (
  base: ChannelRule,
  special: SpecialChannelRule,
  state: SpecialDrawState,
): SpecialDrawOutcome[] => {
  validateSpecialRule(special);
  const chance = drawChance(base, {
    pity: state.pity,
    guaranteed: state.standardGuaranteed,
  });
  const specialHit =
    special.specialFirstSGuaranteed && state.specialGuaranteeAvailable;
  const featuredChance = specialHit
    ? 1
    : state.standardGuaranteed
      ? 1
      : base.featuredChance;
  const nextSpecial = specialHit ? false : state.specialGuaranteeAvailable;
  return [
    {
      state: { ...state, pity: state.pity + 1 },
      featured: false,
      probability: 1 - chance,
    },
    {
      state: {
        pity: 0,
        specialGuaranteeAvailable: nextSpecial,
        standardGuaranteed: specialHit
          ? state.standardGuaranteed
          : base.guaranteeAfterMiss,
      },
      featured: false,
      probability: chance * (1 - featuredChance),
    },
    {
      state: {
        pity: 0,
        specialGuaranteeAvailable: nextSpecial,
        standardGuaranteed: specialHit ? state.standardGuaranteed : false,
      },
      featured: true,
      probability: chance * featuredChance,
    },
  ].filter((outcome) => outcome.probability > 0);
};

const drawLayer = (
  active: Map<string, { state: LocalState; probability: number }>,
  base: ChannelRule,
  special: SpecialChannelRule,
  copies: number,
  tapeCost: number,
) => {
  const next = new Map<string, { state: LocalState; probability: number }>();
  for (const entry of active.values()) {
    for (const outcome of specialTransition(base, special, entry.state)) {
      const state: LocalState = {
        ...outcome.state,
        copies: Math.min(
          copies,
          entry.state.copies + (outcome.featured ? 1 : 0),
        ),
        searches: entry.state.searches + 1,
        tapes: entry.state.tapes + tapeCost,
      };
      add(next, state, entry.probability * outcome.probability);
    }
  }
  return next;
};

export const specialWorstCase = (
  base: ChannelRule,
  special: SpecialChannelRule,
  plan: SpecialPlanState,
) => {
  if (!special.usesBaseChannelRates) return { searches: null, tapes: null };
  let searches = 0;
  let pity = plan.pity;
  let guaranteed = plan.standardGuaranteed;
  let remaining = plan.copies;
  if (
    special.specialFirstSGuaranteed &&
    plan.specialGuaranteeAvailable &&
    remaining > 0
  ) {
    searches += base.hardPity - pity;
    pity = 0;
    remaining--;
  }
  while (remaining > 0) {
    if (guaranteed || base.featuredChance === 1) {
      searches += base.hardPity - pity;
    } else {
      if (!base.guaranteeAfterMiss) return { searches: null, tapes: null };
      searches += base.hardPity - pity + base.hardPity;
    }
    pity = 0;
    guaranteed = false;
    remaining--;
  }
  const discounted =
    plan.useDiscount && plan.discountAvailable && special.discountSearches > 0;
  const actualSearches = discounted
    ? Math.max(searches, special.discountSearches)
    : searches;
  const tapes = discounted
    ? actualSearches - special.discountSearches + special.discountCost
    : actualSearches;
  return { searches: actualSearches, tapes };
};

export const analyzeSpecial = (
  base: ChannelRule,
  special: SpecialChannelRule,
  plan: SpecialPlanState,
): SpecialAnalysis => {
  validateSpecialRule(special);
  if (!special.usesBaseChannelRates)
    throw new Error("特殊频道基础概率补丁未启用，无法计算");
  if (
    !Number.isInteger(plan.pity) ||
    plan.pity < 0 ||
    plan.pity >= base.hardPity
  )
    throw new Error("特殊频道垫数不合法");
  if (!Number.isInteger(plan.copies) || plan.copies < 1 || plan.copies > 6)
    throw new Error("特殊频道目标数量必须为 1 至 6");
  if (
    !Number.isInteger(plan.maxTapes) ||
    plan.maxTapes < 0 ||
    plan.maxTapes > 1200
  )
    throw new Error("特殊频道预算必须为 0 至 1200 张");

  let active = new Map<string, { state: LocalState; probability: number }>();
  add(
    active,
    {
      pity: plan.pity,
      standardGuaranteed: plan.standardGuaranteed,
      specialGuaranteeAvailable: plan.specialGuaranteeAvailable,
      copies: 0,
      searches: 0,
      tapes: 0,
    },
    1,
  );
  const outcomes: { state: LocalState; probability: number }[] = [];
  let exploredStates = 1;
  const useDiscount =
    plan.useDiscount && plan.discountAvailable && special.discountSearches > 0;
  if (useDiscount) {
    if (plan.maxTapes < special.discountCost)
      throw new Error(`折扣十连至少需要 ${special.discountCost} 张母带`);
    for (let i = 0; i < special.discountSearches; i++) {
      active = drawLayer(
        active,
        base,
        special,
        plan.copies,
        i === special.discountSearches - 1 ? special.discountCost : 0,
      );
      exploredStates += active.size;
    }
  }

  while (active.size) {
    const next = new Map<string, { state: LocalState; probability: number }>();
    for (const entry of active.values()) {
      if (
        entry.state.copies >= plan.copies ||
        entry.state.tapes >= plan.maxTapes
      ) {
        outcomes.push(entry);
        continue;
      }
      const layer = new Map<
        string,
        { state: LocalState; probability: number }
      >();
      add(layer, entry.state, entry.probability);
      const advanced = drawLayer(layer, base, special, plan.copies, 1);
      for (const result of advanced.values()) {
        if (
          result.state.copies >= plan.copies ||
          result.state.tapes >= plan.maxTapes
        )
          outcomes.push(result);
        else add(next, result.state, result.probability);
      }
    }
    active = next;
    exploredStates += active.size;
    if (exploredStates > 500000)
      throw new Error("特殊频道状态空间过大，请降低预算或目标数量");
  }

  const grouped = new Map<
    string,
    { tapes: number; searches: number; success: boolean; probability: number }
  >();
  let probability = 0;
  let meanSearches = 0;
  let meanTapes = 0;
  for (const outcome of outcomes) {
    const success = outcome.state.copies >= plan.copies;
    const mass = outcome.probability;
    const id = `${outcome.state.tapes}/${outcome.state.searches}/${+success}`;
    const current = grouped.get(id);
    if (current) current.probability += mass;
    else
      grouped.set(id, {
        tapes: outcome.state.tapes,
        searches: outcome.state.searches,
        success,
        probability: mass,
      });
    if (success) probability += mass;
    meanSearches += outcome.state.searches * mass;
    meanTapes += outcome.state.tapes * mass;
  }
  const distribution = [...grouped.values()].sort(
    (a, b) => a.tapes - b.tapes || a.searches - b.searches,
  );
  const tapeDistribution = distribution.map((entry) => ({
    pulls: entry.tapes,
    probability: entry.probability,
  }));
  const worst = specialWorstCase(base, special, plan);
  return {
    probability,
    meanSearches,
    meanTapes,
    medianTapes: quantile(tapeDistribution, 0.5),
    p90Tapes: quantile(tapeDistribution, 0.9),
    p95Tapes: quantile(tapeDistribution, 0.95),
    worstSearches: worst.searches,
    worstTapes: worst.tapes,
    exploredStates,
    distribution,
  };
};

export const simulateSpecial = (
  base: ChannelRule,
  special: SpecialChannelRule,
  plan: SpecialPlanState,
  iterations: number,
  seed: number,
) => {
  if (!Number.isInteger(iterations) || iterations < 100 || iterations > 200000)
    throw new Error("模拟次数必须为 100 至 200000");
  const random = rng(seed);
  let successes = 0;
  let searchesTotal = 0;
  let tapesTotal = 0;
  for (let run = 0; run < iterations; run++) {
    const state: SpecialDrawState = {
      pity: plan.pity,
      standardGuaranteed: plan.standardGuaranteed,
      specialGuaranteeAvailable: plan.specialGuaranteeAvailable,
    };
    let copies = 0;
    let searches = 0;
    let tapes = 0;
    const draw = () => {
      const roll = random();
      let cumulative = 0;
      for (const outcome of specialTransition(base, special, state)) {
        cumulative += outcome.probability;
        if (roll <= cumulative) {
          Object.assign(state, outcome.state);
          if (outcome.featured) copies++;
          searches++;
          return;
        }
      }
    };
    const useDiscount =
      plan.useDiscount &&
      plan.discountAvailable &&
      special.discountSearches > 0 &&
      plan.maxTapes >= special.discountCost;
    if (useDiscount) {
      for (let i = 0; i < special.discountSearches; i++) draw();
      tapes += special.discountCost;
    }
    while (copies < plan.copies && tapes < plan.maxTapes) {
      draw();
      tapes++;
    }
    if (copies >= plan.copies) successes++;
    searchesTotal += searches;
    tapesTotal += tapes;
  }
  return {
    probability: successes / iterations,
    meanSearches: searchesTotal / iterations,
    meanTapes: tapesTotal / iterations,
    interval: wilson(successes, iterations),
    iterations,
    seed,
  };
};
