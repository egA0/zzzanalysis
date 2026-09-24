import { availableAt } from "../domain/data";
import { drawChance } from "./probability";
import type { AppData, Plan } from "../domain/types";

export const rng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
export const wilson = (success: number, count: number): [number, number] => {
  if (count <= 0) throw new Error("模拟次数必须大于零");
  const p = success / count;
  const z = 1.96;
  const d = 1 + (z * z) / count;
  const center = (p + (z * z) / (2 * count)) / d;
  const spread =
    (z * Math.sqrt((p * (1 - p)) / count + (z * z) / (4 * count * count))) / d;
  return [Math.max(0, center - spread), Math.min(1, center + spread)];
};
export type SimulatedProceeds = {
  signalAfterglow: number;
  signalResidual: number;
};

const initialProceeds = (data: AppData): SimulatedProceeds => ({
  signalAfterglow:
    data.resources.signalAfterglow %
    data.rules.conversion.signalAfterglowPerTape,
  signalResidual:
    data.resources.signalResidual % data.rules.conversion.signalResidualPerTape,
});

const addPullsFromProceeds = (
  wallet: SimulatedProceeds,
  data: AppData,
): number => {
  let pulls = 0;
  const afterglow = data.rules.conversion.signalAfterglowPerTape;
  const residual = data.rules.conversion.signalResidualPerTape;
  if (wallet.signalAfterglow >= afterglow) {
    const exchanged = Math.floor(wallet.signalAfterglow / afterglow);
    wallet.signalAfterglow -= exchanged * afterglow;
    pulls += exchanged;
  }
  if (wallet.signalResidual >= residual) {
    const exchanged = Math.floor(wallet.signalResidual / residual);
    wallet.signalResidual -= exchanged * residual;
    pulls += exchanged;
  }
  return pulls;
};

const proceedsPerPull = (data: AppData, channel: "agent" | "engine") =>
  data.settings.gachaProceeds.enabled
    ? {
        signalAfterglow:
          channel === "agent"
            ? data.settings.gachaProceeds.agentAfterglowPerPull
            : data.settings.gachaProceeds.engineAfterglowPerPull,
        signalResidual:
          channel === "agent"
            ? data.settings.gachaProceeds.agentResidualPerPull
            : data.settings.gachaProceeds.engineResidualPerPull,
      }
    : { signalAfterglow: 0, signalResidual: 0 };

export const simulate = (
  data: AppData,
  plan: Plan,
  iterations: number,
  seed: number,
) => {
  if (!Number.isInteger(iterations) || iterations < 100 || iterations > 200000)
    throw new Error("模拟次数必须为 100 至 200000");
  const random = rng(seed);
  const targets = plan.targets.filter((t) => !t.skipped);
  for (let i = 1; i < targets.length; i++) {
    if (targets[i]!.stopDate < targets[i - 1]!.stopDate)
      throw new Error("目标停止日期须按抽取顺序先后排列");
  }
  let success = 0;
  let spentTotal = 0;
  let returnedPullsTotal = 0;
  for (let run = 0; run < iterations; run++) {
    const state = {
      agent: {
        pity: data.pity.agent.count,
        guaranteed: data.pity.agent.guaranteed,
      },
      engine: {
        pity: data.pity.engine.count,
        guaranteed: data.pity.engine.guaranteed,
      },
    };
    const wallet = initialProceeds(data);
    let returnedPulls = 0;
    let spent = 0;
    let completed = 0;
    const seen = { agent: false, engine: false };
    for (const target of targets) {
      let invested = 0;
      const drawTarget = (channel: "agent" | "engine", copies: number) => {
        const rule = data.rules.channels[channel];
        const s = state[channel];
        if (seen[channel]) {
          if (!rule.pityCarriesAcrossTargets) s.pity = 0;
          if (!rule.guaranteeCarriesAcrossTargets) s.guaranteed = false;
        }
        seen[channel] = true;
        const proceeds = proceedsPerPull(data, channel);
        let gained = 0;
        const available = () =>
          availableAt(data, target.stopDate) + returnedPulls;
        while (
          invested < target.maxPulls &&
          gained < copies &&
          spent < available()
        ) {
          invested++;
          spent++;
          wallet.signalAfterglow += proceeds.signalAfterglow;
          wallet.signalResidual += proceeds.signalResidual;
          returnedPulls += addPullsFromProceeds(wallet, data);
          const gotS = random() < drawChance(rule, s);
          if (!gotS) {
            s.pity++;
            continue;
          }
          s.pity = 0;
          if (s.guaranteed || random() < rule.featuredChance) {
            s.guaranteed = false;
            gained++;
          } else s.guaranteed = rule.guaranteeAfterMiss;
        }
        return gained === copies;
      };
      const gotAgent = drawTarget(target.channel, target.copies);
      const gotEngine =
        target.channel === "agent" && target.includeSignatureEngine === true
          ? drawTarget("engine", target.signatureEngineCopies ?? 1)
          : true;
      if (gotAgent && gotEngine) {
        completed++;
        if (!target.continueOnSuccess) break;
      }
    }
    spentTotal += spent;
    returnedPullsTotal += returnedPulls;
    if (completed === targets.length) success++;
  }
  return {
    probability: success / iterations,
    mean: spentTotal / iterations,
    meanReturnedPulls: returnedPullsTotal / iterations,
    interval: wilson(success, iterations),
    iterations,
    seed,
  };
};
