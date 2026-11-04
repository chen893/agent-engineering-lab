// AI 根据用户授权完成 Agent 接线、离线响应脚本及全部集成断言。
import {
  expect,
  it,
} from "../../repos/pi-mono/node_modules/vitest/dist/index.js";
import { Agent } from "../../repos/pi-mono/packages/agent/src/agent.ts";
import {
  fauxAssistantMessage,
  fauxToolCall,
  getCurrentTools,
  type TranscriptContext,
} from "../../repos/pi-mono/packages/ai/src/index.ts";
import { createFixture as createOfflineFixture } from "../09-mcp-tool-bridge/fixtures.ts";
import { createHistoryFixture } from "./fixtures.ts";
import createHistoryTools from "./history-tools.ts";

//重点看测试中第二个响应回调：它如何从实际 toolResult 中取得 source/entryId，再发起读取。
function getResult(context: TranscriptContext, toolCallId: string) {
  const result = context.messages
    .filter((message) => message.role === "toolResult")
    .find((message) => message.toolCallId === toolCallId);
  if (!result) throw new Error(`Missing tool result: ${toolCallId}`);
  expect(result.isError).toBe(false);
  const text = result.content.find((block) => block.type === "text");
  if (!text || text.type !== "text")
    throw new Error("Expected text tool result");
  return JSON.parse(text.text);
}

it("真实 Agent 从 search 结果定位 read，并在后续请求中收到全文", async () => {
  const offline = await createOfflineFixture();
  try {
    const history = createHistoryFixture();
    let agent: Agent | undefined;
    try {
      const tools = await createHistoryTools(history);
      agent = new Agent({
        streamFn: offline.streamFn,
        getApiKey: offline.getApiKey,
        initialState: { model: offline.model, tools },
      });
      offline.queueResponses(
        () =>
          fauxAssistantMessage(
            fauxToolCall(
              "search_history",
              { query: "Redis" },
              { id: "history-search" },
            ),
            { stopReason: "toolUse" },
          ),
        (context) => {
          // read 参数仅取自模型实际收到的 search 结果，不使用样例中的已知 ID。
          const { hits } = getResult(context, "history-search");
          expect(hits).toHaveLength(1);
          const { source, entryId } = hits[0];
          return fauxAssistantMessage(
            fauxToolCall(
              "read_history",
              { source, entryId },
              { id: "history-read" },
            ),
            { stopReason: "toolUse" },
          );
        },
        (context) => {
          const result = getResult(context, "history-read");
          return fauxAssistantMessage(
            `历史资料 [${result.source}/${result.entryId}]：${result.text}`,
          );
        },
      );

      await agent.prompt(
        "请查找旧会话里 Redis 缓存方案的讨论，读取原文并附来源。",
      );

      expect(offline.requests).toHaveLength(3);
      const [first, second, third] = offline.requests.map(
        (request) => request.context,
      );
      expect(
        getCurrentTools(first.messages)
          .map((tool) => tool.name)
          .sort(),
      ).toEqual(["read_history", "search_history"]);
      expect(
        first.messages.filter((message) => message.role === "toolResult"),
      ).toEqual([]);
      expect(JSON.stringify(first.messages)).not.toContain("缓存新分支");
      expect(JSON.stringify(first.messages)).not.toContain(
        "需要设置过期时间并保留来源",
      );

      const hit = getResult(second, "history-search").hits[0];
      const expectedText =
        "缓存新分支：使用 Redis。" + "需要设置过期时间并保留来源。".repeat(15);
      expect(hit).toEqual({
        source: "design",
        entryId: history.ids.decision,
        role: "assistant",
        preview: expectedText.slice(0, 120),
      });
      expect(hit).not.toHaveProperty("text");
      expect(JSON.stringify(second.messages)).not.toContain(expectedText);
      const readCall = third.messages
        .filter((message) => message.role === "assistant")
        .flatMap((message) => message.content)
        .find(
          (block) => block.type === "toolCall" && block.id === "history-read",
        );
      expect(readCall).toMatchObject({
        name: "read_history",
        arguments: { source: hit.source, entryId: hit.entryId },
      });
      expect(getResult(third, "history-read")).toEqual({
        source: hit.source,
        entryId: hit.entryId,
        role: "assistant",
        text: expectedText,
      });
      expect(expectedText.length).toBeGreaterThan(hit.preview.length);
      expect(agent.state.messages.at(-1)).toMatchObject({
        role: "assistant",
        content: [
          {
            type: "text",
            text: `历史资料 [design/${history.ids.decision}]：${expectedText}`,
          },
        ],
      });
    } finally {
      try {
        if (agent) {
          agent.abort();
          await agent.waitForIdle();
        }
      } finally {
        history.dispose();
      }
    }
  } finally {
    offline.dispose();
  }
});
