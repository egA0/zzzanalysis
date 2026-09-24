import { expect, it } from "vitest";
import { availableAt, initialData } from "../src/domain/data";
import { targetDateForSelection } from "../src/data/version-resources";
import {
  futureVersionList,
  targetCatalog,
  targetPredictions,
  topTargetPrediction,
} from "../src/data/target-predictions";

it("已实装角色有最多三个复刻候选版本", () => {
  const data = initialData();
  const predictions = targetPredictions(data, "艾莲", "agent", 3, "2026-09-18");
  expect(predictions).toHaveLength(3);
  expect(predictions[0]?.kind).toBe("rerun");
  expect(predictions.every((item) => item.probability > 0)).toBe(true);
});

it("官方已公布但未出现在卡池记录的角色可进入目录并预测实装", () => {
  const data = initialData();
  const entry = targetCatalog(data, "2026-09-18").find(
    (item) => item.name === "赛维里安·洛威尔",
  );
  expect(entry?.status).toBe("announced");
  expect(topTargetPrediction(data, "赛维里安·洛威尔", "agent")?.kind).toBe(
    "debut",
  );
});

it("未来版本会进入目标版本选项", () => {
  const data = initialData();
  expect(futureVersionList(data).slice(0, 3)).toEqual(["3.3", "3.4", "3.5"]);
  expect(futureVersionList(data)).toContain("4.0");
});

it("版本资源预测会按目标日期累计", () => {
  const data = initialData();
  data.settings.includeEstimates = true;
  const phaseTwoDate = targetDateForSelection(data, "3.3", 2);
  expect(availableAt(data, phaseTwoDate)).toBeGreaterThan(
    availableAt(data, "2026-10-20"),
  );
});
