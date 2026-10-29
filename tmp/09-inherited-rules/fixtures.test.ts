// 只验证 AI 设施，不加载 rules-extension，也不替代正式验收。
import { existsSync } from "node:fs";
import {
  expect,
  it,
} from "../../repos/pi-mono/node_modules/vitest/dist/index.js";
import { Agent } from "../../repos/pi-mono/packages/agent/src/agent.ts";
import { createFixture } from "./fixtures.ts";

it("离线模型记录实际输入，且临时目录可清理", async () => {
  const fixture = await createFixture();
  const agent = new Agent({
    streamFn: (model, context, options) =>
      fixture.modelRuntime.streamSimple(model, context, options),
    getApiKey: () => "offline-fixture-key",
    initialState: { model: fixture.model, systemPrompt: "设施标记", tools: [] },
  });
  try {
    fixture.queueReplies();
    await agent.prompt("设施自检");
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.requests[0].systemPrompt).toBe("设施标记");
    expect(existsSync(fixture.sessionDir)).toBe(true);
  } finally {
    agent.abort();
    await agent.waitForIdle();
    fixture.dispose();
  }
  expect(existsSync(fixture.root)).toBe(false);
});
