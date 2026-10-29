import type { RunOptions, RunResult, Message, ModelReply } from "./types.ts";

export function executeToolCall(toolCall: {
  id: string;
  name: string;
  arguments: { a: number; b: number };
}): {
  toolCallId: string;
  result?: unknown;
  isError?: boolean;
  errorMessage?: string;
} {
  switch (toolCall.name) {
    case "add": {
      try {
        const { a, b } = toolCall.arguments;
        if (
          !Number.isFinite(a) ||
          !Number.isFinite(b) ||
          Object.keys(toolCall.arguments).length !== 2
        ) {
          return {
            isError: true,
            errorMessage: `参数 a 或 b 不是有效数字`,
            toolCallId: toolCall.id,
          };
        }

        const result = a + b;

        return { toolCallId: toolCall.id, result };
      } catch (error) {
        return {
          isError: true,
          errorMessage: String(error),
          toolCallId: toolCall.id,
        };
      }
    }
    default: {
      return {
        isError: true,
        errorMessage: `tool ${toolCall.name} 不存在，请调用其它工具`,
        toolCallId: toolCall.id,
      };
    }
  }
}

// 以下为 AI 提供的接口；上方工具执行逻辑保留用户原实现。
// 本次由你实现此函数。协议和验收标准见 README.md。
export async function runAgent(options: RunOptions): Promise<RunResult> {
  // console.log(options.input)
  let context: Message[] = [...options.messages];

  const model = options.model;

  for (let step = 0; step < options.maxSteps; step++) {
    const modelReply: ModelReply = await model(context);
    context.push(modelReply);
    if (modelReply.call) {
      const toolResult = executeToolCall(modelReply.call);
      context.push({ role: "tool", output: toolResult });
      continue;
    }

    if (modelReply.role === "assistant" && !modelReply.call) {
      if (options.getFollowUpMessage) {
        const followUpMessage = options.getFollowUpMessage();
        if (followUpMessage) {
          context.push({ role: "user", content: followUpMessage });
          continue;
        }
      }
      return {
        status: "completed",
        messages: context,
        steps: step + 1,
      };
    }
  }
  return {
    status: "max_steps",
    messages: context,
    steps: options.maxSteps,
  };
  throw new Error("待实现 runAgent：请完成本轮 Agent 流程");
}
