// AI 编写验收测试。模拟传输，但调用真实 pi Agent；不测试未约定的畸形历史。
import { describe, expect, it } from "../../repos/pi-mono/node_modules/vitest/dist/index.js";
import { Agent } from "../../repos/pi-mono/packages/agent/src/agent.ts";
import type { Message } from "../../repos/pi-mono/packages/ai/src/types.ts";
import { createRecentTurnsTransform } from "./context-hook.ts";
import { assistant, mockStream, model, toolRound, user } from "./fixtures.ts";

const system: Message = { role: "system", content: "固定规则", timestamp: 0 };

describe("真实 pi 接线基线", () => {
  it("无需真实模型即可完成 prompt 并记录请求", async () => {
    const requests: Message[][] = [];
    const agent = new Agent({ initialState: { model }, streamFn: mockStream(requests) });
    await agent.prompt("hello");
    expect(requests).toHaveLength(1);
    expect(agent.state.messages.at(-1)?.role).toBe("assistant");
  });
});

describe("用户实现的轮次裁剪契约", () => {
  it("裁剪完整旧轮次，保留所有 system 和最新轮次，输入不变", async () => {
    const laterSystem: Message = { role: "system", content: "追加规则", timestamp: 1 };
    const messages: Message[] = [system, user("old"), assistant("old answer"), laterSystem, user("new")];
    const before = structuredClone(messages);
    const result = await createRecentTurnsTransform(1)(messages);
    expect(result).toEqual([system, laterSystem, messages[4]]);
    expect(messages).toEqual(before);
  });
  it("一轮包含多条工具消息时整轮保留或删除，不按消息条数截断", async () => {
    const round = toolRound();
    const messages = [system, user("更旧"), assistant("旧回答"), ...round, user("最新")];
    expect(await createRecentTurnsTransform(2)(messages)).toEqual([system, ...round, messages.at(-1)]);
    expect(await createRecentTurnsTransform(1)(messages)).toEqual([system, messages.at(-1)]);
  });
  it("轮次不足、无 user、空历史均不裁剪；非法配置安全回退", async () => {
    const messages = [system, user("one"), assistant("answer")];
    expect(await createRecentTurnsTransform(3)(messages)).toEqual(messages);
    expect(await createRecentTurnsTransform(1)([system])).toEqual([system]);
    expect(await createRecentTurnsTransform(1)([])).toEqual([]);
    for (const invalid of [0, -1, 1.5, NaN, Infinity]) {
      expect(await createRecentTurnsTransform(invalid)(messages)).toEqual(messages);
    }
  });
  it("连续两次真实 prompt 都重新裁剪，convertToLlm 先收到裁剪结果，state 保留完整历史", async () => {
    const initial = [system, user("旧问题"), assistant("旧回答")];
    const requests: Message[][] = [];
    const converted: Message[][] = [];
    const agent = new Agent({
      initialState: { model, messages: structuredClone(initial) },
      streamFn: mockStream(requests),
      transformContext: createRecentTurnsTransform(1),
      convertToLlm: (messages) => {
        const standard = messages as Message[]; // 本轮契约只有 pi 标准消息，无 custom 消息。
        converted.push(structuredClone(standard));
        return standard;
      },
    });
    await agent.prompt(user("第二轮"));
    await agent.prompt(user("第三轮"));
    expect(converted.map(ms => ms.filter(m => m.role === "user").map(m => m.content))).toEqual([["第二轮"], ["第三轮"]]);
    expect(requests.map(ms => ms.filter(m => m.role === "user").map(m => m.content))).toEqual([["第二轮"], ["第三轮"]]);
    expect(agent.state.messages.slice(0, initial.length)).toEqual(initial);
    expect(agent.state.messages.filter(m => m.role === "user").map(m => m.content)).toEqual(["旧问题", "第二轮", "第三轮"]);
    expect(agent.state.messages.filter(m => m.role === "assistant")).toHaveLength(3);
  });
});
