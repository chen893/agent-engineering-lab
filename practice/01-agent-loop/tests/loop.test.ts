// AI 提供的集中验收；runAgent 未实现时失败是预期状态，不应修改断言以通过。
import assert from "node:assert/strict";
import test from "node:test";
import { runAgent } from "../src/agent-loop.ts";
import { createMockModel } from "../src/mock-model.ts";
import type { Message, Model } from "../src/types.ts";
import type { Scenario } from "../src/mock-model.ts";

// AI 提供的迁移验收，采用用户当前的同步、单条字符串接口。
test("follow-up：追加的新消息实际进入下一次模型请求", async () => {
  const inputs: Message[][] = [];
  const queue = ["继续解释", ""];
  const result = await runAgent({
    messages: [{ role: "user", content: "你好" }],
    maxSteps: 3,
    getFollowUpMessage: () => queue.shift() ?? "",
    model: async (messages) => {
      assert.ok(inputs.length < 5, "模型调用未正确终止");
      inputs.push(structuredClone([...messages]));
      return { role: "assistant", content: `回答${inputs.length}` };
    },
  });
  assert.equal(inputs.length, 2, "后续消息必须被模型实际处理");
  assert.deepEqual(inputs[1], [
    { role: "user", content: "你好" },
    { role: "assistant", content: "回答1" },
    { role: "user", content: "继续解释" },
  ]);
  assert.equal(result.status, "completed");
  assert.equal(result.steps, 2);
  assert.deepEqual(result.messages.at(-1), { role: "assistant", content: "回答2" });
});

test("follow-up：持续追加消息不能重置总步数预算", async () => {
  let calls = 0;
  const result = await runAgent({
    messages: [{ role: "user", content: "开始" }],
    maxSteps: 3,
    getFollowUpMessage: () => "继续",
    model: async () => {
      calls++;
      assert.ok(calls <= 3, "超过总步数上限");
      return { role: "assistant", content: "回答" };
    },
  });
  assert.equal(calls, 3, "存在后续消息且有预算时应继续");
  assert.equal(result.steps, 3);
  assert.equal(result.status, "max_steps");
});

const initialMessages: Message[] = [
  { role: "system", content: "你是一个计算助手。" },
  { role: "user", content: "你好" },
  { role: "assistant", content: "你好，请给出算式。" },
  { role: "user", content: "请计算 2 + 3" },
];

async function run(scenario: Scenario, maxSteps: number) {
  const inputs: Message[][] = [];
  const mock = createMockModel(scenario);
  const model: Model = async (messages) => {
    // 防止无上限的错误实现让验收进程一直运行。
    assert.ok(inputs.length < 10, "超过 10 次模型请求，可能没有正确终止");
    inputs.push(structuredClone([...messages]));
    return mock(messages);
  };
  const messages = structuredClone(initialMessages);
  const result = await runAgent({ messages, model, maxSteps });
  assert.deepEqual(messages, initialMessages, "不能原地修改调用方传入的历史");
  assert.equal(result.steps, inputs.length, "steps 应等于实际模型请求次数");
  return { result, inputs };
}

test("完整工具流程：第二次模型请求携带调用和对应结果", async () => {
  const { result, inputs } = await run("normal", 3);
  assert.equal(result.status, "completed");
  assert.equal(result.steps, 2);
  assert.deepEqual(inputs[0], initialMessages);
  assert.deepEqual(inputs[1].map((m) => m.role), ["system", "user", "assistant", "user", "assistant", "tool"]);
  const call = inputs[1][4];
  const tool = inputs[1][5];
  assert.ok(call.role === "assistant" && call.call);
  assert.ok(tool.role === "tool");
  assert.equal(tool.output.toolCallId, call.call.id);
  assert.equal(tool.output.result, 5);
  assert.deepEqual(result.messages.slice(0, -1), inputs[1]);
  assert.deepEqual(result.messages.at(-1), {
    role: "assistant", content: "计算结果：5",
  });
});

test("未知工具：错误回传模型，模型仍可给出最终回答", async () => {
  const { result, inputs } = await run("unknown", 3);
  assert.equal(result.status, "completed");
  assert.equal(result.steps, 2);
  const tool = inputs[1].at(-1);
  assert.ok(tool?.role === "tool");
  assert.equal(tool.output.isError, true);
  assert.equal(tool.output.toolCallId, "call-1");
  assert.match(tool.output.errorMessage ?? "", /missing/);
  const final = result.messages.at(-1);
  assert.ok(final?.role === "assistant" && !final.call);
  assert.match(final.content, /工具失败/);
});

test("模型持续调用工具：处理完第三步后停止，不发起第四次请求", async () => {
  const { result } = await run("endless", 3);
  assert.equal(result.status, "max_steps");
  assert.equal(result.steps, 3);
  const outputs = result.messages.filter((m) => m.role === "tool");
  assert.deepEqual(outputs.map((m) => m.output.toolCallId), ["call-1", "call-2", "call-3"]);
  assert.deepEqual(outputs.map((m) => m.output.result), [5, 5, 5]);
});

test("上限为零时不请求模型；最后允许的一步可正常结束", async () => {
  const zero = await run("normal", 0);
  assert.equal(zero.result.status, "max_steps");
  assert.equal(zero.result.steps, 0);
  assert.deepEqual(zero.result.messages, initialMessages);
  const direct = await run("direct", 1);
  assert.equal(direct.result.status, "completed");
  assert.equal(direct.result.steps, 1);
  assert.deepEqual(direct.result.messages.at(-1), {
    role: "assistant", content: "你好",
  });
});


test("call 为 null 也结束；有文字且有 call 时仍执行工具", async () => {
  const result = await runAgent({
    messages: structuredClone(initialMessages),
    maxSteps: 1,
    model: async () => ({ role: "assistant", content: "直接回答", call: null }),
  });
  assert.equal(result.status, "completed");
  assert.equal(result.steps, 1);
  assert.deepEqual(result.messages.at(-1), {
    role: "assistant", content: "直接回答", call: null,
  });
  // normal 模型的调用响应同时含 content 和 call，已有正常流程用例覆盖。
});
