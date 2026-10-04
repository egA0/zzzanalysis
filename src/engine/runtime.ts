export type CalculationOptions = {
  deadline?: number;
};

export const checkCalculationBudget = (
  options: CalculationOptions | undefined,
) => {
  if (options?.deadline !== undefined && Date.now() >= options.deadline) {
    throw new Error("计算超过 45 秒，已停止；请降低模拟次数、预算或目标数量");
  }
};
