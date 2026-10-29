// AI 提供：只模拟模型响应，不执行工具、不维护 Agent 循环。
import type { Message, Model, ToolCall } from "./types.ts";

export type Scenario = "normal" | "unknown" | "endless" | "direct";

export function createMockModel(scenario: Scenario = "normal"): Model {
  return async (messages: readonly Message[]) => {
    if (scenario === "direct") {
      return { role: "assistant", content: "你好" };
    }

    const previous = messages.at(-1);
    if (scenario !== "endless" && previous?.role === "tool") {
      const { output } = previous;
      return {
        role: "assistant",
        content: output.isError
          ? `工具失败：${output.errorMessage}`
          : `计算结果：${output.result}`,
      };
    }

    const count = messages.filter((message) => message.role === "tool").length;
    const call: ToolCall = {
      id: `call-${count + 1}`,
      name: scenario === "unknown" ? "missing" : "add",
      arguments: { a: 2, b: 3 },
    };
    return { role: "assistant", content: "准备调用工具", call };
  };
}
