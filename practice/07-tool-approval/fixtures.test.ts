// AI 设施检查：直接调用工具仅用于自检，不能算作用户的审批集成验收。
import { expect, it } from "../../repos/pi-mono/node_modules/vitest/dist/index.js";
import { normalizeContext } from "../../repos/pi-mono/packages/ai/src/utils/transcript.ts";
import { user } from "../05-pi-context-hook/fixtures.ts";
import { createFixture } from "./fixtures.ts";

it("AI 设施：固定文件可读写，执行记录可观察", async () => {
  const fixture = createFixture([]);
  try {
    const [read, write] = fixture.tools;
    expect((await read.execute("read", {})).content).toEqual([
      { type: "text", text: "原始笔记\n" },
    ]);
    await write.execute("write", { content: "你好\n" });
    expect(fixture.snapshot()).toBe("你好\n");
    expect(fixture.executions).toEqual([
      { toolCallId: "read", name: "read_note" },
      { toolCallId: "write", name: "write_note", content: "你好\n" },
    ]);
  } finally { fixture.dispose(); }
});

it("AI 设施：模型只生成协议消息，支持已取消信号", async () => {
  const fixture = createFixture([{ id: "call-1", name: "read_note", arguments: {} }]);
  try {
    const stream = await fixture.streamFn(fixture.model, normalizeContext({ messages: [user("读笔记")] }));
    expect(await stream.result()).toMatchObject({ stopReason: "toolUse", content: [
      { type: "toolCall", id: "call-1", name: "read_note", arguments: {} },
    ] });
    const controller = new AbortController();
    controller.abort();
    const cancelled = await fixture.streamFn(fixture.model, normalizeContext({ messages: [user("已取消")] }), { signal: controller.signal });
    expect(await cancelled.result()).toMatchObject({ stopReason: "aborted" });
    expect(fixture.executions).toEqual([]);
    expect(fixture.requests).toHaveLength(2);
  } finally { fixture.dispose(); }
});
