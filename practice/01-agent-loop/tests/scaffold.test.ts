// AI 提供：验证辅助设施，不代表用户的 Agent Loop 已完成。
import assert from "node:assert/strict";
import test from "node:test";
import { createMockModel } from "../src/mock-model.ts";
import { executeToolCall } from "../src/agent-loop.ts";

test("模拟模型根据回传结果生成最终回答", async () => {
  const model = createMockModel();
  const reply = await model([{ role: "user", content: "计算" }]);
  assert.ok(reply.call);
  if (!reply.call) throw new Error("应返回工具调用");
  const output = executeToolCall(reply.call);
  assert.equal(output.result, 5);
  const final = await model([reply, { role: "tool", output }]);
  assert.deepEqual(final, { role: "assistant", content: "计算结果：5" });
});

test("未知工具场景生成失败回答", async () => {
  const model = createMockModel("unknown");
  const reply = await model([]);
  if (!reply.call) throw new Error("应返回工具调用");
  const output = executeToolCall(reply.call);
  assert.equal(output.isError, true);
  assert.equal(output.toolCallId, reply.call.id);
  const final = await model([{ role: "tool", output }]);
  assert.equal(final.call, undefined);
});

test("持续调用和直接回答场景可用", async () => {
  const output = { toolCallId: "call-1", result: 5 };
  const reply = await createMockModel("endless")([{ role: "tool", output }]);
  assert.ok(reply.call);
  if (reply.call) assert.equal(reply.call.id, "call-2");
  assert.equal((await createMockModel("direct")([])).call, undefined);
});
