// AI 提供的空入口。类型设计、审批状态、Agent 接线由用户完成。
// 将 unknown 换成你定义的真实输入/输出类型；可自由增加内部函数。

import type { NoteFixture } from "./fixtures";
import { Agent } from "../../repos/pi-mono/packages/agent/src/agent.ts";

type Decision =
  | {
      kind: "approve";
    }
  | {
      kind: "reject";
      reason: string;
    };

type Pending = Readonly<{
  requestId: number;
  toolCallId: string;
  toolName: string;
  content: string;
  path: string;
}>;

export function createApprovalSession(_options: {
  fixture: NoteFixture;
  onRequest: (req: Pending) => void;
}) {
  const { fixture, onRequest } = _options;
  let resolveMap = new Map<number, (decision: Decision) => void>();
  let curRequestId = 0;
  let pending: Pending | null = null;

  const agent = new Agent({
    streamFn: fixture.streamFn,
    initialState: {
      model: fixture.model,
      tools: fixture.tools,
    },
    beforeToolCall: (BeforeToolCallContext, signal) => {
      return new Promise((resolve, reject) => {
        let clear = () => {
          signal?.removeEventListener("abort", handleAborted);

          resolveMap.clear();

          pending = null;
        };

        const handleAborted = () => {
          clear();
          reject("aborted");
        };

        const { toolCall, args } = BeforeToolCallContext;
        if (toolCall.name === "write_note") {
          if (
            typeof args !== "object" ||
            args === null ||
            !("content" in args) ||
            typeof args.content !== "string"
          ) {
            reject(new Error("参数错误"));
            return;
          }
          signal?.addEventListener("abort", handleAborted);
          curRequestId++;
          pending = {
            requestId: curRequestId,
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            path: fixture.notePath,
            content: args.content,
          };
          if (signal?.aborted) {
            clear();
            reject("aborted");
            return;
          }
          resolveMap.set(curRequestId, (decision: Decision) => {
            if (decision.kind === "approve") {
              resolve(undefined);
            } else {
              resolve({
                block: true,
                reason: decision.reason,
              });
            }
            clear();
          });
          onRequest(pending);
        } else {
          resolve(undefined);
        }
      });
    },
  });

  return {
    agent,
    get pending() {
      return pending;
    },
    decide(requestId: number, decision: Decision) {
      const toolCallResolve = resolveMap.get(requestId);

      if (toolCallResolve) {
        toolCallResolve(decision);

        return true;
      }
      return false;
    },
  };
}
