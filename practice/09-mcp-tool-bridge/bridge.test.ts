// AI 根据用户六组验证场景编写；补充动态发现、schema、业务错误恢复和调用期断连断言。
import { expect, it, describe } from "../../repos/pi-mono/node_modules/vitest/dist/index.js";
import { fauxAssistantMessage, fauxToolCall, getCurrentTools } from "../../repos/pi-mono/packages/ai/src/index.ts";
import { createFixture } from "./fixtures.ts";
import { createMcpAgent } from "./mcp-agent.ts";

type Fixture = Awaited<ReturnType<typeof createFixture>>;
type Bridge = Awaited<ReturnType<typeof createMcpAgent>>;
const options = (fixture: Fixture) => ({ ...fixture, name: "bridge-test" });
function calls(fixture: Fixture, server: "docs" | "issues") {
  return fixture.readTrace(server).filter(entry => entry.event === "received")
    .map(entry => entry.message).filter((message): message is { method: string; params: unknown } =>
      typeof message === "object" && message !== null && "method" in message && message.method === "tools/call");
}
function expectExited(fixture: Fixture, server: "docs" | "issues") {
  const pid = fixture.readTrace(server).find(entry => entry.event === "started")?.pid;
  expect(pid, `${server} 必须确实启动过`).toBeTypeOf("number");
  expect(() => process.kill(pid!, 0)).toThrowError(expect.objectContaining({ code: "ESRCH" }));
}
async function cleanup(fixture: Fixture, bridge?: Bridge) {
  try {
    if (bridge) {
      bridge.agent.abort();
      await bridge.agent.waitForIdle();
      await bridge.dispose();
    }
  } finally { fixture.dispose(); }
}
function results(fixture: Fixture, request = fixture.requests.length - 1) {
  return fixture.requests[request].context.messages.filter(message => message.role === "toolResult");
}

describe("MCP 工具桥接契约", () => {
  // 只覆盖声明类型内的配置错误，不将 null 等越界值加入契约。
  it.each(["duplicate", "invalid-name", "empty-command"] as const)("配置错误 %s 在启动前拒绝", async kind => {
    const fixture = await createFixture();
    let bridge: Bridge | undefined;
    try {
      const servers = fixture.servers.map(server => ({ ...server }));
      if (kind === "duplicate") servers[1].name = servers[0].name;
      if (kind === "invalid-name") servers[0].name = "bad-name";
      if (kind === "empty-command") servers[0].command = " ";
      await expect(createMcpAgent({ ...options(fixture), servers }).then(value => { bridge = value; return value; })).rejects.toThrow();
      expect(fixture.readTrace("docs")).toEqual([]);
      expect(fixture.readTrace("issues")).toEqual([]);
    } finally { await cleanup(fixture, bridge); }
  });

  it("初始化失败时回收已启动的全部进程", async () => {
    const fixture = await createFixture({ issuesFault: "initialize" });
    let bridge: Bridge | undefined;
    try {
      await expect(createMcpAgent(options(fixture)).then(value => { bridge = value; return value; })).rejects.toThrow();
      expectExited(fixture, "docs");
      expectExited(fixture, "issues");
    } finally { await cleanup(fixture, bridge); }
  });

  it("动态注册五个工具，模型收到原始 description/schema，新增 health 可调用", async () => {
    const fixture = await createFixture({ docsExtraTool: true });
    let bridge: Bridge | undefined;
    try {
      bridge = await createMcpAgent(options(fixture));
      expect(bridge.agent.state.tools.map(tool => tool.name).sort()).toEqual([
        "mcp__docs__get", "mcp__docs__health", "mcp__docs__search", "mcp__issues__get", "mcp__issues__search",
      ]);
      fixture.queueResponses(() => fauxAssistantMessage(fauxToolCall("mcp__docs__health", {}, { id: "health" }), { stopReason: "toolUse" }));
      fixture.queueReplies();
      await bridge.agent.prompt("查看服务状态");
      const tools = getCurrentTools(fixture.requests[0].context.messages);
      expect(tools).toHaveLength(5);
      for (const server of ["docs", "issues"]) {
        const tool = tools.find(tool => tool.name === `mcp__${server}__search`)!;
        expect(tool.description).toBe(`Search ${server} titles and bodies by substring; returns document IDs and titles.`);
        expect(tool.parameters).toMatchObject({ type: "object", properties: { query: { type: "string", minLength: 1 } }, required: ["query"], additionalProperties: false });
      }
      expect(results(fixture)).toContainEqual(expect.objectContaining({ toolCallId: "health", isError: false, content: [{ type: "text", text: "docs" }] }));
      expect(calls(fixture, "docs")).toEqual([expect.objectContaining({ params: { name: "health", arguments: {} } })]);
    } finally { await cleanup(fixture, bridge); }
  });

  it("同名 search/get 路由到正确进程，完整文本和调用 ID 进入下一次模型请求", async () => {
    const fixture = await createFixture();
    let bridge: Bridge | undefined;
    try {
      bridge = await createMcpAgent(options(fixture));
      fixture.queueResponses(() => fauxAssistantMessage([
        fauxToolCall("mcp__docs__search", { query: "CI" }, { id: "ds" }),
        fauxToolCall("mcp__issues__search", { query: "CI" }, { id: "is" }),
        fauxToolCall("mcp__docs__get", { id: "build-guide" }, { id: "dg" }),
        fauxToolCall("mcp__issues__get", { id: "ISSUE-17" }, { id: "ig" }),
      ], { stopReason: "toolUse" }));
      fixture.queueReplies();
      await bridge.agent.prompt("查询两边的 CI 资料");
      expect(fixture.requests).toHaveLength(2);
      const returned = results(fixture);
      expect(returned).toHaveLength(4);
      for (const [id, text] of [["ds", "build-guide"], ["is", "ISSUE-17"], ["dg", "pnpm install --frozen-lockfile"], ["ig", "状态：open。"]]) {
        const result = returned.find(result => result.toolCallId === id)!;
        expect(result.isError).toBe(false);
        expect(JSON.stringify(result.content)).toContain(text);
      }
      // 完整正文从设施数据读取，而非仅验证关键字。
      const { readFileSync } = await import("node:fs");
      const catalog = JSON.parse(readFileSync(new URL("./catalog.json", import.meta.url), "utf8")) as Record<string, Array<{ id: string; title: string; body: string }>>;
      for (const [server, callId, documentId] of [["docs", "dg", "build-guide"], ["issues", "ig", "ISSUE-17"]]) {
        const doc = catalog[server].find(doc => doc.id === documentId)!;
        expect(returned.find(result => result.toolCallId === callId)?.content).toEqual([{ type: "text", text: `${doc.id}: ${doc.title}\n${doc.body}` }]);
        expect(calls(fixture, server as "docs" | "issues").map(call => call.params)).toEqual([
          { name: "search", arguments: { query: "CI" } }, { name: "get", arguments: { id: documentId } },
        ]);
      }
    } finally { await cleanup(fixture, bridge); }
  });

  it("业务错误保留 NOT_FOUND，下轮仍能正常查询", async () => {
    const fixture = await createFixture();
    let bridge: Bridge | undefined;
    try {
      bridge = await createMcpAgent(options(fixture));
      fixture.queueResponses(
        () => fauxAssistantMessage(fauxToolCall("mcp__docs__get", { id: "missing" }, { id: "bad" }), { stopReason: "toolUse" }),
        () => fauxAssistantMessage(fauxToolCall("mcp__docs__get", { id: "build-guide" }, { id: "good" }), { stopReason: "toolUse" }),
      );
      fixture.queueReplies();
      await bridge.agent.prompt("先查不存在的，再查正确资料");
      expect(results(fixture, 1)).toContainEqual(expect.objectContaining({ toolCallId: "bad", isError: true, content: [{ type: "text", text: "NOT_FOUND: missing" }] }));
      expect(results(fixture)).toContainEqual(expect.objectContaining({ toolCallId: "good", isError: false }));
      expect(calls(fixture, "docs")).toHaveLength(2);
    } finally { await cleanup(fixture, bridge); }
  });

  it("调用期进程退出明确返回错误，prompt 能结束", async () => {
    const fixture = await createFixture({ issuesFault: "call" });
    let bridge: Bridge | undefined;
    try {
      bridge = await createMcpAgent(options(fixture));
      fixture.queueResponses(() => fauxAssistantMessage(fauxToolCall("mcp__issues__get", { id: "ISSUE-17" }, { id: "crash" }), { stopReason: "toolUse" }));
      fixture.queueReplies();
      await bridge.agent.prompt("查询工单");
      const result = results(fixture).find(result => result.toolCallId === "crash")!;
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain("调用失败");
      expect(calls(fixture, "issues")).toHaveLength(1);
      expectExited(fixture, "issues");
    } finally { await cleanup(fixture, bridge); }
  }, 10000);

  it("dispose 并发及重复调用安全，两个进程均退出", async () => {
    const fixture = await createFixture();
    let bridge: Bridge | undefined;
    try {
      bridge = await createMcpAgent(options(fixture));
      await Promise.all([bridge.dispose(), bridge.dispose()]);
      await bridge.dispose();
      expectExited(fixture, "docs");
      expectExited(fixture, "issues");
    } finally { await cleanup(fixture, bridge); }
  });
});
