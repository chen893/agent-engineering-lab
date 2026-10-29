// AI 提供：验证约定的成功/失败接口和行为，不限制成本缓存或裁剪算法。
import assert from "node:assert/strict";
import test from "node:test";
import { cost, fitContext } from "./context-budget.mts";
import type { ContextMessage } from "./context-budget.mts";


function expectSuccess(messages: readonly ContextMessage[], budget: number) {
  const before = structuredClone(messages);
  const result = fitContext(messages, budget);
  assert.deepEqual(messages, before, "不能修改调用方输入");
  assert.equal(result.status, "success", "此场景应返回明确的 success 状态");
  if (result.status !== "success") throw new Error("预期 success");
  assert.equal(result.initialCost, JSON.stringify(messages).length);
  assert.equal(result.finalCost, JSON.stringify(result.context).length,
    "finalCost 是裁剪后的实际输出成本，不是剩余额度");
  assert.ok(result.finalCost <= budget, "成功结果不能超预算");
  const deleted = new Set(result.deletedIndexes);
  assert.equal(deleted.size, result.deletedIndexes.length);
  for (const index of deleted) {
    assert.ok(Number.isInteger(index) && index >= 0 && index < messages.length);
  }
  assert.deepEqual(result.context, messages.filter((_, index) => !deleted.has(index)),
    "删除报告必须与保留内容一致，且不能改写或重排消息");
  const lastUserIndex = messages.findLastIndex((message) => message.role === "user");
  messages.forEach((message, index) => {
    if (message.role === "system" || index === lastUserIndex) {
      assert.ok(!deleted.has(index), "不能删除 system 或最后一条 user");
    }
  });
  return result;
}

test("预算充足时保留所有消息，输入不变", () => {
  const messages: ContextMessage[] = [
    { role: "user", content: "旧问题" },
    { role: "assistant", content: "旧回答" },
    { role: "user", content: "新问题" },
  ];
  const before = structuredClone(messages);
  assert.deepEqual(expectSuccess(messages, 10000).context, messages);
  assert.deepEqual(messages, before);
});

test("预算恰好等于必保留消息成本时成功", () => {
  const messages: ContextMessage[] = [
    { role: "system", content: "规则" },
    { role: "user", content: "问题" },
  ];
  const budget = cost(messages);
  assert.deepEqual(expectSuccess(messages, budget).context, messages);
});

test("删除至一个元素或空数组时，括号与逗号成本精确", () => {
  const messages: ContextMessage[] = [
    { role: "assistant", content: "旧回答" },
    { role: "assistant", content: "新回答" },
  ];
  const one = expectSuccess(messages, cost([messages[1]]));
  assert.deepEqual(one.context, [messages[1]]);
  assert.deepEqual(one.deletedIndexes, [0]);
  const empty = expectSuccess(messages, 2);
  assert.deepEqual(empty.context, []);
  assert.deepEqual(empty.deletedIndexes, [0, 1]);
  assert.equal(empty.finalCost, 2);
});

test("转义字符与 Unicode 的成本符合 JSON 字符串长度", () => {
  const messages: ContextMessage[] = [
    { role: "system", content: '中文😀\n"引号"\\' },
    { role: "assistant", content: "旧消息".repeat(30) },
    { role: "user", content: "新问题\t" },
  ];
  const expected = [messages[0], messages[2]];
  assert.deepEqual(expectSuccess(messages, cost(expected)).context, expected);
});

test("同一 assistant 的多个调用可由一条 tool 消息返回", () => {
  const messages: ContextMessage[] = [
    { role: "assistant", content: [
      { type: "tool_use", toolCallId: "a", args: {} },
      { type: "tool_use", toolCallId: "b", args: {} },
    ] },
    { role: "tool", content: [
      { type: "tool_result", toolCallId: "a", result: 1 },
      { type: "tool_result", toolCallId: "b", result: 2 },
    ] },
    { role: "user", content: "继续" },
  ];
  assert.deepEqual(expectSuccess(messages, cost(messages)).context, messages);
  const result = expectSuccess(messages, cost(messages.slice(1)));
  assert.deepEqual(result.context, [messages[2]]);
  assert.deepEqual(result.deletedIndexes, [0, 1]);
});

test("最后一条 user 位于中间时只计费一次，后续完整工具批次可保留", () => {
  const messages: ContextMessage[] = [
    { role: "system", content: "规则" },
    { role: "user", content: "旧问题".repeat(50) },
    { role: "assistant", content: "旧回答" },
    { role: "user", content: "当前问题" },
    { role: "assistant", content: [{ type: "tool_use", toolCallId: "a", args: {} }] },
    { role: "tool", content: [{ type: "tool_result", toolCallId: "a", result: 1 }] },
    { role: "assistant", content: "最终回答" },
  ];
  const expected = [messages[0], ...messages.slice(3)];
  const result = expectSuccess(messages, cost(expected));
  assert.deepEqual(result.context, expected);
  assert.deepEqual(result.deletedIndexes, [1, 2]);
});

test("超预算时删除最旧单元，不返回超预算历史", () => {
  const messages: ContextMessage[] = [
    { role: "system", content: "规则" },
    { role: "user", content: "很长的旧问题".repeat(30) },
    { role: "assistant", content: "旧回答" },
    { role: "user", content: "新问题" },
  ];
  const expected = [messages[0], messages[2], messages[3]];
  const budget = cost(expected) + 10;
  const actual = expectSuccess(messages, budget).context;
  assert.ok(Array.isArray(actual));
  assert.ok(cost(actual) <= budget, `实际 ${cost(actual)} 超过预算 ${budget}`);
  assert.deepEqual(actual, expected);
});

test("必保留内容超预算时报告原始预算、最低成本和原因", () => {
  const messages: ContextMessage[] = [
    { role: "system", content: "规则" },
    { role: "assistant", content: "可删除旧回答" },
    { role: "user", content: "问题" },
  ];
  const before = structuredClone(messages);
  const minimumCost = JSON.stringify([messages[0], messages[2]]).length;
  const budget = minimumCost - 1;
  const result = fitContext(messages, budget);
  assert.equal(result.status, "cannot_fit");
  if (result.status !== "cannot_fit") throw new Error("预期 cannot_fit");
  assert.equal(result.reason, "required_messages_exceed_budget");
  assert.equal(result.budget, budget, "报告调用方原始预算，不是扣减后的额度");
  assert.equal(result.initialCost, JSON.stringify(messages).length);
  assert.equal(result.minimumCost, minimumCost);
  assert.ok(!("context" in result), "失败分支不提供可直接发送给模型的上下文");
  assert.deepEqual(messages, before);
});

test("多个 system 与最后一个 user 均保留且顺序不变", () => {
  const messages: ContextMessage[] = [
    { role: "system", content: "规则1" },
    { role: "assistant", content: "旧回答".repeat(50) },
    { role: "system", content: "规则2" },
    { role: "user", content: "当前问题" },
  ];
  const expected = [messages[0], messages[2], messages[3]];
  assert.deepEqual(expectSuccess(messages, cost(expected) + 10).context, expected);
});

test("两次工具调用与两个结果作为整体删除", () => {
  const messages: ContextMessage[] = [
    { role: "system", content: "规则" },
    {
      role: "assistant",
      content: [
        { type: "tool_use", toolCallId: "a", args: {} },
        { type: "tool_use", toolCallId: "b", args: {} },
      ],
    },
    {
      role: "tool",
      content: [
        { type: "tool_result", toolCallId: "a", result: "x".repeat(300) },
      ],
    },
    {
      role: "tool",
      content: [{ type: "tool_result", toolCallId: "b", result: "短结果" }],
    },
    { role: "assistant", content: "最新回答" },
    { role: "user", content: "继续" },
  ];
  const expected = [messages[0], messages[4], messages[5]];
  // 足够容纳部分工具结果但不能容纳整个调用单元，仍必须整组删除。
  const budget =
    cost([messages[0], messages[3], messages[4], messages[5]]) + 10;
  const before = structuredClone(messages);
  assert.deepEqual(expectSuccess(messages, budget).context, expected);
  assert.deepEqual(messages, before);
});

test("空历史在足够预算下返回准确成本", () => {
  const result = expectSuccess([], cost([]));
  assert.deepEqual(result.context, []);
  assert.deepEqual(result.deletedIndexes, []);
  assert.equal(result.initialCost, 2);
  assert.equal(result.finalCost, 2);
});

test("成本报告与实际序列化长度一致", () => {
  const messages: ContextMessage[] = [
    { role: "system", content: "规则" },
    { role: "user", content: "问题" },
    { role: "assistant", content: "回答" },
  ];
  const result = expectSuccess(messages, 10000);
  assert.equal(result.initialCost, cost(messages));
  assert.equal(result.finalCost, cost(result.context));
});

test("删除位置能准确重建返回上下文", () => {
  const messages: ContextMessage[] = [
    { role: "system", content: "规则" },
    { role: "user", content: "旧问题".repeat(50) },
    { role: "assistant", content: "旧回答" },
    { role: "user", content: "最新问题" },
  ];
  const result = expectSuccess(messages, 150);
  const deleted = new Set(result.deletedIndexes);
  assert.equal(deleted.size, result.deletedIndexes.length);
  for (const index of deleted)
    assert.ok(Number.isInteger(index) && index >= 0 && index < messages.length);
  assert.deepEqual(
    result.context,
    messages.filter((_, index) => !deleted.has(index)),
  );
});

test("空历史在预算 0 时报告 budget_below_minimum", () => {
  assert.deepEqual(fitContext([], 0), {
    status: "cannot_fit",
    reason: "budget_below_minimum",
    budget: 0,
    initialCost: 2,
    minimumCost: 2,
  });
});
