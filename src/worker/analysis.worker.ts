import { analyze } from "../engine/probability";
import { simulate } from "../engine/simulation";
import type { AppData, Plan } from "../domain/types";

self.onmessage = (
  event: MessageEvent<{ data: AppData; plan: Plan; token: number }>,
) => {
  const { data, plan, token } = event.data;
  try {
    const deadline = Date.now() + 45_000;
    const exact = analyze(data, plan, { deadline });
    const simulation = simulate(
      data,
      plan,
      data.settings.simulations,
      data.settings.seed,
      { deadline },
    );
    self.postMessage({ token, exact, simulation });
  } catch (error) {
    self.postMessage({
      token,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
