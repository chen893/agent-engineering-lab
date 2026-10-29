import type { AgentTool } from "../../repos/pi-mono/packages/agent/src/types.ts";
import {
  type Static,
  Type,
} from "../../repos/pi-mono/node_modules/typebox/build/index.mjs";
import { runProcess, type RunResult } from "./process-runner.ts";

// AI 只提供工厂入口；schema、真实 AgentTool 类型和 execute 接线由用户完成。

// 类型设计是本轮工作的一部分，请替换 unknown，不使用 any 绕过接口检查。

// 参数为 executable:string 和 args:string[]，
const processToolSchema = Type.Object({
  executable: Type.String(),
  args: Type.Array(Type.String()),
});

type processToolInput = Static<typeof processToolSchema>;
const validateProcessInput = (input: processToolInput): processToolInput => {
  if (!Array.isArray(input.args) || typeof input.executable !== "string") {
    throw new Error("参数错误");
  }
  return input;
};

export function createProcessTool(): AgentTool<
  typeof processToolSchema,
  RunResult
> {
  return {
    name: "run_process",
    description:
      "Run a program as a child process without going through a shell. `executable` is the path of the program to run, `args` are the arguments passed to it (no shell parsing, so pass arguments literally). Returns the exit code together with the captured stdout and stderr. A non-zero exit code or a run that was cancelled is returned as an error result.",
    label: "run_process",
    parameters: processToolSchema,
    async execute(
      _toolCallId,
      input: processToolInput,
      signal?: AbortSignal,
      _onUpdate?,
    ) {
      const { executable, args } = validateProcessInput(input);

      const result = await runProcess(executable, args, {
        signal: signal,
      });

      if (result.status === "aborted") {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `aborted\n ${result.stdout} ${result.stderr}`,
            },
          ],
          details: result,
        };
      } else {
        return {
          isError:
            result.exitCode === null || result.exitCode !== 0 ? true : false,
          content: [
            {
              type: "text",
              text: `exit ${result.exitCode}\n ${result.stdout} ${result.stderr}`,
            },
          ],
          details: result,
        };
      }
    },
  };
}
