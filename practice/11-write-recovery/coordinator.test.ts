import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "../../repos/pi-mono/node_modules/vitest/dist/index.js";
import { Agent } from "../../repos/pi-mono/packages/agent/src/agent.ts";
import { fauxAssistantMessage, fauxToolCall, type TranscriptContext } from "../../repos/pi-mono/packages/ai/src/index.ts";
import { createFixture } from "../09-mcp-tool-bridge/fixtures.ts";
import { createTicketService } from "./fixtures.ts";
import { createTicketCoordinator } from "./ticket-coordinator.ts";
import { createTicketTool } from "./ticket-tool.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function setup() {
  const root = mkdtempSync(join(tmpdir(), "ticket-test-")); roots.push(root);
  const fixture = createTicketService();
  const stateFile = join(root, "state.json");
  const coordinator = () => createTicketCoordinator({ service: fixture.service, stateFile });
  return { fixture, coordinator, stateFile };
}
const input = { requestKey: "req-1", title: "Help" };
const created = { status: "created", requestKey: input.requestKey, ticketId: "ticket-1" };
const unknown = { status: "unknown", requestKey: input.requestKey };

it.each(["success", "reject"] as const)("终态 %s 重启后复用，标题冲突不修改记录", async (mode) => {
  const { fixture, coordinator } = setup(); fixture.queueCreate(mode);
  const expected = mode === "success" ? created : { status: "rejected", requestKey: input.requestKey, reason: "TITLE_REJECTED" };
  expect(await coordinator().submit(input)).toEqual(expected);
  expect(await coordinator().submit({ ...input, title: "Different" })).toEqual({ status: "conflict", requestKey: input.requestKey });
  expect(await coordinator().submit(input)).toEqual(expected);
  expect(fixture.trace.map(x => x.method)).toEqual(["create"]);
  expect(fixture.tickets).toHaveLength(mode === "success" ? 1 : 0);
});

it.each(["disconnect-before", "disconnect-after"] as const)("%s 后重启查询并安全恢复", async (mode) => {
  const { fixture, coordinator, stateFile } = setup(); fixture.queueCreate(mode);
  expect(await coordinator().submit(input)).toEqual(unknown);
  expect(JSON.parse(readFileSync(stateFile, "utf8"))[input.requestKey]).toMatchObject({ ...input, status: "unknown" });
  expect(await coordinator().submit({ ...input, title: "Different" })).toEqual({ status: "conflict", requestKey: input.requestKey });
  expect(await coordinator().submit(input)).toEqual(created);
  expect(JSON.parse(readFileSync(stateFile, "utf8"))[input.requestKey]).toMatchObject({ ...input, status: "created", ticketId: "ticket-1" });
  expect(await coordinator().submit(input)).toEqual(created);
  expect(fixture.trace).toEqual(mode === "disconnect-before" ? [
    { method: "create", requestKey: input.requestKey, mode },
    { method: "lookup", requestKey: input.requestKey, mode: "available" },
    { method: "create", requestKey: input.requestKey, mode: "success" },
  ] : [
    { method: "create", requestKey: input.requestKey, mode },
    { method: "lookup", requestKey: input.requestKey, mode: "available" },
  ]);
  expect(fixture.tickets).toHaveLength(1);
});

it("查询不可用时保持 unknown，之后恢复；不同请求互不干扰", async () => {
  const { fixture, coordinator } = setup(); fixture.queueCreate("disconnect-after"); fixture.queueLookup("unavailable");
  expect(await coordinator().submit(input)).toEqual(unknown);
  expect(await coordinator().submit(input)).toEqual(unknown);
  expect(await coordinator().submit({ requestKey: "req-2", title: "Other" })).toEqual({ status: "created", requestKey: "req-2", ticketId: "ticket-2" });
  expect(await coordinator().submit(input)).toEqual(created);
  expect(fixture.trace.map(x => x.method)).toEqual(["create", "lookup", "create", "lookup"]);
  expect(fixture.tickets).toHaveLength(2);
});

function result(context: TranscriptContext, id: string) {
  const message = context.messages.find(m => m.role === "toolResult" && m.toolCallId === id);
  if (!message || message.role !== "toolResult") throw new Error(`Missing result ${id}`);
  expect(message.isError).toBe(false);
  const block = message.content.find(b => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Missing text");
  return JSON.parse(block.text);
}

it("真实 Agent 使用新的调用 ID 恢复同一工单", async () => {
  const { fixture, coordinator } = setup(); fixture.queueCreate("disconnect-after");
  const offline = await createFixture();
  const agent = new Agent({ streamFn: offline.streamFn, getApiKey: offline.getApiKey, initialState: { model: offline.model, tools: [createTicketTool(coordinator())] } });
  try {
    offline.queueResponses(
      () => fauxAssistantMessage(fauxToolCall("submit_ticket", input, { id: "call-1" }), { stopReason: "toolUse" }),
      context => { expect(result(context, "call-1")).toEqual(unknown); return fauxAssistantMessage(fauxToolCall("submit_ticket", input, { id: "call-2" }), { stopReason: "toolUse" }); },
      context => { expect(result(context, "call-2")).toEqual(created); return fauxAssistantMessage("工单已创建"); },
    );
    await agent.prompt("提交工单，结果未知时使用相同请求键恢复。");
    expect(offline.requests).toHaveLength(3);
    expect(agent.state.isStreaming).toBe(false);
    expect(agent.state.messages.at(-1)).toMatchObject({ role: "assistant", content: [{ type: "text", text: "工单已创建" }] });
    expect(fixture.trace.map(x => x.method)).toEqual(["create", "lookup"]);
    expect(fixture.tickets).toHaveLength(1);
  } finally { agent.abort(); await agent.waitForIdle(); offline.dispose(); }
});

// 当前实现的数据结构检查；业务契约不要求采用此 JSON 布局。
it("同一协调器实例重复提交只创建一次", async () => {
  const { fixture, coordinator } = setup();
  const instance = coordinator();
  expect(await instance.submit(input)).toEqual(created);
  expect(await instance.submit(input)).toEqual(created);
  expect(fixture.trace).toEqual([{ method: "create", requestKey: input.requestKey, mode: "success" }]);
  expect(fixture.tickets).toHaveLength(1);
});

// 扩展检查：这些异常不在 README 的服务契约内，不作为正式验收标准。
it("扩展：create 的其他异常向调用方传播", async () => {
  const { fixture, coordinator } = setup();
  fixture.service.create = async () => { throw new Error("unexpected create failure"); };
  await expect(coordinator().submit(input)).rejects.toThrow("unexpected create failure");
});

it("扩展：lookup 抛出的异常向调用方传播", async () => {
  const { fixture, coordinator } = setup();
  fixture.queueCreate("disconnect-before");
  expect(await coordinator().submit(input)).toEqual(unknown);
  fixture.service.lookup = async () => { throw new Error("unexpected lookup failure"); };
  await expect(coordinator().submit(input)).rejects.toThrow("unexpected lookup failure");
});
