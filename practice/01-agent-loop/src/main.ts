// AI 提供的运行入口。
import { runAgent } from "./agent-loop.ts";
import { createMockModel } from "./mock-model.ts";
import type { Scenario } from "./mock-model.ts";

const scenario = process.argv[2] ?? "normal";
const scenarios: Scenario[] = ["normal", "unknown", "endless", "direct"];
if (!scenarios.includes(scenario as Scenario)) {
  console.error(`场景必须为：${scenarios.join(", ")}`);
  process.exitCode = 1;
} else {
  try {
    let count = 0;
    const result = await runAgent({
      input: "请计算 2 + 3",
      model: createMockModel(scenario as Scenario),
      maxSteps: 3,
      getFollowUpMessage: () => {
        count++;
        return count === 0 ? "请计算 2 + 3" : "";
      },
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
