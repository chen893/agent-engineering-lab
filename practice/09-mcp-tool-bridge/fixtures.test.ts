// AI 仅自检资料服务和离线模型，不实现用户的 Agent/MCP 适配层。
import { expect, it } from "../../repos/pi-mono/node_modules/vitest/dist/index.js";
import { McpClient, StdioTransport } from "../../repos/pi-mono/packages/mcp/src/index.ts";
import { Agent } from "../../repos/pi-mono/packages/agent/src/agent.ts";
import { fauxAssistantMessage } from "../../repos/pi-mono/packages/ai/src/index.ts";
import { createFixture } from "./fixtures.ts";

it("两个真实 stdio 服务可发现同名工具、查询、报告不存在并关闭", async () => {
  const fixture = await createFixture({ docsExtraTool: true });
  const clients: McpClient[] = [];
  try {
    for (const server of fixture.servers) {
      const client = new McpClient({ name: "fixture-smoke", version: "1.0.0" });
      clients.push(client);
      const transport = new StdioTransport({ command: server.command, args: server.args });
      await client.connect(transport);
      const names = (await client.listTools()).map((tool) => tool.name);
      expect(names).toContain("search");
      expect(names).toContain("get");
      if (server.name === "docs") expect(names).toContain("health");
      const found = await client.callTool("search", { query: "CI" });
      expect(found.isError).toBe(false);
      expect(JSON.stringify(found.content)).toContain(server.name === "docs" ? "build-guide" : "ISSUE-17");
      expect((await client.callTool("get", { id: "missing" })).isError).toBe(true);
      expect((await client.callTool("get", { id: server.name === "docs" ? "build-guide" : "ISSUE-17" })).isError).toBe(false);
      const pid = transport.pid;
      expect(pid).toBeTypeOf("number");
      await client.close();
      expect(client.connectionState).toBe("closed");
      let alive = true;
      try { process.kill(pid!, 0); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        alive = false;
      }
      expect(alive).toBe(false);
    }
  } finally {
    await Promise.all(clients.map((client) => client.close()));
    fixture.dispose();
  }
});

it.each(["initialize", "call"] as const)("人工注入 %s 断连确实导致客户端拒绝", async (fault) => {
  const fixture = await createFixture({ issuesFault: fault });
  const client = new McpClient({ name: "fixture-fault", version: "1.0.0" });
  const server = fixture.servers[1];
  try {
    const connection = client.connect(new StdioTransport({ command: server.command, args: server.args }));
    if (fault === "initialize") await expect(connection).rejects.toThrow();
    else {
      await connection;
      await expect(client.callTool("get", { id: "ISSUE-17" })).rejects.toThrow();
    }
    const received = fixture.readTrace("issues").filter((entry) => entry.event === "received");
    expect(JSON.stringify(received)).toContain(fault === "initialize" ? '"method":"initialize"' : '"method":"tools/call"');
  } finally { await client.close(); fixture.dispose(); }
});

it("离线响应脚本记录真实 Agent 请求", async () => {
  const fixture = await createFixture();
  const agent = new Agent({ streamFn: fixture.streamFn, getApiKey: () => "offline-fixture-key", initialState: { model: fixture.model, tools: [] } });
  try {
    fixture.queueResponses(() => fauxAssistantMessage("fixture-ok"));
    await agent.prompt("设施自检");
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.readTrace("docs")).toEqual([]); // 设施不会偷偷启动服务器或替用户接线。
  } finally { agent.abort(); await agent.waitForIdle(); fixture.dispose(); }
});
