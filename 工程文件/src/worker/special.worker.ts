import type {
  ChannelRule,
  SpecialChannelRule,
  SpecialPlanState,
} from "../domain/types";
import { analyzeSpecial, simulateSpecial } from "../engine/special";

self.onmessage = (
  event: MessageEvent<{
    base: ChannelRule;
    special: SpecialChannelRule;
    plan: SpecialPlanState;
    iterations: number;
    seed: number;
  }>,
) => {
  try {
    const { base, special, plan, iterations, seed } = event.data;
    self.postMessage({
      exact: analyzeSpecial(base, special, plan),
      simulation: simulateSpecial(base, special, plan, iterations, seed),
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
