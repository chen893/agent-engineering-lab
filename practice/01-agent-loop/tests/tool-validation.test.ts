// AI 编写：通过模拟模型注入输入，执行真实工具和循环，验证模型收到的结果。
import assert from "node:assert/strict";
import test from "node:test";
import { runAgent } from "../src/agent-loop.ts";
import type { Model, ToolCall, ToolResult } from "../src/types.ts";

type Case = {
  name: string;
  arguments: unknown;
  expectedResult?: number;
  error?: boolean;
  toolName?: string;
  errorText?: RegExp;
};

const cases: Case[] = [
  { name: "正常加法", arguments: { a: 2, b: 3 }, expectedResult: 5 },
  { name: "零与负数是有效参数", arguments: { a: 0, b: -3 }, expectedResult: -3 },
  { name: "拒绝字符串而非隐式转换", arguments: { a: "2", b: 3 }, error: true },
  { name: "拒绝缺失字段", arguments: { a: 2 }, error: true },
  { name: "拒绝 null 参数", arguments: null, error: true },
  { name: "拒绝缺失整个参数", arguments: undefined, error: true },
  { name: "拒绝数组参数", arguments: [2, 3], error: true },
  { name: "拒绝 NaN", arguments: { a: NaN, b: 3 }, error: true },
  { name: "拒绝正无穷", arguments: { a: 2, b: Infinity }, error: true },
  { name: "拒绝负无穷", arguments: { a: -Infinity, b: 3 }, error: true },
  { name: "未知工具返回错误", toolName: "missing", arguments: { a: 2, b: 3 }, error: true, errorText: /missing/ },
  {
    name: "参数读取抛异常后仍回传错误",
    // 故障注入：仅验证当前 try/catch 范围内的异常转换，
    // 不代表已经验证外部工具、异步工具或模型请求异常。
    arguments: { get a() { throw new Error("injected argument access failure"); }, b: 3 },
    error: true,
    errorText: /injected argument access failure/,
  },
];

async function run(scenario: Case) {
  let requests = 0;
  let received: ToolResult | undefined;
  const id = `validation-${scenario.name}`;
  const model: Model = async (messages) => {
    requests++;
    assert.ok(requests <= 2, "错误回传后不应无限请求模型");
    if (requests === 1) {
      return {
        role: "assistant",
        content: "调用工具",
        call: {
          id,
          name: scenario.toolName ?? "add",
          // 当前生产类型只接受 number 对象，测试刻意模拟未经校验的外部数据。
          // 仅在测试边界断言类型，不把非法值先转换为合法输入。
          arguments: scenario.arguments as ToolCall["arguments"],
        },
      };
    }
    const previous = messages.at(-1);
    assert.ok(previous?.role === "tool", "第二次请求必须带有工具结果");
    received = previous.output;
    return {
      role: "assistant",
      content: received.isError ? "已收到工具错误" : `结果：${received.result}`,
    };
  };
  const result = await runAgent({
    messages: [{ role: "user", content: "执行本次工具调用" }],
    model,
    maxSteps: 3,
  });
  assert.equal(requests, 2);
  assert.equal(result.steps, 2);
  assert.equal(result.status, "completed");
  assert.ok(received, "模型没有收到工具结果");
  assert.equal(received.toolCallId, id);
  assert.equal(result.messages.filter((message) => message.role === "tool").length, 1);
  return { result, received };
}

for (const scenario of cases) {
  test(scenario.name, async () => {
    const { result, received } = await run(scenario);
    if (scenario.error) {
      assert.equal(received.isError, true, "非法参数或执行异常必须标记为错误");
      assert.equal(typeof received.errorMessage, "string");
      assert.ok(received.errorMessage?.trim(), "错误原因不能为空");
      assert.equal(received.result, undefined, "失败不能携带成功计算结果");
      if (scenario.errorText) assert.match(received.errorMessage!, scenario.errorText);
      assert.deepEqual(result.messages.at(-1), { role: "assistant", content: "已收到工具错误" });
    } else {
      assert.notEqual(received.isError, true);
      assert.equal(received.result, scenario.expectedResult);
      assert.deepEqual(result.messages.at(-1), {
        role: "assistant", content: `结果：${scenario.expectedResult}`,
      });
    }
  });
}
