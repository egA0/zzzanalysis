import { availableAt } from "../domain/data";
import type {
  AppData,
  Channel,
  ChannelRule,
  Pity,
  Plan,
  Target,
} from "../domain/types";
import { checkCalculationBudget, type CalculationOptions } from "./runtime";
import { formatDate } from "../domain/date";

export type DrawState = { pity: number; guaranteed: boolean };
export type DrawOutcome = {
  state: DrawState;
  featured: boolean;
  probability: number;
};
export const validateRule = (rule: ChannelRule) => {
  for (const flag of [
    rule.guaranteeAfterMiss,
    rule.pityCarriesAcrossTargets,
    rule.guaranteeCarriesAcrossTargets,
  ]) {
    if (typeof flag !== "boolean") throw new Error("继承与保证规则必须为开关");
  }
  if (
    !Number.isInteger(rule.hardPity) ||
    rule.hardPity < 1 ||
    rule.hardPity > 200
  )
    throw new Error("硬保底必须为 1 至 200");
  for (const p of [
    rule.featuredChance,
    rule.baseChance,
    rule.officialConsolidatedChance,
    rule.officialFeaturedConsolidatedChance,
    ...rule.rateSteps.map((s) => s.probability),
  ]) {
    if (!Number.isFinite(p) || p < 0 || p > 1)
      throw new Error("概率必须为 0 至 1");
  }
  for (const step of rule.rateSteps) {
    if (
      !Number.isInteger(step.fromPull) ||
      step.fromPull < 1 ||
      step.fromPull > rule.hardPity
    )
      throw new Error("递增起点不合法");
  }
};
export const drawChance = (rule: ChannelRule, state: DrawState): number => {
  validateRule(rule);
  return drawChancePrepared(prepareRule(rule), state);
};

export type PreparedRule = {
  hardPity: number;
  featuredChance: number;
  guaranteeAfterMiss: boolean;
  chanceByPity: Float64Array;
};

/** Validate once and precompute per-pity probabilities for calculation hot loops. */
export const prepareRule = (rule: ChannelRule): PreparedRule => {
  validateRule(rule);
  const chanceByPity = new Float64Array(rule.hardPity);
  for (let pity = 0; pity < rule.hardPity; pity++) {
    const pull = pity + 1;
    if (pull === rule.hardPity) {
      chanceByPity[pity] = 1;
      continue;
    }
    let chance = rule.baseChance;
    for (const step of rule.rateSteps) {
      if (pull >= step.fromPull) chance = step.probability;
    }
    chanceByPity[pity] = chance;
  }
  return {
    hardPity: rule.hardPity,
    featuredChance: rule.featuredChance,
    guaranteeAfterMiss: rule.guaranteeAfterMiss,
    chanceByPity,
  };
};

export const drawChancePrepared = (
  rule: PreparedRule,
  state: DrawState,
): number => {
  if (
    !Number.isInteger(state.pity) ||
    state.pity < 0 ||
    state.pity >= rule.hardPity
  )
    throw new Error("垫数超出合法范围");
  return rule.chanceByPity[state.pity]!;
};
export const modeledConsolidatedChance = (rule: ChannelRule): number => {
  const prepared = prepareRule(rule);
  let survival = 1;
  let expected = 0;
  for (let pity = 0; pity < rule.hardPity; pity++) {
    expected += survival;
    survival *= 1 - drawChancePrepared(prepared, { pity, guaranteed: false });
  }
  return 1 / expected;
};
export const transition = (
  rule: ChannelRule,
  state: DrawState,
): DrawOutcome[] => {
  validateRule(rule);
  return transitionPrepared(prepareRule(rule), state);
};

export const transitionPrepared = (
  rule: PreparedRule,
  state: DrawState,
): DrawOutcome[] => {
  const chance = drawChancePrepared(rule, state);
  const featured = state.guaranteed ? 1 : rule.featuredChance;
  return [
    {
      state: { pity: state.pity + 1, guaranteed: state.guaranteed },
      featured: false,
      probability: 1 - chance,
    },
    {
      state: { pity: 0, guaranteed: rule.guaranteeAfterMiss },
      featured: false,
      probability: chance * (1 - featured),
    },
    {
      state: { pity: 0, guaranteed: false },
      featured: true,
      probability: chance * featured,
    },
  ].filter((o) => o.probability > 0);
};

export type Outcome = {
  state: DrawState;
  pulls: number;
  success: boolean;
  probability: number;
};

type Progression = {
  active: Float64Array;
  successByPull: Float64Array;
  activeByPull?: Float64Array[];
};

const runProgression = (
  compiled: PreparedRule,
  initial: DrawState,
  copies: number,
  cap: number,
  options?: CalculationOptions,
  keepSnapshots = false,
): Progression => {
  if (!Number.isInteger(copies) || copies < 1 || copies > 6)
    throw new Error("目标数量必须为 1 至 6");
  if (!Number.isInteger(cap) || cap < 0 || cap > 1200)
    throw new Error("抽数上限必须为 0 至 1200");
  if (
    !Number.isInteger(initial.pity) ||
    initial.pity < 0 ||
    initial.pity >= compiled.hardPity
  )
    throw new Error("垫数超出合法范围");

  const stateCount = compiled.hardPity * 2 * copies;
  const indexOf = (pity: number, guaranteed: boolean, completed: number) =>
    (completed * 2 + (guaranteed ? 1 : 0)) * compiled.hardPity + pity;
  let active = new Float64Array(stateCount);
  active[indexOf(initial.pity, initial.guaranteed, 0)] = 1;
  const successByPull = new Float64Array(cap + 1);
  const activeByPull = keepSnapshots ? [active.slice()] : undefined;

  for (let pull = 1; pull <= cap; pull++) {
    if ((pull & 31) === 0) checkCalculationBudget(options);
    const next = new Float64Array(stateCount);
    let activeMass = 0;
    for (let completed = 0; completed < copies; completed++) {
      for (let guaranteedBit = 0; guaranteedBit <= 1; guaranteedBit++) {
        const guaranteed = guaranteedBit === 1;
        const base = (completed * 2 + guaranteedBit) * compiled.hardPity;
        for (let pity = 0; pity < compiled.hardPity; pity++) {
          const mass = active[base + pity]!;
          if (mass === 0) continue;
          activeMass += mass;
          const chance = compiled.chanceByPity[pity]!;
          const miss = mass * (1 - chance);
          if (miss > 0 && pity + 1 < compiled.hardPity) {
            next[base + pity + 1] = next[base + pity + 1]! + miss;
          }

          const hit = mass * chance;
          if (hit === 0) continue;
          const featured = guaranteed ? 1 : compiled.featuredChance;
          const off = hit * (1 - featured);
          if (off > 0) {
            const offIndex = indexOf(0, compiled.guaranteeAfterMiss, completed);
            next[offIndex] = next[offIndex]! + off;
          }
          const featuredMass = hit * featured;
          if (featuredMass > 0) {
            if (completed + 1 === copies) {
              successByPull[pull] = successByPull[pull]! + featuredMass;
            } else {
              const featuredIndex = indexOf(0, false, completed + 1);
              next[featuredIndex] = next[featuredIndex]! + featuredMass;
            }
          }
        }
      }
    }
    active = next;
    activeByPull?.push(active.slice());
    if (activeMass === 0 && !keepSnapshots) break;
  }
  return { active, successByPull, activeByPull };
};
type CombinedOutcome = {
  states: Partial<Record<Channel, DrawState>>;
  pulls: number;
  success: boolean;
  probability: number;
};

/**
 * Accumulate probability mass for outcomes that share a serialized state key.
 */
const add = <T>(
  map: Map<string, { state: T; probability: number }>,
  k: string,
  s: T,
  p: number,
) => {
  const existing = map.get(k);
  if (existing) existing.probability += p;
  else map.set(k, { state: s, probability: p });
};

// Absorbing Markov chain: outcomes retain pity/guarantee after both success and cap failure.
export const targetDistribution = (
  rule: ChannelRule,
  initial: DrawState,
  copies: number,
  cap: number,
  options?: CalculationOptions,
): Outcome[] => {
  return targetDistributionPrepared(
    prepareRule(rule),
    initial,
    copies,
    cap,
    options,
  );
};

const targetDistributionPrepared = (
  compiled: PreparedRule,
  initial: DrawState,
  copies: number,
  cap: number,
  options?: CalculationOptions,
): Outcome[] => {
  const progression = runProgression(compiled, initial, copies, cap, options);
  const { active, successByPull } = progression;

  const outputs: Outcome[] = [];
  for (let pull = 1; pull <= cap; pull++) {
    const probability = successByPull[pull]!;
    if (probability > 0) {
      outputs.push({
        state: { pity: 0, guaranteed: false },
        pulls: pull,
        success: true,
        probability,
      });
    }
  }
  for (let completed = 0; completed < copies; completed++) {
    for (let guaranteedBit = 0; guaranteedBit <= 1; guaranteedBit++) {
      const base = (completed * 2 + guaranteedBit) * compiled.hardPity;
      for (let pity = 0; pity < compiled.hardPity; pity++) {
        const probability = active[base + pity]!;
        if (probability === 0) continue;
        outputs.push({
          state: { pity, guaranteed: guaranteedBit === 1 },
          pulls: cap,
          success: false,
          probability,
        });
      }
    }
  }
  return outputs;
};
type Global = {
  spent: number;
  agent: DrawState;
  engine: DrawState;
  mask: number;
  stopped: boolean;
};
const globalKey = (s: Global) =>
  `${s.spent}/${s.agent.pity}/${+s.agent.guaranteed}/${s.engine.pity}/${+s.engine.guaranteed}/${s.mask}/${+s.stopped}`;
export type Analysis = {
  probability: number;
  targetProbabilities: number[];
  mean: number;
  median: number;
  p75: number;
  p90: number;
  p95: number;
  successLines: { p75: number | null; p90: number | null; p95: number | null };
  worst: number | null;
  deficit: number | null;
  distribution: { pulls: number; probability: number }[];
  exploredStates: number;
};
export const quantile = (
  entries: { pulls: number; probability: number }[],
  threshold: number,
) => {
  let cumulative = 0;
  for (const entry of [...entries].sort((a, b) => a.pulls - b.pulls)) {
    cumulative += entry.probability;
    if (cumulative + 1e-10 >= threshold) return entry.pulls;
  }
  return entries.at(-1)?.pulls ?? 0;
};
export const coverageLine = (
  entries: { pulls: number; probability: number }[],
  threshold: number,
): number | null => {
  let cumulative = 0;
  for (const entry of [...entries].sort((a, b) => a.pulls - b.pulls)) {
    cumulative += entry.probability;
    if (cumulative + 1e-10 >= threshold) return entry.pulls;
  }
  return null;
};
export const theoreticalWorst = (
  targets: Target[],
  data: AppData,
): number | null => {
  const seen = { agent: false, engine: false };
  let total = 0;
  const worstFor = (channel: Channel, copies: number): number | null => {
    const rule = data.rules.channels[channel];
    const first = !seen[channel];
    const pity = first ? data.pity[channel].count : 0;
    const guaranteed = first && data.pity[channel].guaranteed;
    const firstCopy =
      guaranteed || rule.featuredChance === 1
        ? rule.hardPity - pity
        : rule.guaranteeAfterMiss
          ? rule.hardPity - pity + rule.hardPity
          : null;
    const laterCopy =
      rule.featuredChance === 1
        ? rule.hardPity
        : rule.guaranteeAfterMiss
          ? 2 * rule.hardPity
          : null;
    if (firstCopy === null || (copies > 1 && laterCopy === null)) return null;
    seen[channel] = true;
    return firstCopy + (copies - 1) * (laterCopy ?? 0);
  };
  for (const target of targets.filter((t) => !t.skipped)) {
    const agent = worstFor(target.channel, target.copies);
    if (agent === null) return null;
    total += agent;
    if (target.channel === "agent" && target.includeSignatureEngine === true) {
      const engine = worstFor("engine", target.signatureEngineCopies ?? 1);
      if (engine === null) return null;
      total += engine;
    }
  }
  return total;
};

const usesChannel = (target: Target, channel: Channel) =>
  target.channel === channel ||
  (channel === "engine" &&
    target.channel === "agent" &&
    target.includeSignatureEngine === true);

const combinedDistribution = (
  data: AppData,
  target: Target,
  agent: DrawState,
  engine: DrawState,
  cap: number,
  preparedAgent: PreparedRule,
  preparedEngine: PreparedRule,
  options?: CalculationOptions,
): CombinedOutcome[] => {
  const agents = targetDistributionPrepared(
    preparedAgent,
    agent,
    target.copies,
    cap,
    options,
  );
  const outputs: CombinedOutcome[] = [];
  const engineProgression = runProgression(
    preparedEngine,
    engine,
    target.signatureEngineCopies ?? 1,
    cap,
    options,
    true,
  );
  const successByPull = new Map<number, number>();
  const engineFailures = new Map<
    string,
    { state: DrawState; probability: number }
  >();
  const agentFailures = new Map<
    string,
    { state: DrawState; probability: number }
  >();

  // Agent failure exhausts the shared budget, leaving no pulls for the engine.
  // Only successful agent outcomes need engine transitions; failures can be
  // aggregated by their retained agent state.
  for (const agentOutcome of agents) {
    if (!agentOutcome.success) {
      const failureKey = `${agentOutcome.state.pity}/${+agentOutcome.state.guaranteed}`;
      const existing = agentFailures.get(failureKey);
      if (existing) existing.probability += agentOutcome.probability;
      else
        agentFailures.set(failureKey, {
          state: agentOutcome.state,
          probability: agentOutcome.probability,
        });
      continue;
    }

    const remaining = Math.max(0, cap - agentOutcome.pulls);
    for (let enginePulls = 1; enginePulls <= remaining; enginePulls++) {
      const engineProbability = engineProgression.successByPull[enginePulls]!;
      if (engineProbability === 0) continue;
      const totalPulls = agentOutcome.pulls + enginePulls;
      successByPull.set(
        totalPulls,
        (successByPull.get(totalPulls) ?? 0) +
          agentOutcome.probability * engineProbability,
      );
    }
    const snapshot = engineProgression.activeByPull![remaining]!;
    const hardPity = data.rules.channels.engine.hardPity;
    const engineCopies = target.signatureEngineCopies ?? 1;
    for (let completed = 0; completed < engineCopies; completed++) {
      for (let guaranteedBit = 0; guaranteedBit <= 1; guaranteedBit++) {
        const base = (completed * 2 + guaranteedBit) * hardPity;
        for (let pity = 0; pity < hardPity; pity++) {
          const engineProbability = snapshot[base + pity]!;
          if (engineProbability === 0) continue;
          const probability = agentOutcome.probability * engineProbability;
          const failureKey = `${pity}/${guaranteedBit}`;
          const existing = engineFailures.get(failureKey);
          if (existing) existing.probability += probability;
          else
            engineFailures.set(failureKey, {
              state: { pity, guaranteed: guaranteedBit === 1 },
              probability,
            });
        }
      }
    }
  }

  for (const [pulls, probability] of successByPull) {
    outputs.push({
      states: {
        agent: { pity: 0, guaranteed: false },
        engine: { pity: 0, guaranteed: false },
      },
      pulls,
      success: true,
      probability,
    });
  }
  for (const failure of engineFailures.values()) {
    outputs.push({
      states: {
        agent: { pity: 0, guaranteed: false },
        engine: failure.state,
      },
      pulls: cap,
      success: false,
      probability: failure.probability,
    });
  }
  for (const failure of agentFailures.values()) {
    outputs.push({
      states: { agent: failure.state, engine },
      pulls: cap,
      success: false,
      probability: failure.probability,
    });
  }
  return outputs;
};
export const analyze = (
  data: AppData,
  plan: Plan,
  options?: CalculationOptions,
): Analysis => {
  const targets = plan.targets.filter((t) => !t.skipped);
  if (targets.length > 6)
    throw new Error("精确计算最多支持 6 个目标，请分成多套方案");
  for (let i = 1; i < targets.length; i++) {
    if (targets[i]!.stopDate < targets[i - 1]!.stopDate)
      throw new Error("目标停止日期须按抽取顺序先后排列");
  }
  const starting: Global = {
    spent: 0,
    agent: {
      pity: data.pity.agent.count,
      guaranteed: data.pity.agent.guaranteed,
    },
    engine: {
      pity: data.pity.engine.count,
      guaranteed: data.pity.engine.guaranteed,
    },
    mask: 0,
    stopped: false,
  };
  const preparedAgent = prepareRule(data.rules.channels.agent);
  const preparedEngine = prepareRule(data.rules.channels.engine);
  drawChancePrepared(preparedAgent, starting.agent);
  drawChancePrepared(preparedEngine, starting.engine);
  let frontier = new Map<string, { state: Global; probability: number }>();
  add(frontier, globalKey(starting), starting, 1);
  let exploredStates = 0;
  const worst = theoreticalWorst(targets, data);
  for (let index = 0; index < targets.length; index++) {
    checkCalculationBudget(options);
    const target = targets[index]!;
    if (!target.name.trim()) throw new Error("目标名称不能为空");
    if (
      !Number.isInteger(target.maxPulls) ||
      target.maxPulls < 0 ||
      target.maxPulls > 1200
    )
      throw new Error("目标投入上限必须为 0 至 1200");
    const next = new Map<string, { state: Global; probability: number }>();
    const cache = new Map<string, Outcome[]>();
    // Resource availability and prior channel usage are invariant across
    // frontier states, so compute them once per target.
    const available = availableAt(data, target.stopDate);
    const hadPreviousAgent = targets
      .slice(0, index)
      .some((t) => usesChannel(t, "agent"));
    const hadPreviousEngine = targets
      .slice(0, index)
      .some((t) => usesChannel(t, "engine"));
    const agentRule = data.rules.channels.agent;
    const engineRule = data.rules.channels.engine;
    const combo =
      target.channel === "agent" && target.includeSignatureEngine === true;
    for (const entry of frontier.values()) {
      if ((exploredStates & 255) === 0) checkCalculationBudget(options);
      const s = entry.state;
      if (s.stopped) {
        add(next, globalKey(s), s, entry.probability);
        continue;
      }
      const cap = Math.max(0, Math.min(target.maxPulls, available - s.spent));
      const agentInitial: DrawState = {
        pity:
          hadPreviousAgent && !agentRule.pityCarriesAcrossTargets
            ? 0
            : s.agent.pity,
        guaranteed:
          hadPreviousAgent && !agentRule.guaranteeCarriesAcrossTargets
            ? false
            : s.agent.guaranteed,
      };
      const engineInitial: DrawState = {
        pity:
          hadPreviousEngine && !engineRule.pityCarriesAcrossTargets
            ? 0
            : s.engine.pity,
        guaranteed:
          hadPreviousEngine && !engineRule.guaranteeCarriesAcrossTargets
            ? false
            : s.engine.guaranteed,
      };

      const cacheKey = `${target.channel}/${agentInitial.pity}/${+agentInitial.guaranteed}/${engineInitial.pity}/${+engineInitial.guaranteed}/${target.copies}/${target.signatureEngineCopies ?? 1}/${+combo}/${cap}`;
      let outcomes = cache.get(cacheKey) as Outcome[] | undefined;
      if (!outcomes) {
        outcomes = combo
          ? (combinedDistribution(
              data,
              target,
              agentInitial,
              engineInitial,
              cap,
              preparedAgent,
              preparedEngine,
              options,
            ) as unknown as Outcome[])
          : targetDistributionPrepared(
              target.channel === "engine" ? preparedEngine : preparedAgent,
              target.channel === "engine" ? engineInitial : agentInitial,
              target.copies,
              cap,
              options,
            );
        cache.set(cacheKey, outcomes);
      }
      for (const rawOutcome of outcomes) {
        const outcome = rawOutcome as Outcome & {
          states?: Partial<Record<Channel, DrawState>>;
        };
        const states = outcome.states;
        const updated: Global = {
          ...s,
          ...(states
            ? {
                agent: states.agent ?? s.agent,
                engine: states.engine ?? s.engine,
              }
            : { [target.channel]: outcome.state }),
          spent: s.spent + outcome.pulls,
          mask: s.mask | (outcome.success ? 1 << index : 0),
          stopped: outcome.success && !target.continueOnSuccess,
        };
        add(
          next,
          globalKey(updated),
          updated,
          entry.probability * outcome.probability,
        );
      }
    }
    frontier = next;
    exploredStates += frontier.size;
    if (frontier.size > 250000)
      throw new Error("状态空间过大；请降低投入上限或拆分方案");
  }
  const targetProbabilities = targets.map((_, i) =>
    [...frontier.values()].reduce(
      (v, x) => v + (x.state.mask & (1 << i) ? x.probability : 0),
      0,
    ),
  );
  const distributionMap = new Map<number, number>();
  const successMap = new Map<number, number>();
  let probability = 0;
  let mean = 0;
  for (const x of frontier.values()) {
    const mass = x.probability;
    mean += mass * x.state.spent;
    distributionMap.set(
      x.state.spent,
      (distributionMap.get(x.state.spent) ?? 0) + mass,
    );
    if (x.state.mask === (1 << targets.length) - 1) {
      probability += mass;
      successMap.set(
        x.state.spent,
        (successMap.get(x.state.spent) ?? 0) + mass,
      );
    }
  }
  const distribution = [...distributionMap].map(([pulls, p]) => ({
    pulls,
    probability: p,
  }));
  const successes = [...successMap].map(([pulls, p]) => ({
    pulls,
    probability: p,
  }));
  const lastDate = targets.at(-1)?.stopDate ?? formatDate();
  return {
    probability,
    targetProbabilities,
    mean,
    median: quantile(distribution, 0.5),
    p75: quantile(distribution, 0.75),
    p90: quantile(distribution, 0.9),
    p95: quantile(distribution, 0.95),
    successLines: {
      p75: coverageLine(successes, 0.75),
      p90: coverageLine(successes, 0.9),
      p95: coverageLine(successes, 0.95),
    },
    worst,
    deficit:
      worst === null ? null : Math.max(0, worst - availableAt(data, lastDate)),
    distribution: distribution.sort((a, b) => a.pulls - b.pulls),
    exploredStates,
  };
};
export const fromPity = (p: Pity): DrawState => ({
  pity: p.count,
  guaranteed: p.guaranteed,
});
export const targetChannel = (t: Target): Channel => t.channel;
