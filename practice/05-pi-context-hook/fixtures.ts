// AI 提供模拟消息与模型；没有真实网络请求。
import { createAssistantMessageEventStream } from "../../repos/pi-mono/packages/ai/src/index.ts";
import type { AssistantMessage, Message, Model, UserMessage } from "../../repos/pi-mono/packages/ai/src/types.ts";
import type { StreamFn } from "../../repos/pi-mono/packages/agent/src/types.ts";

export const model: Model<"openai-responses"> = {
  id: "mock", name: "mock", api: "openai-responses", provider: "openai",
  baseUrl: "https://example.invalid", reasoning: false, input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 8192, maxTokens: 2048,
};
export function user(content: string): UserMessage {
  return { role: "user", content, timestamp: 0 };
}
export function assistant(text: string): AssistantMessage {
  return {
    role: "assistant", content: [{ type: "text", text }], api: "openai-responses",
    provider: "openai", model: "mock", stopReason: "stop", timestamp: 0,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  };
}
export function mockStream(requests: Message[][]): StreamFn {
  return (_model, context) => {
    requests.push(structuredClone(context.messages));
    const stream = createAssistantMessageEventStream();
    queueMicrotask(() => stream.push({ type: "done", reason: "stop", message: assistant("mock answer") }));
    return stream;
  };
}
export function toolRound(): Message[] {
  return [
    user("执行两个工具"),
    { ...assistant(""), stopReason: "toolUse", content: [
      { type: "toolCall", id: "a", name: "lookup", arguments: {} },
      { type: "toolCall", id: "b", name: "lookup", arguments: {} },
    ] },
    { role: "toolResult", toolCallId: "a", toolName: "lookup", content: [{ type: "text", text: "A" }], isError: false, timestamp: 0 },
    { role: "toolResult", toolCallId: "b", toolName: "lookup", content: [{ type: "text", text: "B" }], isError: false, timestamp: 0 },
    assistant("工具完成"),
  ];
}
