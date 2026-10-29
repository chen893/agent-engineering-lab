// AI 提供的非目标设施：真实文件工具与离线模型协议，无审批逻辑或 Agent 接线。
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Type } from "../../repos/pi-mono/node_modules/typebox/build/index.mjs";
import type { AgentTool, AgentToolCall, StreamFn } from "../../repos/pi-mono/packages/agent/src/types.ts";
import type { Message } from "../../repos/pi-mono/packages/ai/src/types.ts";
import { AssistantMessageEventStream } from "../../repos/pi-mono/packages/ai/src/utils/event-stream.ts";
import { assistant, model } from "../05-pi-context-hook/fixtures.ts";

export type ScriptedCall = Pick<AgentToolCall, "id" | "name" | "arguments">;

const readSchema = Type.Object({});
const writeSchema = Type.Object({ content: Type.String() });

export function createFixture(calls: readonly ScriptedCall[], initialText = "原始笔记\n") {
  const directory = mkdtempSync(join(tmpdir(), "approval07-"));
  const notePath = join(directory, "note.txt");
  writeFileSync(notePath, initialText, "utf8");
  const executions: { toolCallId: string; name: string; content?: string }[] = [];
  const requests: Message[][] = [];
  const script = structuredClone(calls);
  let nextCall = 0;

  const readTool: AgentTool<typeof readSchema, { path: string }> = {
    name: "read_note", label: "read_note", description: "Read the fixed note file.",
    parameters: readSchema,
    async execute(toolCallId) {
      executions.push({ toolCallId, name: "read_note" });
      return { content: [{ type: "text", text: readFileSync(notePath, "utf8") }], details: { path: notePath } };
    },
  };
  const writeTool: AgentTool<typeof writeSchema, { path: string }> = {
    name: "write_note", label: "write_note", description: "Replace the fixed note with the supplied content.",
    parameters: writeSchema,
    async execute(toolCallId, args) {
      executions.push({ toolCallId, name: "write_note", content: args.content });
      writeFileSync(notePath, args.content, "utf8");
      return { content: [{ type: "text", text: "Note written" }], details: { path: notePath } };
    },
  };

  const streamFn: StreamFn = (_model, context, options) => {
    requests.push(structuredClone(context.messages));
    const lastRole = context.messages.at(-1)?.role;
    const stream = new AssistantMessageEventStream();
    queueMicrotask(() => {
      if (options?.signal?.aborted) {
        stream.push({ type: "error", reason: "aborted", error: {
          ...assistant(""), stopReason: "aborted", errorMessage: "Operation aborted",
        } });
        return;
      }
      const call = lastRole === "user" ? script[nextCall++] : undefined;
      if (call) {
        stream.push({ type: "done", reason: "toolUse", message: {
          ...assistant(""), stopReason: "toolUse", content: [{ type: "toolCall", ...call }],
        } });
      } else {
        stream.push({ type: "done", reason: "stop", message: assistant("本轮结束") });
      }
    });
    return stream;
  };

  const tools: [typeof readTool, typeof writeTool] = [readTool, writeTool];
  return {
    model, streamFn, tools, notePath, executions, requests,
    snapshot: () => readFileSync(notePath, "utf8"),
    dispose: () => rmSync(directory, { recursive: true, force: true }),
  };
}

export type NoteFixture = ReturnType<typeof createFixture>;
